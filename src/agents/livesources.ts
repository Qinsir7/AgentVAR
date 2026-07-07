import type { MatchEvent } from "../shared/types.js";
import type { DataSource, SourceReading } from "./sources.js";

/**
 * Live data sources for the real 2026 FIFA World Cup.
 *
 * Each juror queries a genuinely different provider:
 *  - Juror Alpha  → ESPN scoreboard API (keyless, play-by-play goal details)
 *  - Juror Bravo  → TheSportsDB (keyless free tier: final score + status —
 *                   weaker evidence, and its rationale says so)
 *  - Juror Charlie→ football-data.org (if FOOTBALL_DATA_KEY is set) or the
 *                   ESPN match-summary endpoint as a disclosed fallback
 *
 * A LiveMatch context (set by the Scout at startup) tells the sources which
 * real fixture they are testifying about.
 */
export interface LiveMatch {
  espnEventId: string;
  dateYYYYMMDD: string;
  isoDate: string;
  home: string;
  away: string;
  status: string;
}

let liveMatch: LiveMatch | null = null;
export const setLiveMatch = (m: LiveMatch) => (liveMatch = m);
export const getLiveMatch = () => liveMatch;

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world";

interface EspnDetail {
  type?: { text?: string };
  clock?: { displayValue?: string };
  scoringPlay?: boolean;
  team?: { id?: string };
  athletesInvolved?: { displayName?: string }[];
}

export function parseClockMinute(clock?: string): number {
  return Number.parseInt((clock ?? "0").replace("'", ""), 10) || 0;
}

export interface EspnGoal {
  minute: number;
  clock: string;
  team: string;
  player?: string;
  type: string;
}

/** Fetch all scoring plays for the tracked match from the ESPN scoreboard. */
export async function fetchEspnGoals(match: LiveMatch): Promise<EspnGoal[]> {
  const res = await fetch(`${ESPN_BASE}/scoreboard?dates=${match.dateYYYYMMDD}`);
  if (!res.ok) throw new Error(`ESPN scoreboard ${res.status}`);
  const data = (await res.json()) as {
    events?: { id: string; competitions: { competitors: { team: { id: string; displayName: string } }[]; details?: EspnDetail[] }[] }[];
  };
  const ev = data.events?.find((e) => e.id === match.espnEventId);
  if (!ev) return [];
  const comp = ev.competitions[0];
  const teamById = new Map(comp.competitors.map((c) => [c.team.id, c.team.displayName]));
  return (comp.details ?? [])
    .filter((d) => d.scoringPlay)
    .map((d) => ({
      minute: parseClockMinute(d.clock?.displayValue),
      clock: d.clock?.displayValue ?? "?",
      team: teamById.get(d.team?.id ?? "") ?? "unknown",
      player: d.athletesInvolved?.[0]?.displayName,
      type: d.type?.text ?? "Goal",
    }));
}

/** Discover the tracked match on a given day (optionally filtered by team name). */
export async function findWorldCupMatch(dateYYYYMMDD: string, teamFilter?: string): Promise<LiveMatch | null> {
  const res = await fetch(`${ESPN_BASE}/scoreboard?dates=${dateYYYYMMDD}`);
  if (!res.ok) throw new Error(`ESPN scoreboard ${res.status}`);
  const data = (await res.json()) as {
    events?: { id: string; date: string; status: { type: { name: string } }; competitions: { competitors: { homeAway: string; team: { displayName: string } }[] }[] }[];
  };
  for (const ev of data.events ?? []) {
    const comp = ev.competitions[0];
    const home = comp.competitors.find((c) => c.homeAway === "home")?.team.displayName ?? "?";
    const away = comp.competitors.find((c) => c.homeAway === "away")?.team.displayName ?? "?";
    if (teamFilter && ![home, away].some((t) => t.toLowerCase().includes(teamFilter.toLowerCase()))) continue;
    return { espnEventId: ev.id, dateYYYYMMDD, isoDate: ev.date, home, away, status: ev.status.type.name };
  }
  return null;
}

const requireMatch = (): LiveMatch => {
  if (!liveMatch) throw new Error("live match context not set — Scout must initialize first");
  return liveMatch;
};

const matchesClaim = (g: EspnGoal, event: MatchEvent) =>
  g.team.toLowerCase().includes(event.team.toLowerCase()) && Math.abs(g.minute - event.minute) <= 2;

/** Juror Alpha — ESPN scoreboard play-by-play. */
export const espnScoreboard: DataSource = {
  name: "ESPN Scoreboard API",
  async check(event: MatchEvent): Promise<SourceReading> {
    const match = requireMatch();
    const goals = await fetchEspnGoals(match);
    const hit = goals.find((g) => matchesClaim(g, event));
    return {
      goalConfirmed: !!hit,
      evidence: hit
        ? `espn:scoreboard ${match.home} vs ${match.away} → scoring play @${hit.clock}: ${hit.type} by ${hit.player ?? "unknown"} (${hit.team})`
        : `espn:scoreboard ${match.home} vs ${match.away} → no scoring play for ${event.team} in window ${event.minute - 2}'-${event.minute + 2}'; recorded goals: [${goals.map((g) => `${g.team}@${g.clock}`).join(", ") || "none"}]`,
    };
  },
};

/** Juror Bravo — TheSportsDB free tier (score-level evidence only). */
export const theSportsDb: DataSource = {
  name: "TheSportsDB",
  async check(event: MatchEvent): Promise<SourceReading> {
    const match = requireMatch();
    const key = process.env.THESPORTSDB_KEY ?? "123";
    const slug = `${match.home}_vs_${match.away}`.replace(/ /g, "_");
    const res = await fetch(`https://www.thesportsdb.com/api/v1/json/${key}/searchevents.php?e=${encodeURIComponent(slug)}`);
    if (!res.ok) throw new Error(`TheSportsDB ${res.status}`);
    const data = (await res.json()) as { event?: { strTimestamp: string; intHomeScore: string | null; intAwayScore: string | null; strStatus: string }[] };
    const e = data.event?.find((x) => x.strTimestamp?.startsWith(match.isoDate.slice(0, 10)));
    if (!e) return { goalConfirmed: false, evidence: `thesportsdb: no record of ${slug} on ${match.dateYYYYMMDD}` };

    const teamGoals = event.team.toLowerCase() === match.home.toLowerCase() ? Number(e.intHomeScore ?? 0) : Number(e.intAwayScore ?? 0);
    return {
      goalConfirmed: teamGoals > 0,
      evidence:
        `thesportsdb: ${match.home} ${e.intHomeScore ?? "?"}-${e.intAwayScore ?? "?"} ${match.away} (${e.strStatus}); ` +
        `${event.team} total goals: ${teamGoals} — score-level evidence only (free tier), cannot resolve the exact minute`,
    };
  },
};

/** Juror Charlie — football-data.org, or ESPN match summary as disclosed fallback. */
export const footballDataOrSummary: DataSource = {
  name: process.env.FOOTBALL_DATA_KEY ? "football-data.org" : "ESPN Summary feed",
  async check(event: MatchEvent): Promise<SourceReading> {
    const match = requireMatch();
    if (process.env.FOOTBALL_DATA_KEY) {
      const day = match.isoDate.slice(0, 10);
      const res = await fetch(`https://api.football-data.org/v4/matches?dateFrom=${day}&dateTo=${day}&competitions=WC`, {
        headers: { "X-Auth-Token": process.env.FOOTBALL_DATA_KEY },
      });
      if (!res.ok) throw new Error(`football-data.org ${res.status}`);
      const data = (await res.json()) as {
        matches?: { homeTeam: { name: string }; awayTeam: { name: string }; goals?: { minute: number; team: { name: string }; scorer?: { name: string } }[] }[];
      };
      const m = data.matches?.find(
        (x) => x.homeTeam.name.toLowerCase().includes(match.home.toLowerCase()) || x.awayTeam.name.toLowerCase().includes(match.away.toLowerCase())
      );
      const hit = m?.goals?.find((g) => g.team.name.toLowerCase().includes(event.team.toLowerCase()) && Math.abs(g.minute - event.minute) <= 2);
      return {
        goalConfirmed: !!hit,
        evidence: hit
          ? `football-data.org: goal minute ${hit.minute} by ${hit.scorer?.name ?? "unknown"} (${hit.team.name})`
          : `football-data.org: no goal for ${event.team} near minute ${event.minute}; goals: [${(m?.goals ?? []).map((g) => `${g.team.name}@${g.minute}'`).join(", ") || "none"}]`,
      };
    }

    // Fallback: ESPN summary endpoint (same provider as Alpha — disclosed in README)
    const res = await fetch(`${ESPN_BASE}/summary?event=${match.espnEventId}`);
    if (!res.ok) throw new Error(`ESPN summary ${res.status}`);
    const data = (await res.json()) as {
      keyEvents?: { clock?: { displayValue?: string }; scoringPlay?: boolean; team?: { displayName?: string }; participants?: { athlete?: { displayName?: string } }[]; type?: { text?: string } }[];
    };
    const goals = (data.keyEvents ?? []).filter((k) => k.scoringPlay);
    const hit = goals.find(
      (k) => (k.team?.displayName ?? "").toLowerCase().includes(event.team.toLowerCase()) && Math.abs(parseClockMinute(k.clock?.displayValue) - event.minute) <= 2
    );
    return {
      goalConfirmed: !!hit,
      evidence: hit
        ? `espn:summary keyEvent @${hit.clock?.displayValue}: ${hit.type?.text} — ${hit.participants?.[0]?.athlete?.displayName ?? "unknown"} (${hit.team?.displayName})`
        : `espn:summary: no scoring keyEvent for ${event.team} near ${event.minute}'; scoring events: [${goals.map((k) => `${k.team?.displayName}@${k.clock?.displayValue}`).join(", ") || "none"}]`,
    };
  },
};
