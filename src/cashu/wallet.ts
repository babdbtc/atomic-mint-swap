/**
 * Cashu wallet operations for minting and spending tokens
 */

import * as utils from '../crypto/utils';
import * as bdhke from '../crypto/bdhke';
import * as p2pk from './p2pk';
import { MintClient } from './mint-client';
import {
  Proof,
  P2PKSecret,
  SigFlag,
  BlindedMessage,
  MintQuote,
} from './types';

/**
 * Mint new tokens from the mint using FakeWallet
 *
 * @param mint - Mint client
 * @param amount - Amount to mint in satoshis
 * @param unit - Unit (default: 'sat')
 * @returns Array of proofs (anyone-can-spend, no P2PK lock)
 */
export async function mintTokens(
  mint: MintClient,
  amount: number,
  unit: string = 'sat'
): Promise<Proof[]> {
  // Step 1: Request mint quote
  const quote = await mint.requestMintQuote(amount, unit);
  console.log(`  Mint quote requested: ${quote.quote}`);
  console.log(`  Payment request: ${quote.request}`);

  // Step 2: Wait for payment (FakeWallet auto-pays)
  console.log(`  Waiting for payment...`);
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Check quote status
  const status = await mint.checkMintQuote(quote.quote);
  if (!status.paid) {
    throw new Error('Quote not paid (FakeWallet should auto-pay)');
  }
  console.log(`  ✅ Payment received (FakeWallet)`);

  // Step 3: Get mint keys
  const keysResponse = await mint.getKeys();
  const keyset = keysResponse.keysets[0];
  if (!keyset) {
    throw new Error('No keyset available');
  }

  // Step 4: Create blinded outputs
  // Split amount into standard denominations (powers of 2)
  const outputs = await createBlindedOutputs(amount, keyset.id);
  console.log(`  Created ${outputs.length} blinded outputs`);

  // Step 5: Request mint to sign
  const mintRequest = {
    quote: quote.quote,
    outputs: outputs.map(o => o.blindedMessage),
  };

  const response = await fetch(`${mint['mintUrl']}/v1/mint/bolt11`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(mintRequest),
  });

  if (!response.ok) {
    throw new Error(`Mint failed: ${response.statusText}`);
  }

  const { signatures } = await response.json() as { signatures: any[] };
  console.log(`  Received ${signatures.length} signatures from mint`);
  console.log(`  First C_: ${signatures[0]?.C_}`);

  // Step 6: Unblind signatures
  const proofs = outputs.map((output, i) => {
    const sig = signatures[i];

    // Get the correct mint public key for this amount
    const mintPubkeyHex = keyset.keys[output.amount];
    if (!mintPubkeyHex) {
      console.error(`No key found for amount ${output.amount}`);
      console.error(`Available keys:`, Object.keys(keyset.keys));
      throw new Error(`No mint key for amount ${output.amount}`);
    }

    // Mint public key in compressed format (33 bytes with 02/03 prefix)
    const mintPubkeyBytes = utils.hexToBytes(mintPubkeyHex);

    // Unblind (mintPubkey should be compressed format now)
    const C = bdhke.unblindSignature(
      sig.C_,
      output.blindingFactor,
      mintPubkeyBytes
    );

    return {
      amount: output.amount,
      secret: output.secret,
      C: utils.bytesToHex(C),
      id: keyset.id,
    };
  });

  console.log(`  ✅ Minted ${proofs.length} tokens totaling ${amount} sats`);
  return proofs;
}

/**
 * Mint P2PK locked tokens
 *
 * @param mint - Mint client
 * @param amount - Amount to mint
 * @param recipientPubkey - Public key to lock to
 * @param sigFlag - Signature flag
 * @returns Array of P2PK locked proofs
 */
export async function mintP2PKTokens(
  mint: MintClient,
  amount: number,
  recipientPubkey: Uint8Array,
  sigFlag: SigFlag = SigFlag.SIG_INPUTS
): Promise<Proof[]> {
  // Step 1: Request mint quote
  const quote = await mint.requestMintQuote(amount, 'sat');
  console.log(`  Mint quote requested: ${quote.quote}`);

  // Step 2: Wait for FakeWallet payment
  await new Promise(resolve => setTimeout(resolve, 1000));
  const status = await mint.checkMintQuote(quote.quote);
  if (!status.paid) {
    throw new Error('Quote not paid');
  }
  console.log(`  ✅ Payment received`);

  // Step 3: Get keyset
  const keysResponse = await mint.getKeys();
  const keyset = keysResponse.keysets[0];

  // Step 4: Create P2PK blinded outputs
  const outputs = await createP2PKBlindedOutputs(
    amount,
    keyset.id,
    recipientPubkey,
    sigFlag
  );
  console.log(`  Created ${outputs.length} P2PK blinded outputs`);

  // Step 5: Mint
  const mintRequest = {
    quote: quote.quote,
    outputs: outputs.map(o => o.blindedMessage),
  };

  const response = await fetch(`${mint['mintUrl']}/v1/mint/bolt11`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(mintRequest),
  });

  if (!response.ok) {
    throw new Error(`Mint failed: ${response.statusText}`);
  }

  const { signatures } = await response.json() as { signatures: any[] };

  // Step 6: Unblind
  const proofs = outputs.map((output, i) => {
    // Get the correct mint public key for this amount (compressed format)
    const mintPubkeyHex = keyset.keys[output.amount];
    const mintPubkeyBytes = utils.hexToBytes(mintPubkeyHex);

    const C = bdhke.unblindSignature(
      signatures[i].C_,
      output.blindingFactor,
      mintPubkeyBytes // Use compressed format (33 bytes)
    );

    return {
      amount: output.amount,
      secret: output.secretString,
      C: utils.bytesToHex(C),
      id: keyset.id,
    };
  });

  console.log(`  ✅ Minted ${proofs.length} P2PK locked tokens`);
  return proofs;
}

/**
 * Swap tokens (spend and receive new ones)
 *
 * @param mint - Mint client
 * @param inputProofs - Proofs to spend
 * @param outputAmount - Amount for new tokens
 * @param outputPubkey - Optional pubkey to lock outputs to
 * @returns New proofs
 */
export async function swapTokens(
  mint: MintClient,
  inputProofs: Proof[],
  outputAmount: number,
  outputPubkey?: Uint8Array
): Promise<Proof[]> {
  // Get keyset
  const keysResponse = await mint.getKeys();
  const keyset = keysResponse.keysets[0];

  // Create outputs
  let outputs: any[];
  let isP2PK = false;
  if (outputPubkey) {
    outputs = await createP2PKBlindedOutputs(
      outputAmount,
      keyset.id,
      outputPubkey,
      SigFlag.SIG_INPUTS
    );
    isP2PK = true;
  } else {
    outputs = await createBlindedOutputs(outputAmount, keyset.id);
    isP2PK = false;
  }

  // Swap request
  const swapRequest = {
    inputs: inputProofs,
    outputs: outputs.map(o => o.blindedMessage),
  };

  // Debug logging
  console.log(`\nDEBUG Swap Request:`);
  console.log(`  Inputs: ${swapRequest.inputs.length}`);
  swapRequest.inputs.forEach((inp, i) => {
    console.log(`    Input ${i}: amount=${inp.amount}, hasWitness=${!!inp.witness}`);
    if (inp.witness) {
      const w = JSON.parse(inp.witness);
      console.log(`      Witness sigs: ${w.signatures?.length || 0}, first sig length: ${w.signatures?.[0]?.length || 0}`);
    }
    // Only try to parse as JSON if it starts with '[' (P2PK format)
    if (inp.secret.startsWith('[')) {
      const s = JSON.parse(inp.secret);
      if (s[0] === 'P2PK') {
        console.log(`      P2PK data length: ${s[1].data.length}`);
      }
    } else {
      console.log(`      Secret (hex): ${inp.secret.slice(0, 16)}...`);
    }
  });
  console.log(`  Outputs: ${swapRequest.outputs.length}`);
  swapRequest.outputs.forEach((out, i) => {
    console.log(`    Output ${i}: amount=${out.amount}, B_ length=${out.B_.length}`);
  });

  // Log the full JSON payload
  console.log(`\nFull swap request JSON:`);
  console.log(JSON.stringify(swapRequest, null, 2));

  const response = await mint.swap(swapRequest);

  // Unblind
  const proofs = outputs.map((output, i) => {
    // Get the correct mint public key for this amount
    const mintPubkeyHex = keyset.keys[output.amount];
    const mintPubkeyBytes = utils.hexToBytes(mintPubkeyHex);
    const mintPubkey = mintPubkeyBytes.length === 33
      ? mintPubkeyBytes.slice(1) // Remove 02/03 prefix
      : mintPubkeyBytes;

    const C = bdhke.unblindSignature(
      response.signatures[i].C_,
      output.blindingFactor,
      mintPubkey
    );

    return {
      amount: output.amount,
      secret: isP2PK ? (output as any).secretString : (output as any).secret,
      C: utils.bytesToHex(C),
      id: keyset.id,
    };
  });

  return proofs;
}

/**
 * Create blinded outputs (anyone-can-spend)
 */
async function createBlindedOutputs(
  amount: number,
  keysetId: string
): Promise<Array<{
  blindedMessage: BlindedMessage;
  secret: string;
  blindingFactor: Uint8Array;
  amount: number;
}>> {
  const denominations = splitAmount(amount);

  return denominations.map(amt => {
    const secret = utils.bytesToHex(utils.randomBytes(32));
    const { B_, r } = bdhke.createBlindedMessage(secret);

    return {
      blindedMessage: {
        amount: amt,
        B_: utils.bytesToHex(B_),
        id: keysetId,
      },
      secret,
      blindingFactor: r,
      amount: amt,
    };
  });
}

/**
 * Create P2PK blinded outputs
 */
async function createP2PKBlindedOutputs(
  amount: number,
  keysetId: string,
  recipientPubkey: Uint8Array,
  sigFlag: SigFlag
): Promise<Array<{
  blindedMessage: BlindedMessage;
  secretString: string;
  blindingFactor: Uint8Array;
  amount: number;
}>> {
  const denominations = splitAmount(amount);

  return denominations.map(amt => {
    const p2pkSecret = p2pk.createP2PKSecret(recipientPubkey, sigFlag);
    const secretString = p2pk.serializeP2PKSecret(p2pkSecret);
    const { B_, r } = bdhke.createBlindedMessage(secretString);

    return {
      blindedMessage: {
        amount: amt,
        B_: utils.bytesToHex(B_),
        id: keysetId,
      },
      secretString,
      blindingFactor: r,
      amount: amt,
    };
  });
}

/**
 * Split amount into powers of 2 denominations
 */
function splitAmount(amount: number): number[] {
  const denominations: number[] = [];
  let remaining = amount;
  let power = 0;

  while (remaining > 0) {
    const denomination = 2 ** power;
    if (remaining & (1 << power)) {
      denominations.push(denomination);
      remaining -= denomination;
    }
    power++;
  }

  return denominations.sort((a, b) => a - b);
}
