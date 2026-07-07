import "dotenv/config";
import express from "express";
import { fileURLToPath } from "node:url";
import { privateKeyToAccount } from "viem/accounts";
import { injectivePaymentMiddleware, type RouteMap } from "@injectivelabs/x402/middleware";
import { Engine } from "./engine.js";
import { bus, type BusMessage } from "./shared/bus.js";
import { recordSettledReceipt } from "./shared/payments.js";
import { isInjectiveMode } from "./shared/onchain.js";
import { USDC_ADDRESS, INJECTIVE_TESTNET_CAIP2, usdcToUnits, requireEnv } from "./shared/chain.js";
import { ADJUDICATION_FEE_USDC } from "./agents/arbiter.js";
import { TESTIMONY_FEE_USDC } from "./agents/juror.js";

const app = express();
app.use(express.json());
const engine = new Engine();

interface X402Meta {
  txHash?: string;
  payer?: string;
}
const x402Meta = (req: express.Request): X402Meta => (req as express.Request & { x402?: X402Meta }).x402 ?? {};

/**
 * Real x402 gating (injective mode only). One middleware protects:
 *  - POST /api/adjudicate            → 0.05 USDC to the arbiter wallet
 *  - GET  /api/jurors/:id/claim      → 0.01 USDC to that juror's wallet
 *  - POST /api/jurors/:id/testify    → 0.01 USDC to that juror's wallet
 * Settlement runs through an inline facilitator (FACILITATOR_PRIVATE_KEY pays
 * INJ gas); every payment is a real USDC transfer on Injective EVM testnet.
 */
if (isInjectiveMode()) {
  const arbiterAddress = privateKeyToAccount(requireEnv("ARBITER_PRIVATE_KEY")).address;
  const paymentOption = (payTo: `0x${string}`, usdc: number) => ({
    accepts: [{
      network: INJECTIVE_TESTNET_CAIP2,
      asset: USDC_ADDRESS,
      amount: usdcToUnits(usdc).toString(),
      payTo,
    }],
  });

  const routes: RouteMap = {
    "POST /api/adjudicate": {
      description: "Adjudicated World Cup truth from a jury of independent AI agents",
      ...paymentOption(arbiterAddress, ADJUDICATION_FEE_USDC),
    },
  };
  for (const n of [1, 2, 3]) {
    const jurorAddress = privateKeyToAccount(requireEnv(`JUROR_${n}_PRIVATE_KEY`)).address;
    routes[`GET /api/jurors/juror-${n}/claim`] = {
      description: `Testimony fee claim for juror-${n}`,
      ...paymentOption(jurorAddress, TESTIMONY_FEE_USDC),
    };
    routes[`POST /api/jurors/juror-${n}/testify`] = {
      description: `Signed, reasoned testimony from juror-${n}`,
      ...paymentOption(jurorAddress, TESTIMONY_FEE_USDC),
    };
  }

  app.use(
    injectivePaymentMiddleware(routes, {
      facilitator: {
        privateKey: requireEnv("FACILITATOR_PRIVATE_KEY"),
        rpcUrl: process.env.INJECTIVE_RPC_URL,
      },
    })
  );
}

const publicDir = fileURLToPath(new URL("../public", import.meta.url));
app.use(express.static(publicDir));
app.get("/dashboard", (_req, res) => res.sendFile(`${publicDir}/dashboard.html`));

/** Full queryable state (also consumed by the MCP server). */
app.get("/api/state", (_req, res) => res.json(engine.state()));

/** Server-sent events stream for the live dashboard. */
app.get("/api/events", (req, res) => {
  res.setHeader("content-type", "text/event-stream");
  res.setHeader("cache-control", "no-cache");
  res.flushHeaders();
  const onMessage = (msg: BusMessage) => res.write(`data: ${JSON.stringify(msg)}\n\n`);
  bus.on("message", onMessage);
  req.on("close", () => bus.off("message", onMessage));
});

/** Demo control: advance the match by one event and adjudicate it. */
app.post("/api/demo/advance", async (_req, res) => {
  try {
    const ruling = await engine.advance();
    if (!ruling) return res.status(404).json({ error: "full time — no events left" });
    res.json(ruling);
  } catch (e) {
    res.status(409).json({ error: (e as Error).message });
  }
});

/** Demo control: arm the backdoor on the compromisable juror. */
app.post("/api/demo/arm-lie", (_req, res) => {
  engine.armLie();
  res.json({ ok: true, note: "juror-3 will falsify its next testimony" });
});

/**
 * Consumer endpoint: adjudicated truth as a service.
 * In injective mode the x402 middleware above has already collected and
 * settled the 0.05 USDC fee before this handler runs — we just record the
 * receipt with its tx hash. In mock mode the fee is simulated.
 */
app.post("/api/adjudicate", async (req, res) => {
  const { type = "goal", minute, team, player, description = "" } = req.body ?? {};
  if (typeof minute !== "number" || typeof team !== "string") {
    return res.status(400).json({ error: "body must include { minute: number, team: string }" });
  }
  const feeParams = {
    kind: "adjudication-fee" as const,
    from: req.body?.consumer ?? x402Meta(req).payer ?? "external-consumer",
    to: "arbiter",
    amountUsdc: ADJUDICATION_FEE_USDC,
    note: "x402 adjudication fee — truth as a service",
  };
  if (isInjectiveMode()) recordSettledReceipt(feeParams, x402Meta(req).txHash);
  else await engine.rail.pay(feeParams);

  const ruling = await engine.adjudicate({
    id: `adhoc-${Date.now()}`,
    type,
    minute,
    team,
    player,
    description,
  });
  res.json(ruling);
});

/**
 * Per-juror claim endpoint — how a juror gets paid for a truthful testimony.
 * In injective mode this route is x402-gated with payTo = the juror's own
 * wallet: the arbiter's client pays 0.01 USDC here, and NOT calling this
 * endpoint for a dissenting juror IS the punishment (fee withheld).
 */
app.get("/api/jurors/:id/claim", (req, res) => {
  const juror = engine.jurors.find((j) => j.id === req.params.id);
  if (!juror) return res.status(404).json({ error: "unknown juror" });
  res.json({
    jurorId: juror.id,
    reviewId: req.query.reviewId ?? null,
    acknowledgment: `testimony fee claim accepted by ${juror.profile.name}`,
    settledTx: x402Meta(req).txHash ?? null,
  });
});

/**
 * Per-juror testimony endpoint — the HTTP face of "each juror is its own
 * agent". In injective mode this route is x402-gated at the juror's
 * testimony fee. The per-juror MCP role (npm run mcp:juror) fronts this same
 * endpoint for AI-assistant consumers.
 */
app.post("/api/jurors/:id/testify", async (req, res) => {
  const juror = engine.jurors.find((j) => j.id === req.params.id);
  if (!juror) return res.status(404).json({ error: "unknown juror" });
  const { minute, team, player, description = "" } = req.body ?? {};
  if (typeof minute !== "number" || typeof team !== "string") {
    return res.status(400).json({ error: "body must include { minute: number, team: string }" });
  }
  const testimony = await juror.testify({
    id: `direct-${Date.now()}`,
    event: { id: `adhoc-${Date.now()}`, type: "goal", minute, team, player, description },
    question: `Did ${team} score a goal at minute ${minute}?`,
    openedAt: Date.now(),
    status: "open",
  });
  res.json(testimony);
});

const port = Number(process.env.PORT ?? 4402);
engine
  .init()
  .then(() => {
    app.listen(port, () => {
      console.log(`AgentVAR crew is on the pitch → http://localhost:${port}`);
      console.log(`payment rail: ${engine.rail.mode} · match mode: ${engine.matchMode}`);
      const m = engine.scout.liveMatch;
      if (m) console.log(`tracking: ${m.home} vs ${m.away} (${m.status})`);
    });
  })
  .catch((e) => {
    console.error("engine init failed:", (e as Error).message);
    process.exit(1);
  });
