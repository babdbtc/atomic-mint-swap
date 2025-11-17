use crate::error::BrokerError;
use crate::types::{SwapQuote, SwapStatus};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePool, SqlitePoolOptions};
use sqlx::{FromRow, Row};
use std::str::FromStr;
use uuid::Uuid;

/// Database connection pool
#[derive(Clone)]
pub struct Database {
    pool: SqlitePool,
}

impl Database {
    /// Create a new database connection
    pub async fn new(database_url: &str) -> Result<Self, BrokerError> {
        let options = SqliteConnectOptions::from_str(database_url)
            .map_err(|e| BrokerError::Database(e.to_string()))?
            .create_if_missing(true);

        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .connect_with(options)
            .await
            .map_err(|e| BrokerError::Database(e.to_string()))?;

        Ok(Self { pool })
    }

    /// Run database migrations
    pub async fn migrate(&self) -> Result<(), BrokerError> {
        sqlx::migrate!("./migrations")
            .run(&self.pool)
            .await
            .map_err(|e| BrokerError::Database(format!("Migration failed: {}", e)))?;
        Ok(())
    }

    /// Get the underlying pool
    pub fn pool(&self) -> &SqlitePool {
        &self.pool
    }
}

// Quote repository
impl Database {
    /// Create a new quote
    pub async fn create_quote(&self, quote: &QuoteRecord) -> Result<(), BrokerError> {
        sqlx::query(
            r#"
            INSERT INTO quotes (
                id, source_mint, target_mint, amount_in, amount_out, fee, fee_rate,
                broker_pubkey, adaptor_point, tweaked_pubkey,
                status, created_at, expires_at, user_pubkey
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&quote.id)
        .bind(&quote.source_mint)
        .bind(&quote.target_mint)
        .bind(quote.amount_in as i64)
        .bind(quote.amount_out as i64)
        .bind(quote.fee as i64)
        .bind(quote.fee_rate)
        .bind(&quote.broker_pubkey)
        .bind(&quote.adaptor_point)
        .bind(&quote.tweaked_pubkey)
        .bind(quote.status.to_string())
        .bind(&quote.created_at)
        .bind(&quote.expires_at)
        .bind(&quote.user_pubkey)
        .execute(&self.pool)
        .await
        .map_err(|e| BrokerError::Database(e.to_string()))?;

        Ok(())
    }

    /// Get a quote by ID
    pub async fn get_quote(&self, id: &str) -> Result<Option<QuoteRecord>, BrokerError> {
        let result = sqlx::query_as::<_, QuoteRecord>(
            r#"
            SELECT id, source_mint, target_mint, amount_in, amount_out, fee, fee_rate,
                   broker_pubkey, adaptor_point, tweaked_pubkey,
                   status, created_at, expires_at, accepted_at, completed_at,
                   user_pubkey, error_message
            FROM quotes
            WHERE id = ?
            "#,
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| BrokerError::Database(e.to_string()))?;

        Ok(result)
    }

    /// Update quote status
    pub async fn update_quote_status(
        &self,
        id: &str,
        status: SwapStatus,
        error_message: Option<String>,
    ) -> Result<(), BrokerError> {
        let timestamp = Utc::now().to_rfc3339();
        let status_str = status.to_string();

        match status {
            SwapStatus::Accepted => {
                sqlx::query(
                    r#"
                    UPDATE quotes
                    SET status = ?, accepted_at = ?
                    WHERE id = ?
                    "#,
                )
                .bind(&status_str)
                .bind(&timestamp)
                .bind(id)
                .execute(&self.pool)
                .await
                .map_err(|e| BrokerError::Database(e.to_string()))?;
            }
            SwapStatus::Completed => {
                sqlx::query(
                    r#"
                    UPDATE quotes
                    SET status = ?, completed_at = ?
                    WHERE id = ?
                    "#,
                )
                .bind(&status_str)
                .bind(&timestamp)
                .bind(id)
                .execute(&self.pool)
                .await
                .map_err(|e| BrokerError::Database(e.to_string()))?;
            }
            SwapStatus::Failed | SwapStatus::Expired => {
                sqlx::query(
                    r#"
                    UPDATE quotes
                    SET status = ?, error_message = ?
                    WHERE id = ?
                    "#,
                )
                .bind(&status_str)
                .bind(&error_message)
                .bind(id)
                .execute(&self.pool)
                .await
                .map_err(|e| BrokerError::Database(e.to_string()))?;
            }
            _ => {
                sqlx::query(
                    r#"
                    UPDATE quotes
                    SET status = ?
                    WHERE id = ?
                    "#,
                )
                .bind(&status_str)
                .bind(id)
                .execute(&self.pool)
                .await
                .map_err(|e| BrokerError::Database(e.to_string()))?;
            }
        }

        Ok(())
    }

    /// List quotes with optional filters
    pub async fn list_quotes(
        &self,
        status: Option<SwapStatus>,
        limit: i64,
    ) -> Result<Vec<QuoteRecord>, BrokerError> {
        let query = if let Some(status) = status {
            sqlx::query_as::<_, QuoteRecord>(
                r#"
                SELECT id, source_mint, target_mint, amount_in, amount_out, fee, fee_rate,
                       broker_pubkey, adaptor_point, tweaked_pubkey,
                       status, created_at, expires_at, accepted_at, completed_at,
                       user_pubkey, error_message
                FROM quotes
                WHERE status = ?
                ORDER BY created_at DESC
                LIMIT ?
                "#,
            )
            .bind(status.to_string())
            .bind(limit)
        } else {
            sqlx::query_as::<_, QuoteRecord>(
                r#"
                SELECT id, source_mint, target_mint, amount_in, amount_out, fee, fee_rate,
                       broker_pubkey, adaptor_point, tweaked_pubkey,
                       status, created_at, expires_at, accepted_at, completed_at,
                       user_pubkey, error_message
                FROM quotes
                ORDER BY created_at DESC
                LIMIT ?
                "#,
            )
            .bind(limit)
        };

        let quotes = query
            .fetch_all(&self.pool)
            .await
            .map_err(|e| BrokerError::Database(e.to_string()))?;

        Ok(quotes)
    }

    /// Delete expired quotes
    pub async fn delete_expired_quotes(&self) -> Result<u64, BrokerError> {
        let now = Utc::now().to_rfc3339();

        let result = sqlx::query(
            r#"
            DELETE FROM quotes
            WHERE status = 'pending' AND expires_at < ?
            "#,
        )
        .bind(&now)
        .execute(&self.pool)
        .await
        .map_err(|e| BrokerError::Database(e.to_string()))?;

        Ok(result.rows_affected())
    }
}

// Swap repository
impl Database {
    /// Create a swap execution record
    pub async fn create_swap(&self, swap: &SwapRecord) -> Result<(), BrokerError> {
        sqlx::query(
            r#"
            INSERT INTO swaps (
                id, quote_id, source_proofs, encrypted_signature, started_at
            ) VALUES (?, ?, ?, ?, ?)
            "#,
        )
        .bind(&swap.id)
        .bind(&swap.quote_id)
        .bind(&swap.source_proofs)
        .bind(&swap.encrypted_signature)
        .bind(&swap.started_at)
        .execute(&self.pool)
        .await
        .map_err(|e| BrokerError::Database(e.to_string()))?;

        Ok(())
    }

    /// Complete a swap with target proofs and adaptor secret
    pub async fn complete_swap(
        &self,
        id: &str,
        target_proofs: &str,
        decrypted_signature: Option<&str>,
        adaptor_secret: Option<&str>,
    ) -> Result<(), BrokerError> {
        let completed_at = Utc::now().to_rfc3339();

        sqlx::query(
            r#"
            UPDATE swaps
            SET target_proofs = ?, decrypted_signature = ?, adaptor_secret = ?, completed_at = ?
            WHERE id = ?
            "#,
        )
        .bind(target_proofs)
        .bind(decrypted_signature)
        .bind(adaptor_secret)
        .bind(&completed_at)
        .bind(id)
        .execute(&self.pool)
        .await
        .map_err(|e| BrokerError::Database(e.to_string()))?;

        Ok(())
    }

    /// Get swap by ID
    pub async fn get_swap(&self, id: &str) -> Result<Option<SwapRecord>, BrokerError> {
        let result = sqlx::query_as::<_, SwapRecord>(
            r#"
            SELECT id, quote_id, source_proofs, target_proofs, encrypted_signature,
                   decrypted_signature, adaptor_secret, started_at, completed_at
            FROM swaps
            WHERE id = ?
            "#,
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| BrokerError::Database(e.to_string()))?;

        Ok(result)
    }

    /// Get swap by quote ID
    pub async fn get_swap_by_quote(&self, quote_id: &str) -> Result<Option<SwapRecord>, BrokerError> {
        let result = sqlx::query_as::<_, SwapRecord>(
            r#"
            SELECT id, quote_id, source_proofs, target_proofs, encrypted_signature,
                   decrypted_signature, adaptor_secret, started_at, completed_at
            FROM swaps
            WHERE quote_id = ?
            "#,
        )
        .bind(quote_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| BrokerError::Database(e.to_string()))?;

        Ok(result)
    }
}

// Liquidity events repository
impl Database {
    /// Record a liquidity event
    pub async fn record_liquidity_event(
        &self,
        event: &LiquidityEvent,
    ) -> Result<(), BrokerError> {
        sqlx::query(
            r#"
            INSERT INTO liquidity_events (
                mint_url, event_type, amount, balance_after, quote_id, created_at
            ) VALUES (?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&event.mint_url)
        .bind(&event.event_type)
        .bind(event.amount as i64)
        .bind(event.balance_after as i64)
        .bind(&event.quote_id)
        .bind(&event.created_at)
        .execute(&self.pool)
        .await
        .map_err(|e| BrokerError::Database(e.to_string()))?;

        Ok(())
    }

    /// Get liquidity events for a mint
    pub async fn get_liquidity_events(
        &self,
        mint_url: &str,
        limit: i64,
    ) -> Result<Vec<LiquidityEvent>, BrokerError> {
        let events = sqlx::query_as::<_, LiquidityEvent>(
            r#"
            SELECT id, mint_url, event_type, amount, balance_after, quote_id, created_at
            FROM liquidity_events
            WHERE mint_url = ?
            ORDER BY created_at DESC
            LIMIT ?
            "#,
        )
        .bind(mint_url)
        .bind(limit)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| BrokerError::Database(e.to_string()))?;

        Ok(events)
    }
}

// Database models
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuoteRecord {
    pub id: String,
    pub source_mint: String,
    pub target_mint: String,
    pub amount_in: i64,
    pub amount_out: i64,
    pub fee: i64,
    pub fee_rate: f64,
    pub broker_pubkey: String,
    pub adaptor_point: String,
    pub tweaked_pubkey: String,
    pub status: String,
    pub created_at: String,
    pub expires_at: String,
    pub accepted_at: Option<String>,
    pub completed_at: Option<String>,
    pub user_pubkey: Option<String>,
    pub error_message: Option<String>,
}

// Manual FromRow implementation for QuoteRecord
impl FromRow<'_, sqlx::sqlite::SqliteRow> for QuoteRecord {
    fn from_row(row: &sqlx::sqlite::SqliteRow) -> sqlx::Result<Self> {
        Ok(QuoteRecord {
            id: row.try_get("id")?,
            source_mint: row.try_get("source_mint")?,
            target_mint: row.try_get("target_mint")?,
            amount_in: row.try_get("amount_in")?,
            amount_out: row.try_get("amount_out")?,
            fee: row.try_get("fee")?,
            fee_rate: row.try_get("fee_rate")?,
            broker_pubkey: row.try_get("broker_pubkey")?,
            adaptor_point: row.try_get("adaptor_point")?,
            tweaked_pubkey: row.try_get("tweaked_pubkey")?,
            status: row.try_get("status")?,
            created_at: row.try_get("created_at")?,
            expires_at: row.try_get("expires_at")?,
            accepted_at: row.try_get("accepted_at")?,
            completed_at: row.try_get("completed_at")?,
            user_pubkey: row.try_get("user_pubkey")?,
            error_message: row.try_get("error_message")?,
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SwapRecord {
    pub id: String,
    pub quote_id: String,
    pub source_proofs: String,  // JSON serialized
    pub target_proofs: Option<String>,  // JSON serialized
    pub encrypted_signature: Option<String>,
    pub decrypted_signature: Option<String>,
    pub adaptor_secret: Option<String>,
    pub started_at: String,
    pub completed_at: Option<String>,
}

impl FromRow<'_, sqlx::sqlite::SqliteRow> for SwapRecord {
    fn from_row(row: &sqlx::sqlite::SqliteRow) -> sqlx::Result<Self> {
        Ok(SwapRecord {
            id: row.try_get("id")?,
            quote_id: row.try_get("quote_id")?,
            source_proofs: row.try_get("source_proofs")?,
            target_proofs: row.try_get("target_proofs")?,
            encrypted_signature: row.try_get("encrypted_signature")?,
            decrypted_signature: row.try_get("decrypted_signature")?,
            adaptor_secret: row.try_get("adaptor_secret")?,
            started_at: row.try_get("started_at")?,
            completed_at: row.try_get("completed_at")?,
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LiquidityEvent {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<i64>,
    pub mint_url: String,
    pub event_type: String,  // 'deposit', 'withdrawal', 'swap_in', 'swap_out'
    pub amount: i64,
    pub balance_after: i64,
    pub quote_id: Option<String>,
    pub created_at: String,
}

impl FromRow<'_, sqlx::sqlite::SqliteRow> for LiquidityEvent {
    fn from_row(row: &sqlx::sqlite::SqliteRow) -> sqlx::Result<Self> {
        Ok(LiquidityEvent {
            id: row.try_get("id").ok(),
            mint_url: row.try_get("mint_url")?,
            event_type: row.try_get("event_type")?,
            amount: row.try_get("amount")?,
            balance_after: row.try_get("balance_after")?,
            quote_id: row.try_get("quote_id")?,
            created_at: row.try_get("created_at")?,
        })
    }
}
