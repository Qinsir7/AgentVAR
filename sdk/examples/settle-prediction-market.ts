/**
 * Example: a prediction market settling a "Spain to score vs Portugal" market
 * with AgentVAR instead of a single trusted oracle.
 *
 * Run (against a live AgentVAR instance, `npm start`):
 *   npx tsx sdk/examples/settle-prediction-market.ts
 *
 * With the injective rail the CONSUMER_PRIVATE_KEY wallet pays the 0.05 USDC
 * x402 adjudication fee on Injective EVM testnet — a real machine-to-machine
 * payment for verified truth.
 */
import "dotenv/config";
import { AgentVARClient } from "../index.js";

const market = {
  question: "Will Spain score against Portugal?",
  claim: { team: "Spain", minute: 91, player: "Mikel Merino" }, // 90'+1' goal, ESPN clock
  poolYes: 12_400, // USDC staked on YES
  poolNo: 8_100, // USDC staked on NO
};

const client = new AgentVARClient({
  baseUrl: process.env.VAR_URL ?? "http://localhost:4402",
  privateKey: process.env.CONSUMER_PRIVATE_KEY, // pays the x402 fee if the rail is injective
  rpcUrl: process.env.INJECTIVE_RPC_URL,
});

console.log(`⚖️  Settling market: "${market.question}"`);
console.log(`   Submitting claim to the AgentVAR jury (x402 fee applies)...\n`);

const ruling = await client.adjudicate(market.claim);

const votesFor = ruling.votes.filter((v) => v.agreedWithMajority).length;
console.log(`📜 Ruling: ${ruling.verdict.toUpperCase()} (${votesFor}/${ruling.votes.length})`);
console.log(`   "${ruling.announcement}"`);
if (ruling.anchorExplorerUrl) console.log(`   On-chain anchor: ${ruling.anchorExplorerUrl}`);

// Don't take the server's word for it: verify each juror's signature locally.
const state = await client.state();
const testimonies = state.testimonies.filter((t) => t.reviewId === ruling.reviewId);
for (const t of testimonies) {
  console.log(`   ${t.jurorId}: ${t.verdict} — signature ${client.verifyTestimony(t) ? "✅ valid" : "❌ INVALID"}`);
}

const winners = ruling.verdict === "confirmed" ? "YES" : "NO";
const pool = market.poolYes + market.poolNo;
console.log(`\n💰 Market settled: ${winners} side wins, ${pool.toLocaleString()} USDC pool released.`);
console.log(`   No oracle committee, no dispute window, no humans.`);
