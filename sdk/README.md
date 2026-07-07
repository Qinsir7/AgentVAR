# AgentVAR SDK

Verified sports truth as a service, for any TypeScript app. The SDK wraps an AgentVAR instance's HTTP API and handles the **x402 micropayment flow automatically**: when an endpoint answers `402 Payment Required`, the client signs a USDC transfer on Injective EVM testnet and retries.

```ts
import { AgentVARClient } from "./sdk/index.js";

const client = new AgentVARClient({
  baseUrl: "http://localhost:4402",
  privateKey: process.env.CONSUMER_PRIVATE_KEY, // wallet with USDC on Injective EVM testnet
  rpcUrl: process.env.INJECTIVE_RPC_URL,
});

// Pay 0.05 USDC (x402) → jury of 3 independent AI agents adjudicates the claim
const ruling = await client.adjudicate({ team: "Spain", minute: 91 });
// → { verdict: "confirmed", votes: [3 signed votes], anchorTxHash: "0x…", ... }

// Trustless verification: check each juror's Ed25519 signature locally
const t = (await client.state()).testimonies.at(-1)!;
client.verifyTestimony(t); // true
```

| Method | Cost (injective rail) | What it does |
| --- | --- | --- |
| `adjudicate(claim)` | 0.05 USDC via x402 | Full jury: 3 sources, 2/3 vote, cross-examination, on-chain anchor |
| `getTestimony(jurorId, claim)` | 0.01 USDC via x402 | One juror's signed testimony, no jury |
| `rulings()` / `leaderboard()` / `state()` | free | Read rulings, jury economics, full state |
| `verifyTestimony(t)` | free, local | Ed25519 signature check — don't trust the server |

Who would use this: prediction markets settling outcomes, fantasy/betting apps needing dispute-proof results, parametric insurance products, or other AI agents (via the MCP server, which fronts the same API).

The folder is self-contained: copy `sdk/` into your project (dependency: `@injectivelabs/x402`) and point it at any AgentVAR instance.

See `examples/settle-prediction-market.ts` for an end-to-end prediction-market settlement, including local signature verification.
