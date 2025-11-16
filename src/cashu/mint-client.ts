/**
 * Cashu mint client for API interactions
 * Implements basic mint operations needed for atomic swaps
 */

import {
  MintInfo,
  MintKeyset,
  MintQuote,
  MeltQuote,
  SwapRequest,
  BlindedSignature,
  Proof,
} from './types';

export class MintClient {
  private mintUrl: string;

  constructor(mintUrl: string) {
    // Remove trailing slash
    this.mintUrl = mintUrl.replace(/\/$/, '');
  }

  /**
   * Get mint information (NUT-06)
   */
  async getInfo(): Promise<MintInfo> {
    const response = await fetch(`${this.mintUrl}/v1/info`);
    if (!response.ok) {
      throw new Error(`Failed to get mint info: ${response.statusText}`);
    }
    return await response.json() as MintInfo;
  }

  /**
   * Get mint keysets
   */
  async getKeysets(): Promise<{ keysets: string[] }> {
    const response = await fetch(`${this.mintUrl}/v1/keysets`);
    if (!response.ok) {
      throw new Error(`Failed to get keysets: ${response.statusText}`);
    }
    return await response.json() as { keysets: string[] };
  }

  /**
   * Get keys for a specific keyset
   */
  async getKeys(keysetId?: string): Promise<{ keysets: MintKeyset[] }> {
    const url = keysetId
      ? `${this.mintUrl}/v1/keys/${keysetId}`
      : `${this.mintUrl}/v1/keys`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to get keys: ${response.statusText}`);
    }
    return await response.json() as { keysets: MintKeyset[] };
  }

  /**
   * Request a mint quote
   */
  async requestMintQuote(
    amount: number,
    unit: string = 'sat'
  ): Promise<MintQuote> {
    const response = await fetch(`${this.mintUrl}/v1/mint/quote/bolt11`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, unit }),
    });

    if (!response.ok) {
      throw new Error(`Failed to request mint quote: ${response.statusText}`);
    }
    return await response.json() as MintQuote;
  }

  /**
   * Check mint quote status
   */
  async checkMintQuote(quoteId: string): Promise<MintQuote> {
    const response = await fetch(
      `${this.mintUrl}/v1/mint/quote/bolt11/${quoteId}`
    );

    if (!response.ok) {
      throw new Error(`Failed to check mint quote: ${response.statusText}`);
    }
    return await response.json() as MintQuote;
  }

  /**
   * Request a melt quote
   */
  async requestMeltQuote(
    request: string,
    unit: string = 'sat'
  ): Promise<MeltQuote> {
    const response = await fetch(`${this.mintUrl}/v1/melt/quote/bolt11`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request, unit }),
    });

    if (!response.ok) {
      throw new Error(`Failed to request melt quote: ${response.statusText}`);
    }
    return await response.json() as MeltQuote;
  }

  /**
   * Check melt quote status
   */
  async checkMeltQuote(quoteId: string): Promise<MeltQuote> {
    const response = await fetch(
      `${this.mintUrl}/v1/melt/quote/bolt11/${quoteId}`
    );

    if (!response.ok) {
      throw new Error(`Failed to check melt quote: ${response.statusText}`);
    }
    return await response.json() as MeltQuote;
  }

  /**
   * Swap proofs (redeem and mint new ones)
   * This is the core operation for spending P2PK proofs
   */
  async swap(request: SwapRequest): Promise<{ signatures: BlindedSignature[] }> {
    const response = await fetch(`${this.mintUrl}/v1/swap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Swap failed: ${response.statusText} - ${errorText}`);
    }

    return await response.json() as { signatures: BlindedSignature[] };
  }

  /**
   * Check proof state (NUT-07)
   */
  async checkProofStates(
    Ys: string[]
  ): Promise<{ states: Array<{ Y: string; state: string; witness?: string }> }> {
    const response = await fetch(`${this.mintUrl}/v1/checkstate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ Ys }),
    });

    if (!response.ok) {
      throw new Error(`Failed to check proof states: ${response.statusText}`);
    }

    return await response.json() as { states: Array<{ Y: string; state: string; witness?: string }> };
  }

  /**
   * Check if mint supports NUT-11 (P2PK)
   */
  async supportsP2PK(): Promise<boolean> {
    try {
      const info = await this.getInfo();
      return info.nuts && 11 in info.nuts;
    } catch {
      return false;
    }
  }

  /**
   * Check if mint supports NUT-14 (HTLCs)
   */
  async supportsHTLC(): Promise<boolean> {
    try {
      const info = await this.getInfo();
      return info.nuts && 14 in info.nuts;
    } catch {
      return false;
    }
  }

  /**
   * Get active keyset ID
   */
  async getActiveKeysetId(): Promise<string> {
    const keysets = await this.getKeys();
    const activeKeyset = keysets.keysets.find((k) => k.active);

    if (!activeKeyset) {
      throw new Error('No active keyset found');
    }

    return activeKeyset.id;
  }
}
