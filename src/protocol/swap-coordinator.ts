/**
 * Swap Coordinator
 * Orchestrates atomic swaps between two parties
 */

import * as utils from '../crypto/utils';
import * as p2pk from '../cashu/p2pk';
import {
  generateAdaptorSecret,
  getAdaptorPoint,
  type AdaptorSignature,
  type SchnorrSignature,
} from '../crypto/adaptor';
import { SigFlag } from '../cashu/types';
import {
  SwapState,
  SwapRole,
  SwapContext,
  SwapParams,
  SwapSecret,
  SwapAdaptorSignature,
  SwapEvent,
  SwapEventType,
} from './types';

export class SwapCoordinator {
  private context: SwapContext;
  private eventListeners: Array<(event: SwapEvent) => void> = [];

  constructor(params: SwapParams) {
    this.context = {
      params,
      state: SwapState.IDLE,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  /**
   * Get current swap state
   */
  getState(): SwapState {
    return this.context.state;
  }

  /**
   * Get swap context
   */
  getContext(): SwapContext {
    return { ...this.context };
  }

  /**
   * Subscribe to swap events
   */
  on(listener: (event: SwapEvent) => void): void {
    this.eventListeners.push(listener);
  }

  /**
   * Emit swap event
   */
  private emit(type: SwapEventType, data?: any): void {
    const event: SwapEvent = {
      type,
      swapId: this.context.params.id,
      timestamp: Date.now(),
      data,
    };

    this.eventListeners.forEach((listener) => listener(event));
  }

  /**
   * Transition to new state
   */
  private setState(newState: SwapState, error?: string): void {
    const oldState = this.context.state;
    this.context.state = newState;
    this.context.updatedAt = Date.now();

    if (error) {
      this.context.error = error;
    }

    console.log(`[Swap ${this.context.params.id}] ${oldState} → ${newState}`);
  }

  /**
   * Step 1: Initialize swap (Responder generates adaptor secret)
   */
  async initialize(): Promise<void> {
    if (this.context.state !== SwapState.IDLE) {
      throw new Error(`Cannot initialize from state: ${this.context.state}`);
    }

    const { params } = this.context;

    // Responder generates adaptor secret
    if (params.responder.privkey) {
      params.adaptorSecret = generateAdaptorSecret();
      params.adaptorPoint = getAdaptorPoint(params.adaptorSecret);

      this.emit(SwapEventType.CREATED, {
        adaptorPoint: utils.bytesToHex(params.adaptorPoint),
      });
    }

    this.setState(SwapState.NEGOTIATING);
  }

  /**
   * Step 2: Create P2PK secrets for both parties
   */
  async createSecrets(): Promise<void> {
    if (this.context.state !== SwapState.NEGOTIATING) {
      throw new Error(`Cannot create secrets from state: ${this.context.state}`);
    }

    const { initiator, responder } = this.context.params;

    // Initiator creates secret locked to responder
    this.context.initiatorSecret = {
      secret: p2pk.createP2PKSecret(responder.pubkey, SigFlag.SIG_INPUTS),
      serialized: '',
      mintUrl: initiator.mintUrl,
      amount: initiator.amount,
      recipientPubkey: responder.pubkey,
    };
    this.context.initiatorSecret.serialized = p2pk.serializeP2PKSecret(
      this.context.initiatorSecret.secret
    );

    // Responder creates secret locked to initiator
    this.context.responderSecret = {
      secret: p2pk.createP2PKSecret(initiator.pubkey, SigFlag.SIG_INPUTS),
      serialized: '',
      mintUrl: responder.mintUrl,
      amount: responder.amount,
      recipientPubkey: initiator.pubkey,
    };
    this.context.responderSecret.serialized = p2pk.serializeP2PKSecret(
      this.context.responderSecret.secret
    );

    this.emit(SwapEventType.SECRETS_GENERATED, {
      initiatorSecret: this.context.initiatorSecret.serialized.slice(0, 60),
      responderSecret: this.context.responderSecret.serialized.slice(0, 60),
    });

    this.setState(SwapState.SECRETS_CREATED);
  }

  /**
   * Step 3: Create adaptor signatures
   */
  async createAdaptorSignatures(): Promise<void> {
    if (this.context.state !== SwapState.SECRETS_CREATED) {
      throw new Error(
        `Cannot create adaptor signatures from state: ${this.context.state}`
      );
    }

    const { initiator, responder, adaptorSecret, adaptorPoint } = this.context.params;

    if (!adaptorSecret || !adaptorPoint) {
      throw new Error('Adaptor secret not initialized');
    }

    if (!this.context.initiatorSecret || !this.context.responderSecret) {
      throw new Error('Secrets not created');
    }

    // Initiator creates adaptor signature (if has privkey)
    if (initiator.privkey) {
      const adaptorSig = p2pk.createP2PKAdaptorSignature(
        initiator.privkey,
        this.context.initiatorSecret.secret,
        adaptorSecret
      );

      this.context.initiatorAdaptorSig = {
        signature: adaptorSig,
        signerPubkey: initiator.pubkey,
        secret: this.context.initiatorSecret.secret,
        mintUrl: initiator.mintUrl,
      };

      this.emit(SwapEventType.ADAPTOR_SIG_CREATED, {
        role: SwapRole.INITIATOR,
      });
    }

    // Responder creates adaptor signature (if has privkey)
    if (responder.privkey) {
      const adaptorSig = p2pk.createP2PKAdaptorSignature(
        responder.privkey,
        this.context.responderSecret.secret,
        adaptorSecret
      );

      this.context.responderAdaptorSig = {
        signature: adaptorSig,
        signerPubkey: responder.pubkey,
        secret: this.context.responderSecret.secret,
        mintUrl: responder.mintUrl,
      };

      this.emit(SwapEventType.ADAPTOR_SIG_CREATED, {
        role: SwapRole.RESPONDER,
      });
    }

    this.setState(SwapState.ADAPTOR_SIGS_EXCHANGED);
  }

  /**
   * Step 4: Verify adaptor signatures
   */
  async verifyAdaptorSignatures(): Promise<boolean> {
    if (this.context.state !== SwapState.ADAPTOR_SIGS_EXCHANGED) {
      throw new Error(
        `Cannot verify from state: ${this.context.state}`
      );
    }

    const { initiator, responder } = this.context.params;
    const { initiatorAdaptorSig, responderAdaptorSig } = this.context;

    if (!initiatorAdaptorSig || !responderAdaptorSig) {
      throw new Error('Adaptor signatures not created');
    }

    // Verify initiator's signature
    const initiatorValid = p2pk.verifyP2PKAdaptorSignature(
      initiator.pubkey,
      initiatorAdaptorSig.secret,
      initiatorAdaptorSig.signature
    );

    if (!initiatorValid.valid) {
      this.setState(SwapState.FAILED, `Initiator signature invalid: ${initiatorValid.error}`);
      this.emit(SwapEventType.ERROR, { error: initiatorValid.error });
      return false;
    }

    // Verify responder's signature
    const responderValid = p2pk.verifyP2PKAdaptorSignature(
      responder.pubkey,
      responderAdaptorSig.secret,
      responderAdaptorSig.signature
    );

    if (!responderValid.valid) {
      this.setState(SwapState.FAILED, `Responder signature invalid: ${responderValid.error}`);
      this.emit(SwapEventType.ERROR, { error: responderValid.error });
      return false;
    }

    this.emit(SwapEventType.ADAPTOR_SIG_VERIFIED);
    this.setState(SwapState.VERIFIED);
    return true;
  }

  /**
   * Step 5: Responder claims first (reveals signature)
   */
  async responderClaim(): Promise<SchnorrSignature> {
    if (this.context.state !== SwapState.VERIFIED) {
      throw new Error(`Cannot claim from state: ${this.context.state}`);
    }

    const { adaptorSecret } = this.context.params;
    const { initiatorAdaptorSig } = this.context;

    if (!adaptorSecret) {
      throw new Error('Adaptor secret not available');
    }

    if (!initiatorAdaptorSig) {
      throw new Error('Initiator adaptor signature not available');
    }

    this.setState(SwapState.CLAIMING);
    this.emit(SwapEventType.CLAIM_INITIATED, { role: SwapRole.RESPONDER });

    // Complete adaptor signature to create spendable signature
    const claimSig = p2pk.completeP2PKSignature(
      initiatorAdaptorSig.signature,
      adaptorSecret
    );

    // Verify the completed signature is valid
    const witness = p2pk.createP2PKWitness(claimSig);
    const valid = p2pk.verifyP2PKWitness(
      this.context.params.initiator.pubkey,
      initiatorAdaptorSig.secret,
      witness
    );

    if (!valid.valid) {
      this.setState(SwapState.FAILED, `Claim signature invalid: ${valid.error}`);
      throw new Error(`Claim signature invalid: ${valid.error}`);
    }

    this.emit(SwapEventType.CLAIM_COMPLETED, {
      role: SwapRole.RESPONDER,
      mintUrl: initiatorAdaptorSig.mintUrl,
    });

    return claimSig;
  }

  /**
   * Step 6: Initiator extracts secret from responder's claim
   */
  async extractSecret(responderClaimSig: SchnorrSignature): Promise<Uint8Array> {
    if (this.context.state !== SwapState.CLAIMING) {
      throw new Error(`Cannot extract secret from state: ${this.context.state}`);
    }

    const { initiatorAdaptorSig } = this.context;

    if (!initiatorAdaptorSig) {
      throw new Error('Initiator adaptor signature not available');
    }

    this.setState(SwapState.EXTRACTING);
    this.emit(SwapEventType.SECRET_EXTRACTED, { role: SwapRole.INITIATOR });

    // Extract secret from published signature
    const extracted = p2pk.extractSecretFromWitness(
      initiatorAdaptorSig.signature,
      responderClaimSig
    );

    this.context.extractedSecret = extracted;
    return extracted;
  }

  /**
   * Step 7: Initiator claims using extracted secret
   */
  async initiatorClaim(): Promise<SchnorrSignature> {
    if (this.context.state !== SwapState.EXTRACTING) {
      throw new Error(`Cannot claim from state: ${this.context.state}`);
    }

    const { extractedSecret } = this.context;
    const { responderAdaptorSig } = this.context;

    if (!extractedSecret) {
      throw new Error('Secret not extracted');
    }

    if (!responderAdaptorSig) {
      throw new Error('Responder adaptor signature not available');
    }

    this.emit(SwapEventType.CLAIM_INITIATED, { role: SwapRole.INITIATOR });

    // Complete adaptor signature with extracted secret
    const claimSig = p2pk.completeP2PKSignature(
      responderAdaptorSig.signature,
      extractedSecret
    );

    // Verify the completed signature is valid
    const witness = p2pk.createP2PKWitness(claimSig);
    const valid = p2pk.verifyP2PKWitness(
      this.context.params.responder.pubkey,
      responderAdaptorSig.secret,
      witness
    );

    if (!valid.valid) {
      this.setState(SwapState.FAILED, `Claim signature invalid: ${valid.error}`);
      throw new Error(`Claim signature invalid: ${valid.error}`);
    }

    this.emit(SwapEventType.CLAIM_COMPLETED, {
      role: SwapRole.INITIATOR,
      mintUrl: responderAdaptorSig.mintUrl,
    });

    this.setState(SwapState.COMPLETED);
    this.emit(SwapEventType.SWAP_COMPLETED);

    return claimSig;
  }

  /**
   * Execute complete swap (convenience method)
   */
  async execute(): Promise<{
    responderClaim: SchnorrSignature;
    initiatorClaim: SchnorrSignature;
    extractedSecret: Uint8Array;
  }> {
    // Initialize
    await this.initialize();

    // Create secrets
    await this.createSecrets();

    // Create adaptor signatures
    await this.createAdaptorSignatures();

    // Verify
    const verified = await this.verifyAdaptorSignatures();
    if (!verified) {
      throw new Error('Adaptor signature verification failed');
    }

    // Responder claims
    const responderClaim = await this.responderClaim();

    // Initiator extracts secret
    const extractedSecret = await this.extractSecret(responderClaim);

    // Initiator claims
    const initiatorClaim = await this.initiatorClaim();

    return {
      responderClaim,
      initiatorClaim,
      extractedSecret,
    };
  }
}
