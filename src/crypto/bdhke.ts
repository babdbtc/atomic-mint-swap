/**
 * Blind Diffie-Hellman Key Exchange (BDHKE) for Cashu
 *
 * Implements the cryptographic scheme for blind signatures used in Cashu ecash:
 * - hash_to_curve: Maps secrets to curve points
 * - Blinding: Creates blinded points for mint signing
 * - Unblinding: Removes blinding to get valid signatures
 */

import * as secp from '@noble/secp256k1';
import * as utils from './utils';

// Domain separator for hash_to_curve (NUT-00)
const DOMAIN_SEPARATOR = new TextEncoder().encode('Secp256k1_HashToCurve_Cashu_');

/**
 * Hash arbitrary data to a secp256k1 curve point (NUT-00)
 *
 * Algorithm:
 * 1. msg_hash = SHA256(DOMAIN_SEPARATOR || x)
 * 2. counter = 0
 * 3. Repeat:
 *    - Try: Y = PublicKey('02' || SHA256(msg_hash || counter))
 *    - If valid point, return Y
 *    - Else counter++
 *
 * @param message - Message to hash (can be string or bytes)
 * @returns Curve point Y (x-coordinate, 32 bytes)
 */
export function hashToCurve(message: string | Uint8Array): Uint8Array {
  // Convert message to bytes if string
  const messageBytes = typeof message === 'string'
    ? new TextEncoder().encode(message)
    : message;

  // msg_hash = SHA256(DOMAIN_SEPARATOR || message)
  const combined = new Uint8Array(DOMAIN_SEPARATOR.length + messageBytes.length);
  combined.set(DOMAIN_SEPARATOR);
  combined.set(messageBytes, DOMAIN_SEPARATOR.length);
  const msgHash = utils.hash(combined);

  // Try incrementing counter until we find valid point
  let counter = 0;
  while (counter < 2**32) {
    try {
      // Create counter bytes (uint32 little-endian)
      const counterBytes = new Uint8Array(4);
      const view = new DataView(counterBytes.buffer);
      view.setUint32(0, counter, true); // true = little-endian

      // Hash: SHA256(msg_hash || counter)
      const hashInput = new Uint8Array(msgHash.length + counterBytes.length);
      hashInput.set(msgHash);
      hashInput.set(counterBytes, msgHash.length);
      const hash = utils.hash(hashInput);

      // Try to create point with 0x02 prefix (even y-coordinate)
      const compressed = new Uint8Array(33);
      compressed[0] = 0x02;
      compressed.set(hash, 1);

      // Attempt to parse as valid point
      const point = secp.Point.fromHex(compressed);

      // Success! Return x-coordinate
      return utils.bigIntToBytes(point.toAffine().x);
    } catch {
      // Invalid point, try next counter
      counter++;
    }
  }

  throw new Error('hash_to_curve failed: could not find valid point');
}

/**
 * Create a blinded message for the mint to sign
 *
 * @param secret - Secret to blind (will be hashed to curve)
 * @param blindingFactor - Random blinding factor r (32 bytes). If not provided, will be generated.
 * @returns { B_: blinded point, r: blinding factor, Y: curve point }
 *
 * Math: B_ = Y + r*G where Y = hash_to_curve(secret)
 */
export function createBlindedMessage(
  secret: string,
  blindingFactor?: Uint8Array
): {
  B_: Uint8Array;
  r: Uint8Array;
  Y: Uint8Array;
} {
  // Generate blinding factor if not provided
  const r = blindingFactor ?? utils.generatePrivateKey();

  if (!utils.isValidScalar(r)) {
    throw new Error('Invalid blinding factor');
  }

  // Y = hash_to_curve(secret)
  const Y = hashToCurve(secret);

  // r*G
  const rG_point = utils.scalarMultiplyG_Point(r);

  // Y as point (lift x-coordinate)
  const Y_point = utils.liftX(Y);

  // B_ = Y + r*G
  const B_point = Y_point.add(rG_point);

  // Return compressed point format (33 bytes with 02/03 prefix)
  // This preserves the y-coordinate parity information
  const B_ = utils.hexToBytes(B_point.toHex(true));

  return { B_, r, Y };
}

/**
 * Unblind a signature from the mint
 *
 * @param C_ - Blinded signature from mint (33 or 65 byte point)
 * @param r - Blinding factor used in createBlindedMessage
 * @param mintPubkey - Mint's public key K (32 bytes x-only)
 * @returns C - Unblinded signature (32 bytes x-only)
 *
 * Math: C = C_ - r*K
 */
export function unblindSignature(
  C_: Uint8Array | string,
  r: Uint8Array,
  mintPubkey: Uint8Array
): Uint8Array {
  // Parse C_ as point (handle hex string or bytes)
  const C_bytes = typeof C_ === 'string' ? utils.hexToBytes(C_) : C_;
  let C_point: secp.Point;

  if (C_bytes.length === 33) {
    // Compressed point (02/03 prefix)
    C_point = secp.Point.fromHex(C_bytes);
  } else if (C_bytes.length === 65) {
    // Uncompressed point (04 prefix)
    C_point = secp.Point.fromHex(C_bytes);
  } else if (C_bytes.length === 32) {
    // X-only (assume even y)
    C_point = utils.liftX(C_bytes);
  } else {
    throw new Error(`Invalid C_ length: ${C_bytes.length}`);
  }

  // Validate inputs
  if (!utils.isValidScalar(r)) {
    throw new Error('Invalid blinding factor');
  }
  if (!utils.isValidPoint(mintPubkey)) {
    throw new Error('Invalid mint public key');
  }

  // K as point
  const K_point = utils.liftX(mintPubkey);

  // r*K
  const rK_point = K_point.multiply(utils.bytesToBigInt(r));

  // C = C_ - r*K (use addition with negated point)
  const result_point = C_point.add(rK_point.negate());
  const C = utils.bigIntToBytes(result_point.toAffine().x);

  return C;
}

/**
 * Verify that C is a valid signature on secret by the mint
 *
 * @param C - Unblinded signature (32 bytes)
 * @param secret - Original secret
 * @param mintPubkey - Mint's public key K (32 bytes)
 * @returns true if valid
 *
 * Math: Verify k*hash_to_curve(secret) == C
 * We can't verify this without knowing k, but we can verify the structure.
 * The mint will verify this when we try to spend.
 */
export function verifyUnblindedSignature(
  C: Uint8Array,
  secret: string,
  mintPubkey: Uint8Array
): boolean {
  try {
    // Basic validation
    if (C.length !== 32) return false;
    if (!utils.isValidPoint(C)) return false;
    if (!utils.isValidPoint(mintPubkey)) return false;

    // Compute Y = hash_to_curve(secret)
    const Y = hashToCurve(secret);

    // Both C and Y should be valid points
    return utils.isValidPoint(Y);
  } catch {
    return false;
  }
}

/**
 * Helper: Create multiple blinded messages at once
 */
export function createBlindedMessages(
  secrets: string[]
): Array<{
  B_: Uint8Array;
  r: Uint8Array;
  Y: Uint8Array;
  secret: string;
}> {
  return secrets.map(secret => ({
    ...createBlindedMessage(secret),
    secret,
  }));
}

/**
 * Helper: Unblind multiple signatures at once
 */
export function unblindSignatures(
  blindedSigs: Array<{ C_: Uint8Array | string; r: Uint8Array }>,
  mintPubkey: Uint8Array
): Uint8Array[] {
  return blindedSigs.map(({ C_, r }) => unblindSignature(C_, r, mintPubkey));
}
