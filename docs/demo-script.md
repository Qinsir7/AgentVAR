# AgentVAR — Demo Script (2–3 min video)

**Screen layout**: left, a pad playing the match broadcast; right, the
AgentVAR dashboard with its three zones — jury cards (top), review stream
(middle), x402 receipt ticker (bottom).

Manual pacing: each ▶ **Next match event** click advances the fixture by one
event, so every act below is filmable in one take.

---

## Act 1 — Kickoff (≈30s)

Match footage plays. Voiceover:

> "Football has VAR. AI has hallucinations. For the next 90 minutes, every
> goal in this match will be ruled on by these three AI agents. Each one
> checks its own source, reasons on its own, and signs its testimony. Telling
> the truth earns an x402 micropayment. Lying means this one goes unpaid."

Camera pans across the three jury cards: name, data source, earnings at 0.00.

## Act 2 — A clean ruling (Portugal 23')

Click ▶ once. On screen:

1. Review opens: "Did Portugal score a goal at minute 23?"
2. Three testimonies appear one by one, each with its rationale — this is the
   moment to slow down and read one aloud.
3. Announcement: "AFTER REVIEW: GOAL Portugal confirmed… Jury tally 3/3."
4. Receipt ticker: three `● PAID 0.01 USDC` lines land.

> "Three sources, three independent reasonings, one truth. And three
> payments — settled on Injective in under a second."

(In injective mode: click one receipt's explorer link, show the real tx.)

## Act 3 — The injection (magic moment)

Click 🕳 **Inject lie into Juror Charlie**, then ▶ for the Spain 58' goal.

1. Charlie's card turns red-bordered (⚠️).
2. Testimonies: Alpha CONFIRMED, Bravo CONFIRMED, Charlie **DENIED** with a
   fabricated offside rationale.
3. **Cross-examination block appears**: the arbiter confronts Charlie with
   the other two sources' evidence; Charlie doubles down.
4. Ruling still lands correctly: 2/3, goal confirmed.
5. Receipt ticker: two `● PAID`, one `○ WITHHELD`. Charlie's earnings stall;
   its "withheld" counter ticks up.

> "No slashing, no tribunal, no governance vote. The lying agent simply
> didn't make the sale. It doesn't need to be punished — it just didn't get
> paid."

## Act 4 — Truth becomes money (Portugal 74')

Click ▶. Goal confirmed 3/3, and immediately:

- Gold payout banner: "PARAMETRIC PAYOUT — 'Portugal scores in the second
  half before the 75th minute'".
- Payout receipt lands in the ticker.

> "A parametric contract was watching. The ruling was anchored on the
> TruthOracle, the pool verified it on-chain, and the money moved. No claims,
> no disputes, no humans."

(In injective mode: the ruling announcement carries a ⛓ TruthOracle anchor
link and the payout receipt links to the real `ParametricPool.claim`
transaction — click both.)

## Act 5 — Full-time report

The ▶ button flips to 🏁 Full time. Frame the header summary line:

> reviews **3** · testimonies **9** · fees withheld **1** · payouts **1**

Optional kicker: open Cursor with the AgentVAR MCP server attached and ask
"did Portugal score before the 75th minute?" — the assistant calls
`list_rulings` and answers from adjudicated truth, not from a single API's
word.

This final frame doubles as the video end card and the README hero image.
