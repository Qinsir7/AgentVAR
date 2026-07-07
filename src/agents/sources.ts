import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { MatchEvent } from "../shared/types.js";

/**
 * A juror's data source. `check` returns raw, source-flavoured evidence plus
 * the source's own read on whether the goal happened — the juror agent then
 * reasons over it and signs the final verdict.
 *
 * Two families implement this interface:
 *  - replay sources (below): three differently-shaped views of a recorded
 *    fixture, for deterministic filming.
 *  - live sources (livesources.ts): ESPN, TheSportsDB and football-data.org,
 *    querying the real 2026 World Cup.
 */
export interface SourceReading {
  evidence: string;
  goalConfirmed: boolean;
}

export interface DataSource {
  name: string;
  check(event: MatchEvent): Promise<SourceReading>;
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
  name: "StatsGrid API (replay)",
  async check(event) {
    await sleep(150);
    const hit = findEvent(event);
    return {
      goalConfirmed: !!hit,
      evidence: hit
        ? JSON.stringify({ feed: "statsgrid/v3", event: "GOAL", clock: `${hit.minute}'`, team: hit.team, scorer: hit.player })
        : JSON.stringify({ feed: "statsgrid/v3", event: "NONE", window: `${event.minute - 1}'-${event.minute + 1}'`, team: event.team }),
    };
  },
};

export const broadcastOcr: DataSource = {
  name: "Broadcast OCR (replay)",
  async check(event) {
    await sleep(320);
    const hit = findEvent(event);
    return {
      goalConfirmed: !!hit,
      evidence: hit
        ? `frame@${hit.minute}:02 scoreboard delta detected | caption: "GOAL! ${hit.player} (${hit.team})" | crowd-noise spike 97dB`
        : `frames ${event.minute - 1}'-${event.minute + 1}': no scoreboard change for ${event.team}, no goal caption detected`,
    };
  },
};

export const stadiumSensors: DataSource = {
  name: "Stadium Sensor Net (replay)",
  async check(event) {
    await sleep(80);
    const hit = findEvent(event);
    return {
      goalConfirmed: !!hit,
      evidence: hit
        ? `goal-line sensor: ball fully crossed plane at min ${hit.minute} (attacking side: ${hit.team}); referee watch vibration confirmed`
        : `goal-line sensor: no crossing recorded in min ${event.minute - 1}-${event.minute + 1} for ${event.team} attacking end`,
    };
  },
};
