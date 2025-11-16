/**
 * Cashu token creation and spending with P2PK locks
 * Integrates BDHKE blind signatures with P2PK spending conditions
 */

import * as utils from '../crypto/utils';
import * as bdhke from '../crypto/bdhke';
import * as p2pk from './p2pk';
import {
  Proof,
  P2PKSecret,
  P2PKWitness,
  SigFlag,
  BlindedMessage,
  BlindedSignature,
} from './types';
import { MintClient } from './mint-client';

/**
 * Result of creating blinded outputs for P2PK tokens
 */
export interface P2PKBlindedOutput {
  blindedMessage: BlindedMessage;
  secret: P2PKSecret;
  secretString: string; // Serialized form
  blindingFactor: Uint8Array;
  Y: Uint8Array; // hash_to_curve(secret)
}

/**
 * Create blinded outputs for P2PK locked tokens
 *
 * @param recipientPubkey - Public key to lock tokens to
 * @param amounts - Array of token amounts to create
 * @param keysetId - Mint's keyset ID
 * @param sigFlag - Signature flag (SIG_INPUTS or SIG_ALL)
 * @returns Array of blinded outputs with metadata
 */
export function createP2PKBlindedOutputs(
  recipientPubkey: Uint8Array,
  amounts: number[],
  keysetId: string,
  sigFlag: SigFlag = SigFlag.SIG_INPUTS
): P2PKBlindedOutput[] {
  return amounts.map(amount => {
    // Create P2PK secret
    const secret = p2pk.createP2PKSecret(recipientPubkey, sigFlag);
    const secretString = p2pk.serializeP2PKSecret(secret);

    // Blind the secret
    const { B_, r, Y } = bdhke.createBlindedMessage(secretString);

    // Create blinded message for mint
    const blindedMessage: BlindedMessage = {
      amount,
      B_: utils.bytesToHex(B_),
      id: keysetId,
    };

    return {
      blindedMessage,
      secret,
      secretString,
      blindingFactor: r,
      Y,
    };
  });
}

/**
 * Unblind signatures from mint to create spendable proofs
 *
 * @param blindedOutputs - Outputs created by createP2PKBlindedOutputs
 * @param signatures - Blinded signatures from mint
 * @param mintPubkey - Mint's public key (from keyset)
 * @returns Array of P2PK locked proofs (without witness)
 */
export function unblindP2PKProofs(
  blindedOutputs: P2PKBlindedOutput[],
  signatures: BlindedSignature[],
  mintPubkey: Uint8Array
): Proof[] {
  if (blindedOutputs.length !== signatures.length) {
    throw new Error('Mismatch between outputs and signatures');
  }

  return blindedOutputs.map((output, i) => {
    const sig = signatures[i];

    // Unblind the signature
    const C = bdhke.unblindSignature(
      sig.C_,
      output.blindingFactor,
      mintPubkey
    );

    // Create proof
    const proof: Proof = {
      amount: sig.amount,
      secret: output.secretString,
      C: utils.bytesToHex(C),
      id: sig.id,
      // No witness yet - will be added when spending
    };

    return proof;
  });
}

/**
 * Create witness for spending P2PK locked proofs
 *
 * @param proofs - Proofs to spend
 * @param privkey - Private key corresponding to the locked pubkey
 * @param adaptorSecret - Optional adaptor secret for adaptor signatures
 * @returns Proofs with witnesses attached
 */
export function addP2PKWitnesses(
  proofs: Proof[],
  privkey: Uint8Array,
  adaptorSecret?: Uint8Array
): Proof[] {
  return proofs.map(proof => {
    // Deserialize the P2PK secret
    const secret = p2pk.deserializeP2PKSecret(proof.secret);

    // Create signature (adaptor or regular)
    let witness: P2PKWitness;

    if (adaptorSecret) {
      // Create adaptor signature
      const adaptorSig = p2pk.createP2PKAdaptorSignature(
        privkey,
        secret,
        adaptorSecret
      );

      // For adaptor signatures, we need to complete them first
      // This is handled separately in the swap flow
      throw new Error('Use completeP2PKAdaptorSignature separately for adaptor sigs');
    } else {
      // Create regular Schnorr signature
      const sig = p2pk.signP2PKSecret(privkey, secret);

      // Serialize as 64 bytes: R || s (BIP-340 format)
      const sigBytes = new Uint8Array(64);
      sigBytes.set(sig.R, 0);
      sigBytes.set(sig.s, 32);

      witness = {
        signatures: [utils.bytesToHex(sigBytes)],
      };
    }

    // Attach witness to proof
    return {
      ...proof,
      witness: JSON.stringify(witness),
    };
  });
}

/**
 * Helper: Create P2PK locked tokens via mint swap
 *
 * @param mint - Mint client
 * @param inputProofs - Proofs to swap (with witnesses if needed)
 * @param recipientPubkey - Pubkey to lock new tokens to
 * @param amounts - Amounts for new tokens
 * @param sigFlag - Signature flag
 * @returns New P2PK locked proofs (without witness)
 */
export async function createP2PKLockedTokens(
  mint: MintClient,
  inputProofs: Proof[],
  recipientPubkey: Uint8Array,
  amounts: number[],
  sigFlag: SigFlag = SigFlag.SIG_INPUTS
): Promise<Proof[]> {
  // Get keyset ID
  const keysetId = await mint.getActiveKeysetId();

  // Get mint's public key for this keyset
  const keys = await mint.getKeys(keysetId);
  const keyset = keys.keysets.find(k => k.id === keysetId);
  if (!keyset) {
    throw new Error(`Keyset ${keysetId} not found`);
  }

  // Get the mint's public key (we need one of the denomination keys)
  // For now, just use the first available key
  const firstAmount = Object.keys(keyset.keys)[0];
  const mintPubkeyHex = keyset.keys[parseInt(firstAmount)];
  const mintPubkey = utils.hexToBytes(mintPubkeyHex);

  // Create blinded outputs
  const blindedOutputs = createP2PKBlindedOutputs(
    recipientPubkey,
    amounts,
    keysetId,
    sigFlag
  );

  // Request swap from mint
  const response = await mint.swap({
    inputs: inputProofs,
    outputs: blindedOutputs.map(o => o.blindedMessage),
  });

  // Unblind signatures
  const proofs = unblindP2PKProofs(
    blindedOutputs,
    response.signatures,
    mintPubkey
  );

  return proofs;
}

/**
 * Helper: Spend P2PK locked tokens
 *
 * @param mint - Mint client
 * @param lockedProofs - P2PK locked proofs (without witness)
 * @param privkey - Private key to unlock
 * @param outputAmounts - Amounts for new tokens
 * @param outputPubkey - Pubkey to lock new tokens to (or undefined for anyone-spend)
 * @returns New proofs
 */
export async function spendP2PKLockedTokens(
  mint: MintClient,
  lockedProofs: Proof[],
  privkey: Uint8Array,
  outputAmounts: number[],
  outputPubkey?: Uint8Array
): Promise<Proof[]> {
  // Add witnesses to input proofs
  const proofsWithWitnesses = addP2PKWitnesses(lockedProofs, privkey);

  // Create outputs (P2PK locked or anyone-spend)
  if (outputPubkey) {
    return createP2PKLockedTokens(
      mint,
      proofsWithWitnesses,
      outputPubkey,
      outputAmounts
    );
  } else {
    // Create anyone-spend tokens (no P2PK lock)
    // This would require a different flow - for now just throw
    throw new Error('Anyone-spend outputs not yet implemented');
  }
}
