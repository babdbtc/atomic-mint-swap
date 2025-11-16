/**
 * Schnorr Adaptor Signatures for secp256k1
 *
 * Implements the adaptor signature scheme that enables atomic swaps:
 * - Generate: Create adaptor signature (s', R, T)
 * - Verify: Verify adaptor signature without knowing secret
 * - Extract: Extract secret from published signature
 * - Complete: Create valid signature from adaptor + secret
 */

import * as utils from './utils';
import {
  AdaptorSignature,
  AdaptorSignatureWithMeta,
  SchnorrSignature,
  PrivateKey,
  PublicKey,
  Hash,
  Nonce,
  Secret,
  VerificationResult,
} from './types';

// Re-export types for convenience
export type {
  AdaptorSignature,
  AdaptorSignatureWithMeta,
  SchnorrSignature,
  PrivateKey,
  PublicKey,
  Hash,
  Nonce,
  Secret,
  VerificationResult,
} from './types';

/**
 * Generate an adaptor signature
 *
 * @param privkey - Signer's private key (32 bytes)
 * @param message - Message to sign (32 bytes)
 * @param adaptorSecret - Secret scalar t (32 bytes)
 * @param nonce - Optional nonce r (32 bytes). If not provided, will be generated.
 * @returns Adaptor signature (s', R, T)
 *
 * Math: s' = r + t + H(P||R||m) * x
 */
export function generateAdaptorSignature(
  privkey: PrivateKey,
  message: Hash,
  adaptorSecret: Secret,
  nonce?: Nonce
): AdaptorSignature {
  // Validate inputs
  if (privkey.length !== 32) throw new Error('Private key must be 32 bytes');
  if (message.length !== 32) throw new Error('Message must be 32 bytes');
  if (adaptorSecret.length !== 32) throw new Error('Adaptor secret must be 32 bytes');
  if (!utils.isValidScalar(privkey)) throw new Error('Invalid private key');
  if (!utils.isValidScalar(adaptorSecret)) throw new Error('Invalid adaptor secret');

  // Generate or validate nonce
  const r = nonce ?? utils.generatePrivateKey();
  if (r.length !== 32) throw new Error('Nonce must be 32 bytes');
  if (!utils.isValidScalar(r)) throw new Error('Invalid nonce');

  // Canonicalize private key to have even y-coordinate (BIP-340 style)
  let P_point = utils.scalarMultiplyG_Point(privkey);
  let x_final = privkey;

  // If P has odd y-coordinate, negate private key
  if (P_point.toAffine().y & 1n) {
    x_final = utils.negateScalar(privkey);
    P_point = utils.scalarMultiplyG_Point(x_final);
  }
  const P = utils.bigIntToBytes(P_point.toAffine().x);

  // Compute R = rG and ensure even y-coordinate (BIP-340 style)
  let R_point = utils.scalarMultiplyG_Point(r);
  let r_final = r;

  // If R has odd y-coordinate, negate r
  if (R_point.toAffine().y & 1n) {
    r_final = utils.negateScalar(r);
    R_point = utils.scalarMultiplyG_Point(r_final);
  }
  const R = utils.bigIntToBytes(R_point.toAffine().x);

  // Compute T = tG and ensure even y-coordinate
  let T_point = utils.scalarMultiplyG_Point(adaptorSecret);
  let t_final = adaptorSecret;

  // If T has odd y-coordinate, negate t
  if (T_point.toAffine().y & 1n) {
    t_final = utils.negateScalar(adaptorSecret);
    T_point = utils.scalarMultiplyG_Point(t_final);
  }
  const T = utils.bigIntToBytes(T_point.toAffine().x);

  // Compute challenge e = H(P || R || m)
  const e = computeChallenge(P, R, message);

  // Compute s' = r + t + e*x mod n (using potentially negated values)
  const ex = utils.multiplyScalars(e, x_final);
  const r_plus_t = utils.addScalars(r_final, t_final);
  const s_prime = utils.addScalars(r_plus_t, ex);

  return { s_prime, R, T };
}

/**
 * Verify an adaptor signature
 *
 * @param pubkey - Signer's public key (32 bytes)
 * @param message - Message that was signed (32 bytes)
 * @param adaptorSig - Adaptor signature to verify
 * @returns Verification result
 *
 * Math: Verify s'G = T + R + H(P||R||m)P
 */
export function verifyAdaptorSignature(
  pubkey: PublicKey,
  message: Hash,
  adaptorSig: AdaptorSignature
): VerificationResult {
  try {
    // Validate inputs
    if (pubkey.length !== 32) {
      return { valid: false, error: 'Public key must be 32 bytes' };
    }
    if (message.length !== 32) {
      return { valid: false, error: 'Message must be 32 bytes' };
    }
    if (adaptorSig.s_prime.length !== 32) {
      return { valid: false, error: 's_prime must be 32 bytes' };
    }
    if (adaptorSig.R.length !== 32) {
      return { valid: false, error: 'R must be 32 bytes' };
    }
    if (adaptorSig.T.length !== 32) {
      return { valid: false, error: 'T must be 32 bytes' };
    }

    if (!utils.isValidScalar(adaptorSig.s_prime)) {
      return { valid: false, error: 'Invalid s_prime scalar' };
    }
    if (!utils.isValidPoint(adaptorSig.R)) {
      return { valid: false, error: 'Invalid R point' };
    }
    if (!utils.isValidPoint(adaptorSig.T)) {
      return { valid: false, error: 'Invalid T point' };
    }
    if (!utils.isValidPoint(pubkey)) {
      return { valid: false, error: 'Invalid public key point' };
    }

    // Compute challenge e = H(P || R || m)
    const e = computeChallenge(pubkey, adaptorSig.R, message);

    // Compute left side: s'G
    const lhs = utils.scalarMultiplyG(adaptorSig.s_prime);

    // Compute right side: T + R + eP
    // First: eP
    const P = utils.liftX(pubkey);
    const eP = P.multiply(utils.bytesToBigInt(e));

    // Second: R + T
    const R_point = utils.liftX(adaptorSig.R);
    const T_point = utils.liftX(adaptorSig.T);
    const R_plus_T = R_point.add(T_point);

    // Third: (R + T) + eP
    const rhs_point = R_plus_T.add(eP);
    const rhs = utils.bigIntToBytes(rhs_point.toAffine().x);

    // Verify equality
    if (!utils.equalBytes(lhs, rhs)) {
      return { valid: false, error: 'Signature equation does not hold' };
    }

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Extract secret from completed signature
 *
 * @param adaptorSig - Original adaptor signature
 * @param completedSig - Completed Schnorr signature published on-chain
 * @returns Extracted secret t
 *
 * Math: t = s' - s mod n
 * Verifies: tG = T
 */
export function extractSecret(
  adaptorSig: AdaptorSignature,
  completedSig: SchnorrSignature
): Secret {
  // Validate R values match
  if (!utils.equalBytes(adaptorSig.R, completedSig.R)) {
    throw new Error('R values do not match between adaptor and completed signature');
  }

  // Validate inputs
  if (adaptorSig.s_prime.length !== 32) throw new Error('s_prime must be 32 bytes');
  if (completedSig.s.length !== 32) throw new Error('s must be 32 bytes');
  if (adaptorSig.T.length !== 32) throw new Error('T must be 32 bytes');

  // Extract secret: t = s' - s mod n
  const t = utils.subtractScalars(adaptorSig.s_prime, completedSig.s);

  // Verify extraction: tG should equal T
  const tG = utils.scalarMultiplyG(t);
  if (!utils.equalBytes(tG, adaptorSig.T)) {
    throw new Error('Extracted secret does not satisfy tG = T');
  }

  return t;
}

/**
 * Complete adaptor signature with secret
 *
 * @param adaptorSig - Adaptor signature to complete
 * @param secret - Secret t to complete with
 * @returns Valid Schnorr signature
 *
 * Math: s = s' - t mod n
 * Results in: sG = R + H(P||R||m)P
 */
export function completeSignature(
  adaptorSig: AdaptorSignature,
  secret: Secret
): SchnorrSignature {
  // Validate inputs
  if (adaptorSig.s_prime.length !== 32) throw new Error('s_prime must be 32 bytes');
  if (secret.length !== 32) throw new Error('Secret must be 32 bytes');
  if (adaptorSig.R.length !== 32) throw new Error('R must be 32 bytes');
  if (adaptorSig.T.length !== 32) throw new Error('T must be 32 bytes');

  if (!utils.isValidScalar(adaptorSig.s_prime)) throw new Error('Invalid s_prime');
  if (!utils.isValidScalar(secret)) throw new Error('Invalid secret');

  // Verify secret: tG should equal T
  const tG = utils.scalarMultiplyG(secret);
  if (!utils.equalBytes(tG, adaptorSig.T)) {
    throw new Error('Secret does not satisfy tG = T');
  }

  // Complete: s = s' - t mod n
  const s = utils.subtractScalars(adaptorSig.s_prime, secret);

  return { s, R: adaptorSig.R };
}

/**
 * Verify a completed Schnorr signature
 *
 * @param pubkey - Signer's public key (32 bytes)
 * @param message - Message that was signed (32 bytes)
 * @param signature - Schnorr signature to verify
 * @returns Verification result
 *
 * Math: Verify sG = R + H(P||R||m)P
 */
export function verifySchnorrSignature(
  pubkey: PublicKey,
  message: Hash,
  signature: SchnorrSignature
): VerificationResult {
  try {
    // Validate inputs
    if (pubkey.length !== 32) {
      return { valid: false, error: 'Public key must be 32 bytes' };
    }
    if (message.length !== 32) {
      return { valid: false, error: 'Message must be 32 bytes' };
    }
    if (signature.s.length !== 32) {
      return { valid: false, error: 's must be 32 bytes' };
    }
    if (signature.R.length !== 32) {
      return { valid: false, error: 'R must be 32 bytes' };
    }

    if (!utils.isValidScalar(signature.s)) {
      return { valid: false, error: 'Invalid s scalar' };
    }
    if (!utils.isValidPoint(signature.R)) {
      return { valid: false, error: 'Invalid R point' };
    }
    if (!utils.isValidPoint(pubkey)) {
      return { valid: false, error: 'Invalid public key point' };
    }

    // Compute challenge e = H(P || R || m)
    const e = computeChallenge(pubkey, signature.R, message);

    // Compute left side: sG
    const lhs = utils.scalarMultiplyG(signature.s);

    // Compute right side: R + eP
    const P = utils.liftX(pubkey);
    const eP = P.multiply(utils.bytesToBigInt(e));
    const R_point = utils.liftX(signature.R);
    const rhs_point = R_point.add(eP);
    const rhs = utils.bigIntToBytes(rhs_point.toAffine().x);

    // Verify equality
    if (!utils.equalBytes(lhs, rhs)) {
      return { valid: false, error: 'Signature equation does not hold' };
    }

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Compute Schnorr challenge: H(P || R || m)
 *
 * @param pubkey - Public key P (32 bytes)
 * @param R - Nonce point R (32 bytes)
 * @param message - Message m (32 bytes)
 * @returns Challenge e (32 bytes)
 */
function computeChallenge(
  pubkey: PublicKey,
  R: Uint8Array,
  message: Hash
): Uint8Array {
  return utils.hashConcat(pubkey, R, message);
}

/**
 * Helper: Generate random adaptor secret (canonical form with even y-coordinate)
 */
export function generateAdaptorSecret(): Secret {
  let secret = utils.generatePrivateKey();
  const T_point = utils.scalarMultiplyG_Point(secret);

  // Ensure T has even y-coordinate
  if (T_point.toAffine().y & 1n) {
    secret = utils.negateScalar(secret);
  }

  return secret;
}

/**
 * Helper: Generate adaptor point from secret
 */
export function getAdaptorPoint(secret: Secret): Uint8Array {
  return utils.scalarMultiplyG(secret);
}

/**
 * Helper: Serialize adaptor signature to hex
 */
export function serializeAdaptorSignature(sig: AdaptorSignature): {
  s_prime: string;
  R: string;
  T: string;
} {
  return {
    s_prime: utils.bytesToHex(sig.s_prime),
    R: utils.bytesToHex(sig.R),
    T: utils.bytesToHex(sig.T),
  };
}

/**
 * Helper: Deserialize adaptor signature from hex
 */
export function deserializeAdaptorSignature(data: {
  s_prime: string;
  R: string;
  T: string;
}): AdaptorSignature {
  return {
    s_prime: utils.hexToBytes(data.s_prime),
    R: utils.hexToBytes(data.R),
    T: utils.hexToBytes(data.T),
  };
}

/**
 * Helper: Serialize Schnorr signature to hex
 */
export function serializeSchnorrSignature(sig: SchnorrSignature): {
  s: string;
  R: string;
} {
  return {
    s: utils.bytesToHex(sig.s),
    R: utils.bytesToHex(sig.R),
  };
}

/**
 * Helper: Deserialize Schnorr signature from hex
 */
export function deserializeSchnorrSignature(data: {
  s: string;
  R: string;
}): SchnorrSignature {
  return {
    s: utils.hexToBytes(data.s),
    R: utils.hexToBytes(data.R),
  };
}
