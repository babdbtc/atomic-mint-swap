# Atomic Ecash Swap Feasibility Analysis

## Executive Summary

**YES - This is possible and buildable!** Cashu's existing cryptographic primitives (NUT-11 Schnorr signatures + NUT-14 HTLCs) provide the foundation for atomic cross-mint swaps. Two viable approaches exist:

1. **Adaptor Signatures (Recommended)** - True scriptless atomic swaps using Schnorr adaptor signatures
2. **Enhanced HTLCs** - Protocol extension for coordinated hash-locked swaps

---

## Research Findings

### Cashu's Cryptographic Stack

#### Core Protocol (NUT-00)
- **Scheme**: Blind Diffie-Hellman Key Exchange (BDHKE)
- **Curve**: secp256k1
- **Hash-to-curve**: Domain separator `b"Secp256k1_HashToCurve_Cashu_"`
- **Basic model**: Blind signatures for bearer tokens

#### Spending Conditions (NUT-11: P2PK)
- **Signature type**: 64-byte Schnorr signatures
- **Message signing**: SHA256 hash of message
- **Locking**: Tokens locked to recipient's public key
- **Unlocking**: Requires valid Schnorr signature from private key
- **Features**: Multisig support, signature flags (SIG_INPUTS, SIG_ALL)

#### HTLCs (NUT-14)
- **Hash locks**: 32-byte preimage required for spending
- **Timelocks**: Refund path after timeout
- **Combined conditions**: Preimage + P2PK signature
- **Use case**: Atomic swaps between users (same mint), Lightning coupling

### Adaptor Signature Compatibility

#### What Are Adaptor Signatures?
Cryptographic primitive that links signature creation to secret revelation:
- Standard Schnorr: `sG = R + H(P || R || m)P`
- Adaptor signature: `s'G = T + R + H(P || R || m)P`
- Secret extraction: `t = s' - s` (where `T = tG`)

#### Why They Enable Atomicity
When party A publishes their transaction (revealing `s`), party B can:
1. Compute `t = s' - s` (extract the secret)
2. Compute `s = s' - t` (create their own valid signature)
3. Claim their funds immediately

**Either both swaps complete or neither does** - no trust required.

#### Cashu Compatibility
✅ **Cashu uses Schnorr signatures on secp256k1** (NUT-11)
✅ **Adaptor signatures work with Schnorr on secp256k1**
✅ **Mathematical foundation is compatible**

---

## Approach 1: Adaptor Signature Atomic Swaps (RECOMMENDED)

### Protocol Design

#### Parties
- **Bob**: Holds ecash from Mint B, wants ecash from Mint A
- **Charlie**: Holds ecash from Mint A, willing to swap (broker)
- **Mint A & B**: Standard Cashu mints (no modifications needed)

#### Setup Phase
1. Bob and Charlie negotiate:
   - Amount to swap
   - Fee (e.g., 0.5%)
   - Mints involved (A and B)

2. Both parties generate shared parameters:
   - Agree on `R` value for signatures
   - Exchange public keys (P_bob, P_charlie)

3. Charlie generates secret:
   - Random scalar `t`
   - Compute `T = tG`
   - Share `T` with Bob

#### Token Preparation
4. Bob creates P2PK tokens on Mint B:
   - Lock to Charlie's public key
   - Amount: swap amount + fee

5. Charlie creates P2PK tokens on Mint A:
   - Lock to Bob's public key
   - Amount: swap amount

#### Adaptor Signature Exchange
6. Bob creates adaptor signature for Charlie:
   - `(s'_bob, R, T)` enabling Charlie to redeem from Mint B
   - **Not yet a valid signature** - requires secret `t`

7. Charlie creates adaptor signature for Bob:
   - `(s'_charlie, R, T)` enabling Bob to redeem from Mint A
   - Uses the same `T` value

#### Atomic Execution
8. Charlie claims first:
   - Computes `s_charlie = s'_charlie - t`
   - Submits valid signature to Mint A
   - Claims Bob's tokens from Mint A

9. Bob extracts secret:
   - Observes Charlie's published signature `s_charlie`
   - Computes `t = s'_charlie - s_charlie`
   - Computes `s_bob = s'_bob - t`

10. Bob claims his tokens:
    - Submits valid signature to Mint B
    - Claims Charlie's tokens from Mint B

### Atomicity Guarantee
- If Charlie claims (step 8), Bob can **always** extract `t` and claim (step 10)
- If Charlie doesn't claim, Bob doesn't reveal his signature → Charlie can't claim
- No race conditions or trust assumptions
- Works even if mints are non-cooperative or offline

### Implementation Requirements

#### Client-Side Cryptography
- Adaptor signature generation (Schnorr variant)
- Secret extraction from published signatures
- Standard Cashu wallet operations

#### No Mint Changes Required
- Uses existing NUT-11 (P2PK) functionality
- Mints only validate standard Schnorr signatures
- No protocol upgrades needed

#### Discovery & Coordination (Nostr)
- Charlie announces:
  - Supported mint pairs
  - Fee structure
  - Liquidity availability
  - Public key for swaps
- Bob discovers brokers via Nostr queries
- Peer-to-peer negotiation protocol

### Advantages
✅ True atomicity without trust
✅ No mint cooperation required
✅ No protocol changes needed
✅ Privacy-preserving (looks like regular P2PK transactions)
✅ Works with existing Cashu implementations

### Challenges
⚠️ Requires implementing adaptor signature cryptography
⚠️ Not yet standard in Cashu libraries
⚠️ Needs peer-to-peer coordination protocol
⚠️ Broker needs liquidity on both mints

---

## Approach 2: Enhanced HTLC Protocol (Alternative)

### Protocol Design

#### Extension to NUT-14
Coordinate HTLCs across two mints using shared preimage:

1. Bob creates HTLC on Mint B:
   - Locked to `hash(preimage)`
   - Payable to Charlie
   - Locktime: T + 24 hours

2. Charlie creates HTLC on Mint A:
   - Locked to same `hash(preimage)`
   - Payable to Bob
   - Locktime: T + 12 hours (shorter!)

3. Charlie reveals preimage to claim from Mint B

4. Bob observes preimage, claims from Mint A

### Atomicity Analysis
⚠️ **Not truly atomic without additional guarantees:**
- If Charlie reveals preimage but Mint A is offline, Bob may not claim in time
- If Charlie claims but doesn't publish preimage, Bob loses funds
- Requires timelock ordering to minimize risk

### Improvements Needed
To make this truly atomic:
- **Proof Publication**: Charlie must prove preimage revelation
- **Mint Coordination**: Some form of cross-mint verification
- **OR** use adaptor signatures even within HTLC structure

### Why This Is Less Ideal
- Requires protocol extensions (new NUT)
- Timing-dependent (not instant atomicity)
- Vulnerable to mint downtime
- More complex failure modes

---

## Approach 3: Mint Protocol Extension (Future Work)

### Concept
Add native cross-mint swap support to Cashu protocol:
- New NUT specification
- Mints coordinate on swap execution
- Built-in atomic settlement

### Requirements
- Consensus among mint operators
- Standardized mint-to-mint communication
- Protocol upgrade across ecosystem

### Timeline
Long-term solution (6-12+ months for adoption)

---

## Recommended Implementation Path

### Phase 1: Proof of Concept (Weeks 1-2)
1. Implement adaptor signature library for Cashu
   - Schnorr adaptor signature generation
   - Secret extraction functions
   - Integration with existing Cashu crypto

2. Build basic swap protocol
   - Two-party local testing
   - Manual negotiation
   - Verify atomicity guarantees

### Phase 2: Broker Service (Weeks 3-4)
1. Charlie service implementation
   - Liquidity management across mints
   - Fee calculation
   - Swap execution engine

2. Nostr integration
   - Announcement protocol
   - Discovery mechanism
   - Encrypted negotiation

### Phase 3: Client Integration (Weeks 5-6)
1. Wallet support
   - Swap initiation UI
   - Broker discovery
   - Transaction monitoring

2. Testing & security audit
   - Adversarial testing
   - Cryptographic review
   - Edge case handling

---

## Technical Specifications

### Adaptor Signature Format

```json
{
  "adaptor_signature": {
    "s_prime": "<hex_64_bytes>",
    "R": "<hex_32_bytes>",
    "T": "<hex_32_bytes>",
    "pubkey": "<hex_32_bytes>"
  }
}
```

### Swap Request (Nostr Event)

```json
{
  "kind": 9000,
  "content": {
    "from_mint": "<mint_B_url>",
    "to_mint": "<mint_A_url>",
    "amount": 10000,
    "max_fee_bps": 50
  },
  "tags": [
    ["p", "<broker_pubkey>"]
  ]
}
```

### Swap Offer (Nostr Event)

```json
{
  "kind": 9001,
  "content": {
    "swap_id": "<uuid>",
    "fee_bps": 50,
    "fee_absolute": 50,
    "total_to_mint_B": 10050,
    "total_from_mint_A": 10000,
    "broker_pubkey_A": "<pubkey>",
    "broker_pubkey_B": "<pubkey>",
    "T": "<hex_32_bytes>",
    "R": "<hex_32_bytes>",
    "expiry": 1234567890
  }
}
```

### Adaptor Signature Exchange

```json
{
  "kind": 9002,
  "content": {
    "swap_id": "<uuid>",
    "side": "bob_to_charlie",
    "p2pk_proof": {
      "amount": 10050,
      "secret": "<p2pk_secret>",
      "C": "<hex_commitment>"
    },
    "adaptor_sig": {
      "s_prime": "<hex>",
      "R": "<hex>",
      "T": "<hex>"
    }
  }
}
```

---

## Security Considerations

### Cryptographic Security
- **Adaptor signature soundness**: Requires proper implementation of Schnorr variant
- **Randomness**: Both `r` (for R) and `t` (for T) must be cryptographically random
- **Signature verification**: Mints must validate standard Schnorr signatures correctly

### Economic Security
- **Broker liquidity**: Charlie must maintain sufficient balances
- **Fee incentives**: Must compensate for capital lockup and risk
- **Sybil resistance**: Reputation system on Nostr

### Operational Security
- **Preimage privacy**: Before claiming, preimage must not leak
- **Timing attacks**: Ensure no correlation between swap initiation and execution
- **Mint downtime**: Adaptor signature approach is resilient to this

### Privacy Considerations
- **On-chain privacy**: P2PK transactions don't reveal swap relationship
- **Nostr privacy**: Encrypted negotiation prevents transaction graph analysis
- **Amount privacy**: Use round amounts or split/combine tokens

---

## Open Questions

1. **Cashu library support**: Do existing libraries (cashu-ts, cashu-js, nutshell) expose low-level signature APIs?
2. **Witness format**: Can adaptor signature proofs fit in existing witness structure?
3. **Multi-hop swaps**: Can we chain swaps across 3+ mints atomically?
4. **Griefing prevention**: How to prevent DoS by fake swap requests?
5. **Fee markets**: What's optimal pricing for broker services?

---

## Conclusion

**Building atomic ecash swaps for Cashu is feasible using adaptor signatures with existing protocol features (NUT-11).**

### Key Advantages
- No mint upgrades required
- True atomicity guarantees
- Privacy-preserving
- Can be built and deployed immediately

### Main Challenge
Implementing adaptor signature cryptography for Schnorr on secp256k1 in Cashu context.

### Recommendation
**Start building with Approach 1 (Adaptor Signatures)** - it provides the strongest atomicity guarantees with minimal ecosystem dependencies.
