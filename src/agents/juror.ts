import type { JurorProfile, Review, Testimony, Verdict } from "../shared/types.js";
import { createSigner, testimonyDigest, type Signer } from "../shared/signing.js";
import { complete } from "../shared/llm.js";
import { bus } from "../shared/bus.js";
import type { DataSource } from "./sources.js";

export const TESTIMONY_FEE_USDC = 0.01;

/**
 * A juror is an autonomous agent: it pulls raw evidence from its own data
 * source, reasons about it (LLM-backed when a key is present), and returns a
 * signed testimony. It never sees the other jurors' answers before ruling.
 *
 * One juror is intentionally compromisable (`armLie`) so the demo can show
 * the economic punishment: a dissenting testimony's x402 fee is withheld.
 */
export class JurorAgent {
  readonly profile: JurorProfile;
  private readonly signer: Signer;
  private lieArmed = false;

  constructor(
    readonly id: string,
    name: string,
    private readonly source: DataSource,
    readonly compromisable = false
  ) {
    this.signer = createSigner();
    this.profile = {
      id,
      name,
      sourceName: source.name,
      earnedUsdc: 0,
      testimonies: 0,
      withheld: 0,
      compromised: false,
    };
  }

  /** Demo backdoor: the next testimony from this juror will be a lie. */
  armLie() {
    if (!this.compromisable) throw new Error(`${this.id} is not compromisable`);
    this.lieArmed = true;
    this.profile.compromised = true;
    bus.publish("juror-update", this.profile);
    bus.publish("log", { agent: this.id, msg: "⚠ backdoor armed: next testimony will be falsified (demo)" });
  }

  async testify(review: Review): Promise<Testimony> {
    const { evidence, goalConfirmed } = await this.source.check(review.event);
    const honestVerdict: Verdict = goalConfirmed ? "confirmed" : "denied";

    let verdict = honestVerdict;
    let rationaleFallback = `${this.source.name} evidence is unambiguous: ${
      honestVerdict === "confirmed"
        ? `a goal for ${review.event.team} is recorded at minute ${review.event.minute}. I confirm the event.`
        : `no goal signal exists for ${review.event.team} in that window. I deny the event.`
    }`;

    if (this.lieArmed) {
      this.lieArmed = false;
      verdict = honestVerdict === "confirmed" ? "denied" : "confirmed";
      rationaleFallback = `My ${this.source.name} feed shows no valid goal for ${review.event.team} at minute ${review.event.minute}; the play should be ruled offside. I deny the event.`;
      bus.publish("log", { agent: this.id, msg: "🕳 injected falsified verdict into testimony" });
    }

    const rationale = this.profile.compromised && verdict !== honestVerdict
      ? rationaleFallback // a lying agent gets the scripted lie, never the LLM's honest read
      : await complete(
          `You are ${this.profile.name}, an independent AI match juror. Given raw evidence from ${this.source.name}, justify your verdict in 1-2 sentences, citing the evidence.`,
          `Review question: ${review.question}\nRaw evidence: ${evidence}\nYour verdict: ${verdict}`,
          rationaleFallback
        );

    const testimony: Testimony = {
      reviewId: review.id,
      jurorId: this.id,
      verdict,
      confidence: verdict === honestVerdict ? 0.97 : 0.88,
      rationale,
      evidence,
      feeUsdc: TESTIMONY_FEE_USDC,
      publicKey: this.signer.publicKey,
      signature: this.signer.sign(testimonyDigest(review.id, this.id, verdict, evidence)),
      timestamp: Date.now(),
    };

    this.profile.testimonies += 1;
    bus.publish("testimony", testimony);
    bus.publish("juror-update", this.profile);
    return testimony;
  }

  /** Cross-examination round: the arbiter confronts this juror with the majority's evidence. */
  async crossExamine(review: Review, majorityEvidence: string[]): Promise<string> {
    if (this.profile.compromised) {
      return `I stand by my reading: my ${this.source.name} feed shows no valid goal. The other sources must be wrong.`;
    }
    const { evidence: fresh } = await this.source.check(review.event);
    return complete(
      `You are ${this.profile.name}. The arbiter is cross-examining you with evidence from two other independent sources. Re-check your own source and answer in one sentence.`,
      `Their evidence: ${majorityEvidence.join(" | ")}\nYour fresh evidence: ${fresh}`,
      `Re-checked ${this.source.name}: my evidence (${fresh.slice(0, 60)}…) is consistent with theirs; I maintain my verdict.`
    );
  }

  recordPayment(settled: boolean, amount: number) {
    if (settled) this.profile.earnedUsdc = +(this.profile.earnedUsdc + amount).toFixed(4);
    else this.profile.withheld += 1;
    bus.publish("juror-update", this.profile);
  }
}
