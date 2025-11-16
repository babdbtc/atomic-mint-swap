/**
 * Liquidity Management for Charlie
 * 
 * Tracks and manages Charlie's ecash balances across multiple mints
 */

import { MintClient } from '../cashu/mint-client';
import { mintTokens } from '../cashu/wallet';
import { Proof } from '../cashu/types';
import { MintConfig, MintLiquidity } from './types';

export class LiquidityManager {
  private liquidity: Map<string, MintLiquidity> = new Map();
  private mintClients: Map<string, MintClient> = new Map();

  constructor(private mints: MintConfig[]) {
    // Initialize mint clients
    for (const mint of mints) {
      this.mintClients.set(mint.mintUrl, new MintClient(mint.mintUrl));
      this.liquidity.set(mint.mintUrl, {
        mintUrl: mint.mintUrl,
        balance: 0,
        tokens: [],
        lastUpdated: new Date(),
      });
    }
  }

  /**
   * Get current balance on a mint
   */
  getBalance(mintUrl: string): number {
    const liq = this.liquidity.get(mintUrl);
    return liq?.balance ?? 0;
  }

  /**
   * Get available tokens on a mint
   */
  getTokens(mintUrl: string): Proof[] {
    const liq = this.liquidity.get(mintUrl);
    return liq?.tokens ?? [];
  }

  /**
   * Add tokens to liquidity (e.g., after minting or receiving)
   */
  addTokens(mintUrl: string, tokens: Proof[]): void {
    const liq = this.liquidity.get(mintUrl);
    if (!liq) {
      throw new Error(`Unknown mint: ${mintUrl}`);
    }

    const amount = tokens.reduce((sum, t) => sum + t.amount, 0);
    liq.tokens.push(...tokens);
    liq.balance += amount;
    liq.lastUpdated = new Date();

    console.log(`💰 Added ${amount} sats to ${mintUrl} (new balance: ${liq.balance})`);
  }

  /**
   * Remove tokens from liquidity (e.g., after spending)
   */
  removeTokens(mintUrl: string, tokens: Proof[]): void {
    const liq = this.liquidity.get(mintUrl);
    if (!liq) {
      throw new Error(`Unknown mint: ${mintUrl}`);
    }

    const amount = tokens.reduce((sum, t) => sum + t.amount, 0);
    
    // Remove tokens by secret (unique identifier)
    const secretsToRemove = new Set(tokens.map(t => t.secret));
    liq.tokens = liq.tokens.filter(t => !secretsToRemove.has(t.secret));
    
    liq.balance -= amount;
    liq.lastUpdated = new Date();

    console.log(`💸 Removed ${amount} sats from ${mintUrl} (new balance: ${liq.balance})`);
  }

  /**
   * Select tokens totaling at least the specified amount
   */
  selectTokens(mintUrl: string, amount: number): Proof[] {
    const available = this.getTokens(mintUrl);
    const selected: Proof[] = [];
    let total = 0;

    // Simple greedy selection (largest first)
    const sorted = [...available].sort((a, b) => b.amount - a.amount);

    for (const token of sorted) {
      if (total >= amount) break;
      selected.push(token);
      total += token.amount;
    }

    if (total < amount) {
      throw new Error(
        `Insufficient liquidity on ${mintUrl}: need ${amount}, have ${total}`
      );
    }

    return selected;
  }

  /**
   * Check if we have enough liquidity for a swap
   */
  canSwap(mintUrl: string, amount: number): boolean {
    return this.getBalance(mintUrl) >= amount;
  }

  /**
   * Get mint client
   */
  getMintClient(mintUrl: string): MintClient {
    const client = this.mintClients.get(mintUrl);
    if (!client) {
      throw new Error(`Unknown mint: ${mintUrl}`);
    }
    return client;
  }

  /**
   * Get all liquidity info
   */
  getAllLiquidity(): MintLiquidity[] {
    return Array.from(this.liquidity.values());
  }

  /**
   * Initialize liquidity by minting tokens on each mint
   * (In production, Charlie would receive tokens from users or mint via Lightning)
   */
  async initializeLiquidity(amountPerMint: number): Promise<void> {
    console.log(`\n🏦 Initializing Charlie's liquidity (${amountPerMint} sats per mint)...\n`);

    for (const [mintUrl, client] of this.mintClients.entries()) {
      try {
        console.log(`Minting ${amountPerMint} sats on ${mintUrl}...`);
        const tokens = await mintTokens(client, amountPerMint);
        this.addTokens(mintUrl, tokens);
      } catch (error) {
        console.error(`Failed to mint on ${mintUrl}:`, error);
      }
    }

    console.log('\n✅ Liquidity initialization complete!\n');
    this.printLiquidity();
  }

  /**
   * Print current liquidity status
   */
  printLiquidity(): void {
    console.log('💰 Charlie\'s Liquidity:');
    for (const liq of this.getAllLiquidity()) {
      console.log(`  ${liq.mintUrl}: ${liq.balance} sats (${liq.tokens.length} tokens)`);
    }
    console.log();
  }
}
