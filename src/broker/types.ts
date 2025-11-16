/**
 * Types for Charlie Broker Service
 */

import { Proof } from '../cashu/types';

/**
 * Mint configuration that Charlie supports
 */
export interface MintConfig {
  mintUrl: string;
  name: string;
  unit: string; // 'sat', 'usd', etc.
}

/**
 * Charlie's liquidity on a specific mint
 */
export interface MintLiquidity {
  mintUrl: string;
  balance: number; // in base units (sats)
  tokens: Proof[]; // actual ecash tokens
  lastUpdated: Date;
}

/**
 * Swap request from a client (Bob)
 */
export interface SwapRequest {
  clientId: string;
  fromMint: string; // Mint URL Bob has tokens on
  toMint: string;   // Mint URL Bob wants tokens on
  amount: number;   // Amount Bob wants to swap (in base units)
  clientPublicKey: Uint8Array; // Bob's signing key (x-only)
}

/**
 * Swap quote from Charlie
 */
export interface SwapQuote {
  quoteId: string;
  fromMint: string;
  toMint: string;
  inputAmount: number;  // What Bob pays
  outputAmount: number; // What Bob receives (after fee)
  fee: number;          // Charlie's fee
  feeRate: number;      // Fee percentage (0.005 = 0.5%)
  charliePublicKey: Uint8Array; // Charlie's signing key
  adaptorPoint: Uint8Array;     // Adaptor point for atomic swap
  adaptorSecret: Uint8Array;    // Adaptor secret (shared with client for broker model)
  expiresAt: Date;
  status: 'pending' | 'accepted' | 'completed' | 'expired' | 'failed';
}

/**
 * Swap execution details
 */
export interface SwapExecution {
  quoteId: string;
  clientTokens: Proof[]; // Bob's tokens with witness
  charlieTokens: Proof[]; // Charlie's tokens (locked to Bob+T)
  clientSwapComplete: boolean;
  charlieSwapComplete: boolean;
  completedAt?: Date;
}

/**
 * Charlie's configuration
 */
export interface BrokerConfig {
  mints: MintConfig[];
  feeRate: number; // Default 0.005 (0.5%)
  minSwapAmount: number; // Minimum swap in sats
  maxSwapAmount: number; // Maximum swap in sats
  quoteExpirySeconds: number; // How long quotes are valid
  privateKey: Uint8Array; // Charlie's master key
}

/**
 * Nostr announcement format
 */
export interface NostrAnnouncement {
  brokerPubkey: string;
  supportedMints: string[];
  feeRate: number;
  minAmount: number;
  maxAmount: number;
  timestamp: number;
}
