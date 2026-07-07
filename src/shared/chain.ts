import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

/** Injective EVM Testnet (chain 1439) — where all AgentVAR value settles. */
export const injectiveTestnet = defineChain({
  id: 1439,
  name: "Injective EVM Testnet",
  nativeCurrency: { name: "Injective", symbol: "INJ", decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.INJECTIVE_RPC_URL ?? "https://k8s.testnet.json-rpc.injective.network"] },
  },
  blockExplorers: {
    default: { name: "Blockscout", url: "https://testnet.blockscout.injective.network" },
  },
  testnet: true,
});

/** Native Circle USDC on Injective EVM Testnet (FiatTokenV2_2, EIP-3009). */
export const USDC_ADDRESS: Address = "0x0C382e685bbeeFE5d3d9C29e29E341fEE8E84C5d";
export const USDC_DECIMALS = 6;
export const INJECTIVE_TESTNET_CAIP2 = "eip155:1439";

export const explorerTxUrl = (hash: string) => `https://testnet.blockscout.injective.network/tx/${hash}`;
export const explorerAddressUrl = (addr: string) => `https://testnet.blockscout.injective.network/address/${addr}`;

export const usdcToUnits = (usdc: number) => BigInt(Math.round(usdc * 10 ** USDC_DECIMALS));

export const publicClient = createPublicClient({ chain: injectiveTestnet, transport: http() });

/**
 * The public testnet RPC sits behind a load balancer whose nodes lag each
 * other badly: receipt lookups can fail for minutes after a tx has landed.
 * So we confirm transactions by their *effect* (balance moved, code present,
 * contract state changed) instead of waiting for receipts.
 */
export async function waitForEffect(check: () => Promise<boolean>, what: string, timeoutMs = 120_000): Promise<void> {
  const start = Date.now();
  for (;;) {
    try {
      if (await check()) return;
    } catch {
      // transient RPC error — keep polling
    }
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 2000));
  }
}

/** Best-effort receipt wait with effect-check fallback semantics. */
export async function waitForTx(hash: Hex, timeoutMs = 120_000) {
  const start = Date.now();
  for (;;) {
    try {
      const receipt = await publicClient.getTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error(`tx ${hash} reverted`);
      return receipt;
    } catch (e) {
      if ((e as Error).message.includes("reverted")) throw e;
    }
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for tx ${hash}`);
    await new Promise((r) => setTimeout(r, 1500));
  }
}

export function walletFor(privateKey: Hex) {
  const account = privateKeyToAccount(privateKey);
  return createWalletClient({ account, chain: injectiveTestnet, transport: http() });
}

export const ERC20_ABI = [
  {
    type: "function", name: "transfer", stateMutability: "nonpayable",
    inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function", name: "balanceOf", stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

// ---------------------------------------------------------------------------
// Contract artifacts & deployments

const root = fileURLToPath(new URL("../..", import.meta.url));

export function loadArtifacts(): Record<string, { abi: Abi; bytecode: Hex }> {
  const path = `${root}/contracts/artifacts.json`;
  if (!existsSync(path)) throw new Error("contracts/artifacts.json missing — run: npx tsx scripts/compile.ts");
  return JSON.parse(readFileSync(path, "utf-8"));
}

export interface Deployments {
  chainId: number;
  truthOracle: Address;
  parametricPool: Address;
  usdc: Address;
  term: { team: string; afterMinute: number; beforeMinute: number; payoutUsdc: number; beneficiary: Address; description: string };
  deployedAt: string;
  txs: Record<string, string>;
}

export function loadDeployments(): Deployments | null {
  const path = `${root}/deployments.json`;
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8"));
}

export function requireEnv(name: string): Hex {
  const v = process.env[name];
  if (!v) throw new Error(`missing env var ${name} — see .env.example`);
  return (v.startsWith("0x") ? v : `0x${v}`) as Hex;
}
