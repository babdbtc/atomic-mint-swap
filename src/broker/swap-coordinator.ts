/**
 * Swap Coordinator for Charlie
 *
 * Handles atomic swap execution between Charlie and clients
 */

import { randomBytes } from 'crypto';
import { schnorr } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha256';
import * as secp from '@noble/secp256k1';
import * as utils from '../crypto/utils';
import { mintP2PKTokens, swapTokens } from '../cashu/wallet';
import { SigFlag, P2PKWitness, Proof } from '../cashu/types';
import { LiquidityManager } from './liquidity';
import { SwapRequest, SwapQuote, SwapExecution, BrokerConfig } from './types';

export class SwapCoordinator {
  private quotes: Map<string, SwapQuote> = new Map();
  private executions: Map<string, SwapExecution> = new Map();

  constructor(
    private config: BrokerConfig,
    private liquidity: LiquidityManager
  ) {}

  /**
   * Generate a swap quote for a client request
   */
  async createQuote(request: SwapRequest): Promise<SwapQuote> {
    this.validateSwapRequest(request);

    const fee = Math.ceil(request.amount * this.config.feeRate);
    const outputAmount = request.amount - fee;

    if (!this.liquidity.canSwap(request.toMint, outputAmount)) {
      throw new Error(`Insufficient liquidity on ${request.toMint}`);
    }

    const adaptorSecret = utils.generatePrivateKey();
    const adaptorPoint = utils.scalarMultiplyG_Point(adaptorSecret);
    const adaptorPointCompressed = utils.hexToBytes(adaptorPoint.toHex(true));

    const charlieSwapKey = utils.generatePrivateKey();
    const charliePubkey = utils.getCompressedPublicKey(charlieSwapKey); // Use compressed format

    const quote: SwapQuote = {
      quoteId: this.generateQuoteId(),
      fromMint: request.fromMint,
      toMint: request.toMint,
      inputAmount: request.amount,
      outputAmount,
      fee,
      feeRate: this.config.feeRate,
      charliePublicKey: charliePubkey,
      adaptorPoint: adaptorPointCompressed,
      adaptorSecret: adaptorSecret, // Shared with client for broker model
      expiresAt: new Date(Date.now() + this.config.quoteExpirySeconds * 1000),
      status: 'pending',
    };

    this.quotes.set(quote.quoteId, quote);
    (quote as any)._charlieSwapKey = charlieSwapKey;
    (quote as any)._adaptorSecret = adaptorSecret;

    console.log(`Quote ${quote.quoteId}: ${request.amount} → ${outputAmount} sats (fee: ${fee})`);
    return quote;
  }

  /**
   * Prepare swap - Charlie mints locked tokens
   */
  async prepareSwap(quoteId: string, clientPubkey: Uint8Array): Promise<Proof[]> {
    const quote = this.quotes.get(quoteId);
    if (!quote || quote.status !== 'pending') {
      throw new Error(`Invalid quote: ${quoteId}`);
    }

    const adaptorSecret = (quote as any)._adaptorSecret as Uint8Array;
    const adaptorPoint = utils.scalarMultiplyG_Point(adaptorSecret);

    // Parse client pubkey (compressed format)
    const clientPoint = secp.Point.fromHex(clientPubkey);
    const clientTweaked = clientPoint.add(adaptorPoint);
    const clientTweakedX = utils.bigIntToBytes(clientTweaked.toAffine().x);

    console.log(`Charlie locking ${quote.outputAmount} sats to client on ${quote.toMint}`);

    const mintClient = this.liquidity.getMintClient(quote.toMint);
    const lockedTokens = await mintP2PKTokens(
      mintClient,
      quote.outputAmount,
      clientTweakedX,
      SigFlag.SIG_INPUTS
    );

    this.executions.set(quoteId, {
      quoteId,
      clientTokens: [],
      charlieTokens: lockedTokens,
      clientSwapComplete: false,
      charlieSwapComplete: false,
    });

    quote.status = 'accepted';
    return lockedTokens;
  }

  /**
   * Complete swap after client reveals signature
   */
  async completeSwap(quoteId: string, clientTokensWithWitness: Proof[]): Promise<void> {
    const quote = this.quotes.get(quoteId);
    const execution = this.executions.get(quoteId);

    if (!quote || !execution) {
      throw new Error(`Quote/execution not found: ${quoteId}`);
    }

    const charlieSwapKey = (quote as any)._charlieSwapKey as Uint8Array;
    const adaptorSecret = (quote as any)._adaptorSecret as Uint8Array;
    const charlieWithAdaptor = utils.addScalars(charlieSwapKey, adaptorSecret);

    console.log(`Charlie completing swap ${quoteId}...`);

    const charlieProofsWithWitness = clientTokensWithWitness.map(token => {
      const messageHash = sha256(new TextEncoder().encode(token.secret));
      const signature = schnorr.sign(messageHash, charlieWithAdaptor);
      const witness: P2PKWitness = { signatures: [utils.bytesToHex(signature)] };
      return { ...token, witness: JSON.stringify(witness) };
    });

    const mintClient = this.liquidity.getMintClient(quote.fromMint);
    const totalAmount = clientTokensWithWitness.reduce((sum, t) => sum + t.amount, 0);
    const newTokens = await swapTokens(mintClient, charlieProofsWithWitness, totalAmount);

    this.liquidity.addTokens(quote.fromMint, newTokens);

    execution.clientSwapComplete = true;
    execution.charlieSwapComplete = true;
    execution.completedAt = new Date();
    quote.status = 'completed';

    console.log(`Charlie swap complete! Received ${totalAmount} sats`);
  }

  getQuote(quoteId: string): SwapQuote | undefined {
    return this.quotes.get(quoteId);
  }

  private validateSwapRequest(request: SwapRequest): void {
    if (request.amount < this.config.minSwapAmount) {
      throw new Error(`Amount below minimum ${this.config.minSwapAmount}`);
    }
    if (request.amount > this.config.maxSwapAmount) {
      throw new Error(`Amount above maximum ${this.config.maxSwapAmount}`);
    }

    const supportedMints = this.config.mints.map(m => m.mintUrl);
    if (!supportedMints.includes(request.fromMint)) {
      throw new Error(`Unsupported fromMint: ${request.fromMint}`);
    }
    if (!supportedMints.includes(request.toMint)) {
      throw new Error(`Unsupported toMint: ${request.toMint}`);
    }
    if (request.fromMint === request.toMint) {
      throw new Error('Cannot swap to same mint');
    }
  }

  private generateQuoteId(): string {
    return randomBytes(16).toString('hex');
  }
}
