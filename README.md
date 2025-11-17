# Cashu Broker Service

A broker service that facilitates atomic swaps of ecash between different Cashu mints using adaptor signatures. Provides liquidity across multiple mints and enables users to exchange ecash without Lightning transactions.

## Overview

When Alice uses Mint A and Bob uses Mint B, but Bob wants to pay Alice, a broker acts as an intermediary:

1. **Bob** has ecash from Mint B
2. **Alice** wants to receive ecash from Mint A
3. **Broker** holds liquidity on both Mint A and Mint B
4. **Bob** swaps his Mint B ecash with the broker to get Mint A ecash (fee applies)
5. **Bob** pays Alice with the Mint A ecash

This enables cross-mint payments **without Lightning transactions** and with **atomic swap guarantees**.

## Features

- **Atomic Swaps**: Cryptographically guaranteed via adaptor signatures
- **No Lightning Required**: Direct ecash-to-ecash swaps
- **Fee-Based Liquidity**: Broker earns fees for providing liquidity
- **NUT-11 P2PK**: Uses Cashu's Pay-to-Public-Key standard
- **Multi-Mint Support**: Manages liquidity across multiple mints
- **Production-Ready**: HTTP API, database persistence, metrics, and Docker support

## Project Status

🚀 **Production Implementation Complete!**

**Core Features**:
- [x] Schnorr adaptor signatures (schnorr_fun)
- [x] CDK integration for P2PK tokens and wallets
- [x] Async liquidity management across multiple mints
- [x] Swap coordinator with adaptor signatures
- [x] Main broker service ("Charlie")
- [x] HTTP/REST API (axum framework)
- [x] Database persistence (SQLite)
- [x] Metrics and monitoring
- [x] Comprehensive test suite
- [x] Docker deployment

**Next Steps** (Phase 4+):
- [ ] Nostr service announcements and discovery
- [ ] gRPC API
- [ ] Advanced security features (rate limiting, auth)
- [ ] Multi-hop swaps

## Quick Start

### Prerequisites

- Rust toolchain (1.70+)
- Docker (optional, for running local mints)

### Running the Broker

```bash
cd cashu-broker

# Build the broker
cargo build --release

# Run the example broker
cargo run --example run_broker

# Run tests
cargo test

# See cashu-broker/README.md for full documentation
```

This demonstrates:
- Initializing Charlie (the broker) with liquidity on two mints
- Generating swap quotes with fee calculation
- Full async implementation using Tokio
- CDK integration for Cashu operations

### Running the HTTP Server

```bash
cd cashu-broker

# Configure environment
cp .env.example .env
# Edit .env with your mint URLs

# Start the server
cargo run --release

# In another terminal, test the API
curl http://localhost:3000/health
curl http://localhost:3000/metrics
curl http://localhost:3000/liquidity

# Request a swap quote
curl -X POST http://localhost:3000/quote \
  -H "Content-Type: application/json" \
  -d '{
    "source_mint": "http://localhost:3338",
    "target_mint": "http://localhost:3339",
    "amount": 100
  }'
```

### Using Docker

```bash
cd cashu-broker

# Build and run with Docker Compose
docker-compose up -d

# Check logs
docker-compose logs -f broker

# Stop
docker-compose down
```

## Architecture

```
cashu-broker/
├── src/
│   ├── main.rs              # HTTP server entry point
│   ├── lib.rs               # Public API and module exports
│   ├── api.rs               # HTTP endpoints (REST API)
│   ├── broker.rs            # Main broker service ("Charlie")
│   ├── swap.rs              # Swap coordinator with P2PK
│   ├── liquidity.rs         # Multi-mint liquidity management
│   ├── adaptor.rs           # Schnorr adaptor signatures
│   ├── db.rs                # SQLite database persistence
│   ├── config.rs            # Configuration management
│   ├── types.rs             # Core data types
│   └── error.rs             # Error handling types
├── migrations/              # Database migrations
├── tests/                   # Integration tests
├── examples/                # Example usage
├── Cargo.toml               # Dependencies
└── README.md                # Detailed documentation
```

## How It Works

### 1. Quote Request
Bob requests a quote to swap ecash from Mint B to Mint A:

```rust
let quote = broker.request_quote(SwapRequest {
    source_mint: "http://mint-b.test".to_string(),
    target_mint: "http://mint-a.test".to_string(),
    amount: 1000, // sats
}).await?;

// Quote includes:
// - input_amount: 1000 sats
// - output_amount: 990 sats (1% fee)
// - fee: 10 sats
// - adaptor_point: T (for locking)
```

### 2. Atomic Swap Setup
Both parties lock tokens to tweaked pubkeys:
- Bob locks 1000 sats to `Charlie + T` on Mint B
- Charlie locks 990 sats to `Bob + T` on Mint A

Where `T` is the adaptor point derived from secret `t`.

### 3. Secret Revelation
Bob spends Charlie's tokens on Mint A by signing with `Bob + t` (adaptor secret).
This reveals the adaptor secret to Charlie.

### 4. Completion
Charlie extracts the adaptor secret from Bob's signature and spends Bob's tokens on Mint B.

Both swaps complete atomically - either both succeed or neither does.

## Configuration

Create a `.env` file in the `cashu-broker/` directory:

```bash
# Mint Configuration (JSON array)
MINTS='[
  {"mint_url":"http://localhost:3338","name":"Mint A","unit":"sat"},
  {"mint_url":"http://localhost:3339","name":"Mint B","unit":"sat"}
]'

# Fee Configuration
FEE_RATE=0.01                    # 1% fee
MIN_SWAP_AMOUNT=1                # 1 sat minimum
MAX_SWAP_AMOUNT=1000000          # 1M sats maximum
QUOTE_EXPIRY_SECONDS=300         # 5 minutes

# Server Configuration
HOST=127.0.0.1
PORT=3000
CORS_ORIGINS=*

# Database
DATABASE_URL=sqlite://cashu-broker.db

# Logging
RUST_LOG=info
```

Or configure programmatically:

```rust
use cashu_broker::{Broker, types::BrokerConfig, types::MintConfig};

let config = BrokerConfig {
    mints: vec![
        MintConfig {
            mint_url: "http://localhost:3338".to_string(),
            name: "Mint A".to_string(),
            unit: "sat".to_string(),
        },
        MintConfig {
            mint_url: "http://localhost:3339".to_string(),
            name: "Mint B".to_string(),
            unit: "sat".to_string(),
        },
    ],
    fee_rate: 0.01,              // 1%
    min_swap_amount: 1,
    max_swap_amount: 1_000_000,
    quote_expiry_seconds: 300,
};

let broker = Broker::new(config).await?;
```

## API Endpoints

The broker exposes the following HTTP endpoints:

- `GET /health` - Health check
- `GET /metrics` - Performance metrics
- `GET /liquidity` - Current liquidity status
- `POST /quote` - Request swap quote
- `POST /quote/:id/accept` - Accept quote and lock tokens
- `POST /quote/:id/complete` - Complete swap
- `GET /quote/:id` - Get quote status
- `GET /quotes` - List all quotes (with filters)

See [`cashu-broker/README.md`](./cashu-broker/README.md) for detailed API documentation.

## Documentation

- [Broker README](./cashu-broker/README.md) - Detailed implementation guide
- [Testing Guide](./cashu-broker/TESTING.md) - Test suite documentation
- [Protocol Specification](./docs/PROTOCOL_SPECIFICATION.md) - Technical protocol details
- [Atomic Swap Analysis](./docs/ATOMIC_SWAP_ANALYSIS.md) - Cryptographic analysis
- [Quick Start Guide](./docs/QUICK-START.md) - Getting started
- [Current Status](./docs/STATUS.md) - Project status

## Development

```bash
# Navigate to broker directory
cd cashu-broker

# Run all tests
cargo test

# Run with logging
RUST_LOG=debug cargo run --example run_broker

# Run integration tests
cargo test --test api_integration_test

# Check code formatting
cargo fmt --check

# Run linter
cargo clippy

# Build optimized binary
cargo build --release
```

## Testing

The broker includes comprehensive tests:

- **Unit Tests**: Database layer, adaptor signatures, core logic
- **Integration Tests**: Full HTTP API testing
- **Example Programs**: Runnable demonstrations

```bash
# Run all tests
cargo test

# Run with output
cargo test -- --nocapture

# Run specific test
cargo test test_request_quote_success

# See TESTING.md for more details
cd cashu-broker && cat TESTING.md
```

## Security

⚠️ **Experimental Software - Use at your own risk**

- Cryptography based on Schnorr adaptor signatures
- Uses NUT-00 (BDHKE) and NUT-11 (P2PK) standards
- Not formally audited
- Do not use with large amounts in production

**Security Features**:
- Memory-safe Rust implementation
- Thread-safe concurrent operations
- Comprehensive error handling
- Input validation on all endpoints
- Database integrity constraints

## Deployment

### Docker

```bash
cd cashu-broker

# Build image
docker build -t cashu-broker .

# Run container
docker run -p 3000:3000 \
  -e MINTS='[...]' \
  -e DATABASE_URL=sqlite://data/broker.db \
  -v $(pwd)/data:/data \
  cashu-broker
```

### Systemd Service

```ini
[Unit]
Description=Cashu Broker Service
After=network.target

[Service]
Type=simple
User=cashu-broker
WorkingDirectory=/opt/cashu-broker
ExecStart=/opt/cashu-broker/target/release/cashu-broker
Restart=always
Environment="RUST_LOG=info"
EnvironmentFile=/opt/cashu-broker/.env

[Install]
WantedBy=multi-user.target
```

## Performance

The Rust implementation provides:
- **High throughput**: Async I/O with Tokio
- **Low latency**: Zero-cost abstractions
- **Memory safety**: No buffer overflows or leaks
- **Predictable performance**: No garbage collection pauses
- **Single binary**: Easy deployment

## Contributing

Contributions welcome! Please:
1. Read the protocol specification in `docs/`
2. Check existing issues
3. Submit PRs with tests
4. Follow Rust best practices (cargo fmt, cargo clippy)

## License

MIT

## Acknowledgments

- [Cashu Protocol](https://github.com/cashubtc/nuts) - Ecash protocol
- [Cashu Development Kit (CDK)](https://github.com/cashubtc/cdk) - Rust implementation
- [Scriptless Scripts](https://github.com/BlockstreamResearch/scriptless-scripts) - Adaptor signatures
- Adaptor signature research community
