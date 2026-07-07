import { randomBytes } from "node:crypto";
import { createInjectiveClient, parsePaymentResponseHeader } from "@injectivelabs/x402/client";
import type { PaymentReceipt, ReceiptKind } from "./types.js";
import { bus } from "./bus.js";
import { explorerTxUrl, requireEnv } from "./chain.js";

/**
 * PaymentRail abstracts how agents pay each other.
 *
 * - MockRail: deterministic in-process simulation. Every economic event that
 *   would be an x402 payment is recorded as a receipt, including *withheld*
 *   payments (the punishment for lying jurors).
 * - InjectiveX402Rail: the same interface backed by real USDC transfers on
 *   Injective EVM testnet using the x402 flow (client pays a 402-gated
 *   endpoint, settlement lands in ~650ms). See docs/roadmap.md — wiring is
 *   isolated to this file on purpose.
 */
export interface PayParams {
  kind: ReceiptKind;
  from: string;
  to: string;
  amountUsdc: number;
  reviewId?: string;
  note: string;
}

export interface PaymentRail {
  readonly mode: "mock" | "injective";
  pay(params: PayParams): Promise<PaymentReceipt>;
  withhold(params: PayParams): Promise<PaymentReceipt>;
}

function receiptBase(params: PayParams): Omit<PaymentReceipt, "status" | "txHash" | "explorerUrl" | "mock"> {
  return {
    id: `rcpt_${randomBytes(4).toString("hex")}`,
    kind: params.kind,
    from: params.from,
    to: params.to,
    amountUsdc: params.amountUsdc,
    reviewId: params.reviewId,
    note: params.note,
    timestamp: Date.now(),
  };
}

class MockRail implements PaymentRail {
  readonly mode = "mock" as const;

  async pay(params: PayParams): Promise<PaymentReceipt> {
    const receipt: PaymentReceipt = {
      ...receiptBase(params),
      status: "settled",
      txHash: `0x${randomBytes(32).toString("hex")}`,
      explorerUrl: undefined,
      mock: true,
    };
    bus.publish("receipt", receipt);
    return receipt;
  }

  async withhold(params: PayParams): Promise<PaymentReceipt> {
    const receipt: PaymentReceipt = {
      ...receiptBase(params),
      status: "withheld",
      mock: true,
    };
    bus.publish("receipt", receipt);
    return receipt;
  }
}

class InjectiveX402Rail implements PaymentRail {
  readonly mode = "injective" as const;
  private client: ReturnType<typeof createInjectiveClient> | null = null;

  private getClient() {
    if (!this.client) {
      this.client = createInjectiveClient({
        privateKey: requireEnv("ARBITER_PRIVATE_KEY"),
        rpcUrl: process.env.INJECTIVE_RPC_URL,
      });
    }
    return this.client;
  }

  /**
   * Settles a testimony fee by calling the juror's x402-gated claim endpoint.
   * The endpoint answers 402 with the juror's price (payTo = juror wallet);
   * the arbiter's client signs an EIP-3009 USDC authorization, the facilitator
   * settles it on Injective EVM (~650ms), and the response carries the tx
   * hash in the PAYMENT-RESPONSE header.
   */
  async pay(params: PayParams): Promise<PaymentReceipt> {
    if (params.kind !== "testimony-fee") {
      throw new Error(
        `InjectiveX402Rail.pay only handles testimony fees; ${params.kind} settles on-chain elsewhere ` +
          "(adjudication fees via the x402 middleware, payouts via ParametricPool.claim)"
      );
    }
    const selfUrl = process.env.VAR_URL ?? `http://localhost:${process.env.PORT ?? 4402}`;
    const res = await this.getClient().fetch(`${selfUrl}/api/jurors/${params.to}/claim?reviewId=${params.reviewId}`);
    if (!res.ok) throw new Error(`x402 claim for ${params.to} failed: ${res.status} ${await res.text()}`);
    const settlement = parsePaymentResponseHeader(res);

    const receipt: PaymentReceipt = {
      ...receiptBase(params),
      status: "settled",
      txHash: settlement?.transaction,
      explorerUrl: settlement?.transaction ? explorerTxUrl(settlement.transaction) : undefined,
      mock: false,
    };
    bus.publish("receipt", receipt);
    return receipt;
  }

  async withhold(params: PayParams): Promise<PaymentReceipt> {
    // Withholding is the absence of an x402 call: the arbiter simply never
    // pays the dissenting juror's claim endpoint. We still record it locally
    // so the dashboard can show the punishment.
    const receipt: PaymentReceipt = { ...receiptBase(params), status: "withheld", mock: false };
    bus.publish("receipt", receipt);
    return receipt;
  }
}

export function createPaymentRail(): PaymentRail {
  return process.env.PAYMENT_RAIL === "injective" ? new InjectiveX402Rail() : new MockRail();
}

/**
 * Record a payment that was already settled on-chain by other machinery
 * (the x402 middleware for adjudication fees, ParametricPool.claim for
 * payouts) so it shows up in the receipt ticker with its explorer link.
 */
export function recordSettledReceipt(params: PayParams, txHash?: string): PaymentReceipt {
  const receipt: PaymentReceipt = {
    ...receiptBase(params),
    status: "settled",
    txHash,
    explorerUrl: txHash ? explorerTxUrl(txHash) : undefined,
    mock: false,
  };
  bus.publish("receipt", receipt);
  return receipt;
}
