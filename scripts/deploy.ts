/**
 * Deploys TruthOracle + ParametricPool to Injective EVM Testnet and funds the
 * pool with its payout amount in USDC. Writes deployments.json.
 *
 * Note: the public testnet RPC's receipt lookups are unreliable (lagging
 * load-balanced nodes), so deployment is confirmed by checking that code
 * exists at the predicted contract address, and funding by the pool's USDC
 * balance.
 *
 * Prerequisites: scripts/compile.ts, scripts/setup-wallets.ts, and a funded
 * FUNDER_PRIVATE_KEY in .env.
 */
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getContractAddress, type Abi, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  publicClient, walletFor, requireEnv, loadArtifacts, waitForEffect,
  USDC_ADDRESS, usdcToUnits, ERC20_ABI, explorerAddressUrl, type Deployments,
} from "../src/shared/chain.js";

const TERM = {
  team: process.env.TERM_TEAM ?? "Argentina",
  afterMinute: 45,
  beforeMinute: 90,
  payoutUsdc: Number(process.env.POOL_PAYOUT_USDC ?? 1),
};
const description = `Pays ${TERM.payoutUsdc} USDC if ${TERM.team} scores in the second half before the ${TERM.beforeMinute}th minute`;

async function main() {
  const artifacts = loadArtifacts();
  const deployer = walletFor(requireEnv("FUNDER_PRIVATE_KEY"));
  const arbiter = privateKeyToAccount(requireEnv("ARBITER_PRIVATE_KEY")).address;
  const beneficiary = (process.env.BENEFICIARY_ADDRESS ?? arbiter) as Address;
  const txs: Record<string, string> = {};

  console.log(`Deployer: ${deployer.account.address}\nArbiter (oracle writer): ${arbiter}\nBeneficiary: ${beneficiary}\n`);

  const deploy = async (name: string, abi: Abi, bytecode: Hex, args: unknown[]): Promise<Address> => {
    const nonce = await publicClient.getTransactionCount({ address: deployer.account.address });
    const predicted = getContractAddress({ from: deployer.account.address, nonce: BigInt(nonce) });
    const hash = await deployer.deployContract({ abi, bytecode, args });
    txs[`deploy${name}`] = hash;
    await waitForEffect(
      async () => !!(await publicClient.getCode({ address: predicted })),
      `${name} bytecode at ${predicted}`
    );
    console.log(`${name.padEnd(14)} → ${predicted}\n  ${explorerAddressUrl(predicted)}`);
    return predicted;
  };

  // 1. TruthOracle
  const truthOracle = await deploy("TruthOracle", artifacts.TruthOracle.abi, artifacts.TruthOracle.bytecode, [arbiter]);

  // 2. ParametricPool
  const parametricPool = await deploy("ParametricPool", artifacts.ParametricPool.abi, artifacts.ParametricPool.bytecode, [
    USDC_ADDRESS, truthOracle, TERM.team, TERM.afterMinute, TERM.beforeMinute,
    usdcToUnits(TERM.payoutUsdc), beneficiary, description,
  ]);

  // 3. Fund the pool with the payout amount
  const target = usdcToUnits(TERM.payoutUsdc);
  const poolBalance = async () =>
    (await publicClient.readContract({
      address: USDC_ADDRESS, abi: ERC20_ABI, functionName: "balanceOf", args: [parametricPool],
    })) as bigint;
  const fundHash = await deployer.writeContract({
    address: USDC_ADDRESS, abi: ERC20_ABI, functionName: "transfer", args: [parametricPool, target],
  });
  txs.fundPool = fundHash;
  await waitForEffect(async () => (await poolBalance()) >= target, "pool USDC balance");
  console.log(`Pool funded with ${TERM.payoutUsdc} USDC (${fundHash})`);

  const deployments: Deployments = {
    chainId: 1439,
    truthOracle,
    parametricPool,
    usdc: USDC_ADDRESS,
    term: { ...TERM, beneficiary, description },
    deployedAt: new Date().toISOString(),
    txs,
  };
  const outPath = fileURLToPath(new URL("../deployments.json", import.meta.url));
  writeFileSync(outPath, JSON.stringify(deployments, null, 2));
  console.log("\n→ deployments.json written. Start the crew with: PAYMENT_RAIL=injective npm start");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
