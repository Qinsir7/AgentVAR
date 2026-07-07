import type { ParametricTerm, Ruling, Review } from "../shared/types.js";
import { recordSettledReceipt, type PaymentRail } from "../shared/payments.js";
import { isInjectiveMode, claimParametricPayout } from "../shared/onchain.js";
import { loadDeployments } from "../shared/chain.js";
import { bus } from "../shared/bus.js";

/**
 * The Treasurer watches final rulings for its parametric term.
 *
 * - mock mode: term is hard-coded here and the payout is a simulated receipt.
 * - injective mode: the term lives in the deployed ParametricPool contract
 *   (which holds the USDC). The Treasurer merely calls `claim(reviewId)`;
 *   the pool itself re-verifies the ruling against the TruthOracle on-chain,
 *   so nobody — including the Treasurer — can trigger a payout the jury
 *   didn't rule for. No claims process, no disputes, no humans.
 */
export class TreasurerAgent {
  readonly term: ParametricTerm;

  constructor(private readonly rail: PaymentRail) {
    const deployed = isInjectiveMode() ? loadDeployments() : null;
    this.term = deployed
      ? {
          id: "term-1",
          description: deployed.term.description,
          team: deployed.term.team,
          afterMinute: deployed.term.afterMinute,
          beforeMinute: deployed.term.beforeMinute,
          payoutUsdc: deployed.term.payoutUsdc,
          beneficiary: deployed.term.beneficiary,
          triggered: false,
        }
      : {
          id: "term-1",
          description: "Pays 25 USDC if Portugal scores in the second half before the 75th minute",
          team: "Portugal",
          afterMinute: 45,
          beforeMinute: 75,
          payoutUsdc: 25,
          beneficiary: process.env.BENEFICIARY_ADDRESS || "demo-beneficiary-wallet",
          triggered: false,
        };
  }

  async onRuling(review: Review, ruling: Ruling): Promise<void> {
    if (this.term.triggered || ruling.verdict !== "confirmed") return;
    const e = review.event;
    if (e.team !== this.term.team || e.minute <= this.term.afterMinute || e.minute >= this.term.beforeMinute) return;

    this.term.triggered = true;
    const payParams = {
      kind: "parametric-payout" as const,
      from: "parametric-pool",
      to: this.term.beneficiary,
      amountUsdc: this.term.payoutUsdc,
      reviewId: review.id,
      note: `parametric payout — "${this.term.description}" triggered by ruling ${review.id}`,
    };

    let receipt;
    if (isInjectiveMode()) {
      try {
        const { txHash } = await claimParametricPayout(review.id);
        receipt = recordSettledReceipt(payParams, txHash);
      } catch (err) {
        this.term.triggered = false;
        bus.publish("log", { agent: "treasurer", msg: `pool claim failed: ${(err as Error).message}` });
        return;
      }
    } else {
      receipt = await this.rail.pay(payParams);
    }

    bus.publish("payout", { term: this.term, receipt, reviewId: review.id });
    bus.publish("log", { agent: "treasurer", msg: "💸 parametric term triggered — no claims, no disputes, no humans" });
  }
}
