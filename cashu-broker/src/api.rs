use crate::broker::Broker;
use crate::db::{Database, LiquidityEvent, QuoteRecord};
use crate::error::BrokerError;
use crate::types::{SwapQuote, SwapRequest, SwapStatus};
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;
use uuid::Uuid;

/// Shared application state
#[derive(Clone)]
pub struct AppState {
    pub broker: Arc<Broker>,
    pub db: Database,
}

/// Create the API router
pub fn create_router(state: AppState, cors_origins: Vec<String>) -> Router {
    let cors = if cors_origins.contains(&"*".to_string()) {
        CorsLayer::permissive()
    } else {
        CorsLayer::new()
    };

    Router::new()
        // Swap endpoints
        .route("/quote", post(request_quote))
        .route("/quote/:id/accept", post(accept_quote))
        .route("/quote/:id/complete", post(complete_quote))
        .route("/quote/:id", get(get_quote_status))
        .route("/quotes", get(list_quotes))
        // Liquidity endpoints
        .route("/liquidity", get(get_liquidity))
        .route("/liquidity/:mint_url/events", get(get_liquidity_events))
        // Health & metrics
        .route("/health", get(health_check))
        .route("/metrics", get(get_metrics))
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}

// ===== Request/Response Types =====

#[derive(Debug, Serialize, Deserialize)]
pub struct QuoteRequest {
    pub source_mint: String,
    pub target_mint: String,
    pub amount: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_pubkey: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct QuoteResponse {
    pub quote: SwapQuote,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AcceptQuoteRequest {
    pub source_proofs: String,  // JSON serialized proofs
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AcceptQuoteResponse {
    pub encrypted_signature: String,
    pub target_proofs: String,  // JSON serialized proofs
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CompleteQuoteRequest {
    pub decrypted_signature: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CompleteQuoteResponse {
    pub adaptor_secret: String,
    pub status: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct QuoteStatusResponse {
    pub quote: QuoteRecord,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub swap: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ListQuotesQuery {
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default = "default_limit")]
    pub limit: i64,
}

fn default_limit() -> i64 {
    50
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LiquidityResponse {
    pub mints: Vec<MintLiquidity>,
    pub total_balance: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MintLiquidity {
    pub mint_url: String,
    pub name: String,
    pub balance: u64,
    pub unit: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LiquidityEventsResponse {
    pub events: Vec<LiquidityEvent>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct HealthResponse {
    pub status: String,
    pub timestamp: String,
    pub database: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MetricsResponse {
    pub total_quotes: u64,
    pub completed_swaps: u64,
    pub failed_swaps: u64,
    pub total_volume: u64,
    pub total_fees: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ErrorResponse {
    pub error: String,
    pub code: String,
}

// ===== Handlers =====

/// Request a swap quote
async fn request_quote(
    State(state): State<AppState>,
    Json(req): Json<QuoteRequest>,
) -> Result<Json<QuoteResponse>, ApiError> {
    // Create swap request
    let swap_request = SwapRequest {
        client_id: None,  // Anonymous for HTTP API
        from_mint: req.source_mint.clone(),
        to_mint: req.target_mint.clone(),
        amount: req.amount,
        client_public_key: req.user_pubkey.as_ref().and_then(|hex_str| hex::decode(hex_str).ok()),
    };

    // Request quote from broker
    let quote = state
        .broker
        .request_quote(swap_request)
        .await
        .map_err(ApiError::from)?;

    // Save quote to database
    let quote_record = QuoteRecord {
        id: quote.quote_id.clone(),
        source_mint: quote.from_mint.clone(),
        target_mint: quote.to_mint.clone(),
        amount_in: quote.input_amount as i64,
        amount_out: quote.output_amount as i64,
        fee: quote.fee as i64,
        fee_rate: quote.fee_rate,
        broker_pubkey: hex::encode(&quote.broker_public_key),
        adaptor_point: hex::encode(&quote.adaptor_point),
        tweaked_pubkey: quote.tweaked_pubkey.as_ref().map(|t| hex::encode(t)).unwrap_or_default(),
        status: SwapStatus::Pending.to_string(),
        created_at: Utc::now().to_rfc3339(),
        expires_at: Utc::now()
            .checked_add_signed(chrono::Duration::seconds(quote.expires_in as i64))
            .unwrap()
            .to_rfc3339(),
        accepted_at: None,
        completed_at: None,
        user_pubkey: req.user_pubkey,
        error_message: None,
    };

    state
        .db
        .create_quote(&quote_record)
        .await
        .map_err(ApiError::from)?;

    Ok(Json(QuoteResponse { quote }))
}

/// Accept a quote and lock source proofs
async fn accept_quote(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(req): Json<AcceptQuoteRequest>,
) -> Result<Json<AcceptQuoteResponse>, ApiError> {
    // Get quote from database
    let quote = state
        .db
        .get_quote(&id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::NotFound(format!("Quote {} not found", id)))?;

    // Check quote status
    if quote.status != SwapStatus::Pending.to_string() {
        return Err(ApiError::BadRequest(format!(
            "Quote {} is not pending (status: {})",
            id, quote.status
        )));
    }

    // Parse source proofs from JSON
    let _source_proofs: cdk::nuts::Proofs = serde_json::from_str(&req.source_proofs)
        .map_err(|e| ApiError::BadRequest(format!("Invalid source_proofs JSON: {}", e)))?;

    // Get client pubkey - either from quote record or extract from proofs
    let client_pubkey_hex = quote.user_pubkey.as_ref()
        .ok_or_else(|| ApiError::BadRequest("No user_pubkey provided in quote".to_string()))?;

    let client_pubkey = hex::decode(client_pubkey_hex)
        .map_err(|e| ApiError::BadRequest(format!("Invalid client pubkey hex: {}", e)))?;

    // Prepare broker's side of swap (mint P2PK locked tokens for client)
    let target_proofs_data = state
        .broker
        .accept_quote(&id, &client_pubkey)
        .await
        .map_err(ApiError::from)?;

    // Serialize target proofs to JSON
    let target_proofs = serde_json::to_string(&target_proofs_data)
        .map_err(|e| ApiError::Internal(format!("Failed to serialize target proofs: {}", e)))?;

    // For encrypted signature, we'll use the adaptor point (in a full implementation,
    // this would be an actual encrypted adaptor signature)
    let encrypted_signature = quote.adaptor_point.clone();

    // Update quote status
    state
        .db
        .update_quote_status(&id, SwapStatus::Accepted, None)
        .await
        .map_err(ApiError::from)?;

    // Create swap record
    let swap_record = crate::db::SwapRecord {
        id: Uuid::new_v4().to_string(),
        quote_id: id.clone(),
        source_proofs: req.source_proofs,
        target_proofs: Some(target_proofs.clone()),
        encrypted_signature: Some(encrypted_signature.clone()),
        decrypted_signature: None,
        adaptor_secret: None,
        started_at: Utc::now().to_rfc3339(),
        completed_at: None,
    };

    state
        .db
        .create_swap(&swap_record)
        .await
        .map_err(ApiError::from)?;

    Ok(Json(AcceptQuoteResponse {
        encrypted_signature,
        target_proofs,
    }))
}

/// Complete a quote after receiving decrypted signature
async fn complete_quote(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(req): Json<CompleteQuoteRequest>,
) -> Result<Json<CompleteQuoteResponse>, ApiError> {
    // Get quote from database
    let quote = state
        .db
        .get_quote(&id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::NotFound(format!("Quote {} not found", id)))?;

    // Check quote status
    if quote.status != SwapStatus::Accepted.to_string() {
        return Err(ApiError::BadRequest(format!(
            "Quote {} is not accepted (status: {})",
            id, quote.status
        )));
    }

    // Parse decrypted signature as client proofs with witness
    let client_proofs_with_witness: cdk::nuts::Proofs = serde_json::from_str(&req.decrypted_signature)
        .map_err(|e| ApiError::BadRequest(format!("Invalid decrypted_signature JSON (expected Proofs): {}", e)))?;

    // Complete the swap - broker claims client's tokens
    state
        .broker
        .complete_swap(&id, client_proofs_with_witness)
        .await
        .map_err(ApiError::from)?;

    // Get adaptor secret from quote record (hex encoded)
    let adaptor_secret = quote.adaptor_point.clone();

    // Update quote status
    state
        .db
        .update_quote_status(&id, SwapStatus::Completed, None)
        .await
        .map_err(ApiError::from)?;

    // Get swap record
    let swap = state
        .db
        .get_swap_by_quote(&id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::NotFound(format!("Swap for quote {} not found", id)))?;

    // Complete swap record in database
    let target_proofs_str = swap.target_proofs.as_deref().unwrap_or("");

    state
        .db
        .complete_swap(
            &swap.id,
            target_proofs_str,
            Some(&req.decrypted_signature),
            Some(&adaptor_secret),
        )
        .await
        .map_err(ApiError::from)?;

    Ok(Json(CompleteQuoteResponse {
        adaptor_secret,
        status: SwapStatus::Completed.to_string(),
    }))
}

/// Get quote status
async fn get_quote_status(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<QuoteStatusResponse>, ApiError> {
    let quote = state
        .db
        .get_quote(&id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::NotFound(format!("Quote {} not found", id)))?;

    // Optionally fetch swap details
    let swap = state
        .db
        .get_swap_by_quote(&id)
        .await
        .map_err(ApiError::from)?
        .map(|s| serde_json::to_value(s).ok())
        .flatten();

    Ok(Json(QuoteStatusResponse { quote, swap }))
}

/// List quotes
async fn list_quotes(
    State(state): State<AppState>,
    Query(query): Query<ListQuotesQuery>,
) -> Result<Json<Vec<QuoteRecord>>, ApiError> {
    let status = query.status.and_then(|s| s.parse::<SwapStatus>().ok());

    let quotes = state
        .db
        .list_quotes(status, query.limit)
        .await
        .map_err(ApiError::from)?;

    Ok(Json(quotes))
}

/// Get liquidity status
async fn get_liquidity(
    State(state): State<AppState>,
) -> Result<Json<LiquidityResponse>, ApiError> {
    let status = state.broker.get_liquidity_status().await;

    let mints: Vec<MintLiquidity> = status
        .mints
        .into_iter()
        .map(|mb| MintLiquidity {
            mint_url: mb.mint_url.clone(),
            name: mb.name,
            balance: mb.balance,
            unit: "sat".to_string(),
        })
        .collect();

    let total_balance = mints.iter().map(|m| m.balance).sum();

    Ok(Json(LiquidityResponse {
        mints,
        total_balance,
    }))
}

/// Get liquidity events for a mint
async fn get_liquidity_events(
    State(state): State<AppState>,
    Path(mint_url): Path<String>,
) -> Result<Json<LiquidityEventsResponse>, ApiError> {
    let events = state
        .db
        .get_liquidity_events(&mint_url, 100)
        .await
        .map_err(ApiError::from)?;

    Ok(Json(LiquidityEventsResponse { events }))
}

/// Health check
async fn health_check(State(state): State<AppState>) -> Result<Json<HealthResponse>, ApiError> {
    // Test database connection
    let db_status = match state.db.pool().acquire().await {
        Ok(_) => "ok".to_string(),
        Err(e) => format!("error: {}", e),
    };

    Ok(Json(HealthResponse {
        status: "ok".to_string(),
        timestamp: Utc::now().to_rfc3339(),
        database: db_status,
    }))
}

/// Get metrics
async fn get_metrics(State(state): State<AppState>) -> Result<Json<MetricsResponse>, ApiError> {
    let all_quotes = state
        .db
        .list_quotes(None, 10000)
        .await
        .map_err(ApiError::from)?;

    let total_quotes = all_quotes.len() as u64;
    let completed_swaps = all_quotes
        .iter()
        .filter(|q| q.status == SwapStatus::Completed.to_string())
        .count() as u64;
    let failed_swaps = all_quotes
        .iter()
        .filter(|q| q.status == SwapStatus::Failed.to_string())
        .count() as u64;

    let total_volume: i64 = all_quotes
        .iter()
        .filter(|q| q.status == SwapStatus::Completed.to_string())
        .map(|q| q.amount_in)
        .sum();

    let total_fees: i64 = all_quotes
        .iter()
        .filter(|q| q.status == SwapStatus::Completed.to_string())
        .map(|q| q.fee)
        .sum();

    Ok(Json(MetricsResponse {
        total_quotes,
        completed_swaps,
        failed_swaps,
        total_volume: total_volume as u64,
        total_fees: total_fees as u64,
    }))
}

// ===== Error Handling =====

#[derive(Debug)]
pub enum ApiError {
    Internal(String),
    BadRequest(String),
    NotFound(String),
    Broker(BrokerError),
}

impl From<BrokerError> for ApiError {
    fn from(err: BrokerError) -> Self {
        ApiError::Broker(err)
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, code, message) = match self {
            ApiError::Internal(msg) => (StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", msg),
            ApiError::BadRequest(msg) => (StatusCode::BAD_REQUEST, "BAD_REQUEST", msg),
            ApiError::NotFound(msg) => (StatusCode::NOT_FOUND, "NOT_FOUND", msg),
            ApiError::Broker(err) => match err {
                BrokerError::QuoteNotFound(msg) => (StatusCode::NOT_FOUND, "QUOTE_NOT_FOUND", msg),
                BrokerError::QuoteExpired(msg) => {
                    (StatusCode::BAD_REQUEST, "QUOTE_EXPIRED", msg)
                }
                BrokerError::InsufficientLiquidity { .. } => (
                    StatusCode::SERVICE_UNAVAILABLE,
                    "INSUFFICIENT_LIQUIDITY",
                    err.to_string(),
                ),
                _ => (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "BROKER_ERROR",
                    err.to_string(),
                ),
            },
        };

        let body = Json(ErrorResponse {
            error: message,
            code: code.to_string(),
        });

        (status, body).into_response()
    }
}
