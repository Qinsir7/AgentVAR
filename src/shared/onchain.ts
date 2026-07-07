import { keccak256, toBytes, toHex, type Hex } from "viem";
import type { Ruling, Review, Testimony } from "./types.js";
import { walletFor, requireEnv, loadArtifacts, loadDeployments, explorerTxUrl, waitForTx } from "./chain.js";

export const isInjectiveMode = () => process.env.PAYMENT_RAIL === "injective";

export const reviewIdBytes32 = (reviewId: string): Hex => keccak256(toBytes(reviewId));

/**
 * Anchor a final ruling on the TruthOracle contract (Injective EVM testnet).
 * Called by the Arbiter agent; the tx hash becomes part of the ruling so the
 * dashboard can link straight to the explorer.
 */
export async function anchorRuling(review: Review, ruling: Ruling, testimonies: Testimony[]): Promise<{ txHash: string; explorerUrl: string }> {
  const deployments = loadDeployments();
  if (!deployments) throw new Error("deployments.json missing — run scripts/deploy.ts first");
  const artifacts = loadArtifacts();
  const arbiter = walletFor(requireEnv("ARBITER_PRIVATE_KEY"));

  const testimonyRoot = keccak256(toHex(testimonies.map((t) => t.signature).join("|")));
  const tally = ruling.votes.filter((v) => v.agreedWithMajority).length;

  const txHash = await arbiter.writeContract({
    address: deployments.truthOracle,
    abi: artifacts.TruthOracle.abi,
    functionName: "recordRuling",
    args: [
      reviewIdBytes32(ruling.reviewId),
      ruling.verdict === "confirmed",
      review.event.team,
      review.event.minute,
      tally,
      ruling.votes.length,
      testimonyRoot,
    ],
  });
  await waitForTx(txHash);
  return { txHash, explorerUrl: explorerTxUrl(txHash) };
}

/**
 * Trigger the ParametricPool payout for a ruling. Permissionless on-chain —
 * the pool itself re-verifies the term against the TruthOracle record, so the
 * Treasurer agent is just the caller, not a trusted party.
 */
export async function claimParametricPayout(reviewId: string): Promise<{ txHash: string; explorerUrl: string }> {
  const deployments = loadDeployments();
  if (!deployments) throw new Error("deployments.json missing — run scripts/deploy.ts first");
  const artifacts = loadArtifacts();
  const treasurer = walletFor(requireEnv("TREASURER_PRIVATE_KEY"));

  const txHash = await treasurer.writeContract({
    address: deployments.parametricPool,
    abi: artifacts.ParametricPool.abi,
    functionName: "claim",
    args: [reviewIdBytes32(reviewId)],
  });
  await waitForTx(txHash);
  return { txHash, explorerUrl: explorerTxUrl(txHash) };
}
