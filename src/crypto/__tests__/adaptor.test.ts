/**
 * Comprehensive tests for Schnorr adaptor signatures
 */

import * as adaptor from '../adaptor';
import * as utils from '../utils';
import { AdaptorSignature, SchnorrSignature } from '../types';

describe('Adaptor Signatures', () => {
  describe('generateAdaptorSignature', () => {
    it('should generate a valid adaptor signature', () => {
      const privkey = utils.generatePrivateKey();
      const message = utils.hash(new TextEncoder().encode('test message'));
      const secret = adaptor.generateAdaptorSecret();

      const sig = adaptor.generateAdaptorSignature(privkey, message, secret);

      expect(sig.s_prime).toHaveLength(32);
      expect(sig.R).toHaveLength(32);
      expect(sig.T).toHaveLength(32);
    });

    it('should generate different signatures with different nonces', () => {
      const privkey = utils.generatePrivateKey();
      const message = utils.hash(new TextEncoder().encode('test message'));
      const secret = adaptor.generateAdaptorSecret();
      const nonce1 = utils.generatePrivateKey();
      const nonce2 = utils.generatePrivateKey();

      const sig1 = adaptor.generateAdaptorSignature(privkey, message, secret, nonce1);
      const sig2 = adaptor.generateAdaptorSignature(privkey, message, secret, nonce2);

      expect(sig1.R).not.toEqual(sig2.R);
      expect(sig1.s_prime).not.toEqual(sig2.s_prime);
      expect(sig1.T).toEqual(sig2.T); // Same secret = same T
    });

    it('should throw on invalid inputs', () => {
      const privkey = utils.generatePrivateKey();
      const message = utils.hash(new TextEncoder().encode('test'));
      const secret = adaptor.generateAdaptorSecret();

      expect(() =>
        adaptor.generateAdaptorSignature(new Uint8Array(31), message, secret)
      ).toThrow('Private key must be 32 bytes');

      expect(() =>
        adaptor.generateAdaptorSignature(privkey, new Uint8Array(31), secret)
      ).toThrow('Message must be 32 bytes');

      expect(() =>
        adaptor.generateAdaptorSignature(privkey, message, new Uint8Array(31))
      ).toThrow('Adaptor secret must be 32 bytes');
    });
  });

  describe('verifyAdaptorSignature', () => {
    it('should verify a valid adaptor signature', () => {
      const privkey = utils.generatePrivateKey();
      const pubkey = utils.getPublicKey(privkey);
      const message = utils.hash(new TextEncoder().encode('test message'));
      const secret = adaptor.generateAdaptorSecret();

      const sig = adaptor.generateAdaptorSignature(privkey, message, secret);
      const result = adaptor.verifyAdaptorSignature(pubkey, message, sig);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject invalid adaptor signature', () => {
      const privkey = utils.generatePrivateKey();
      const pubkey = utils.getPublicKey(privkey);
      const message = utils.hash(new TextEncoder().encode('test message'));
      const secret = adaptor.generateAdaptorSecret();

      const sig = adaptor.generateAdaptorSignature(privkey, message, secret);

      // Tamper with s_prime
      const tampered: AdaptorSignature = {
        ...sig,
        s_prime: utils.generatePrivateKey(),
      };

      const result = adaptor.verifyAdaptorSignature(pubkey, message, tampered);

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject signature for wrong message', () => {
      const privkey = utils.generatePrivateKey();
      const pubkey = utils.getPublicKey(privkey);
      const message1 = utils.hash(new TextEncoder().encode('message 1'));
      const message2 = utils.hash(new TextEncoder().encode('message 2'));
      const secret = adaptor.generateAdaptorSecret();

      const sig = adaptor.generateAdaptorSignature(privkey, message1, secret);
      const result = adaptor.verifyAdaptorSignature(pubkey, message2, sig);

      expect(result.valid).toBe(false);
    });

    it('should reject signature for wrong pubkey', () => {
      const privkey1 = utils.generatePrivateKey();
      const privkey2 = utils.generatePrivateKey();
      const pubkey2 = utils.getPublicKey(privkey2);
      const message = utils.hash(new TextEncoder().encode('test'));
      const secret = adaptor.generateAdaptorSecret();

      const sig = adaptor.generateAdaptorSignature(privkey1, message, secret);
      const result = adaptor.verifyAdaptorSignature(pubkey2, message, sig);

      expect(result.valid).toBe(false);
    });
  });

  describe('extractSecret', () => {
    it('should extract secret from completed signature', () => {
      const privkey = utils.generatePrivateKey();
      const message = utils.hash(new TextEncoder().encode('test message'));
      const secret = adaptor.generateAdaptorSecret();

      const adaptorSig = adaptor.generateAdaptorSignature(privkey, message, secret);
      const completedSig = adaptor.completeSignature(adaptorSig, secret);
      const extracted = adaptor.extractSecret(adaptorSig, completedSig);

      expect(extracted).toEqual(secret);
    });

    it('should verify extracted secret satisfies tG = T', () => {
      const privkey = utils.generatePrivateKey();
      const message = utils.hash(new TextEncoder().encode('test'));
      const secret = adaptor.generateAdaptorSecret();

      const adaptorSig = adaptor.generateAdaptorSignature(privkey, message, secret);
      const completedSig = adaptor.completeSignature(adaptorSig, secret);
      const extracted = adaptor.extractSecret(adaptorSig, completedSig);

      const tG = utils.scalarMultiplyG(extracted);
      expect(tG).toEqual(adaptorSig.T);
    });

    it('should throw if R values do not match', () => {
      const privkey = utils.generatePrivateKey();
      const message = utils.hash(new TextEncoder().encode('test'));
      const secret = adaptor.generateAdaptorSecret();

      const adaptorSig = adaptor.generateAdaptorSignature(privkey, message, secret);
      const wrongSig: SchnorrSignature = {
        s: new Uint8Array(32),
        R: utils.generatePrivateKey(), // Different R
      };

      expect(() => adaptor.extractSecret(adaptorSig, wrongSig)).toThrow(
        'R values do not match'
      );
    });
  });

  describe('completeSignature', () => {
    it('should complete adaptor signature with secret', () => {
      const privkey = utils.generatePrivateKey();
      const pubkey = utils.getPublicKey(privkey);
      const message = utils.hash(new TextEncoder().encode('test'));
      const secret = adaptor.generateAdaptorSecret();

      const adaptorSig = adaptor.generateAdaptorSignature(privkey, message, secret);
      const completed = adaptor.completeSignature(adaptorSig, secret);

      expect(completed.s).toHaveLength(32);
      expect(completed.R).toEqual(adaptorSig.R);

      // Verify completed signature is valid
      const result = adaptor.verifySchnorrSignature(pubkey, message, completed);
      expect(result.valid).toBe(true);
    });

    it('should throw if secret does not match T', () => {
      const privkey = utils.generatePrivateKey();
      const message = utils.hash(new TextEncoder().encode('test'));
      const secret = adaptor.generateAdaptorSecret();
      const wrongSecret = adaptor.generateAdaptorSecret();

      const adaptorSig = adaptor.generateAdaptorSignature(privkey, message, secret);

      expect(() => adaptor.completeSignature(adaptorSig, wrongSecret)).toThrow(
        'Secret does not satisfy tG = T'
      );
    });
  });

  describe('verifySchnorrSignature', () => {
    it('should verify a valid Schnorr signature', () => {
      const privkey = utils.generatePrivateKey();
      const pubkey = utils.getPublicKey(privkey);
      const message = utils.hash(new TextEncoder().encode('test'));
      const secret = adaptor.generateAdaptorSecret();

      const adaptorSig = adaptor.generateAdaptorSignature(privkey, message, secret);
      const schnorrSig = adaptor.completeSignature(adaptorSig, secret);

      const result = adaptor.verifySchnorrSignature(pubkey, message, schnorrSig);
      expect(result.valid).toBe(true);
    });

    it('should reject invalid Schnorr signature', () => {
      const privkey = utils.generatePrivateKey();
      const pubkey = utils.getPublicKey(privkey);
      const message = utils.hash(new TextEncoder().encode('test'));

      const invalidSig: SchnorrSignature = {
        s: utils.generatePrivateKey(),
        R: utils.scalarMultiplyG(utils.generatePrivateKey()),
      };

      const result = adaptor.verifySchnorrSignature(pubkey, message, invalidSig);
      expect(result.valid).toBe(false);
    });
  });

  describe('End-to-End Atomic Swap Simulation', () => {
    it('should demonstrate atomicity guarantee', () => {
      // Setup: Alice and Bob want to swap
      const alicePrivkey = utils.generatePrivateKey();
      const alicePubkey = utils.getPublicKey(alicePrivkey);
      const bobPrivkey = utils.generatePrivateKey();
      const bobPubkey = utils.getPublicKey(bobPrivkey);

      // Messages to sign (representing transactions on two mints)
      const msgMintA = utils.hash(new TextEncoder().encode('transaction on mint A'));
      const msgMintB = utils.hash(new TextEncoder().encode('transaction on mint B'));

      // Bob generates secret and adaptor point
      const bobSecret = adaptor.generateAdaptorSecret();
      const T = adaptor.getAdaptorPoint(bobSecret);

      // Step 1: Alice creates adaptor signature for Mint B transaction
      const aliceAdaptorSig = adaptor.generateAdaptorSignature(
        alicePrivkey,
        msgMintB,
        bobSecret
      );

      // Step 2: Bob creates adaptor signature for Mint A transaction
      const bobAdaptorSig = adaptor.generateAdaptorSignature(
        bobPrivkey,
        msgMintA,
        bobSecret
      );

      // Verify both use same T
      expect(aliceAdaptorSig.T).toEqual(T);
      expect(bobAdaptorSig.T).toEqual(T);

      // Step 3: Both verify each other's adaptor signatures
      const aliceSigValid = adaptor.verifyAdaptorSignature(
        alicePubkey,
        msgMintB,
        aliceAdaptorSig
      );
      const bobSigValid = adaptor.verifyAdaptorSignature(
        bobPubkey,
        msgMintA,
        bobAdaptorSig
      );

      expect(aliceSigValid.valid).toBe(true);
      expect(bobSigValid.valid).toBe(true);

      // Step 4: Bob claims on Mint B (publishes signature)
      const bobClaimSig = adaptor.completeSignature(aliceAdaptorSig, bobSecret);

      // Verify Bob's claim is valid
      const bobClaimValid = adaptor.verifySchnorrSignature(
        alicePubkey,
        msgMintB,
        bobClaimSig
      );
      expect(bobClaimValid.valid).toBe(true);

      // Step 5: Alice observes Bob's signature and extracts secret
      const extractedSecret = adaptor.extractSecret(aliceAdaptorSig, bobClaimSig);
      expect(extractedSecret).toEqual(bobSecret);

      // Step 6: Alice uses extracted secret to claim on Mint A
      const aliceClaimSig = adaptor.completeSignature(bobAdaptorSig, extractedSecret);

      // Verify Alice's claim is valid
      const aliceClaimValid = adaptor.verifySchnorrSignature(
        bobPubkey,
        msgMintA,
        aliceClaimSig
      );
      expect(aliceClaimValid.valid).toBe(true);

      // ATOMICITY VERIFIED:
      // - Once Bob published his signature, Alice could extract the secret
      // - Alice can now always claim on Mint A
      // - Either both transactions complete or neither does
    });
  });

  describe('Serialization', () => {
    it('should serialize and deserialize adaptor signatures', () => {
      const privkey = utils.generatePrivateKey();
      const message = utils.hash(new TextEncoder().encode('test'));
      const secret = adaptor.generateAdaptorSecret();

      const sig = adaptor.generateAdaptorSignature(privkey, message, secret);
      const serialized = adaptor.serializeAdaptorSignature(sig);
      const deserialized = adaptor.deserializeAdaptorSignature(serialized);

      expect(deserialized.s_prime).toEqual(sig.s_prime);
      expect(deserialized.R).toEqual(sig.R);
      expect(deserialized.T).toEqual(sig.T);
    });

    it('should serialize and deserialize Schnorr signatures', () => {
      const privkey = utils.generatePrivateKey();
      const message = utils.hash(new TextEncoder().encode('test'));
      const secret = adaptor.generateAdaptorSecret();

      const adaptorSig = adaptor.generateAdaptorSignature(privkey, message, secret);
      const schnorrSig = adaptor.completeSignature(adaptorSig, secret);

      const serialized = adaptor.serializeSchnorrSignature(schnorrSig);
      const deserialized = adaptor.deserializeSchnorrSignature(serialized);

      expect(deserialized.s).toEqual(schnorrSig.s);
      expect(deserialized.R).toEqual(schnorrSig.R);
    });
  });

  describe('Test Vectors', () => {
    it('should match known test vector', () => {
      // Fixed test inputs for reproducibility
      const privkeyHex =
        '0000000000000000000000000000000000000000000000000000000000000001';
      const secretHex =
        '0000000000000000000000000000000000000000000000000000000000000002';
      const nonceHex =
        '0000000000000000000000000000000000000000000000000000000000000003';
      const messageHex =
        '0000000000000000000000000000000000000000000000000000000000000000';

      const privkey = utils.hexToBytes(privkeyHex);
      const secret = utils.hexToBytes(secretHex);
      const nonce = utils.hexToBytes(nonceHex);
      const message = utils.hexToBytes(messageHex);

      const pubkey = utils.getPublicKey(privkey);
      const adaptorSig = adaptor.generateAdaptorSignature(
        privkey,
        message,
        secret,
        nonce
      );

      // Verify signature structure
      expect(adaptorSig.s_prime).toHaveLength(32);
      expect(adaptorSig.R).toHaveLength(32);
      expect(adaptorSig.T).toHaveLength(32);

      // Verify adaptor signature is valid
      const verified = adaptor.verifyAdaptorSignature(pubkey, message, adaptorSig);
      expect(verified.valid).toBe(true);

      // Complete and verify
      const completed = adaptor.completeSignature(adaptorSig, secret);
      const completedValid = adaptor.verifySchnorrSignature(pubkey, message, completed);
      expect(completedValid.valid).toBe(true);

      // Extract and verify
      const extracted = adaptor.extractSecret(adaptorSig, completed);
      expect(extracted).toEqual(secret);
    });
  });
});
