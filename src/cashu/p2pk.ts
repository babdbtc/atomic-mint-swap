/**
 * Cashu P2PK operations for atomic swaps
 * Integrates adaptor signatures with Cashu NUT-11
 */

import * as utils from '../crypto/utils';
import {
  generateAdaptorSignature,
  verifyAdaptorSignature,
  completeSignature,
  extractSecret,
  verifySchnorrSignature,
  type AdaptorSignature,
  type SchnorrSignature,
  type VerificationResult,
} from '../crypto/adaptor';
import {
  P2PKSecret,
  P2PKWitness,
  Proof,
  SigFlag,
} from './types';

/**
 * Create a P2PK secret for locking to a public key
 *
 * @param recipientPubkey - Recipient's public key (32 bytes)
 * @param sigflag - Signature flag (default: SIG_INPUTS)
 * @returns P2PK secret structure
 */
export function createP2PKSecret(
  recipientPubkey: Uint8Array,
  sigflag: SigFlag = SigFlag.SIG_INPUTS
): P2PKSecret {
  // Generate random nonce
  const nonce = utils.randomBytes(32);

  // Convert x-only pubkey (32 bytes) to compressed format (33 bytes)
  // Need to determine correct prefix based on y-coordinate parity
  let pubkeyForSecret: Uint8Array;
  if (recipientPubkey.length === 32) {
    // Lift x-coordinate to get full point
    const point = utils.liftX(recipientPubkey);
    const affine = point.toAffine();

    // Use 0x02 for even y, 0x03 for odd y
    const prefix = (affine.y & 1n) === 0n ? 0x02 : 0x03;

    pubkeyForSecret = new Uint8Array(33);
    pubkeyForSecret[0] = prefix;
    pubkeyForSecret.set(recipientPubkey, 1);
  } else {
    pubkeyForSecret = recipientPubkey; // Already in correct format
  }

  return {
    nonce: utils.bytesToHex(nonce),
    data: utils.bytesToHex(pubkeyForSecret),
    tags: [['sigflag', sigflag]],
  };
}

/**
 * Serialize P2PK secret to Cashu format
 *
 * @param secret - P2PK secret structure
 * @returns JSON string in Cashu format
 */
export function serializeP2PKSecret(secret: P2PKSecret): string {
  return JSON.stringify(['P2PK', secret]);
}

/**
 * Deserialize P2PK secret from Cashu format
 *
 * @param serialized - JSON string
 * @returns P2PK secret structure
 */
export function deserializeP2PKSecret(serialized: string): P2PKSecret {
  const parsed = JSON.parse(serialized);
  if (!Array.isArray(parsed) || parsed[0] !== 'P2PK') {
    throw new Error('Invalid P2PK secret format');
  }
  return parsed[1] as P2PKSecret;
}

/**
 * Create standard Schnorr signature for P2PK proof
 *
 * @param privkey - Signer's private key
 * @param secret - P2PK secret (will be serialized and hashed)
 * @returns Schnorr signature
 */
export function signP2PKSecret(
  privkey: Uint8Array,
  secret: P2PKSecret
): SchnorrSignature {
  // Serialize and hash the secret
  const serialized = serializeP2PKSecret(secret);
  const message = utils.hash(new TextEncoder().encode(serialized));

  // RAW Schnorr (NO BIP-340 canonicalization)
  // Do NOT negate keys - use them directly
  const P_point = utils.scalarMultiplyG_Point(privkey);
  const P = utils.bigIntToBytes(P_point.toAffine().x);

  // Generate nonce (NO canonicalization)
  const nonce = utils.generatePrivateKey();
  const R_point = utils.scalarMultiplyG_Point(nonce);
  const R = utils.bigIntToBytes(R_point.toAffine().x);

  // Compute challenge e = H(P || R || m)
  const e = utils.hashConcat(P, R, message);

  // Compute s = r + e*x (RAW Schnorr - no canonicalization)
  const ex = utils.multiplyScalars(e, privkey);
  const s = utils.addScalars(nonce, ex);

  return { s, R };
}

/**
 * Create adaptor signature for P2PK proof (for atomic swaps)
 *
 * @param privkey - Signer's private key
 * @param secret - P2PK secret
 * @param adaptorSecret - Adaptor secret t
 * @param nonce - Optional nonce (will be generated if not provided)
 * @returns Adaptor signature
 */
export function createP2PKAdaptorSignature(
  privkey: Uint8Array,
  secret: P2PKSecret,
  adaptorSecret: Uint8Array,
  nonce?: Uint8Array
): AdaptorSignature {
  // Serialize and hash the secret (this is what Cashu signs)
  const serialized = serializeP2PKSecret(secret);
  const message = utils.hash(new TextEncoder().encode(serialized));

  return generateAdaptorSignature(
    privkey,
    message,
    adaptorSecret,
    nonce
  );
}

/**
 * Verify adaptor signature for P2PK proof
 *
 * @param pubkey - Signer's public key
 * @param secret - P2PK secret
 * @param adaptorSig - Adaptor signature to verify
 * @returns Verification result
 */
export function verifyP2PKAdaptorSignature(
  pubkey: Uint8Array,
  secret: P2PKSecret,
  adaptorSig: AdaptorSignature
): VerificationResult {
  const serialized = serializeP2PKSecret(secret);
  const message = utils.hash(new TextEncoder().encode(serialized));

  return verifyAdaptorSignature(pubkey, message, adaptorSig);
}

/**
 * Complete adaptor signature to create spendable witness
 *
 * @param adaptorSig - Adaptor signature
 * @param secret - Adaptor secret t
 * @returns Schnorr signature
 */
export function completeP2PKSignature(
  adaptorSig: AdaptorSignature,
  secret: Uint8Array
): SchnorrSignature {
  return completeSignature(adaptorSig, secret);
}

/**
 * Extract adaptor secret from published P2PK witness
 *
 * @param adaptorSig - Original adaptor signature
 * @param publishedSig - Published Schnorr signature
 * @returns Extracted secret
 */
export function extractSecretFromWitness(
  adaptorSig: AdaptorSignature,
  publishedSig: SchnorrSignature
): Uint8Array {
  return extractSecret(adaptorSig, publishedSig);
}

/**
 * Create P2PK witness from signature
 *
 * @param signature - Schnorr signature
 * @returns P2PK witness structure
 */
export function createP2PKWitness(
  signature: SchnorrSignature
): P2PKWitness {
  // Cashu expects 64-byte signature (R || s)
  const sigBytes = new Uint8Array(64);
  sigBytes.set(signature.R, 0);
  sigBytes.set(signature.s, 32);

  return {
    signatures: [utils.bytesToHex(sigBytes)],
  };
}

/**
 * Serialize P2PK witness to JSON
 *
 * @param witness - P2PK witness structure
 * @returns JSON string
 */
export function serializeWitness(witness: P2PKWitness): string {
  return JSON.stringify(witness);
}

/**
 * Deserialize P2PK witness from JSON
 *
 * @param serialized - JSON string
 * @returns P2PK witness structure
 */
export function deserializeWitness(serialized: string): P2PKWitness {
  return JSON.parse(serialized) as P2PKWitness;
}

/**
 * Parse Schnorr signature from witness
 *
 * @param witness - P2PK witness
 * @param index - Signature index (default: 0)
 * @returns Schnorr signature
 */
export function parseSignatureFromWitness(
  witness: P2PKWitness,
  index: number = 0
): SchnorrSignature {
  const sigHex = witness.signatures[index];
  if (!sigHex || sigHex.length !== 128) {
    throw new Error('Invalid signature in witness');
  }

  const sigBytes = utils.hexToBytes(sigHex);
  return {
    R: sigBytes.slice(0, 32),
    s: sigBytes.slice(32, 64),
  };
}

/**
 * Verify P2PK witness signature
 *
 * @param pubkey - Signer's public key
 * @param secret - P2PK secret
 * @param witness - P2PK witness
 * @returns Verification result
 */
export function verifyP2PKWitness(
  pubkey: Uint8Array,
  secret: P2PKSecret,
  witness: P2PKWitness
): VerificationResult {
  try {
    const signature = parseSignatureFromWitness(witness);
    const serialized = serializeP2PKSecret(secret);
    const message = utils.hash(new TextEncoder().encode(serialized));

    return verifySchnorrSignature(pubkey, message, signature);
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Create a complete P2PK proof for atomic swap
 *
 * Creates a proof structure ready for submission to mint,
 * but with adaptor signature instead of regular signature
 *
 * @param amount - Amount in satoshis
 * @param recipientPubkey - Recipient's public key
 * @param C - Blinded commitment (hex)
 * @param id - Keyset ID
 * @param sigflag - Signature flag
 * @returns Proof structure without witness (to be added after adaptor sig exchange)
 */
export function createSwapProof(
  amount: number,
  recipientPubkey: Uint8Array,
  C: string,
  id: string,
  sigflag: SigFlag = SigFlag.SIG_INPUTS
): { proof: Proof; secret: P2PKSecret } {
  const secret = createP2PKSecret(recipientPubkey, sigflag);

  const proof: Proof = {
    amount,
    secret: serializeP2PKSecret(secret),
    C,
    id,
    // witness will be added later after adaptor signature exchange
  };

  return { proof, secret };
}

/**
 * Add witness to proof after signature is completed
 *
 * @param proof - Proof structure
 * @param signature - Completed Schnorr signature
 * @returns Proof with witness
 */
export function addWitnessToProof(
  proof: Proof,
  signature: SchnorrSignature
): Proof {
  const witness = createP2PKWitness(signature);

  return {
    ...proof,
    witness: serializeWitness(witness),
  };
}
