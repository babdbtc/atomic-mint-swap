-- Initial schema for Cashu broker service
-- Stores swap quotes, execution state, and liquidity events

-- Swap quotes table
CREATE TABLE IF NOT EXISTS quotes (
    id TEXT PRIMARY KEY,  -- UUID v4
    source_mint TEXT NOT NULL,
    target_mint TEXT NOT NULL,
    amount_in INTEGER NOT NULL,  -- Amount in source mint (sats)
    amount_out INTEGER NOT NULL,  -- Amount in target mint (sats)
    fee INTEGER NOT NULL,  -- Broker fee (sats)
    fee_rate REAL NOT NULL,  -- Fee rate (e.g., 0.005 for 0.5%)

    -- Adaptor signature data
    broker_pubkey TEXT NOT NULL,  -- Broker's public key (hex)
    adaptor_point TEXT NOT NULL,  -- Adaptor point T (hex)
    tweaked_pubkey TEXT NOT NULL,  -- Tweaked pubkey P' = P + T (hex)

    -- Lifecycle
    status TEXT NOT NULL CHECK(status IN ('pending', 'accepted', 'completed', 'expired', 'failed')),
    created_at TEXT NOT NULL,  -- ISO 8601 timestamp
    expires_at TEXT NOT NULL,  -- ISO 8601 timestamp
    accepted_at TEXT,  -- ISO 8601 timestamp (nullable)
    completed_at TEXT,  -- ISO 8601 timestamp (nullable)

    -- Metadata
    user_pubkey TEXT,  -- Client's public key (optional)
    error_message TEXT  -- Error details if failed
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status);
CREATE INDEX IF NOT EXISTS idx_quotes_created_at ON quotes(created_at);
CREATE INDEX IF NOT EXISTS idx_quotes_expires_at ON quotes(expires_at);
CREATE INDEX IF NOT EXISTS idx_quotes_source_mint ON quotes(source_mint);
CREATE INDEX IF NOT EXISTS idx_quotes_target_mint ON quotes(target_mint);

-- Swap execution table
CREATE TABLE IF NOT EXISTS swaps (
    id TEXT PRIMARY KEY,  -- Same as quote_id
    quote_id TEXT NOT NULL UNIQUE,

    -- Locked proofs (serialized JSON)
    source_proofs TEXT NOT NULL,  -- JSON array of proofs from user
    target_proofs TEXT,  -- JSON array of proofs from broker (nullable until completed)

    -- Signature data
    encrypted_signature TEXT,  -- Broker's encrypted signature (hex)
    decrypted_signature TEXT,  -- Final signature after decryption (hex)
    adaptor_secret TEXT,  -- Recovered adaptor secret (hex, nullable until completed)

    -- Execution details
    started_at TEXT NOT NULL,
    completed_at TEXT,

    FOREIGN KEY (quote_id) REFERENCES quotes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_swaps_quote_id ON swaps(quote_id);
CREATE INDEX IF NOT EXISTS idx_swaps_completed_at ON swaps(completed_at);

-- Liquidity events table (for tracking balance changes)
CREATE TABLE IF NOT EXISTS liquidity_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mint_url TEXT NOT NULL,
    event_type TEXT NOT NULL CHECK(event_type IN ('deposit', 'withdrawal', 'swap_in', 'swap_out')),
    amount INTEGER NOT NULL,  -- Amount in sats
    balance_after INTEGER NOT NULL,  -- Balance after this event
    quote_id TEXT,  -- Associated quote (nullable for manual deposits/withdrawals)
    created_at TEXT NOT NULL,  -- ISO 8601 timestamp

    FOREIGN KEY (quote_id) REFERENCES quotes(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_liquidity_events_mint_url ON liquidity_events(mint_url);
CREATE INDEX IF NOT EXISTS idx_liquidity_events_created_at ON liquidity_events(created_at);
CREATE INDEX IF NOT EXISTS idx_liquidity_events_quote_id ON liquidity_events(quote_id);

-- Metrics aggregates table (for fast analytics)
CREATE TABLE IF NOT EXISTS metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    metric_type TEXT NOT NULL,  -- e.g., 'swap_volume', 'swap_count', 'fees_earned'
    mint_url TEXT,  -- Nullable for global metrics
    value REAL NOT NULL,
    period TEXT NOT NULL,  -- e.g., 'hourly', 'daily', 'weekly'
    period_start TEXT NOT NULL,  -- ISO 8601 timestamp
    period_end TEXT NOT NULL,  -- ISO 8601 timestamp
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_metrics_type_period ON metrics(metric_type, period, period_start);
CREATE INDEX IF NOT EXISTS idx_metrics_mint_url ON metrics(mint_url);
