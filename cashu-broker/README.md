# Cashu Broker (Rust Implementation)

> **Status**: ✅ Core Implementation Complete - Ready for Testing

Production-grade Rust implementation of the Cashu broker service for atomic ecash swaps between different mints.

**This is now the primary implementation.** The TypeScript version in `/src` serves as a reference specification.

## Why Rust?

The TypeScript version (`../tests/test-broker.ts`) successfully proved the concept. For production deployment, Rust offers:

- **Memory safety** - Critical when handling liquidity
- **Performance** - Lower latency, no GC pauses
- **Reliability** - Predictable performance for long-running services
- **Single binary** - Easier deployment
- **CDK ecosystem** - Native integration with Cashu Development Kit

## Architecture

```
cashu-broker/
├── src/
│   ├── lib.rs           # Public API and module definitions
│   ├── adaptor.rs       # ✅ Schnorr adaptor signatures (schnorr_fun)
│   ├── types.rs         # ✅ Core data types
│   ├── error.rs         # ✅ Error handling
│   ├── liquidity.rs     # ✅ Multi-mint liquidity management
│   ├── swap.rs          # ✅ Swap coordinator with P2PK integration
│   └── broker.rs        # ✅ Main broker service ("Charlie")
├── examples/
│   └── run_broker.rs    # ✅ Working broker demonstration
└── tests/
    └── integration.rs   # 🚧 TODO: Full end-to-end integration tests
```

## Dependencies

### Core
- **cdk** (v0.4): Cashu Development Kit for wallet/mint operations
- **schnorr_fun** (v0.10): Pure Rust Schnorr adaptor signatures
- **secp256kfun** (v0.10): Secp256k1 elliptic curve operations

### Runtime
- **tokio** (v1): Async runtime for concurrent swap handling
- **async-trait**: Async trait methods

### Utilities
- **anyhow** / **thiserror**: Error handling
- **serde** / **serde_json**: Serialization
- **tracing**: Structured logging

## Implementation Status

### ✅ Phase 1-3: Core Broker (COMPLETE)
- [x] Project structure and dependencies
- [x] Error types and Result wrappers
- [x] Core data types (BrokerConfig, SwapQuote, etc.)
- [x] Adaptor signature primitives
  - Encrypted signature creation
  - Signature verification
  - Signature decryption
  - Adaptor secret recovery
  - Key tweaking operations
- [x] Liquidity manager
  - Multi-mint wallet management
  - Balance tracking with RwLock for concurrent access
  - Token selection (greedy algorithm)
  - Mint/receive via CDK wallet integration
- [x] Swap coordinator
  - Quote generation with fee calculation
  - P2PK token locking to tweaked public keys
  - Adaptor signature-based atomic swaps
  - Quote expiry management
- [x] Main broker service
  - Full Charlie broker implementation
  - Initialize liquidity across mints
  - Request/accept/complete swap flow
  - Status reporting

### 🚧 Phase 4: Nostr Integration (NEXT)
- [ ] Nostr service announcements (NIP-01)
- [ ] Encrypted swap request/response (NIP-04)
- [ ] Broker discovery protocol
- [ ] Real-time quote updates

### 📋 Phase 5: Production Features
- [ ] HTTP/REST API (axum)
- [ ] gRPC API for programmatic access
- [ ] Metrics and monitoring (Prometheus)
- [ ] Database persistence (SQLite/PostgreSQL)
- [ ] CLI tool for broker management
- [ ] Docker deployment
- [ ] Comprehensive integration tests

## Building

```bash
# Build the library
cargo build --release

# Run tests
cargo test

# Run example
cargo run --example run_broker
```

## Testing Against Local Mints

The broker requires running Cashu mints for testing:

```bash
# From parent directory
./scripts/setup-local-mints.sh

# Verify mints are running
docker-compose ps

# Run integration tests
cargo test --test integration -- --ignored
```

## Design Decisions

### Why schnorr_fun over secp256k1-zkp?

- **Pure Rust**: No C dependencies, easier to audit
- **Schnorr-specific**: Built for Schnorr adaptor signatures
- **Well-documented**: Clear API for encrypted signatures
- **Active development**: Regular updates and improvements

secp256k1-zkp focuses on ECDSA adaptor signatures, while we need Schnorr for Cashu P2PK (NUT-11).

### Why async/await?

The broker needs to:
- Handle multiple concurrent swap requests
- Interact with multiple mint APIs simultaneously
- Maintain long-lived connections for monitoring

Tokio's async runtime provides efficient concurrency without thread overhead.

## Security Considerations

⚠️ **Not production-ready yet**

- [ ] Formal cryptographic audit needed
- [ ] Thorough testing against attack vectors
- [ ] Rate limiting and DoS protection
- [ ] Secure key storage
- [ ] Audit logging

## References

- [TypeScript Reference Implementation](../tests/test-broker.ts)
- [Cashu Development Kit](https://github.com/cashubtc/cdk)
- [schnorr_fun Documentation](https://docs.rs/schnorr_fun)
- [NUT-11: P2PK Specification](https://github.com/cashubtc/nuts/blob/main/11.md)

## License

MIT
