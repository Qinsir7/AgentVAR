/**
 * AgentVAR SDK — verified sports truth as a service, for any TypeScript app.
 *
 * What it gives you:
 *  - `adjudicate()` — submit a claimed goal; a jury of independent AI agents
 *    fetches evidence from separate real-world sources, votes 2/3, and returns
 *    a signed ruling anchored on Injective EVM testnet.
 *  - x402 payments handled automatically: if the AgentVAR endpoint answers
 *    HTTP 402, the client signs a USDC transfer on Injective and retries.
 *  - `verifyTestimony()` — check each juror's Ed25519 signature locally, so
 *    you don't even have to trust the AgentVAR server about who said what.
 *
 * This folder is self-contained on purpose: copy `sdk/` into your own project
 * (deps: `@injectivelabs/x402`) and it works against any AgentVAR instance.
 */
import { createInjectiveClient } from "@injectivelabs/x402/client";
import { verify as edVerify } from "node:crypto";

export interface GoalClaim {
  team: string;
  minute: number;
  player?: string;
  description?: string;
}

export interface Testimony {
  reviewId: string;
  jurorId: string;
  verdict: "confirmed" | "denied";
  confidence: number;
  rationale: string;
  evidence: string;
  feeUsdc: number;
  publicKey: string; // Ed25519 SPKI, base64
  signature: string; // base64
  timestamp: number;
}

export interface Vote {
  jurorId: string;
  verdict: "confirmed" | "denied";
  agreedWithMajority: boolean;
  paid: boolean;
}

export interface Ruling {
  reviewId: string;
  verdict: "confirmed" | "denied";
  votes: Vote[];
  announcement: string;
  crossExamination?: { jurorId: string; question: string; answer: string };
  finalizedAt: number;
  anchorTxHash?: string;
  anchorExplorerUrl?: string;
}

export interface JurorProfile {
  id: string;
  name: string;
  sourceName: string;
  earnedUsdc: number;
  testimonies: number;
  withheld: number;
  compromised: boolean;
}

export interface AgentVAROptions {
  /** AgentVAR instance URL. Default: http://localhost:4402 */
  baseUrl?: string;
  /**
   * EVM private key holding USDC on Injective EVM testnet. Required to call
   * the paid endpoints when the instance runs on the injective rail; omit it
   * against a mock-rail instance.
   */
  privateKey?: string;
  /** Injective EVM testnet RPC override (recommended: a stable endpoint). */
  rpcUrl?: string;
}

export class AgentVARClient {
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;

  constructor(opts: AgentVAROptions = {}) {
    this.baseUrl = (opts.baseUrl ?? "http://localhost:4402").replace(/\/$/, "");
    if (opts.privateKey) {
      const pk = (opts.privateKey.startsWith("0x") ? opts.privateKey : `0x${opts.privateKey}`) as `0x${string}`;
      this.fetcher = createInjectiveClient({ privateKey: pk, rpcUrl: opts.rpcUrl }).fetch as typeof fetch;
    } else {
      this.fetcher = fetch;
    }
  }

  /**
   * Ask the jury: "did this goal happen?" Pays the x402 adjudication fee
   * (0.05 USDC) automatically and resolves to the final signed ruling.
   */
  async adjudicate(claim: GoalClaim): Promise<Ruling> {
    return this.post("/api/adjudicate", claim);
  }

  /**
   * Buy a single juror's signed testimony directly (0.01 USDC via x402)
   * without convening the full jury.
   */
  async getTestimony(jurorId: string, claim: GoalClaim): Promise<Testimony> {
    return this.post(`/api/jurors/${jurorId}/testify`, claim);
  }

  /** All rulings issued by this instance so far. */
  async rulings(): Promise<Ruling[]> {
    return (await this.state()).rulings;
  }

  /** Jury economics: USDC earned, testimonies given, fees withheld for lying. */
  async leaderboard(): Promise<JurorProfile[]> {
    return (await this.state()).jurors;
  }

  /** Full instance state (reviews, rulings, testimonies, receipts, term...). */
  async state(): Promise<{
    paymentRail: string;
    matchMode: string;
    rulings: Ruling[];
    testimonies: Testimony[];
    jurors: JurorProfile[];
    [k: string]: unknown;
  }> {
    const res = await this.fetcher(`${this.baseUrl}/api/state`);
    if (!res.ok) throw new Error(`GET /api/state → ${res.status}`);
    return res.json();
  }

  /**
   * Verify a testimony's Ed25519 signature locally — proof that this exact
   * juror produced this exact verdict over this exact evidence.
   */
  verifyTestimony(t: Testimony): boolean {
    const digest = JSON.stringify({ reviewId: t.reviewId, jurorId: t.jurorId, verdict: t.verdict, evidence: t.evidence });
    return edVerify(
      null,
      Buffer.from(digest),
      { key: Buffer.from(t.publicKey, "base64"), format: "der", type: "spki" },
      Buffer.from(t.signature, "base64")
    );
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await this.fetcher(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`POST ${path} → ${res.status}: ${JSON.stringify(data)}`);
    return data as T;
  }
}
