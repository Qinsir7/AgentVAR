import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import type { MatchEvent, Review } from "../shared/types.js";
import { bus } from "../shared/bus.js";
import { findWorldCupMatch, fetchEspnGoals, setLiveMatch, getLiveMatch, type LiveMatch } from "./livesources.js";

/**
 * The Scout watches the match and opens reviews for key events.
 *
 * MATCH_MODE=replay (default): steps through the recorded fixture — fully
 * deterministic, ideal for filming.
 *
 * MATCH_MODE=live: tracks a real 2026 World Cup match via the ESPN public
 * API. Configure with:
 *   LIVE_DATE=YYYYMMDD  (default: today UTC)
 *   LIVE_TEAM=Portugal  (optional filter; otherwise first match of the day)
 * Goals discovered on the feed become a queue you can step through with
 * "Next match event" — and while the match is in play the Scout keeps
 * polling, so with AUTO_ADJUDICATE=true new goals are adjudicated the
 * moment ESPN reports them, no clicks involved.
 */
export class ScoutAgent {
  readonly mode: "replay" | "live" = process.env.MATCH_MODE === "live" ? "live" : "replay";
  private events: MatchEvent[] = [];
  private cursor = 0;
  private seenGoalKeys = new Set<string>();
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  /** Set by the engine so auto-discovered goals can be adjudicated hands-free. */
  onAutoEvent: ((review: Review) => void) | null = null;

  async init(): Promise<void> {
    if (this.mode === "replay") {
      const fixturePath = fileURLToPath(new URL("../../data/fixture.json", import.meta.url));
      this.events = (JSON.parse(readFileSync(fixturePath, "utf-8")) as { events: MatchEvent[] }).events;
      return;
    }

    const date = process.env.LIVE_DATE ?? new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const match = await findWorldCupMatch(date, process.env.LIVE_TEAM);
    if (!match) throw new Error(`no World Cup match found for ${date}${process.env.LIVE_TEAM ? ` / team=${process.env.LIVE_TEAM}` : ""}`);
    setLiveMatch(match);
    bus.publish("log", { agent: "scout", msg: `📡 tracking real match: ${match.home} vs ${match.away} (${match.status}, ESPN #${match.espnEventId})` });

    await this.pollLiveGoals();
    // Keep watching while the match may still produce events.
    const intervalMs = Number(process.env.LIVE_POLL_MS ?? 45_000);
    this.pollTimer = setInterval(() => void this.pollLiveGoals().catch(() => {}), intervalMs);
    this.pollTimer.unref?.();
  }

  private async pollLiveGoals(): Promise<void> {
    const match = getLiveMatch();
    if (!match) return;
    const goals = await fetchEspnGoals(match);
    for (const g of goals) {
      const key = `${g.team}@${g.clock}`;
      if (this.seenGoalKeys.has(key)) continue;
      this.seenGoalKeys.add(key);
      const event: MatchEvent = {
        id: `live-${this.seenGoalKeys.size}`,
        type: "goal",
        minute: g.minute,
        team: g.team,
        player: g.player,
        description: `${g.type} @${g.clock} (ESPN live feed)`,
      };
      this.events.push(event);
      bus.publish("log", { agent: "scout", msg: `📡 goal detected on live feed: ${g.team} @${g.clock}` });
      if (process.env.AUTO_ADJUDICATE === "true" && this.onAutoEvent) {
        this.cursor = this.events.length; // consume immediately
        bus.publish("match-event", event);
        this.onAutoEvent(this.openReview(event));
      }
    }
  }

  get liveMatch(): LiveMatch | null {
    return getLiveMatch();
  }

  get remaining(): number {
    return this.events.length - this.cursor;
  }

  /** Advance the match: emit the next queued event and open a review for it. */
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
