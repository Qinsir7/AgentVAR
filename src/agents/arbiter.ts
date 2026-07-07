import type { Review, Ruling, Testimony, Verdict, Vote } from "../shared/types.js";
import type { PaymentRail } from "../shared/payments.js";
import { verifySignature, testimonyDigest } from "../shared/signing.js";
import { complete } from "../shared/llm.js";
import { bus } from "../shared/bus.js";
import { isInjectiveMode, anchorRuling } from "../shared/onchain.js";
import type { JurorAgent } from "./juror.js";

export const ADJUDICATION_FEE_USDC = 0.05;

/**
 * The Arbiter runs the review: collects independent signed testimonies,
 * tallies a 2/3 majority, cross-examines any dissenter, announces the ruling
 * in natural language (stadium-VAR style), and settles the economics —
 * truthful jurors get their x402 testimony fee, the dissenter's fee is
 * withheld. No staking, no token, no governance: honesty is simply the only
 * profitable strategy.
 */
export class ArbiterAgent {
  constructor(
    private readonly jurors: JurorAgent[],
    private readonly rail: PaymentRail
  ) {}

  async adjudicate(review: Review): Promise<Ruling> {
    // 1. Independent testimonies (parallel, no juror sees another's answer).
    const testimonies = await Promise.all(this.jurors.map((j) => j.testify(review)));

    // 2. Verify signatures before counting anything.
    for (const t of testimonies) {
      const ok = verifySignature(testimonyDigest(t.reviewId, t.jurorId, t.verdict, t.evidence), t.signature, t.publicKey);
      if (!ok) throw new Error(`invalid signature from ${t.jurorId}`);
    }

    // 3. Tally 2/3 majority.
    const confirmed = testimonies.filter((t) => t.verdict === "confirmed");
    const majority: Verdict = confirmed.length >= 2 ? "confirmed" : "denied";
    const dissenters = testimonies.filter((t) => t.verdict !== majority);

    // 4. Cross-examine dissenters before finalizing.
    let crossExamination: Ruling["crossExamination"];
    for (const d of dissenters) {
      const juror = this.jurors.find((j) => j.id === d.jurorId)!;
      const majorityEvidence = testimonies.filter((t) => t.verdict === majority).map((t) => t.evidence);
      const question = `Two independent sources contradict you. Re-check ${juror.profile.sourceName} and justify your verdict.`;
      const answer = await juror.crossExamine(review, majorityEvidence);
      crossExamination = { jurorId: d.jurorId, question, answer };
      bus.publish("cross-examination", { reviewId: review.id, ...crossExamination });
    }

    // 5. Settle the economics: pay the majority, withhold from dissenters.
    const votes: Vote[] = [];
    for (const t of testimonies) {
      const agreed = t.verdict === majority;
      const juror = this.jurors.find((j) => j.id === t.jurorId)!;
      if (agreed) {
        await this.rail.pay({
          kind: "testimony-fee",
          from: "arbiter",
          to: t.jurorId,
          amountUsdc: t.feeUsdc,
          reviewId: review.id,
          note: `x402 testimony fee — ${juror.profile.name} (${t.verdict})`,
        });
        juror.recordPayment(true, t.feeUsdc);
      } else {
        await this.rail.withhold({
          kind: "testimony-fee",
          from: "arbiter",
          to: t.jurorId,
          amountUsdc: t.feeUsdc,
          reviewId: review.id,
          note: `fee WITHHELD — testimony contradicted 2/3 majority`,
        });
        juror.recordPayment(false, t.feeUsdc);
      }
      votes.push({ jurorId: t.jurorId, verdict: t.verdict, agreedWithMajority: agreed, paid: agreed });
    }

    // 6. Stadium-style announcement.
    const announcement = await this.announce(review, majority, votes, testimonies, crossExamination);

    const ruling: Ruling = {
      reviewId: review.id,
      verdict: majority,
      votes,
      announcement,
      crossExamination,
      finalizedAt: Date.now(),
    };

    // 7. Anchor the ruling on the TruthOracle contract (Injective EVM) so
    //    downstream contracts can settle against adjudicated truth.
    if (isInjectiveMode()) {
      try {
        const anchor = await anchorRuling(review, ruling, testimonies);
        ruling.anchorTxHash = anchor.txHash;
        ruling.anchorExplorerUrl = anchor.explorerUrl;
        bus.publish("log", { agent: "arbiter", msg: `⛓ ruling anchored on TruthOracle: ${anchor.txHash}` });
      } catch (e) {
        bus.publish("log", { agent: "arbiter", msg: `⛓ anchoring failed: ${(e as Error).message}` });
      }
    }

    review.status = "ruled";
    bus.publish("ruling", ruling);
    return ruling;
  }

  private async announce(
    review: Review,
    verdict: Verdict,
    votes: Vote[],
    testimonies: Testimony[],
    crossExam?: Ruling["crossExamination"]
  ): Promise<string> {
    const tally = `${votes.filter((v) => v.agreedWithMajority).length}/${votes.length}`;
    const e = review.event;
    const fallback =
      verdict === "confirmed"
        ? `AFTER REVIEW: GOAL ${e.team} confirmed, minute ${e.minute}${e.player ? ` (${e.player})` : ""}. Jury tally ${tally}.` +
          (crossExam
            ? ` ${crossExam.jurorId}'s testimony was inconsistent with two independent sources and its fee has been withheld.`
            : " All testimonies consistent; all fees settled.")
        : `AFTER REVIEW: no goal for ${e.team} at minute ${e.minute}. Jury tally ${tally}.`;
    return complete(
      "You are the VAR announcer at a World Cup stadium. Announce the ruling in at most 2 sentences, formal and crisp. Mention the jury tally and, if a juror dissented, that its fee was withheld.",
      `Event: ${JSON.stringify(e)}\nVerdict: ${verdict}\nTally: ${tally}\nDissent: ${crossExam ? crossExam.jurorId : "none"}\nRationales: ${testimonies.map((t) => `${t.jurorId}: ${t.rationale}`).join(" | ")}`,
      fallback
    );
  }
}
