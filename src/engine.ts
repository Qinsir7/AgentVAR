import type { MatchEvent, PaymentReceipt, Review, Ruling, Testimony } from "./shared/types.js";
import { bus, type BusMessage } from "./shared/bus.js";
import { createPaymentRail } from "./shared/payments.js";
import { JurorAgent } from "./agents/juror.js";
import { ArbiterAgent } from "./agents/arbiter.js";
import { ScoutAgent } from "./agents/scout.js";
import { TreasurerAgent } from "./agents/treasurer.js";
import { statsFeed, broadcastOcr, stadiumSensors } from "./agents/sources.js";

/**
 * Wires the whole crew together and keeps queryable state for the dashboard
 * and the MCP server. In a production deployment each juror runs as its own
 * process/MCP server behind an x402-gated endpoint; here they share a process
 * for a one-command demo (see README disclosure).
 */
export class Engine {
  readonly rail = createPaymentRail();
  readonly jurors = [
    new JurorAgent("juror-1", "Juror Alpha", statsFeed),
    new JurorAgent("juror-2", "Juror Bravo", broadcastOcr),
    new JurorAgent("juror-3", "Juror Charlie", stadiumSensors, /* compromisable */ true),
  ];
  readonly scout = new ScoutAgent();
  readonly arbiter = new ArbiterAgent(this.jurors, this.rail);
  readonly treasurer = new TreasurerAgent(this.rail);

  readonly reviews: Review[] = [];
  readonly rulings: Ruling[] = [];
  readonly testimonies: Testimony[] = [];
  readonly receipts: PaymentReceipt[] = [];
  readonly feed: BusMessage[] = [];
  private busy = false;

  constructor() {
    bus.on("message", (msg: BusMessage) => {
      this.feed.push(msg);
      if (msg.type === "testimony") this.testimonies.push(msg.payload as Testimony);
      if (msg.type === "receipt") this.receipts.push(msg.payload as PaymentReceipt);
    });
  }

  /** Advance the match by one event and run the full adjudication pipeline. */
  async advance(): Promise<Ruling | null> {
    if (this.busy) throw new Error("a review is already in progress");
    const review = this.scout.nextReview();
    if (!review) return null;
    return this.runReview(review);
  }

  /** Adjudicate an ad-hoc event (MCP consumers pay ADJUDICATION_FEE for this). */
  async adjudicate(event: MatchEvent): Promise<Ruling> {
    const review = this.scout.openReview(event);
    const ruling = await this.runReview(review);
    return ruling;
  }

  private async runReview(review: Review): Promise<Ruling> {
    this.busy = true;
    try {
      this.reviews.push(review);
      const ruling = await this.arbiter.adjudicate(review);
      this.rulings.push(ruling);
      await this.treasurer.onRuling(review, ruling);
      return ruling;
    } finally {
      this.busy = false;
    }
  }

  armLie() {
    this.jurors.find((j) => j.compromisable)!.armLie();
  }

  state() {
    return {
      paymentRail: this.rail.mode,
      jurors: this.jurors.map((j) => j.profile),
      reviews: this.reviews,
      rulings: this.rulings,
      testimonies: this.testimonies,
      receipts: this.receipts,
      term: this.treasurer.term,
      remainingEvents: this.scout.remaining,
      summary: {
        reviews: this.reviews.length,
        testimonies: this.testimonies.length,
        withheld: this.receipts.filter((r) => r.status === "withheld").length,
        payouts: this.receipts.filter((r) => r.kind === "parametric-payout").length,
      },
    };
  }
}
