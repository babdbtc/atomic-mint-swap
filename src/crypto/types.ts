/**
 * Core cryptographic types for Schnorr adaptor signatures
 */

/** 32-byte private key scalar */
export type PrivateKey = Uint8Array;

/** 32-byte public key (x-only, Schnorr style) */
export type PublicKey = Uint8Array;

/** 32-byte hash/message */
export type Hash = Uint8Array;

/** 32-byte random nonce scalar */
export type Nonce = Uint8Array;

/** 32-byte secret scalar for adaptor */
export type Secret = Uint8Array;

/**
 * Standard Schnorr signature (s, R)
 * where s is the signature scalar and R is the nonce point
 */
export interface SchnorrSignature {
  /** 32-byte signature scalar */
  s: Uint8Array;
  /** 32-byte R point (x-only) */
  R: Uint8Array;
}

/**
 * Adaptor signature (s', R, T)
 * where s' = s + t is the adapted signature scalar
 */
export interface AdaptorSignature {
  /** 32-byte adapted signature scalar s' */
  s_prime: Uint8Array;
  /** 32-byte R point (x-only) */
  R: Uint8Array;
  /** 32-byte adaptor point T (x-only) */
  T: Uint8Array;
}

/**
 * Adaptor signature with metadata for verification
 */
export interface AdaptorSignatureWithMeta extends AdaptorSignature {
  /** Public key that created the signature */
  pubkey: PublicKey;
  /** Message that was signed */
  message: Hash;
}

/**
 * Result of signature verification
 */
export interface VerificationResult {
  valid: boolean;
  error?: string;
}
