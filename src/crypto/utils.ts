/**
 * Cryptographic utility functions
 */

import { sha256 } from '@noble/hashes/sha256';
import * as secp from '@noble/secp256k1';

/**
 * Convert hex string to Uint8Array
 */
export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error('Hex string must have even length');
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Convert Uint8Array to hex string
 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * SHA256 hash function
 */
export function hash(data: Uint8Array): Uint8Array {
  return sha256(data);
}

/**
 * Hash multiple byte arrays together
 */
export function hashConcat(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const concatenated = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    concatenated.set(arr, offset);
    offset += arr.length;
  }
  return hash(concatenated);
}

/**
 * Generate cryptographically secure random bytes
 */
export function randomBytes(length: number): Uint8Array {
  return secp.utils.randomPrivateKey().slice(0, length);
}

/**
 * Generate a random private key
 */
export function generatePrivateKey(): Uint8Array {
  return secp.utils.randomPrivateKey();
}

/**
 * Derive public key from private key (x-only, 32 bytes)
 */
export function getPublicKey(privkey: Uint8Array): Uint8Array {
  const point = secp.Point.fromPrivateKey(privkey);
  // Return x-only coordinate (Schnorr style)
  const affine = point.toAffine();
  return bigIntToBytes(affine.x);
}

/**
 * Lift x-only public key to full point
 * Assumes even y-coordinate (standard for Schnorr)
 */
export function liftX(xOnlyPubkey: Uint8Array): secp.Point {
  if (xOnlyPubkey.length !== 32) {
    throw new Error('x-only pubkey must be 32 bytes');
  }
  // Prepend 0x02 for even y-coordinate
  const compressed = new Uint8Array(33);
  compressed[0] = 0x02;
  compressed.set(xOnlyPubkey, 1);
  return secp.Point.fromHex(compressed);
}

/**
 * Modulo operation for curve order
 */
function mod(a: bigint, b: bigint = secp.CURVE.n): bigint {
  const result = a % b;
  return result >= 0n ? result : b + result;
}

/**
 * Scalar addition modulo curve order
 */
export function addScalars(a: Uint8Array, b: Uint8Array): Uint8Array {
  const aBig = bytesToBigInt(a);
  const bBig = bytesToBigInt(b);
  const sum = mod(aBig + bBig);
  return bigIntToBytes(sum);
}

/**
 * Scalar subtraction modulo curve order
 */
export function subtractScalars(a: Uint8Array, b: Uint8Array): Uint8Array {
  const aBig = bytesToBigInt(a);
  const bBig = bytesToBigInt(b);
  const diff = mod(aBig - bBig);
  return bigIntToBytes(diff);
}

/**
 * Scalar negation modulo curve order
 */
export function negateScalar(a: Uint8Array): Uint8Array {
  const aBig = bytesToBigInt(a);
  const negated = mod(-aBig);
  return bigIntToBytes(negated);
}

/**
 * Scalar multiplication modulo curve order
 */
export function multiplyScalars(a: Uint8Array, b: Uint8Array): Uint8Array {
  const aBig = bytesToBigInt(a);
  const bBig = bytesToBigInt(b);
  const product = mod(aBig * bBig);
  return bigIntToBytes(product);
}

/**
 * Point multiplication: scalar * G (generator) - returns x-only
 */
export function scalarMultiplyG(scalar: Uint8Array): Uint8Array {
  const point = secp.Point.BASE.multiply(bytesToBigInt(scalar));
  const affine = point.toAffine();
  return bigIntToBytes(affine.x);
}

/**
 * Point multiplication: scalar * G (generator) - returns full point
 */
export function scalarMultiplyG_Point(scalar: Uint8Array): secp.Point {
  return secp.Point.BASE.multiply(bytesToBigInt(scalar));
}

/**
 * Point addition
 */
export function addPoints(P: Uint8Array, Q: Uint8Array): Uint8Array {
  const p1 = liftX(P);
  const p2 = liftX(Q);
  const sum = p1.add(p2);
  const affine = sum.toAffine();
  return bigIntToBytes(affine.x);
}

/**
 * Convert bytes to BigInt (big-endian)
 */
export function bytesToBigInt(bytes: Uint8Array): bigint {
  let result = 0n;
  for (const byte of bytes) {
    result = (result << 8n) | BigInt(byte);
  }
  return result;
}

/**
 * Convert BigInt to bytes (big-endian, 32 bytes)
 */
export function bigIntToBytes(value: bigint): Uint8Array {
  const hex = value.toString(16).padStart(64, '0');
  return hexToBytes(hex);
}

/**
 * Verify a scalar is valid (0 < scalar < n)
 */
export function isValidScalar(scalar: Uint8Array): boolean {
  if (scalar.length !== 32) return false;
  const value = bytesToBigInt(scalar);
  return value > 0n && value < secp.CURVE.n;
}

/**
 * Verify a point is valid
 */
export function isValidPoint(point: Uint8Array): boolean {
  if (point.length !== 32) return false;
  try {
    liftX(point);
    return true;
  } catch {
    return false;
  }
}

/**
 * Constant-time comparison of byte arrays
 */
export function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
}
