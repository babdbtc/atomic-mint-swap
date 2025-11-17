//! Example: Running the Cashu Broker Service
//!
//! This example demonstrates:
//! 1. Starting Charlie (the broker) with liquidity on two mints
//! 2. Bob requesting a swap quote
//! 3. Executing an atomic swap from Mint B → Mint A
//!
//! To run this example:
//! 1. Start local mints with docker-compose up
//! 2. cargo run --example run_broker

use cashu_broker::{Broker, BrokerConfig, MintConfig, SwapRequest};
use tracing_subscriber;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialize logging
    tracing_subscriber::fmt::init();

    println!("\n╔═══════════════════════════════════════════════════════════════╗");
    println!("║         CASHU ATOMIC SWAP BROKER - DEMONSTRATION            ║");
    println!("╚═══════════════════════════════════════════════════════════════╝\n");

    // Configure the broker with two local mints
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
        fee_rate: 0.005,        // 0.5% fee
        min_swap_amount: 1,
        max_swap_amount: 10_000,
        quote_expiry_seconds: 300, // 5 minutes
    };

    // Create and initialize the broker
    println!("🚀 Initializing Charlie (the broker)...\n");
    let broker = Broker::new(config).await?;

    // Initialize liquidity on each mint
    println!("💰 Setting up initial liquidity...\n");
    broker.initialize(100).await?;

    // Display broker status
    broker.print_status().await;

    // Simulate a client (Bob) requesting a swap
    println!("\n👤 Bob wants to swap 8 sats from Mint B to Mint A\n");

    let swap_request = SwapRequest {
        client_id: "bob".to_string(),
        from_mint: "http://localhost:3339".to_string(), // Mint B
        to_mint: "http://localhost:3338".to_string(),   // Mint A
        amount: 8,
        client_public_key: vec![
            // Example compressed public key (33 bytes)
            // In practice, this would be Bob's actual public key
            0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        ],
    };

    // Request a quote
    let quote = broker.request_quote(swap_request).await?;

    println!("\n📋 Quote Details:");
    println!("   ID: {}", quote.quote_id);
    println!("   Input: {} sats (Mint B)", quote.input_amount);
    println!("   Output: {} sats (Mint A)", quote.output_amount);
    println!("   Fee: {} sats ({:.1}%)", quote.fee, quote.fee_rate * 100.0);
    println!("   Status: {:?}", quote.status);

    // In a real scenario:
    // 1. Bob would accept the quote
    // 2. Bob would provide his public key
    // 3. Charlie would lock tokens to Bob's tweaked key
    // 4. Bob would lock tokens to Charlie's tweaked key
    // 5. Either party claims, revealing the adaptor secret
    // 6. The other party extracts the secret and claims their tokens
    // 7. Swap is complete atomically!

    println!("\n✅ Quote generated successfully!");
    println!("\nIn production:");
    println!("  1. Bob would accept this quote");
    println!("  2. Both parties lock tokens to tweaked P2PK keys");
    println!("  3. First claim reveals adaptor secret");
    println!("  4. Second party claims using extracted secret");
    println!("  5. Swap completes atomically! 🎉");

    println!("\n🔄 To run the broker continuously, use broker.run().await");
    println!("   (This would start HTTP/gRPC server and Nostr announcements)\n");

    Ok(())
}
