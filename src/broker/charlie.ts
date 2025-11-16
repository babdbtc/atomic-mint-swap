/**
 * Charlie - The Ecash Broker Service
 *
 * Facilitates atomic swaps between different Cashu mints for a fee
 */

import * as utils from '../crypto/utils';
import { LiquidityManager } from './liquidity';
import { SwapCoordinator } from './swap-coordinator';
import { BrokerConfig, MintConfig, SwapRequest, SwapQuote } from './types';
import { Proof } from '../cashu/types';

export class CharlieBroker {
  private liquidity: LiquidityManager;
  private swapCoordinator: SwapCoordinator;
  private config: BrokerConfig;

  constructor(config: Partial<BrokerConfig> & { mints: MintConfig[] }) {
    // Default configuration
    this.config = {
      mints: config.mints,
      feeRate: config.feeRate ?? 0.005, // 0.5%
      minSwapAmount: config.minSwapAmount ?? 1,
      maxSwapAmount: config.maxSwapAmount ?? 10000,
      quoteExpirySeconds: config.quoteExpirySeconds ?? 300, // 5 minutes
      privateKey: config.privateKey ?? utils.generatePrivateKey(),
    };

    this.liquidity = new LiquidityManager(this.config.mints);
    this.swapCoordinator = new SwapCoordinator(this.config, this.liquidity);

    console.log('\n' + '='.repeat(70));
    console.log('🤖 CHARLIE BROKER SERVICE');
    console.log('='.repeat(70));
    console.log(`Fee Rate: ${(this.config.feeRate * 100).toFixed(2)}%`);
    console.log(`Min Swap: ${this.config.minSwapAmount} sats`);
    console.log(`Max Swap: ${this.config.maxSwapAmount} sats`);
    console.log(`Supported Mints: ${this.config.mints.length}`);
    this.config.mints.forEach(m => console.log(`  - ${m.name} (${m.mintUrl})`));
    console.log('='.repeat(70) + '\n');
  }

  /**
   * Initialize Charlie's liquidity on all mints
   */
  async initialize(amountPerMint: number): Promise<void> {
    await this.liquidity.initializeLiquidity(amountPerMint);
  }

  /**
   * Request a swap quote
   */
  async requestQuote(request: SwapRequest): Promise<SwapQuote> {
    console.log(`\n📨 Swap request from ${request.clientId}`);
    console.log(`   ${request.fromMint} → ${request.toMint}`);
    console.log(`   Amount: ${request.amount} sats\n`);

    return await this.swapCoordinator.createQuote(request);
  }

  /**
   * Accept quote and prepare swap
   */
  async acceptQuote(quoteId: string, clientPubkey: Uint8Array): Promise<Proof[]> {
    console.log(`\n✅ Client accepted quote ${quoteId}`);
    return await this.swapCoordinator.prepareSwap(quoteId, clientPubkey);
  }

  /**
   * Complete swap after client provides their tokens
   */
  async completeClientSwap(quoteId: string, clientTokens: Proof[]): Promise<void> {
    await this.swapCoordinator.completeSwap(quoteId, clientTokens);
  }

  /**
   * Get current liquidity status
   */
  getLiquidityStatus(): any {
    return {
      mints: this.liquidity.getAllLiquidity().map(liq => ({
        mintUrl: liq.mintUrl,
        balance: liq.balance,
        tokenCount: liq.tokens.length,
        lastUpdated: liq.lastUpdated,
      })),
      totalBalance: this.liquidity.getAllLiquidity().reduce((sum, liq) => sum + liq.balance, 0),
    };
  }

  /**
   * Get configuration
   */
  getConfig(): Readonly<BrokerConfig> {
    return { ...this.config };
  }

  /**
   * Print status
   */
  printStatus(): void {
    console.log('\n' + '='.repeat(70));
    console.log('📊 CHARLIE STATUS');
    console.log('='.repeat(70));
    this.liquidity.printLiquidity();
    console.log('='.repeat(70) + '\n');
  }
}
