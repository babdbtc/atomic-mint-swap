/**
 * Atomic swap protocol types
 */

import { AdaptorSignature } from '../crypto/adaptor';
import { P2PKSecret, Proof } from '../cashu/types';

/** Swap state machine states */
export enum SwapState {
  // Initial states
  IDLE = 'IDLE',
  NEGOTIATING = 'NEGOTIATING',

  // Setup states
  SECRETS_CREATED = 'SECRETS_CREATED',
  PROOFS_LOCKED = 'PROOFS_LOCKED',

  // Signature exchange states
  ADAPTOR_SIGS_EXCHANGED = 'ADAPTOR_SIGS_EXCHANGED',
  VERIFIED = 'VERIFIED',

  // Execution states
  CLAIMING = 'CLAIMING',
  EXTRACTING = 'EXTRACTING',

  // Terminal states
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  TIMEOUT = 'TIMEOUT',
}

/** Swap participant role */
export enum SwapRole {
  INITIATOR = 'INITIATOR',  // Party requesting swap
  RESPONDER = 'RESPONDER',   // Broker/liquidity provider
}

/** Swap participant information */
export interface SwapParticipant {
  role: SwapRole;
  pubkey: Uint8Array;
  privkey?: Uint8Array; // Only for local participant
  mintUrl: string;
  amount: number;
}

/** Swap parameters */
export interface SwapParams {
  id: string; // Unique swap ID
  initiator: SwapParticipant;
  responder: SwapParticipant;
  adaptorSecret?: Uint8Array; // Responder's secret (only responder knows initially)
  adaptorPoint?: Uint8Array; // Public T = tG
  fee?: number; // Fee in sats
  expiryTime?: number; // Unix timestamp
}

/** P2PK secret with metadata */
export interface SwapSecret {
  secret: P2PKSecret;
  serialized: string;
  mintUrl: string;
  amount: number;
  recipientPubkey: Uint8Array;
}

/** Adaptor signature with metadata */
export interface SwapAdaptorSignature {
  signature: AdaptorSignature;
  signerPubkey: Uint8Array;
  secret: P2PKSecret;
  mintUrl: string;
}

/** Completed proof ready for submission */
export interface SwapProof {
  proof: Proof;
  mintUrl: string;
}

/** Swap execution context */
export interface SwapContext {
  params: SwapParams;
  state: SwapState;

  // Secrets
  initiatorSecret?: SwapSecret;
  responderSecret?: SwapSecret;

  // Adaptor signatures
  initiatorAdaptorSig?: SwapAdaptorSignature;
  responderAdaptorSig?: SwapAdaptorSignature;

  // Proofs
  initiatorProof?: SwapProof;
  responderProof?: SwapProof;

  // Extracted secret (after first claim)
  extractedSecret?: Uint8Array;

  // Timing
  createdAt: number;
  updatedAt: number;

  // Error tracking
  error?: string;
}

/** Swap event types */
export enum SwapEventType {
  CREATED = 'CREATED',
  SECRETS_GENERATED = 'SECRETS_GENERATED',
  PROOFS_CREATED = 'PROOFS_CREATED',
  ADAPTOR_SIG_CREATED = 'ADAPTOR_SIG_CREATED',
  ADAPTOR_SIG_RECEIVED = 'ADAPTOR_SIG_RECEIVED',
  ADAPTOR_SIG_VERIFIED = 'ADAPTOR_SIG_VERIFIED',
  CLAIM_INITIATED = 'CLAIM_INITIATED',
  CLAIM_COMPLETED = 'CLAIM_COMPLETED',
  SECRET_EXTRACTED = 'SECRET_EXTRACTED',
  SWAP_COMPLETED = 'SWAP_COMPLETED',
  ERROR = 'ERROR',
}

/** Swap event */
export interface SwapEvent {
  type: SwapEventType;
  swapId: string;
  timestamp: number;
  data?: any;
}

/** Swap message types for communication */
export enum SwapMessageType {
  // Negotiation
  SWAP_REQUEST = 'SWAP_REQUEST',
  SWAP_OFFER = 'SWAP_OFFER',
  SWAP_ACCEPT = 'SWAP_ACCEPT',
  SWAP_REJECT = 'SWAP_REJECT',

  // Setup
  SECRET_SHARE = 'SECRET_SHARE',
  PROOF_SHARE = 'PROOF_SHARE',

  // Signature exchange
  ADAPTOR_SIG_SHARE = 'ADAPTOR_SIG_SHARE',

  // Execution
  CLAIM_NOTIFICATION = 'CLAIM_NOTIFICATION',

  // Completion
  SWAP_COMPLETE = 'SWAP_COMPLETE',
  SWAP_FAILED = 'SWAP_FAILED',
}

/** Base swap message */
export interface SwapMessage {
  type: SwapMessageType;
  swapId: string;
  timestamp: number;
  from: string; // Pubkey hex
  to: string; // Pubkey hex
}

/** Swap request message */
export interface SwapRequestMessage extends SwapMessage {
  type: SwapMessageType.SWAP_REQUEST;
  fromMint: string;
  toMint: string;
  amount: number;
  maxFee?: number;
}

/** Swap offer message */
export interface SwapOfferMessage extends SwapMessage {
  type: SwapMessageType.SWAP_OFFER;
  fee: number;
  adaptorPoint: string; // T in hex
  expiryTime: number;
}

/** Adaptor signature share message */
export interface AdaptorSigShareMessage extends SwapMessage {
  type: SwapMessageType.ADAPTOR_SIG_SHARE;
  adaptorSig: {
    s_prime: string;
    R: string;
    T: string;
  };
  secret: P2PKSecret;
  mintUrl: string;
}

/** Claim notification message */
export interface ClaimNotificationMessage extends SwapMessage {
  type: SwapMessageType.CLAIM_NOTIFICATION;
  witness: {
    signatures: string[];
  };
  mintUrl: string;
}
