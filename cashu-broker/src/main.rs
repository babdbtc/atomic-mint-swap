use cashu_broker::{api, AppState, Broker, Config, Database};
use std::sync::Arc;
use tracing::{info, Level};
use tracing_subscriber::{fmt, prelude::*, EnvFilter};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Load configuration
    let config = Config::from_env()?;

    // Initialize logging
    init_logging(&config.log_level)?;

    info!("Starting Cashu Broker...");
    info!("Server: {}", config.server_address());
    info!("Database: {}", config.database_url);
    info!("Fee rate: {}%", config.fee_rate * 100.0);
    info!("Mints: {}", config.mints.len());

    // Initialize database
    let db = Database::new(&config.database_url).await?;
    info!("Running database migrations...");
    db.migrate().await?;
    info!("Database ready");

    // Initialize broker
    let broker_config = cashu_broker::types::BrokerConfig {
        mints: config.mints.clone(),
        fee_rate: config.fee_rate,
        min_swap_amount: config.min_swap_amount,
        max_swap_amount: config.max_swap_amount,
        quote_expiry_seconds: config.quote_expiry_seconds,
    };

    let broker = Broker::new(broker_config).await?;
    info!("Broker initialized");

    // Initialize broker liquidity
    // TODO: Load initial liquidity from config or database
    // For now, we'll start with empty liquidity and add it manually
    info!("Broker ready to accept requests");

    // Create app state
    let state = AppState {
        broker: Arc::new(broker),
        db,
    };

    // Create router
    let app = api::create_router(state, config.cors_origins);

    // Start HTTP server
    let addr = config.server_address();
    info!("Listening on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

fn init_logging(log_level: &str) -> Result<(), Box<dyn std::error::Error>> {
    let filter = EnvFilter::try_from_default_env()
        .or_else(|_| EnvFilter::try_new(log_level))
        .unwrap_or_else(|_| EnvFilter::new("info"));

    tracing_subscriber::registry()
        .with(fmt::layer())
        .with(filter)
        .init();

    Ok(())
}
