# Testing Guide

Comprehensive testing documentation for the Cashu Broker.

## Test Structure

```
cashu-broker/
├── src/
│   └── db.rs              # Unit tests for database layer (inline)
├── tests/
│   └── api_integration_test.rs  # Integration tests for HTTP API
└── examples/
    └── run_broker.rs      # Manual testing example
```

## Running Tests

### All Tests

```bash
cargo test
```

### Unit Tests Only

```bash
# Database layer tests
cargo test --lib db::tests

# All unit tests
cargo test --lib
```

### Integration Tests Only

```bash
cargo test --test api_integration_test
```

### With Logging

```bash
RUST_LOG=debug cargo test -- --nocapture
```

### Specific Test

```bash
cargo test test_create_and_get_quote
```

## Test Coverage

### Database Layer (`src/db.rs`)

**Quote Management:**
- ✅ `test_create_and_get_quote` - Create and retrieve quotes
- ✅ `test_update_quote_status` - Update quote status with timestamps
- ✅ `test_list_quotes_with_filter` - Filter quotes by status

**Swap Lifecycle:**
- ✅ `test_swap_lifecycle` - Full swap creation and completion

**Liquidity Tracking:**
- ✅ `test_liquidity_events` - Record and retrieve liquidity events

**Edge Cases:**
- ✅ In-memory SQLite for isolated tests
- ✅ Automatic migration before each test

### HTTP API (`tests/api_integration_test.rs`)

**Health & Metrics:**
- ✅ `test_health_endpoint` - Health check returns OK
- ✅ `test_get_metrics` - Metrics endpoint structure
- ✅ `test_get_liquidity` - Liquidity status response

**Quote Operations:**
- ✅ `test_request_quote_success` - Create swap quote
- ✅ `test_request_quote_invalid_amount` - Validation errors
- ✅ `test_request_quote_same_mint_error` - Same-mint rejection
- ✅ `test_request_quote_unsupported_mint` - Unknown mint rejection
- ✅ `test_get_nonexistent_quote` - 404 for missing quotes
- ✅ `test_list_quotes_empty` - Empty list handling
- ✅ `test_list_quotes_with_filter` - Status filtering

**Infrastructure:**
- ✅ `test_cors_headers` - CORS configuration

## Test Data

### Test Database

All tests use in-memory SQLite:
```rust
Database::new("sqlite::memory:")
```

This ensures:
- No file system pollution
- Complete isolation between tests
- Fast execution
- Automatic cleanup

### Test Configuration

```rust
let broker_config = BrokerConfig {
    mints: vec![
        MintConfig {
            mint_url: "http://mint-a.test".to_string(),
            name: "Mint A".to_string(),
            unit: "sat".to_string(),
        },
        MintConfig {
            mint_url: "http://mint-b.test".to_string(),
            name: "Mint B".to_string(),
            unit: "sat".to_string(),
        },
    ],
    fee_rate: 0.01,  // 1% for testing
    min_swap_amount: 1,
    max_swap_amount: 10000,
    quote_expiry_seconds: 300,
};
```

## Manual Testing

### Using the Example Broker

```bash
# Run the example broker
cargo run --example run_broker

# This demonstrates:
# - Broker initialization
# - Quote generation
# - Fee calculation
# - Liquidity management
```

### Using the HTTP Server

```bash
# 1. Configure environment
cp .env.example .env
# Edit .env with test mint URLs

# 2. Start server
cargo run --release

# 3. Test endpoints
curl http://localhost:3000/health
curl http://localhost:3000/metrics
curl http://localhost:3000/liquidity

# 4. Request a quote
curl -X POST http://localhost:3000/quote \
  -H "Content-Type: application/json" \
  -d '{
    "source_mint": "http://localhost:3338",
    "target_mint": "http://localhost:3339",
    "amount": 100
  }'
```

## Integration Testing with Real Mints

For full end-to-end testing with real Cashu mints:

### Prerequisites

1. **Run local mints:**
```bash
# Terminal 1
nutshell --port 3338

# Terminal 2
nutshell --port 3339
```

2. **Configure broker:**
```bash
MINTS='[
  {"mint_url":"http://localhost:3338","name":"Mint A","unit":"sat"},
  {"mint_url":"http://localhost:3339","name":"Mint B","unit":"sat"}
]'
```

3. **Initialize liquidity:**
```bash
# Fund the broker on both mints
# (Manual process or via broker initialization endpoint)
```

### End-to-End Test Flow

```bash
# 1. Request quote
QUOTE_ID=$(curl -X POST http://localhost:3000/quote \
  -H "Content-Type: application/json" \
  -d '{"source_mint":"http://localhost:3338","target_mint":"http://localhost:3339","amount":100}' \
  | jq -r '.quote.id')

echo "Quote ID: $QUOTE_ID"

# 2. Check quote status
curl http://localhost:3000/quote/$QUOTE_ID | jq

# 3. Accept quote (requires locked proofs)
curl -X POST http://localhost:3000/quote/$QUOTE_ID/accept \
  -H "Content-Type: application/json" \
  -d '{"source_proofs":"[...]"}' \
  | jq

# 4. Complete swap (requires decrypted signature)
curl -X POST http://localhost:3000/quote/$QUOTE_ID/complete \
  -H "Content-Type: application/json" \
  -d '{"decrypted_signature":"..."}' \
  | jq

# 5. Verify completion
curl http://localhost:3000/quote/$QUOTE_ID | jq
curl http://localhost:3000/metrics | jq
```

## CI/CD Integration

### GitHub Actions

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions-rs/toolchain@v1
        with:
          toolchain: stable
      - name: Run tests
        run: cargo test --all-features
      - name: Run clippy
        run: cargo clippy -- -D warnings
      - name: Check formatting
        run: cargo fmt -- --check
```

### Docker Testing

```bash
# Build test image
docker build -t cashu-broker-test --target builder .

# Run tests in container
docker run cashu-broker-test cargo test
```

## Benchmarking

### Database Performance

```bash
cargo test --release -- --ignored --nocapture bench
```

### API Throughput

```bash
# Using Apache Bench
ab -n 1000 -c 10 http://localhost:3000/health

# Using wrk
wrk -t12 -c400 -d30s http://localhost:3000/health
```

## Test Data Cleanup

All tests use either:
- In-memory SQLite (automatic cleanup)
- Temporary files (cleaned by OS)
- Isolated namespaces (no conflicts)

No manual cleanup required!

## Troubleshooting

### Tests Fail to Compile

```bash
# Update dependencies
cargo update

# Clean build artifacts
cargo clean
cargo build
```

### Database Migration Errors

```bash
# Ensure SQLx CLI is installed
cargo install sqlx-cli --no-default-features --features sqlite

# Check migration files
ls migrations/

# Test migration manually
DATABASE_URL=sqlite::memory: sqlx migrate run
```

### Integration Tests Timeout

```bash
# Increase test timeout
cargo test -- --test-threads=1 --nocapture

# Run with more verbosity
RUST_LOG=trace cargo test
```

## Writing New Tests

### Database Test Template

```rust
#[tokio::test]
async fn test_my_feature() {
    let db = setup_test_db().await;

    // Your test code here

    // Assertions
    assert_eq!(actual, expected);
}
```

### API Test Template

```rust
#[tokio::test]
async fn test_my_endpoint() {
    let (app, _db) = setup_test_app().await;

    let response = app
        .oneshot(
            Request::builder()
                .uri("/my-endpoint")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
}
```

## Coverage Goals

Current coverage estimate: ~70%

Target coverage:
- Database layer: 90%+ ✅
- API handlers: 80%+ ✅
- Core broker logic: 80%+ (needs expansion)
- Error handling: 90%+ (needs expansion)

## Next Steps

- [ ] Add property-based testing (proptest)
- [ ] Add mutation testing (cargo-mutants)
- [ ] Add performance benchmarks
- [ ] Add load testing suite
- [ ] Add chaos engineering tests
