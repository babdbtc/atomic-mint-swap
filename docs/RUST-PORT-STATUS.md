# Rust Port Status

**Status**: 🚧 Foundation Complete - Ready for CDK Integration

## Overview

The Charlie broker service is being ported from TypeScript to Rust for production deployment. The TypeScript version successfully proved the concept and validated the atomic swap protocol. The Rust version provides production-grade reliability, performance, and security.

## Why Rust?

| Aspect | TypeScript | Rust |
|--------|-----------|------|
| **Purpose** | Prototype & validate | Production deployment |
| **Performance** | ~10-50ms swap latency | ~1-5ms swap latency (estimated) |
| **Memory** | GC pauses, unpredictable | Zero-cost abstractions, predictable |
| **Safety** | Runtime errors | Compile-time guarantees |
| **Deployment** | node + dependencies | Single binary |
| **Ecosystem** | cashu-ts | CDK (Cashu Development Kit) |

## Implementation Progress

### ✅ Completed (838 lines of Rust)

#### Core Infrastructure
- **Error Handling** (`error.rs`, 48 lines)
  - Custom `BrokerError` enum with descriptive variants
  - `Result<T>` type alias for ergonomic error handling
  - Integration with anyhow and thiserror

- **Type System** (`types.rs`, 128 lines)
  - `BrokerConfig`, `MintConfig` - broker configuration
  - `SwapRequest`, `SwapQuote` - swap protocol types
  - `SwapStatus`, `SwapExecution` - swap state tracking
  - Custom SystemTime serialization for cross-platform compatibility

- **Library Interface** (`lib.rs`, 61 lines)
  - Public API definitions
  - Module organization
  - Documentation with examples

#### Cryptography
- **Adaptor Signatures** (`adaptor.rs`, 193 lines)
  - Wrapper around `schnorr_fun` for Schnorr adaptor signatures
  - `AdaptorContext` for managing cryptographic operations
  - Key operations:
    - `create_encrypted_signature()` - create adaptor signature
    - `verify_encrypted_signature()` - verify without decrypting
    - `decrypt_signature()` - decrypt with adaptor secret
    - `recover_adaptor_secret()` - extract secret from revealed signature
    - `tweak_public_key()` - compute P' = P + T
  - Full test coverage demonstrating end-to-end adaptor signature flow

#### Service Components (Scaffolded)
- **Liquidity Manager** (`liquidity.rs`, 130 lines)
  - Structure defined with async methods
  - Token selection, balance tracking, mint management
  - TODO: CDK wallet integration

- **Swap Coordinator** (`swap.rs`, 232 lines)
  - Quote generation with validation
  - Swap preparation and completion flow
  - TODO: CDK P2PK token minting

- **Charlie Broker** (`broker.rs`, 200 lines)
  - Main service orchestration
  - Public API for quote requests and swap execution
  - Liquidity status reporting
  - TODO: HTTP/gRPC server, Nostr announcements

### 🚧 Next Steps

#### 1. CDK Integration (High Priority)
```rust
// Need to integrate CDK for:
- cdk::wallet::Wallet - for managing ecash tokens
- cdk::nuts::nut11::P2PKConditions - for P2PK locking
- cdk::mint::MintClient - for mint API communication
```

Key questions to research:
- How does CDK handle P2PK token minting?
- Can we access the underlying secret/signature for adaptor signature recovery?
- What's the best way to manage multiple wallets (one per mint)?

#### 2. Async Implementation
- Port liquidity manager logic with tokio async/await
- Implement concurrent mint interactions
- Handle connection pooling for mint APIs

#### 3. Testing
- Create integration tests using local Docker mints
- Port test scenarios from TypeScript version
- Test adaptor signature recovery in real swap scenarios

#### 4. Service Runtime
- HTTP API (using axum or actix-web)
- gRPC API for programmatic access
- Nostr integration for broker announcements
- Metrics and monitoring (Prometheus)

#### 5. Production Hardening
- Database persistence (SQLite/PostgreSQL)
- Rate limiting and DoS protection
- Secure key storage (HSM support)
- Comprehensive audit logging
- Error recovery and retry logic

## File Structure

```
charlie-broker/
├── Cargo.toml (dependencies and metadata)
├── README.md (Rust-specific documentation)
├── .gitignore
└── src/
    ├── lib.rs           ✅ Public API and modules
    ├── error.rs         ✅ Error types
    ├── types.rs         ✅ Core data structures
    ├── adaptor.rs       ✅ Schnorr adaptor signatures
    ├── liquidity.rs     🚧 Multi-mint liquidity (scaffolded)
    ├── swap.rs          🚧 Swap coordinator (scaffolded)
    └── broker.rs        🚧 Main broker service (scaffolded)
```

## Dependencies

### Cryptography
- `schnorr_fun` v0.10 - Pure Rust Schnorr adaptor signatures
- `secp256kfun` v0.10 - Secp256k1 operations

### Cashu
- `cdk` v0.4 - Cashu Development Kit

### Runtime
- `tokio` v1 - Async runtime
- `async-trait` - Async trait support

### Utilities
- `anyhow` / `thiserror` - Error handling
- `serde` / `serde_json` - Serialization
- `tracing` - Structured logging
- `hex`, `sha2`, `rand` - Crypto utilities

## Key Design Decisions

### 1. schnorr_fun vs secp256k1-zkp
**Choice**: `schnorr_fun`

**Reasoning**:
- Pure Rust (no C dependencies)
- Designed specifically for Schnorr adaptor signatures
- Clean, well-documented API
- Active development

secp256k1-zkp focuses on ECDSA adaptor signatures, while we need Schnorr for Cashu P2PK (NUT-11).

### 2. Async Runtime
**Choice**: `tokio`

**Reasoning**:
- Industry standard for async Rust
- Rich ecosystem (axum, tonic, etc.)
- Efficient concurrent I/O for multiple mints
- Battle-tested in production

### 3. Error Handling
**Choice**: `thiserror` + `anyhow`

**Reasoning**:
- `thiserror` for library errors (BrokerError)
- `anyhow` for application errors
- Ergonomic error propagation with `?`
- Good error context preservation

## Testing Strategy

### Unit Tests
- ✅ Adaptor signature operations
- 🚧 Liquidity manager methods
- 🚧 Swap coordinator validation
- 🚧 Quote generation and expiry

### Integration Tests
- 🚧 Full swap flow against local mints
- 🚧 Multi-mint liquidity management
- 🚧 Concurrent swap handling
- 🚧 Error recovery scenarios

### Benchmark Tests
- 🚧 Swap latency under load
- 🚧 Memory usage during high concurrency
- 🚧 CDK wallet operation performance

## Migration Path

1. **Phase 1**: ✅ Foundation (COMPLETE)
   - Project structure
   - Error types and core types
   - Adaptor signature primitives

2. **Phase 2**: 🚧 CDK Integration (IN PROGRESS)
   - Research CDK P2PK API
   - Implement liquidity manager
   - Port swap coordinator logic

3. **Phase 3**: Production Features
   - HTTP/gRPC APIs
   - Nostr integration
   - Database persistence
   - Monitoring and metrics

4. **Phase 4**: Deployment
   - Docker containerization
   - Kubernetes manifests
   - CI/CD pipelines
   - Security audit

## Reference Implementation

The TypeScript version (`tests/test-charlie-broker.ts`) serves as the reference:
- Validated atomic swap protocol
- Proven fee calculation
- Working adaptor signature flow
- End-to-end test scenario

The Rust port maintains protocol compatibility while adding production-grade features.

## Next Session TODO

1. **Research CDK P2PK Integration**
   - Read CDK documentation for NUT-11 P2PK support
   - Understand how to create P2PK locked tokens
   - Figure out signature extraction for adaptor secret recovery

2. **Implement Liquidity Manager**
   - Initialize CDK wallets for each mint
   - Implement token minting via CDK
   - Add token selection and balance tracking

3. **Port Swap Coordinator**
   - Implement quote generation with adaptor signatures
   - Add P2PK token minting with tweaked pubkeys
   - Implement adaptor secret recovery from revealed signatures

4. **Create Integration Test**
   - Port the TypeScript test scenario to Rust
   - Run against local Docker mints
   - Verify atomic swap completes successfully

## Resources

- [CDK Documentation](https://docs.rs/cdk)
- [CDK GitHub](https://github.com/cashubtc/cdk)
- [schnorr_fun Docs](https://docs.rs/schnorr_fun)
- [NUT-11 P2PK Spec](https://github.com/cashubtc/nuts/blob/main/11.md)
- [TypeScript Reference](../tests/test-charlie-broker.ts)

---

**Last Updated**: 2024-11-16
**Status**: Foundation complete, ready for CDK integration
