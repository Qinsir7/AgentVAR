import { generateKeyPairSync, sign, verify } from "node:crypto";

/**
 * Each juror holds an Ed25519 keypair and signs its testimony, so a ruling is
 * auditable: anyone can verify which agent said what.
 */
export interface Signer {
  publicKey: string;
  sign(message: string): string;
}

export function createSigner(): Signer {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const pubDer = publicKey.export({ type: "spki", format: "der" }).toString("base64");
  return {
    publicKey: pubDer,
    sign(message: string) {
      return sign(null, Buffer.from(message), privateKey).toString("base64");
    },
  };
}

export function verifySignature(message: string, signatureB64: string, publicKeyB64: string): boolean {
  const key = {
    key: Buffer.from(publicKeyB64, "base64"),
    format: "der" as const,
    type: "spki" as const,
  };
  return verify(null, Buffer.from(message), key, Buffer.from(signatureB64, "base64"));
}

export function testimonyDigest(reviewId: string, jurorId: string, verdict: string, evidence: string): string {
  return JSON.stringify({ reviewId, jurorId, verdict, evidence });
}
