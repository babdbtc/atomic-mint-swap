/**
 * Cashu protocol types for atomic swaps
 */

/** Cashu proof structure */
export interface Proof {
  /** Amount in satoshis */
  amount: number;
  /** Secret (JSON stringified for P2PK) */
  secret: string;
  /** Blinded commitment point (hex) */
  C: string;
  /** Keyset ID */
  id: string;
  /** Witness for spending conditions (JSON stringified) */
  witness?: string;
}

/** P2PK secret structure */
export interface P2PKSecret {
  nonce: string;
  data: string; // recipient pubkey hex
  tags?: string[][];
}

/** P2PK witness structure */
export interface P2PKWitness {
  signatures: string[]; // hex signatures
  preimage?: string; // for HTLCs (NUT-14)
}

/** Signature flag options */
export enum SigFlag {
  SIG_INPUTS = 'SIG_INPUTS', // Each input requires own signature
  SIG_ALL = 'SIG_ALL', // First input signature covers all
}

/** Mint quote for melting */
export interface MeltQuote {
  quote: string;
  amount: number;
  fee_reserve: number;
  paid: boolean;
  expiry: number;
}

/** Mint quote for minting */
export interface MintQuote {
  quote: string;
  request: string;
  paid: boolean;
  expiry: number;
}

/** Mint keyset info */
export interface MintKeyset {
  id: string;
  unit: string;
  active: boolean;
  keys: Record<number, string>; // amount -> pubkey
}

/** Mint info (NUT-06) */
export interface MintInfo {
  name?: string;
  pubkey?: string;
  version?: string;
  description?: string;
  description_long?: string;
  contact?: Array<[string, string]>;
  nuts: Record<number, any>;
  motd?: string;
}

/** Swap request to mint */
export interface SwapRequest {
  inputs: Proof[];
  outputs: BlindedMessage[];
}

/** Blinded message for minting */
export interface BlindedMessage {
  amount: number;
  B_: string; // blinded point hex
  id: string; // keyset id
}

/** Blinded signature from mint */
export interface BlindedSignature {
  amount: number;
  C_: string; // blinded signature hex
  id: string;
}
