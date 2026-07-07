import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { MatchEvent } from "../shared/types.js";

/**
 * Three independent data sources, one per juror. In this demo build they all
 * replay the same recorded fixture but expose it in genuinely different
 * shapes/latencies — mirroring how a stats API, a broadcast-OCR pipeline and
 * a stadium sensor feed would disagree in format while (usually) agreeing on
 * facts. Real providers plug in behind the same `DataSource` interface.
 */
export interface DataSource {
  name: string;
  /** Raw, source-flavoured evidence for "did this event happen?" */
  fetchEvidence(event: MatchEvent): Promise<string>;
}

const fixturePath = fileURLToPath(new URL("../../data/fixture.json", import.meta.url));
const fixture = JSON.parse(readFileSync(fixturePath, "utf-8")) as { events: MatchEvent[] };

function findEvent(event: MatchEvent): MatchEvent | undefined {
  return fixture.events.find(
    (e) => e.type === event.type && e.team === event.team && Math.abs(e.minute - event.minute) <= 1
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const statsFeed: DataSource = {
  name: "StatsGrid API",
  async fetchEvidence(event) {
    await sleep(150);
    const hit = findEvent(event);
    return hit
      ? JSON.stringify({ feed: "statsgrid/v3", event: "GOAL", clock: `${hit.minute}'`, team: hit.team, scorer: hit.player })
      : JSON.stringify({ feed: "statsgrid/v3", event: "NONE", window: `${event.minute - 1}'-${event.minute + 1}'`, team: event.team });
  },
};

export const broadcastOcr: DataSource = {
  name: "Broadcast OCR",
  async fetchEvidence(event) {
    await sleep(320);
    const hit = findEvent(event);
    return hit
      ? `frame@${hit.minute}:02 scoreboard delta detected | caption: "GOAL! ${hit.player} (${hit.team})" | crowd-noise spike 97dB`
      : `frames ${event.minute - 1}'-${event.minute + 1}': no scoreboard change for ${event.team}, no goal caption detected`;
  },
};

export const stadiumSensors: DataSource = {
  name: "Stadium Sensor Net",
  async fetchEvidence(event) {
    await sleep(80);
    const hit = findEvent(event);
    return hit
      ? `goal-line sensor: ball fully crossed plane at min ${hit.minute} (attacking side: ${hit.team}); referee watch vibration confirmed`
      : `goal-line sensor: no crossing recorded in min ${event.minute - 1}-${event.minute + 1} for ${event.team} attacking end`;
  },
};
