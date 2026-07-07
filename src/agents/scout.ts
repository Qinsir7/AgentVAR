import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import type { MatchEvent, Review } from "../shared/types.js";
import { bus } from "../shared/bus.js";

/**
 * The Scout watches the match feed and decides which moments deserve a
 * review. In this build it replays a recorded fixture (manual pacing keeps
 * the demo filmable); a live provider plugs in by pushing MatchEvents.
 */
export class ScoutAgent {
  private readonly events: MatchEvent[];
  private cursor = 0;

  constructor() {
    const fixturePath = fileURLToPath(new URL("../../data/fixture.json", import.meta.url));
    this.events = (JSON.parse(readFileSync(fixturePath, "utf-8")) as { events: MatchEvent[] }).events;
  }

  get remaining(): number {
    return this.events.length - this.cursor;
  }

  /** Advance the match: emit the next event and open a review for it. */
  nextReview(): Review | null {
    const event = this.events[this.cursor];
    if (!event) return null;
    this.cursor += 1;
    bus.publish("match-event", event);
    return this.openReview(event);
  }

  /** Open a review for an arbitrary event (used by the MCP adjudicate tool). */
  openReview(event: MatchEvent): Review {
    const review: Review = {
      id: `rev_${randomBytes(3).toString("hex")}`,
      event,
      question: `Did ${event.team} score a goal at minute ${event.minute}?`,
      openedAt: Date.now(),
      status: "open",
    };
    bus.publish("review-opened", review);
    return review;
  }
}
