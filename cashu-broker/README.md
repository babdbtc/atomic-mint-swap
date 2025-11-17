# Cashu Broker - Production HTTP API

> **Status**: ✅ Production-Ready with Full Stack Implementation

Production-grade Rust broker service for atomic Cashu ecash swaps with complete HTTP API, database persistence, structured logging, and Docker deployment.

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
│   ├── main.rs          # ✅ HTTP server entry point
│   ├── lib.rs           # ✅ Public API and module definitions
│   ├── api.rs           # ✅ HTTP endpoints & handlers (axum)
│   ├── broker.rs        # ✅ Main broker service ("Charlie")
│   ├── swap.rs          # ✅ Swap coordinator with P2PK integration
│   ├── liquidity.rs     # ✅ Multi-mint liquidity management
│   ├── adaptor.rs       # ✅ Schnorr adaptor signatures (schnorr_fun)
│   ├── db.rs            # ✅ Database repository layer (SQLx)
│   ├── config.rs        # ✅ Configuration management
│   ├── types.rs         # ✅ Core data types
│   └── error.rs         # ✅ Error handling
├── migrations/          # ✅ SQLx database migrations
│   └── 20250117000001_initial_schema.sql
├── examples/
│   └── run_broker.rs    # ✅ Working broker demonstration
├── Dockerfile           # ✅ Production Docker image
├── docker-compose.yml   # ✅ Docker orchestration
├── .env.example         # ✅ Configuration template
└── README.md
```

## Dependencies

### Core
- **cdk** (v0.4): Cashu Development Kit for wallet/mint operations
- **schnorr_fun** (v0.10): Pure Rust Schnorr adaptor signatures
- **secp256kfun** (v0.10): Secp256k1 elliptic curve operations

### HTTP & API
- **axum** (v0.7): Modern async web framework
- **tower** / **tower-http** (v0.4/v0.5): Middleware and CORS
- **serde** / **serde_json**: JSON serialization

### Database
- **sqlx** (v0.7): Async SQL with compile-time checked queries (SQLite/PostgreSQL)

### Runtime
- **tokio** (v1): Async runtime for concurrent swap handling
- **async-trait**: Async trait methods

### Configuration & Logging
- **dotenvy** (v0.15): Environment variable management
- **tracing** / **tracing-subscriber** (v0.1/v0.3): Structured logging
- **anyhow** / **thiserror**: Error handling

### Utilities
- **uuid** (v1.6): Quote ID generation
- **chrono** (v0.4): Timestamp handling
- **hex**: Hex encoding/decoding

## Implementation Status

### ✅ Phase 1-3: Core Broker (COMPLETE)
- [x] Project structure and dependencies
- [x] Error types and Result wrappers
- [x] Core data types (BrokerConfig, SwapQuote, etc.)
- [x] Adaptor signature primitives
- [x] Liquidity manager (multi-mint, concurrent)
- [x] Swap coordinator (P2PK, adaptor signatures)
- [x] Main broker service (Charlie)

### ✅ Phase 4-5: Production Stack (COMPLETE)
- [x] **HTTP/REST API** - Full axum web server
  - POST /quote - Request swap quote
  - POST /quote/:id/accept - Accept quote
  - POST /quote/:id/complete - Complete swap
  - GET /quote/:id - Get quote status
  - GET /quotes - List quotes with filtering
  - GET /liquidity - Check broker liquidity
  - GET /health - Health check endpoint
  - GET /metrics - Performance metrics
- [x] **Database Persistence** - SQLx with SQLite
  - Quotes table with full lifecycle tracking
  - Swaps table for execution details
  - Liquidity events tracking
  - Metrics aggregation
  - Database migrations
- [x] **Configuration Management** - .env support
  - Server settings (host, port)
  - Database URL
  - Broker config (fees, limits)
  - Mint configuration
  - CORS settings
- [x] **Structured Logging** - tracing-subscriber
  - Configurable log levels
  - JSON output support
  - Request tracing
- [x] **Docker Deployment**
  - Multi-stage Dockerfile
  - docker-compose.yml
  - Health checks
  - Volume persistence

### 📋 Phase 6: Advanced Features (NEXT)
- [ ] Nostr integration (NIP-01, NIP-04)
- [ ] WebSocket support for real-time updates
- [ ] PostgreSQL support (in addition to SQLite)
- [ ] Prometheus metrics exporter
- [ ] gRPC API
- [ ] Admin dashboard
- [ ] Comprehensive integration tests
- [ ] Rate limiting
- [ ] Authentication for admin endpoints

## Quick Start

### Option 1: Docker (Recommended for Production)

```bash
# 1. Configure environment
cp .env.example .env
# Edit .env with your mint URLs and settings

# 2. Start the broker
docker-compose up -d

# 3. Check health
curl http://localhost:3000/health

# 4. View logs
docker-compose logs -f broker
```

### Option 2: Manual Build

```bash
# 1. Install Rust (if not already installed)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 2. Configure environment
cp .env.example .env
# Edit .env with your settings

# 3. Run database migrations
cargo install sqlx-cli --no-default-features --features sqlite
sqlx migrate run

# 4. Build and run
cargo build --release
./target/release/cashu-broker

# Or run directly with cargo
cargo run --release
```

## API Examples

### Request a Quote

```bash
curl -X POST http://localhost:3000/quote \
  -H "Content-Type: application/json" \
  -d '{
    "source_mint": "http://localhost:3338",
    "target_mint": "http://localhost:3339",
    "amount": 100
  }'
```

### Check Health

```bash
curl http://localhost:3000/health
```

### Get Metrics

```bash
curl http://localhost:3000/metrics
```

### List Quotes

```bash
# All quotes
curl http://localhost:3000/quotes

# Filter by status
curl 'http://localhost:3000/quotes?status=completed&limit=10'
```

## Testing

```bash
# Run unit tests
cargo test

# Run specific test
cargo test test_adaptor_signatures

# Run with logging
RUST_LOG=debug cargo test

# Run example broker
cargo run --example run_broker
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
