# Cashu Broker Service

A broker service that facilitates atomic swaps of ecash between different Cashu mints using adaptor signatures. Provides liquidity across multiple mints and enables users to exchange ecash without Lightning transactions.

## Overview

When Alice uses Mint A and Bob uses Mint B, but Bob wants to pay Alice, a broker acts as an intermediary:

1. **Bob** has ecash from Mint B
2. **Alice** wants to receive ecash from Mint A
3. **Broker** holds liquidity on both Mint A and Mint B
4. **Bob** swaps his Mint B ecash with the broker to get Mint A ecash (0.5% fee)
5. **Bob** pays Alice with the Mint A ecash

This enables cross-mint payments **without Lightning transactions** and with **atomic swap guarantees**.

## Features

- **Atomic Swaps**: Cryptographically guaranteed via adaptor signatures
- **No Lightning Required**: Direct ecash-to-ecash swaps
- **Fee-Based Liquidity**: Broker earns fees for providing liquidity
- **NUT-11 P2PK**: Uses Cashu's Pay-to-Public-Key standard
- **Multi-Mint Support**: Manages liquidity across multiple mints

## Project Status

✅ **TypeScript Prototype - Complete and Working**

- [x] Adaptor signature primitives
- [x] P2PK token minting and swapping (NUT-11)
- [x] BDHKE blind signatures (NUT-00)
- [x] Liquidity management across multiple mints
- [x] Swap quote system with fee calculation
- [x] Atomic swap coordinator
- [x] End-to-end broker test (working)

🚧 **Rust Production Implementation - In Progress**

- [x] Project structure and dependencies
- [x] Error handling and type system
- [x] Schnorr adaptor signatures (schnorr_fun)
- [ ] CDK integration for P2PK tokens
- [ ] Async liquidity management
- [ ] Swap coordinator with proper error handling
- [ ] HTTP/gRPC API server
- [ ] Nostr service announcements
- [ ] Production deployment tools

See [Rust Port Status](./docs/RUST-PORT-STATUS.md) for details.

## Quick Start

### TypeScript Prototype

```bash
# Install dependencies
npm install

# Start local Cashu mints (requires Docker)
./scripts/setup-local-mints.sh

# Run the working broker demo
npx tsx tests/test-broker.ts
```

This demonstrates:
- Bob minting 8 sats on Mint B
- Bob requesting a swap quote from the broker
- Broker locking ecash for atomic swap
- Bob revealing adaptor secret by swapping
- Broker completing the swap and earning a 1 sat fee (0.5%)

### Rust Implementation (In Development)

```bash
cd cashu-broker

# Build the library (requires Rust toolchain)
cargo build

# Run tests
cargo test

# See cashu-broker/README.md for details
```

## Architecture

```
src/
├── broker/
│   ├── charlie.ts           # Main broker service
│   ├── liquidity.ts         # Multi-mint liquidity management
│   ├── swap-coordinator.ts  # Atomic swap execution
│   └── types.ts             # Broker type definitions
├── cashu/
│   ├── mint-client.ts       # Mint API integration
│   ├── wallet.ts            # Token minting/swapping
│   └── types.ts             # Cashu type definitions
├── crypto/
│   ├── adaptor.ts           # Schnorr adaptor signatures
│   └── utils.ts             # Cryptographic utilities
└── index.ts                 # Public exports
```

## How It Works

### 1. Quote Request
Bob requests a quote to swap 8 sats from Mint B to Mint A:
```typescript
const quote = await charlie.requestQuote({
  clientId: 'bob',
  fromMint: MINT_B_URL,
  toMint: MINT_A_URL,
  amount: 8,
  clientPublicKey: bobPubkey,
});
// Quote: input=8 sats, output=7 sats, fee=1 sat (0.5%)
```

### 2. Atomic Swap Setup
Both parties lock tokens to tweaked pubkeys:
- Bob locks 8 sats to `Charlie + T` on Mint B
- Charlie locks 7 sats to `Bob + T` on Mint A

Where `T` is the adaptor point.

### 3. Secret Revelation
Bob spends Charlie's tokens on Mint A by signing with `Bob + t` (adaptor secret).
This reveals the adaptor secret to Charlie.

### 4. Completion
Charlie extracts the adaptor secret from Bob's signature and spends Bob's tokens on Mint B.

Both swaps complete atomically - either both succeed or neither does.

## Configuration

```typescript
const charlie = new CharlieBroker({
  mints: [
    { mintUrl: 'http://localhost:3338', name: 'Mint A', unit: 'sat' },
    { mintUrl: 'http://localhost:3339', name: 'Mint B', unit: 'sat' },
  ],
  feeRate: 0.005,        // 0.5%
  minSwapAmount: 1,       // 1 sat minimum
  maxSwapAmount: 10000,   // 10,000 sats maximum
});

// Initialize with liquidity
await charlie.initialize(100); // 100 sats on each mint
```

## Documentation

- [Quick Start Guide](./docs/QUICK-START.md)
- [Protocol Specification](./docs/PROTOCOL_SPECIFICATION.md)
- [Atomic Swap Analysis](./docs/ATOMIC_SWAP_ANALYSIS.md)
- [Current Status](./docs/STATUS.md)

## Development

```bash
# Run tests
npm test

# Run specific test
npx tsx tests/test-charlie-broker.ts

# Run local mints
./scripts/setup-local-mints.sh

# Check mint status
docker-compose ps
docker-compose logs
```

## Security

⚠️ **Experimental Software - Use at your own risk**

- Cryptography based on Schnorr adaptor signatures
- Uses NUT-00 (BDHKE) and NUT-11 (P2PK) standards
- Not formally audited
- Do not use with large amounts

## Next Steps

1. **Nostr Integration**: Enable broker service announcements
2. **Client API**: Build user-friendly swap client
3. **Fee Optimization**: Dynamic fee rates based on liquidity
4. **Multi-Hop Swaps**: Chain multiple brokers for wider mint coverage

## Contributing

Contributions welcome! Please:
1. Read the protocol specification
2. Check existing issues
3. Submit PRs with tests

## License

MIT

## Acknowledgments

- [Cashu Protocol](https://github.com/cashubtc/nuts)
- [Scriptless Scripts](https://github.com/BlockstreamResearch/scriptless-scripts)
- Adaptor signature research community
