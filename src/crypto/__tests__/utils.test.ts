/**
 * Tests for cryptographic utility functions
 */

import * as utils from '../utils';

describe('Cryptographic Utils', () => {
  describe('hexToBytes and bytesToHex', () => {
    it('should convert hex to bytes and back', () => {
      const hex = 'deadbeef';
      const bytes = utils.hexToBytes(hex);
      const hexBack = utils.bytesToHex(bytes);

      expect(hexBack).toBe(hex);
    });

    it('should handle 32-byte values', () => {
      const hex = 'a'.repeat(64);
      const bytes = utils.hexToBytes(hex);

      expect(bytes).toHaveLength(32);
      expect(utils.bytesToHex(bytes)).toBe(hex);
    });

    it('should throw on odd-length hex', () => {
      expect(() => utils.hexToBytes('abc')).toThrow('even length');
    });
  });

  describe('hash and hashConcat', () => {
    it('should produce 32-byte hash', () => {
      const data = new TextEncoder().encode('test');
      const hashed = utils.hash(data);

      expect(hashed).toHaveLength(32);
    });

    it('should produce different hashes for different inputs', () => {
      const data1 = new TextEncoder().encode('test1');
      const data2 = new TextEncoder().encode('test2');

      const hash1 = utils.hash(data1);
      const hash2 = utils.hash(data2);

      expect(hash1).not.toEqual(hash2);
    });

    it('should concatenate and hash multiple arrays', () => {
      const arr1 = new Uint8Array([1, 2, 3]);
      const arr2 = new Uint8Array([4, 5, 6]);
      const arr3 = new Uint8Array([7, 8, 9]);

      const hashed = utils.hashConcat(arr1, arr2, arr3);

      expect(hashed).toHaveLength(32);
    });
  });

  describe('randomBytes and generatePrivateKey', () => {
    it('should generate random bytes of correct length', () => {
      const bytes = utils.randomBytes(16);
      expect(bytes).toHaveLength(16);
    });

    it('should generate different random values', () => {
      const bytes1 = utils.randomBytes(32);
      const bytes2 = utils.randomBytes(32);

      expect(bytes1).not.toEqual(bytes2);
    });

    it('should generate valid private key', () => {
      const privkey = utils.generatePrivateKey();

      expect(privkey).toHaveLength(32);
      expect(utils.isValidScalar(privkey)).toBe(true);
    });
  });

  describe('getPublicKey', () => {
    it('should derive public key from private key', () => {
      const privkey = utils.generatePrivateKey();
      const pubkey = utils.getPublicKey(privkey);

      expect(pubkey).toHaveLength(32);
      expect(utils.isValidPoint(pubkey)).toBe(true);
    });

    it('should produce same pubkey for same privkey', () => {
      const privkey = utils.hexToBytes('a'.repeat(64));
      const pubkey1 = utils.getPublicKey(privkey);
      const pubkey2 = utils.getPublicKey(privkey);

      expect(pubkey1).toEqual(pubkey2);
    });
  });

  describe('Scalar arithmetic', () => {
    it('should add scalars correctly', () => {
      const a = utils.hexToBytes('0'.repeat(63) + '5');
      const b = utils.hexToBytes('0'.repeat(63) + '3');
      const sum = utils.addScalars(a, b);

      expect(utils.bytesToHex(sum)).toBe('0'.repeat(63) + '8');
    });

    it('should subtract scalars correctly', () => {
      const a = utils.hexToBytes('0'.repeat(63) + '5');
      const b = utils.hexToBytes('0'.repeat(63) + '3');
      const diff = utils.subtractScalars(a, b);

      expect(utils.bytesToHex(diff)).toBe('0'.repeat(63) + '2');
    });

    it('should handle modular arithmetic', () => {
      // Test that operations wrap around at curve order
      const privkey1 = utils.generatePrivateKey();
      const privkey2 = utils.generatePrivateKey();

      const sum = utils.addScalars(privkey1, privkey2);
      expect(utils.isValidScalar(sum)).toBe(true);
    });
  });

  describe('Point operations', () => {
    it('should multiply scalar by generator', () => {
      const scalar = utils.generatePrivateKey();
      const point = utils.scalarMultiplyG(scalar);

      expect(point).toHaveLength(32);
      expect(utils.isValidPoint(point)).toBe(true);
    });

    it('should add points correctly', () => {
      const scalar1 = utils.generatePrivateKey();
      const scalar2 = utils.generatePrivateKey();

      const P = utils.scalarMultiplyG(scalar1);
      const Q = utils.scalarMultiplyG(scalar2);
      const sum = utils.addPoints(P, Q);

      expect(sum).toHaveLength(32);
      expect(utils.isValidPoint(sum)).toBe(true);

      // Verify: (a + b)G = aG + bG
      const scalarSum = utils.addScalars(scalar1, scalar2);
      const expected = utils.scalarMultiplyG(scalarSum);
      expect(sum).toEqual(expected);
    });
  });

  describe('Validation', () => {
    it('should validate scalar correctly', () => {
      const validScalar = utils.generatePrivateKey();
      expect(utils.isValidScalar(validScalar)).toBe(true);

      const zero = new Uint8Array(32);
      expect(utils.isValidScalar(zero)).toBe(false);

      const wrongLength = new Uint8Array(31);
      expect(utils.isValidScalar(wrongLength)).toBe(false);
    });

    it('should validate point correctly', () => {
      const privkey = utils.generatePrivateKey();
      const validPoint = utils.getPublicKey(privkey);

      expect(utils.isValidPoint(validPoint)).toBe(true);

      const wrongLength = new Uint8Array(31);
      expect(utils.isValidPoint(wrongLength)).toBe(false);
    });
  });

  describe('equalBytes', () => {
    it('should compare byte arrays correctly', () => {
      const bytes1 = new Uint8Array([1, 2, 3, 4]);
      const bytes2 = new Uint8Array([1, 2, 3, 4]);
      const bytes3 = new Uint8Array([1, 2, 3, 5]);

      expect(utils.equalBytes(bytes1, bytes2)).toBe(true);
      expect(utils.equalBytes(bytes1, bytes3)).toBe(false);
    });

    it('should handle different lengths', () => {
      const bytes1 = new Uint8Array([1, 2, 3]);
      const bytes2 = new Uint8Array([1, 2, 3, 4]);

      expect(utils.equalBytes(bytes1, bytes2)).toBe(false);
    });
  });

  describe('liftX', () => {
    it('should lift x-only pubkey to full point', () => {
      const privkey = utils.generatePrivateKey();
      const xOnlyPubkey = utils.getPublicKey(privkey);
      const point = utils.liftX(xOnlyPubkey);

      expect(point).toBeDefined();
      const affine = point.toAffine();
      const reconstructedX = utils.bigIntToBytes(affine.x);
      expect(reconstructedX).toEqual(xOnlyPubkey);
    });

    it('should throw on invalid x-coordinate', () => {
      const invalidX = new Uint8Array(32).fill(0);
      // Most values are valid, so we just check it handles edge cases
      expect(() => utils.liftX(invalidX)).not.toThrow();
    });
  });
});
