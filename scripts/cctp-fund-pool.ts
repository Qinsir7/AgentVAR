/**
 * Cross-chain funding of the ParametricPool via Circle CCTP V2.
 *
 * Burns USDC on Ethereum Sepolia, fetches Circle's attestation from the Iris
 * API, and mints native USDC on Injective EVM Testnet directly into the
 * ParametricPool (or your funder wallet if no deployment exists yet).
 *
 * This is how sponsors/LPs anywhere fund World Cup insurance pools on
 * Injective without a bridge UI: burn → attest → mint, all scripted.
 *
 * Usage:
 *   npx tsx scripts/cctp-fund-pool.ts [amountUsdc]     (default 1)
 *
 * Requirements:
 *   - FUNDER_PRIVATE_KEY in .env, holding on Ethereum Sepolia:
 *     USDC (faucet.circle.com) and Sepolia ETH for gas
 *   - The same wallet needs INJ on Injective testnet to pay the mint gas
 */
import "dotenv/config";
import { createWalletClient, createPublicClient, http, pad, parseAbi, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { injectiveTestnet, requireEnv, loadDeployments, explorerTxUrl, usdcToUnits } from "../src/shared/chain.js";

// CCTP V2 testnet contracts (identical addresses across EVM testnets,
// including Injective — see docs.injective.network/developers-defi/usdc-stablecoin)
const TOKEN_MESSENGER_V2 = "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA";
const MESSAGE_TRANSMITTER_V2 = "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275";
const SEPOLIA_USDC = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
const SEPOLIA_DOMAIN = 0;
const INJECTIVE_DOMAIN = 29;
const IRIS_API = "https://iris-api-sandbox.circle.com";

const tokenMessengerAbi = parseAbi([
  "function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken, bytes32 destinationCaller, uint256 maxFee, uint32 minFinalityThreshold) external",
]);
const messageTransmitterAbi = parseAbi([
  "function receiveMessage(bytes message, bytes attestation) external returns (bool)",
]);
const erc20Abi = parseAbi([
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function balanceOf(address account) external view returns (uint256)",
]);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const amountUsdc = Number(process.argv[2] ?? 1);
  const amount = usdcToUnits(amountUsdc);
  const account = privateKeyToAccount(requireEnv("FUNDER_PRIVATE_KEY"));

  const sepoliaRpc = process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
  const srcWallet = createWalletClient({ account, chain: sepolia, transport: http(sepoliaRpc) });
  const srcPublic = createPublicClient({ chain: sepolia, transport: http(sepoliaRpc) });
  const dstWallet = createWalletClient({ account, chain: injectiveTestnet, transport: http() });
  const dstPublic = createPublicClient({ chain: injectiveTestnet, transport: http() });

  const deployments = loadDeployments();
  const recipient = (deployments?.parametricPool ?? account.address) as Hex;
  console.log(`CCTP: ${amountUsdc} USDC  Sepolia → Injective testnet`);
  console.log(`Recipient on Injective: ${recipient} ${deployments ? "(ParametricPool)" : "(funder wallet — no deployment found)"}`);

  // 1. Approve + burn on Sepolia
  const approveHash = await srcWallet.writeContract({
    address: SEPOLIA_USDC, abi: erc20Abi, functionName: "approve", args: [TOKEN_MESSENGER_V2, amount],
  });
  await srcPublic.waitForTransactionReceipt({ hash: approveHash });
  console.log(`approved (${approveHash})`);

  const burnHash = await srcWallet.writeContract({
    address: TOKEN_MESSENGER_V2,
    abi: tokenMessengerAbi,
    functionName: "depositForBurn",
    args: [
      amount,
      INJECTIVE_DOMAIN,
      pad(recipient), // mintRecipient as bytes32
      SEPOLIA_USDC,
      pad("0x0000000000000000000000000000000000000000"), // anyone may deliver
      0n, // maxFee 0 → standard (finality-gated) transfer
      2000, // minFinalityThreshold: finalized
    ],
  });
  await srcPublic.waitForTransactionReceipt({ hash: burnHash });
  console.log(`burned on Sepolia (${burnHash})`);

  // 2. Poll the Iris API for Circle's attestation (standard transfer:
  //    Sepolia finality ≈ 15-20 minutes)
  console.log("waiting for Circle attestation (standard transfer can take ~15-20 min)…");
  let message: { message: Hex; attestation: Hex } | undefined;
  for (let i = 0; ; i++) {
    const res = await fetch(`${IRIS_API}/v2/messages/${SEPOLIA_DOMAIN}?transactionHash=${burnHash}`);
    if (res.ok) {
      const data = (await res.json()) as { messages?: { message: Hex; attestation: Hex; status: string }[] };
      const m = data.messages?.[0];
      if (m?.status === "complete") { message = m; break; }
    }
    if (i % 6 === 0 && i > 0) console.log(`  still waiting… (${i * 10}s)`);
    await sleep(10_000);
  }
  console.log("attestation received");

  // 3. Mint on Injective
  const mintHash = await dstWallet.writeContract({
    address: MESSAGE_TRANSMITTER_V2,
    abi: messageTransmitterAbi,
    functionName: "receiveMessage",
    args: [message.message, message.attestation],
  });
  await dstPublic.waitForTransactionReceipt({ hash: mintHash });
  console.log(`minted on Injective: ${explorerTxUrl(mintHash)}`);

  const bal = await dstPublic.readContract({
    address: deployments?.usdc ?? "0x0C382e685bbeeFE5d3d9C29e29E341fEE8E84C5d",
    abi: erc20Abi, functionName: "balanceOf", args: [recipient],
  });
  console.log(`Recipient USDC balance on Injective: ${Number(bal) / 1e6}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
