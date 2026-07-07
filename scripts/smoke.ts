/**
 * End-to-end smoke test of the full demo flow in mock mode, over the real
 * recorded Argentina 3-2 Egypt fixture:
 * clean ruling → lie injection → parametric payout → final report.
 */
import { Engine } from "../src/engine.js";

const engine = new Engine();
await engine.init();
const assert = (cond: boolean, msg: string) => {
  if (!cond) throw new Error(`SMOKE FAIL: ${msg}`);
  console.log(`✓ ${msg}`);
};

// Act 2: clean ruling (Egypt 15')
const r1 = await engine.advance();
assert(r1!.verdict === "confirmed", "clean ruling confirms the goal");
assert(r1!.votes.every((v) => v.paid), "all three jurors paid on a 3/3 ruling");

// Act 3: injected lie (Egypt 67')
engine.armLie();
const r2 = await engine.advance();
assert(r2!.verdict === "confirmed", "ruling survives a lying juror (2/3)");
const liar = r2!.votes.find((v) => v.jurorId === "juror-3")!;
assert(!liar.paid && liar.verdict === "denied", "lying juror's fee withheld");
assert(!!r2!.crossExamination, "dissenter was cross-examined");

// Act 4: parametric payout (Argentina 79' — second half, before 90')
const r3 = await engine.advance();
assert(r3!.verdict === "confirmed", "Argentina comeback goal confirmed");
let s = engine.state();
assert(s.term.triggered, "parametric term triggered");
assert(s.summary.payouts === 1, "exactly one payout receipt");

// Remaining real goals (Messi 83', Enzo 90'+2')
const r4 = await engine.advance();
const r5 = await engine.advance();
assert(r4!.verdict === "confirmed" && r5!.verdict === "confirmed", "Messi + Enzo goals confirmed");
assert(s.summary.payouts === 1, "payout fired only once");

// Act 5: full time
assert((await engine.advance()) === null, "fixture exhausted → full time");
s = engine.state();
assert(s.summary.reviews === 5 && s.summary.testimonies === 15 && s.summary.withheld === 1,
  "final report: 5 reviews, 15 testimonies, 1 withheld");

// Juror economics
const charlie = s.jurors.find((j) => j.id === "juror-3")!;
assert(charlie.earnedUsdc === 0.04 && charlie.withheld === 1, "Charlie earned 0.04, lost 1 fee");
const alpha = s.jurors.find((j) => j.id === "juror-1")!;
assert(alpha.earnedUsdc === 0.05, "Alpha earned 0.05 across 5 testimonies");

console.log("\nAll smoke checks passed. Final report:", JSON.stringify(s.summary));
