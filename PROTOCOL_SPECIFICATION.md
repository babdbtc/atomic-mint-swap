# Cashu Atomic Swap Protocol Specification
## NUT-XX: Cross-Mint Atomic Swaps via Adaptor Signatures

**Status**: Draft Proposal
**Author**: Cashu Community
**Depends on**: NUT-11 (Pay-to-Pubkey)

---

## Abstract

This specification defines a protocol for atomic swaps of ecash tokens between different Cashu mints using Schnorr adaptor signatures. The protocol enables trustless exchange without requiring mint cooperation or protocol upgrades.

---

## Motivation

Users of different Cashu mints cannot directly transact without:
1. Both parties trusting a common mint
2. Using Lightning as intermediary (requires channels, liquidity, routing)
3. Trusting a third-party escrow

Atomic swaps using adaptor signatures enable:
- Trustless cross-mint exchange
- No mint modifications required
- Privacy-preserving transactions
- Lightning-free ecash interoperability

---

## Specification

### 1. Terminology

- **Swap Initiator (Alice)**: Party requesting ecash from target mint
- **Swap Responder (Bob)**: Party offering liquidity (broker)
- **Source Mint**: Mint where Alice holds ecash
- **Target Mint**: Mint where Alice wants ecash
- **Adaptor Point (T)**: Public point `T = tG` where `t` is secret
- **Adaptor Signature**: Tuple `(s', R, T)` satisfying `s'G = T + R + H(P||R||m)P`

### 2. Cryptographic Primitives

#### 2.1 Adaptor Signature Generation

Given:
- Private key `x`
- Public key `P = xG`
- Message `m`
- Adaptor point `T = tG`
- Nonce `r` and `R = rG`

Generate adaptor signature:
```
e = H(P || R || m)
s' = r + t + e·x
Return (s', R, T)
```

Verification equation:
```
s'G == T + R + e·P
```

#### 2.2 Signature Extraction

Given:
- Adaptor signature `(s', R, T)`
- Published signature `(s, R)`

Extract secret:
```
t = s' - s
Verify: tG == T
```

#### 2.3 Signature Completion

Given:
- Adaptor signature `(s', R, T)`
- Secret `t`

Complete signature:
```
s = s' - t
Return (s, R)
```

Verification:
```
sG == R + H(P || R || m)P
```

### 3. Protocol Flow

#### Phase 1: Discovery

**Bob (Broker) announces liquidity via Nostr:**

```json
{
  "kind": 38000,
  "pubkey": "<broker_nostr_pubkey>",
  "created_at": 1234567890,
  "content": "",
  "tags": [
    ["mint", "<mint_A_url>", "<available_sats>"],
    ["mint", "<mint_B_url>", "<available_sats>"],
    ["fee", "50"],
    ["min_swap", "1000"],
    ["max_swap", "1000000"],
    ["cashu_pubkey_A", "<broker_cashu_pubkey_for_mint_A>"],
    ["cashu_pubkey_B", "<broker_cashu_pubkey_for_mint_B>"]
  ]
}
```

**Alice discovers Bob:**
- Queries Nostr for kind `38000` events
- Filters by required mint pair
- Evaluates fee and liquidity

#### Phase 2: Negotiation

**Alice sends swap request (Nostr DM):**

```json
{
  "swap_request": {
    "id": "<random_uuid>",
    "from_mint": "<mint_A_url>",
    "to_mint": "<mint_B_url>",
    "amount": 100000,
    "alice_pubkey_A": "<pubkey_for_receiving_on_A>",
    "alice_pubkey_B": "<pubkey_for_sending_on_B>",
    "timestamp": 1234567890
  }
}
```

**Bob responds with swap offer:**

```json
{
  "swap_offer": {
    "id": "<same_uuid>",
    "fee": 500,
    "total_alice_sends": 100500,
    "total_alice_receives": 100000,
    "bob_pubkey_A": "<pubkey_for_sending_on_A>",
    "bob_pubkey_B": "<pubkey_for_receiving_on_B>",
    "T": "<hex_32_bytes>",
    "R_A": "<hex_32_bytes>",
    "R_B": "<hex_32_bytes>",
    "expiry": 1234567900
  }
}
```

Where:
- `T = tG` (Bob's secret adaptor point)
- `R_A` = nonce for transaction on Mint A
- `R_B` = nonce for transaction on Mint B
- Both transactions use the same `T`

#### Phase 3: Token Preparation

**Alice creates P2PK tokens on Mint B:**

```json
{
  "amount": 100500,
  "secret": {
    "nonce": "<random_hex>",
    "data": "<bob_pubkey_B>",
    "tags": [
      ["sigflag", "SIG_INPUTS"]
    ]
  }
}
```

**Bob creates P2PK tokens on Mint A:**

```json
{
  "amount": 100000,
  "secret": {
    "nonce": "<random_hex>",
    "data": "<alice_pubkey_A>",
    "tags": [
      ["sigflag", "SIG_INPUTS"]
    ]
  }
}
```

#### Phase 4: Adaptor Signature Exchange

**Alice creates adaptor signature for Mint B:**

```
m_B = SHA256(secret_B)
e_B = SHA256(alice_pubkey_B || R_B || m_B)
s'_alice = r_alice + t + e_B · x_alice

adaptor_sig_alice = (s'_alice, R_B, T)
```

Sends to Bob:
```json
{
  "adaptor_signature": {
    "proof": {
      "amount": 100500,
      "secret": "<secret_B_json>",
      "C": "<blinded_commitment>"
    },
    "s_prime": "<hex_64_bytes>",
    "R": "<R_B_hex>",
    "T": "<T_hex>",
    "pubkey": "<alice_pubkey_B>"
  }
}
```

**Bob creates adaptor signature for Mint A:**

```
m_A = SHA256(secret_A)
e_A = SHA256(bob_pubkey_A || R_A || m_A)
s'_bob = r_bob + t + e_A · x_bob

adaptor_sig_bob = (s'_bob, R_A, T)
```

Sends to Alice:
```json
{
  "adaptor_signature": {
    "proof": {
      "amount": 100000,
      "secret": "<secret_A_json>",
      "C": "<blinded_commitment>"
    },
    "s_prime": "<hex_64_bytes>",
    "R": "<R_A_hex>",
    "T": "<T_hex>",
    "pubkey": "<bob_pubkey_A>"
  }
}
```

**Verification:**

Both parties verify:
```
s'G == T + R + e·P
```

If invalid, abort swap.

#### Phase 5: Atomic Execution

**Bob claims on Mint B (first mover):**

```
s_bob_claim = s'_alice - t

Bob submits to Mint B:
{
  "inputs": [<alice_p2pk_proof>],
  "outputs": [...],
  "witness": {
    "signatures": ["<s_bob_claim_hex>"]
  }
}
```

Mint B validates standard Schnorr signature and releases tokens.

**Alice observes and extracts secret:**

Alice monitors Mint B's spent proofs (via NUT-07 state check):
```
{
  "Y": "<secret_commitment>",
  "state": "SPENT",
  "witness": {
    "signatures": ["<s_bob_claim_hex>"]
  }
}
```

Alice extracts `t`:
```
t = s'_alice - s_bob_claim
Verify: tG == T
```

**Alice claims on Mint A:**

```
s_alice_claim = s'_bob - t

Alice submits to Mint A:
{
  "inputs": [<bob_p2pk_proof>],
  "outputs": [...],
  "witness": {
    "signatures": ["<s_alice_claim_hex>"]
  }
}
```

Swap complete - both parties have claimed their tokens atomically.

### 4. Atomicity Guarantees

**Theorem**: The protocol provides atomic swap execution.

**Proof**:
1. Both adaptor signatures share the same `T = tG`
2. Only Bob knows secret `t`
3. If Bob claims on Mint B:
   - He must publish `s_bob = s'_alice - t`
   - Alice can compute `t = s'_alice - s_bob`
   - Alice can then compute `s_alice = s'_bob - t`
   - Alice can claim on Mint A
4. If Bob never claims on Mint B:
   - `s_bob` is never revealed
   - Alice cannot extract `t`
   - Alice cannot claim on Mint A (doesn't have valid signature)
   - Bob cannot claim on Mint A (doesn't know Alice's private key)
   - Neither party loses funds
5. No race conditions: Once Bob publishes signature, `t` is irrevocably revealed

**Therefore**: Either both swaps execute or neither does. QED.

### 5. Security Considerations

#### 5.1 Cryptographic Security

**Random Number Generation:**
- `t` must be generated from cryptographically secure random source
- `r` values must be unique per signature (nonce reuse attack)
- Never reuse `T` across multiple swaps

**Signature Verification:**
- Mints must properly validate Schnorr signatures per NUT-11
- Clients must verify adaptor signatures before proceeding

#### 5.2 Privacy

**Transaction Unlinkability:**
- P2PK transactions appear as standard NUT-11 operations
- No on-chain evidence of cross-mint coordination
- Observers cannot distinguish swaps from normal transfers

**Nostr Privacy:**
- Use encrypted DMs for negotiation (NIP-04 or NIP-17)
- Avoid correlating amounts across mints
- Use fresh pubkeys for each swap

#### 5.3 Economic Security

**Broker Liquidity:**
- Bob must maintain sufficient balance on both mints
- Capital lockup during swap execution
- Fee must compensate for risk and opportunity cost

**Griefing Prevention:**
- Require small upfront bond for swap requests
- Reputation systems (Nostr web-of-trust)
- Exponential backoff for failed swaps

#### 5.4 Operational Security

**Mint Downtime:**
- Protocol is resilient - no timeouts required
- Alice can wait indefinitely for Bob to claim
- If Bob claims but Alice's mint is offline, she can claim later

**Double-Spend Protection:**
- Mints enforce standard ecash redemption rules
- Tokens can only be spent once
- Race conditions impossible due to atomicity

### 6. Implementation Guidelines

#### 6.1 Required Capabilities

Implementing wallets must support:
- Schnorr signature generation (NUT-11)
- Adaptor signature generation and verification
- Secret extraction from published signatures
- P2PK token creation and spending
- Nostr event publishing and subscription

#### 6.2 Library Support

Reference implementations should provide:
```typescript
// Adaptor signature generation
function generateAdaptorSignature(
  privkey: Uint8Array,
  message: Uint8Array,
  adaptorPoint: Uint8Array,
  nonce: Uint8Array
): AdaptorSignature

// Adaptor signature verification
function verifyAdaptorSignature(
  pubkey: Uint8Array,
  message: Uint8Array,
  adaptorSig: AdaptorSignature
): boolean

// Secret extraction
function extractSecret(
  adaptorSig: AdaptorSignature,
  completedSig: SchnorrSignature
): Uint8Array

// Signature completion
function completeSignature(
  adaptorSig: AdaptorSignature,
  secret: Uint8Array
): SchnorrSignature
```

#### 6.3 Error Handling

Implementations must handle:
- Invalid adaptor signatures (abort before token creation)
- Mint API failures (retry with exponential backoff)
- Expired swap offers (request new offer)
- Broker offline (try alternative brokers)

### 7. Test Vectors

#### 7.1 Adaptor Signature Test

**Inputs:**
```
privkey = 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
message = SHA256("test message")
nonce = 0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321
t = 0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
```

**Expected:**
```
P = 0x02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5
T = 0x02f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9
R = 0x02dff1d77f2a671c5f36183726db2341be58feae1da2deced843240f7b502ba659
s' = 0x... (computed)
```

**Verification:**
```
s'G == T + R + SHA256(P || R || message) · P
```

#### 7.2 Complete Swap Test

[Full end-to-end test vector with two mints, token creation, signature exchange, and claiming sequence]

### 8. Backwards Compatibility

This specification:
- Requires NUT-11 (P2PK) support
- Does not modify existing NUTs
- Is purely client-side protocol
- Requires no mint upgrades
- Is optional for wallet implementations

Mints that support NUT-11 automatically support atomic swaps without changes.

### 9. Reference Implementation

See: [GitHub repository link]

Includes:
- TypeScript/JavaScript library
- CLI tool for testing
- Broker service example
- Nostr integration module

### 10. Future Extensions

#### 10.1 Multi-Hop Swaps

Chain multiple swaps atomically:
```
Alice (Mint A) → Bob (Mint B) → Charlie (Mint C)
```

Use nested adaptor signatures with multiple secrets.

#### 10.2 Submarine Swaps

Combine with Lightning HTLCs:
```
Alice (Mint A) ↔ Bob (Lightning) ↔ Charlie (Mint B)
```

Atomic ecash-to-Lightning-to-ecash.

#### 10.3 DEX Integration

Decentralized orderbook on Nostr:
- Limit orders for mint pairs
- Automated market makers
- Liquidity pools

### 11. Acknowledgments

This specification builds on:
- Schnorr adaptor signatures (Blockstream Research)
- Cashu protocol (Calle)
- Scriptless scripts research (Andrew Poelstra)

---

## Changelog

- 2025-01-XX: Initial draft specification

## License

CC0 1.0 Universal
