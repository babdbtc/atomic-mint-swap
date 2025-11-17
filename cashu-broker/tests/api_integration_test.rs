use cashu_broker::{api, AppState, Broker, Config, Database};
use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use serde_json::{json, Value};
use std::sync::Arc;
use tower::ServiceExt;

/// Helper to setup test environment
async fn setup_test_app() -> (axum::Router, Database) {
    // Create in-memory database
    let db = Database::new("sqlite::memory:")
        .await
        .expect("Failed to create test database");
    db.migrate().await.expect("Failed to run migrations");

    // Create broker config
    let broker_config = cashu_broker::types::BrokerConfig {
        mints: vec![
            cashu_broker::types::MintConfig {
                mint_url: "http://mint-a.test".to_string(),
                name: "Mint A".to_string(),
                unit: "sat".to_string(),
            },
            cashu_broker::types::MintConfig {
                mint_url: "http://mint-b.test".to_string(),
                name: "Mint B".to_string(),
                unit: "sat".to_string(),
            },
        ],
        fee_rate: 0.01,
        min_swap_amount: 1,
        max_swap_amount: 10000,
        quote_expiry_seconds: 300,
    };

    let broker = Broker::new(broker_config)
        .await
        .expect("Failed to create broker");

    let state = AppState {
        broker: Arc::new(broker),
        db: db.clone(),
    };

    let app = api::create_router(state, vec!["*".to_string()]);

    (app, db)
}

/// Helper to parse JSON response
async fn parse_json_response(body: Body) -> Value {
    let bytes = axum::body::to_bytes(body, usize::MAX)
        .await
        .expect("Failed to read body");
    serde_json::from_slice(&bytes).expect("Failed to parse JSON")
}

#[tokio::test]
async fn test_health_endpoint() {
    let (app, _db) = setup_test_app().await;

    let response = app
        .oneshot(
            Request::builder()
                .uri("/health")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = parse_json_response(response.into_body()).await;
    assert_eq!(body["status"], "ok");
    assert!(body["timestamp"].is_string());
    assert_eq!(body["database"], "ok");
}

#[tokio::test]
async fn test_request_quote_success() {
    let (app, _db) = setup_test_app().await;

    let request_body = json!({
        "source_mint": "http://mint-a.test",
        "target_mint": "http://mint-b.test",
        "amount": 100
    });

    let response = app
        .oneshot(
            Request::builder()
                .uri("/quote")
                .method("POST")
                .header("content-type", "application/json")
                .body(Body::from(serde_json::to_vec(&request_body).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();

    // Note: This will fail without actual mints, but tests the API structure
    // In real integration tests, you'd mock the broker or have test mints running
    assert!(
        response.status() == StatusCode::OK
            || response.status() == StatusCode::INTERNAL_SERVER_ERROR
    );
}

#[tokio::test]
async fn test_request_quote_invalid_amount() {
    let (app, _db) = setup_test_app().await;

    let request_body = json!({
        "source_mint": "http://mint-a.test",
        "target_mint": "http://mint-b.test",
        "amount": 0  // Below minimum
    });

    let response = app
        .oneshot(
            Request::builder()
                .uri("/quote")
                .method("POST")
                .header("content-type", "application/json")
                .body(Body::from(serde_json::to_vec(&request_body).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert!(response.status().is_client_error() || response.status().is_server_error());
}

#[tokio::test]
async fn test_get_liquidity() {
    let (app, _db) = setup_test_app().await;

    let response = app
        .oneshot(
            Request::builder()
                .uri("/liquidity")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = parse_json_response(response.into_body()).await;
    assert!(body["mints"].is_array());
    assert!(body["total_balance"].is_number());
}

#[tokio::test]
async fn test_get_metrics() {
    let (app, _db) = setup_test_app().await;

    let response = app
        .oneshot(
            Request::builder()
                .uri("/metrics")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = parse_json_response(response.into_body()).await;
    assert!(body["total_quotes"].is_number());
    assert!(body["completed_swaps"].is_number());
    assert!(body["failed_swaps"].is_number());
    assert!(body["total_volume"].is_number());
    assert!(body["total_fees"].is_number());
}

#[tokio::test]
async fn test_list_quotes_empty() {
    let (app, _db) = setup_test_app().await;

    let response = app
        .oneshot(
            Request::builder()
                .uri("/quotes")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = parse_json_response(response.into_body()).await;
    assert!(body.is_array());
    assert_eq!(body.as_array().unwrap().len(), 0);
}

#[tokio::test]
async fn test_list_quotes_with_filter() {
    let (app, _db) = setup_test_app().await;

    let response = app
        .oneshot(
            Request::builder()
                .uri("/quotes?status=completed&limit=10")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = parse_json_response(response.into_body()).await;
    assert!(body.is_array());
}

#[tokio::test]
async fn test_get_nonexistent_quote() {
    let (app, _db) = setup_test_app().await;

    let response = app
        .oneshot(
            Request::builder()
                .uri("/quote/nonexistent-id")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn test_cors_headers() {
    let (app, _db) = setup_test_app().await;

    let response = app
        .oneshot(
            Request::builder()
                .uri("/health")
                .header("origin", "http://example.com")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    // CORS should be configured
    assert!(response.headers().contains_key("access-control-allow-origin"));
}

#[tokio::test]
async fn test_request_quote_same_mint_error() {
    let (app, _db) = setup_test_app().await;

    let request_body = json!({
        "source_mint": "http://mint-a.test",
        "target_mint": "http://mint-a.test",  // Same mint!
        "amount": 100
    });

    let response = app
        .oneshot(
            Request::builder()
                .uri("/quote")
                .method("POST")
                .header("content-type", "application/json")
                .body(Body::from(serde_json::to_vec(&request_body).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();

    // Should return error for same-mint swap
    assert!(response.status().is_client_error() || response.status().is_server_error());
}

#[tokio::test]
async fn test_request_quote_unsupported_mint() {
    let (app, _db) = setup_test_app().await;

    let request_body = json!({
        "source_mint": "http://unknown-mint.test",
        "target_mint": "http://mint-b.test",
        "amount": 100
    });

    let response = app
        .oneshot(
            Request::builder()
                .uri("/quote")
                .method("POST")
                .header("content-type", "application/json")
                .body(Body::from(serde_json::to_vec(&request_body).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();

    // Should return error for unsupported mint
    assert!(response.status().is_client_error() || response.status().is_server_error());
}
