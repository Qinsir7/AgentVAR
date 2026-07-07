export type EventType = "goal";

export interface MatchEvent {
  id: string;
  type: EventType;
  minute: number;
  team: string;
  player?: string;
  description: string;
}

/** A VAR review opened by the Scout agent for one match event. */
export interface Review {
  id: string;
  event: MatchEvent;
  question: string;
  openedAt: number;
  status: "open" | "ruled";
}

export type Verdict = "confirmed" | "denied";

/** Signed, reasoned testimony produced by one juror agent. */
export interface Testimony {
  reviewId: string;
  jurorId: string;
  verdict: Verdict;
  confidence: number;
  rationale: string;
  evidence: string;
  feeUsdc: number;
  publicKey: string;
  signature: string;
  timestamp: number;
}

export interface CrossExamination {
  jurorId: string;
  question: string;
  answer: string;
}

export interface Vote {
  jurorId: string;
  verdict: Verdict;
  agreedWithMajority: boolean;
  paid: boolean;
}

export interface Ruling {
  reviewId: string;
  verdict: Verdict;
  votes: Vote[];
  announcement: string;
  crossExamination?: CrossExamination;
  finalizedAt: number;
  /** TruthOracle anchor tx on Injective EVM testnet (injective mode only). */
  anchorTxHash?: string;
  anchorExplorerUrl?: string;
}

export type ReceiptKind = "testimony-fee" | "adjudication-fee" | "parametric-payout";

export interface PaymentReceipt {
  id: string;
  kind: ReceiptKind;
  from: string;
  to: string;
  amountUsdc: number;
  status: "settled" | "withheld";
  reviewId?: string;
  txHash?: string;
  explorerUrl?: string;
  note: string;
  mock: boolean;
  timestamp: number;
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

export interface ParametricTerm {
  id: string;
  description: string;
  team: string;
  beforeMinute: number;
  afterMinute: number;
  payoutUsdc: number;
  beneficiary: string;
  triggered: boolean;
}
