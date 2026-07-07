/** Prints INJ + USDC balances for the funder and all generated role wallets. */
import "dotenv/config";
import { formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { publicClient, ERC20_ABI, USDC_ADDRESS, requireEnv, USDC_DECIMALS } from "../src/shared/chain.js";

const roles = [
  "FUNDER_PRIVATE_KEY",
  "FACILITATOR_PRIVATE_KEY",
  "ARBITER_PRIVATE_KEY",
  "TREASURER_PRIVATE_KEY",
  "CONSUMER_PRIVATE_KEY",
  "JUROR_1_PRIVATE_KEY",
  "JUROR_2_PRIVATE_KEY",
  "JUROR_3_PRIVATE_KEY",
  "BENEFICIARY_PRIVATE_KEY",
];

for (const role of roles) {
  if (!process.env[role]) continue;
  const account = privateKeyToAccount(requireEnv(role));
  const inj = await publicClient.getBalance({ address: account.address });
  const usdc = (await publicClient.readContract({
    address: USDC_ADDRESS, abi: ERC20_ABI, functionName: "balanceOf", args: [account.address],
  })) as bigint;
  const name = role.replace("_PRIVATE_KEY", "").toLowerCase();
  console.log(
    `${name.padEnd(12)} ${account.address}  ${Number(formatEther(inj)).toFixed(4).padStart(10)} INJ  ${(Number(usdc) / 10 ** USDC_DECIMALS).toFixed(2).padStart(8)} USDC`
  );
}
