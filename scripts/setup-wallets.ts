/**
 * One-time wallet setup for injective mode.
 *
 * You provide ONE funded wallet (testnet INJ for gas + testnet USDC) in .env:
 *   FUNDER_PRIVATE_KEY=0x...
 *
 * This script generates fresh wallets for every agent role, appends them to
 * .env, and distributes funds from the funder:
 *   - facilitator: 0.2 INJ  (pays gas when settling every x402 payment)
 *   - arbiter:     0.1 INJ + 1.0 USDC (anchors rulings on-chain, pays jurors)
 *   - treasurer:   0.1 INJ  (triggers ParametricPool.claim)
 *   - consumer:    0.5 USDC (an external agent that buys adjudications via x402)
 *   - jurors 1-3:  nothing  (they only *receive* x402 payments)
 *
 * Faucets: INJ → testnet.faucet.injective.network, USDC → faucet.circle.com
 * (select "Injective Testnet").
 */
import "dotenv/config";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { formatEther, parseEther, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { publicClient, walletFor, requireEnv, ERC20_ABI, USDC_ADDRESS, usdcToUnits, USDC_DECIMALS } from "../src/shared/chain.js";

const envPath = fileURLToPath(new URL("../.env", import.meta.url));

const ROLES = [
  "FACILITATOR_PRIVATE_KEY",
  "ARBITER_PRIVATE_KEY",
  "TREASURER_PRIVATE_KEY",
  "CONSUMER_PRIVATE_KEY",
  "JUROR_1_PRIVATE_KEY",
  "JUROR_2_PRIVATE_KEY",
  "JUROR_3_PRIVATE_KEY",
  "BENEFICIARY_PRIVATE_KEY",
] as const;

function upsertEnv(lines: string[], key: string, value: string): string[] {
  const idx = lines.findIndex((l) => l.startsWith(`${key}=`));
  if (idx >= 0) lines[idx] = `${key}=${value}`;
  else lines.push(`${key}=${value}`);
  return lines;
}

async function main() {
  const funderKey = requireEnv("FUNDER_PRIVATE_KEY");
  const funder = walletFor(funderKey);

  // 1. Generate any missing role keys and persist them to .env
  let envText = existsSync(envPath) ? readFileSync(envPath, "utf-8") : "";
  let lines = envText.split("\n");
  const keys: Record<string, Hex> = {};
  for (const role of ROLES) {
    const existing = process.env[role];
    keys[role] = (existing as Hex) || generatePrivateKey();
    if (!existing) lines = upsertEnv(lines, role, keys[role]);
  }
  const addr = (role: (typeof ROLES)[number]): Address => privateKeyToAccount(keys[role]).address;
  lines = upsertEnv(lines, "BENEFICIARY_ADDRESS", addr("BENEFICIARY_PRIVATE_KEY"));
  writeFileSync(envPath, lines.join("\n"));

  console.log("Role wallets:");
  for (const role of ROLES) console.log(`  ${role.replace("_PRIVATE_KEY", "").toLowerCase().padEnd(12)} ${addr(role)}`);

  // 2. Check funder balances
  const injBal = await publicClient.getBalance({ address: funder.account.address });
  const usdcBal = (await publicClient.readContract({
    address: USDC_ADDRESS, abi: ERC20_ABI, functionName: "balanceOf", args: [funder.account.address],
  })) as bigint;
  console.log(`\nFunder ${funder.account.address}: ${formatEther(injBal)} INJ, ${Number(usdcBal) / 10 ** USDC_DECIMALS} USDC`);
  if (injBal < parseEther("0.5")) console.warn("⚠ low INJ — top up at testnet.faucet.injective.network");
  if (usdcBal < usdcToUnits(3)) console.warn("⚠ low USDC — top up at faucet.circle.com (Injective Testnet)");

  // 3. Distribute. Idempotent (skips wallets already at target) and confirmed
  //    by polling the destination *balance* rather than the tx receipt — the
  //    public testnet RPC sits behind a load balancer whose nodes lag each
  //    other, so receipt lookups are flaky even after a tx has landed.
  const injBalance = (a: Address) => publicClient.getBalance({ address: a });
  const usdcBalance = async (a: Address) =>
    (await publicClient.readContract({
      address: USDC_ADDRESS, abi: ERC20_ABI, functionName: "balanceOf", args: [a],
    })) as bigint;
  const untilBalance = async (read: () => Promise<bigint>, target: bigint, what: string) => {
    for (let i = 0; i < 60; i++) {
      if ((await read()) >= target) return;
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error(`timed out waiting for ${what} to reach target balance`);
  };

  const sendInj = async (to: Address, inj: string) => {
    const target = parseEther(inj);
    const current = await injBalance(to);
    if (current >= target) {
      console.log(`  ${to} already has ${formatEther(current)} INJ — skip`);
      return;
    }
    const hash = await funder.sendTransaction({ to, value: target - current });
    await untilBalance(() => injBalance(to), target, `${to} INJ`);
    console.log(`  ${inj} INJ → ${to} (${hash})`);
  };
  const sendUsdc = async (to: Address, usdc: number) => {
    const target = usdcToUnits(usdc);
    const current = await usdcBalance(to);
    if (current >= target) {
      console.log(`  ${to} already has ${Number(current) / 10 ** USDC_DECIMALS} USDC — skip`);
      return;
    }
    const hash = await funder.writeContract({
      address: USDC_ADDRESS, abi: ERC20_ABI, functionName: "transfer", args: [to, target - current],
    });
    await untilBalance(() => usdcBalance(to), target, `${to} USDC`);
    console.log(`  ${usdc} USDC → ${to} (${hash})`);
  };

  console.log("\nDistributing gas and working capital…");
  await sendInj(addr("FACILITATOR_PRIVATE_KEY"), "0.2");
  await sendInj(addr("ARBITER_PRIVATE_KEY"), "0.1");
  await sendInj(addr("TREASURER_PRIVATE_KEY"), "0.1");
  await sendUsdc(addr("ARBITER_PRIVATE_KEY"), 1.0);
  await sendUsdc(addr("CONSUMER_PRIVATE_KEY"), 0.5);

  console.log("\nDone. Next: npx tsx scripts/deploy.ts");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
