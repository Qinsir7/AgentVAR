# HackQuest Submission — AgentVAR

## 1. Tell us about your project and which World Cup-related pain point it solves

AgentVAR is an autonomous AI referee crew that turns World Cup truth into a paid, verifiable service.

The pain point: everything downstream of a match — bet settlement, prediction markets, parametric insurance, fan rewards — depends on "what actually happened on the pitch", and today that means trusting a single sports API's word. One wrong or manipulated feed silently mis-settles millions. Existing oracle designs patch this with heavy machinery: staking, tokens, dispute courts, governance votes.

AgentVAR replaces that machinery with one lightweight primitive: the payment itself is the incentive. Three independent AI juror agents each pull evidence from a different real data source (ESPN, TheSportsDB, football-data.org), reason over it with an LLM, and sign their testimony. An Arbiter agent rules by 2/3 majority and cross-examines any dissenter. Jurors whose testimony matches the ruling get paid a real x402 USDC micropayment on Injective (~650ms settlement); a lying juror's fee is simply withheld — no slashing, no tribunal, the lie just didn't make the sale. Rulings anchor on-chain (TruthOracle) and a ParametricPool contract re-verifies them on-chain to pay out insurance automatically. No claims, no disputes, no humans.

We demoed it on the real Argentina 3-2 Egypt Round-of-16 comeback: all five real goals adjudicated, a bribed juror punished economically, and a parametric payout triggered by Romero's 79' goal — every receipt a real transaction on Injective EVM testnet.

## 2. Post introducing the project

**AgentVAR — Football has VAR. AI has hallucinations. Truth has a price tag.**

**What it does.** AgentVAR is a jury of autonomous AI agents that adjudicates World Cup events and sells the verdict as a service. A Scout agent watches the match feed (a recorded real fixture, or the live 2026 World Cup via public APIs) and opens a VAR review for every goal: "Did Messi score at 83'?" Three juror agents independently fetch evidence from three different providers, reason with an LLM, and return Ed25519-signed testimony — none sees another's answer. An Arbiter tallies a 2/3 majority, cross-examines dissenters with the majority's evidence, announces the ruling stadium-style, and anchors it on the TruthOracle contract on Injective EVM testnet.

**The economics are the security model.** Consumers pay 0.05 USDC (via x402) for an adjudicated ruling. The Arbiter pays 0.01 USDC to each juror whose testimony matched the ruling — through that juror's own x402-gated claim endpoint, to that juror's own wallet. A dissenting juror's endpoint is simply never called. Honesty is the only profitable strategy: no staking, no slashing, no governance. In our demo we bribe Juror Charlie to deny a real goal — the ruling still lands correctly at 2/3, the cross-examination is recorded, and Charlie's fee is withheld on-chain.

**Truth becomes money, automatically.** A ParametricPool contract (funded cross-chain via USDC CCTP) holds a term like "pays out if Argentina scores in the second half before the 90th minute". When the jury confirms Romero's 79' goal, the pool re-verifies the ruling against the TruthOracle on-chain and pays the beneficiary instantly. No claims process exists.

**The real-world problem.** The 2026 World Cup will move billions through prediction markets, sportsbooks and fan products, all settling against single-source data feeds. A single point of trust is a single point of failure — outages, errors and manipulation propagate silently into settlements. AgentVAR demonstrates a minimal, economically-secured alternative: plural independent sources, machine-speed adjudication, cryptographic auditability, and instant on-chain settlement.

**How to try it.**
- Live site: https://agent-var.vercel.app/
- GitHub: https://github.com/Qinsir7/AgentVAR
- `npm install && npm start` → Match Control Room dashboard (mock rail, 30 seconds)
- Full on-chain mode: one funded testnet key + `npm run setup && npm run deploy && PAYMENT_RAIL=injective npm start`
- Live real-match mode: `npm run start:live` — jurors query real providers about matches in play, auto-adjudicating new goals
- SDK: `npm run sdk:example` settles a demo prediction market and verifies every juror signature locally
- MCP: attach `npm run mcp` to Cursor/Claude and your AI assistant buys truth with a real x402 payment

**On-chain evidence (Injective EVM Testnet, chain 1439).**
- TruthOracle: https://testnet.blockscout.injective.network/address/0x92485534311C0D77aA2646904D6Fd55488473fb2
- ParametricPool: https://testnet.blockscout.injective.network/address/0x6e4DFA9918FB2339FDAbA8d14f56c192cDcf14eB

*(attach screenshots: 1. landing page hero; 2. dashboard mid-match with three testimonies and rationale; 3. the lie-injection review with the red cross-examination block and the WITHHELD receipt; 4. the gold parametric-payout banner; 5. a Blockscout tx page of one x402 receipt; 6. sdk:example terminal output)*

## 3. Which new Injective technologies does your project utilize?

Select **all four**:

- **x402** — every endpoint (adjudication + each juror's testimony/claim) is gated by `@injectivelabs/x402` middleware; the arbiter pays jurors through the x402 client; withheld payment is the entire punishment mechanism. Real USDC settlement on Injective EVM testnet.
- **USDC CCTP** — the ParametricPool is denominated in native Circle USDC and can be capitalized cross-chain: `npm run cctp` burns on Ethereum Sepolia (TokenMessengerV2), fetches Circle's Iris attestation, and mints directly into the pool on Injective (domain 29).
- **MCP Server** — two roles: a consumer server so any AI assistant buys jury-verified truth as a tool call (with a real x402 payment), and a juror role that makes each juror its own priced MCP endpoint.
- **Agent Skills** — the `agentvar-juror` skill turns any Cursor agent into a jury member; it is the on-ramp to an open, permissionless jury.

## 4. Anything else you'd like us to know?

- Everything in the pipeline is real: the demo match is the actual Argentina 3-2 Egypt Round-of-16 game (July 7), live mode queries real public providers about real 2026 World Cup fixtures, x402 payments/ruling anchors/pool payouts are all verifiable transactions on Injective EVM testnet.
- The README has an "Honest disclosure" section that states exactly what is demo rails (the deterministic replay pacing, the scripted lie backdoor, the single-process topology) versus what is production-shaped (per-juror wallets and x402 endpoints, on-chain re-verification of payouts).
- The design generalizes beyond football: any event with multiple independent observers — flight delays, weather, esports, election calls — can be adjudicated by a paid AI jury with the same four Injective primitives.
- Built solo during the hackathon window; the deterministic replay mode exists so the filmed demo is exactly reproducible by judges (`npm run smoke` asserts the entire economic outcome).
