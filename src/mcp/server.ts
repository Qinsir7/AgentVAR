import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createInjectiveClient } from "@injectivelabs/x402/client";
import { z } from "zod";

/**
 * MCP server exposing AgentVAR to any AI assistant (Cursor, Claude, ...).
 *
 * Two roles, selected with MCP_ROLE:
 *  - "consumer" (default): buy adjudicated truth — open reviews, read
 *    rulings, inspect the jury's earnings. Each adjudication costs an x402
 *    fee (0.05 USDC) on the injective rail.
 *  - "juror": front a single juror agent — ask it for signed testimony about
 *    an event. Each testimony costs the juror's x402 fee (0.01 USDC).
 *
 * Requires a running AgentVAR instance (npm start), reachable at VAR_URL.
 */
const VAR_URL = process.env.VAR_URL ?? "http://localhost:4402";
const role = process.env.MCP_ROLE ?? "consumer";
const jurorId = process.env.MCP_JUROR_ID ?? "juror-1";

const server = new McpServer({ name: role === "juror" ? `agentvar-${jurorId}` : "agentvar", version: "0.1.0" });

const text = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] });

async function getJson(path: string) {
  const res = await fetch(`${VAR_URL}${path}`);
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json();
}

/**
 * POSTs to the AgentVAR instance. When CONSUMER_PRIVATE_KEY is set, requests
 * go through an x402-aware client: if the endpoint answers 402, the client
 * signs a USDC payment on Injective EVM testnet and retries automatically —
 * the AI assistant driving this MCP server literally pays for truth.
 */
const consumerKey = process.env.CONSUMER_PRIVATE_KEY;
const payingFetch: typeof fetch = consumerKey
  ? (createInjectiveClient({
      privateKey: (consumerKey.startsWith("0x") ? consumerKey : `0x${consumerKey}`) as `0x${string}`,
      rpcUrl: process.env.INJECTIVE_RPC_URL,
    }).fetch as typeof fetch)
  : fetch;

async function postJson(path: string, body: unknown) {
  const res = await payingFetch(`${VAR_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data;
}

const eventArgs = {
  team: z.string().describe("Team name, e.g. 'Portugal'"),
  minute: z.number().describe("Match minute of the claimed goal"),
  player: z.string().optional().describe("Scorer, if known"),
};

if (role === "juror") {
  server.registerTool(
    "get_testimony",
    {
      description: `Ask ${jurorId} for signed, reasoned testimony about a claimed World Cup goal. Costs the juror's x402 testimony fee (0.01 USDC) on the injective rail.`,
      inputSchema: eventArgs,
    },
    async (args) => text(await postJson(`/api/jurors/${jurorId}/testify`, args))
  );
  server.registerTool(
    "juror_profile",
    { description: `Earnings, testimony count and withheld-fee count for ${jurorId}.`, inputSchema: {} },
    async () => {
      const state = await getJson("/api/state");
      return text(state.jurors.find((j: { id: string }) => j.id === jurorId));
    }
  );
} else {
  server.registerTool(
    "adjudicate_event",
    {
      description:
        "Submit a claimed World Cup goal for adjudication by the AgentVAR jury (3 independent AI jurors, 2/3 majority, cross-examination of dissent). Costs an x402 adjudication fee (0.05 USDC). Returns the final ruling with the VAR announcement.",
      inputSchema: eventArgs,
    },
    async (args) => text(await postJson("/api/adjudicate", { ...args, consumer: "mcp-client" }))
  );
  server.registerTool(
    "list_rulings",
    { description: "All rulings issued so far, with per-juror votes and payment outcomes.", inputSchema: {} },
    async () => text((await getJson("/api/state")).rulings)
  );
  server.registerTool(
    "juror_leaderboard",
    {
      description: "The jury's economics: USDC earned, testimonies given, and fees withheld for lying — the whole incentive system at a glance.",
      inputSchema: {},
    },
    async () => text((await getJson("/api/state")).jurors)
  );
  server.registerTool(
    "match_report",
    { description: "Summary of the adjudicated match: reviews, testimonies, withheld fees, parametric payouts.", inputSchema: {} },
    async () => {
      const s = await getJson("/api/state");
      return text({ summary: s.summary, parametricTerm: s.term, paymentRail: s.paymentRail });
    }
  );
}

await server.connect(new StdioServerTransport());
