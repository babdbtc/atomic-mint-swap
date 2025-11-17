#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{Database, LiquidityEvent, QuoteRecord, SwapRecord};
    use crate::types::SwapStatus;
    use chrono::Utc;

    async fn setup_test_db() -> Database {
        // Use in-memory SQLite for tests
        let db = Database::new("sqlite::memory:")
            .await
            .expect("Failed to create test database");
        db.migrate().await.expect("Failed to run migrations");
        db
    }

    fn create_test_quote() -> QuoteRecord {
        QuoteRecord {
            id: "test-quote-123".to_string(),
            source_mint: "http://mint-a.test".to_string(),
            target_mint: "http://mint-b.test".to_string(),
            amount_in: 100,
            amount_out: 99,
            fee: 1,
            fee_rate: 0.01,
            broker_pubkey: "02abcd1234".to_string(),
            adaptor_point: "03efgh5678".to_string(),
            tweaked_pubkey: "02ijkl9012".to_string(),
            status: SwapStatus::Pending.to_string(),
            created_at: Utc::now().to_rfc3339(),
            expires_at: Utc::now()
                .checked_add_signed(chrono::Duration::seconds(300))
                .unwrap()
                .to_rfc3339(),
            accepted_at: None,
            completed_at: None,
            user_pubkey: Some("02user1234".to_string()),
            error_message: None,
        }
    }

    #[tokio::test]
    async fn test_create_and_get_quote() {
        let db = setup_test_db().await;
        let quote = create_test_quote();

        // Create quote
        db.create_quote(&quote).await.expect("Failed to create quote");

        // Get quote
        let retrieved = db
            .get_quote(&quote.id)
            .await
            .expect("Failed to get quote")
            .expect("Quote not found");

        assert_eq!(retrieved.id, quote.id);
        assert_eq!(retrieved.amount_in, quote.amount_in);
        assert_eq!(retrieved.status, quote.status);
    }

    #[tokio::test]
    async fn test_update_quote_status() {
        let db = setup_test_db().await;
        let quote = create_test_quote();

        db.create_quote(&quote).await.expect("Failed to create quote");

        // Update to accepted
        db.update_quote_status(&quote.id, SwapStatus::Accepted, None)
            .await
            .expect("Failed to update status");

        let updated = db
            .get_quote(&quote.id)
            .await
            .expect("Failed to get quote")
            .expect("Quote not found");

        assert_eq!(updated.status, SwapStatus::Accepted.to_string());
        assert!(updated.accepted_at.is_some());
    }

    #[tokio::test]
    async fn test_update_quote_to_completed() {
        let db = setup_test_db().await;
        let quote = create_test_quote();

        db.create_quote(&quote).await.expect("Failed to create quote");

        // Update to completed
        db.update_quote_status(&quote.id, SwapStatus::Completed, None)
            .await
            .expect("Failed to update status");

        let updated = db
            .get_quote(&quote.id)
            .await
            .expect("Failed to get quote")
            .expect("Quote not found");

        assert_eq!(updated.status, SwapStatus::Completed.to_string());
        assert!(updated.completed_at.is_some());
    }

    #[tokio::test]
    async fn test_update_quote_to_failed_with_error() {
        let db = setup_test_db().await;
        let quote = create_test_quote();

        db.create_quote(&quote).await.expect("Failed to create quote");

        // Update to failed with error message
        db.update_quote_status(
            &quote.id,
            SwapStatus::Failed,
            Some("Insufficient liquidity".to_string()),
        )
        .await
        .expect("Failed to update status");

        let updated = db
            .get_quote(&quote.id)
            .await
            .expect("Failed to get quote")
            .expect("Quote not found");

        assert_eq!(updated.status, SwapStatus::Failed.to_string());
        assert_eq!(
            updated.error_message,
            Some("Insufficient liquidity".to_string())
        );
    }

    #[tokio::test]
    async fn test_list_quotes_no_filter() {
        let db = setup_test_db().await;

        // Create multiple quotes
        for i in 0..5 {
            let mut quote = create_test_quote();
            quote.id = format!("test-quote-{}", i);
            db.create_quote(&quote).await.expect("Failed to create quote");
        }

        let quotes = db
            .list_quotes(None, 10)
            .await
            .expect("Failed to list quotes");

        assert_eq!(quotes.len(), 5);
    }

    #[tokio::test]
    async fn test_list_quotes_with_status_filter() {
        let db = setup_test_db().await;

        // Create quotes with different statuses
        for i in 0..3 {
            let mut quote = create_test_quote();
            quote.id = format!("pending-{}", i);
            db.create_quote(&quote).await.expect("Failed to create quote");
        }

        for i in 0..2 {
            let mut quote = create_test_quote();
            quote.id = format!("completed-{}", i);
            quote.status = SwapStatus::Completed.to_string();
            db.create_quote(&quote).await.expect("Failed to create quote");
        }

        // Get only completed
        let completed = db
            .list_quotes(Some(SwapStatus::Completed), 10)
            .await
            .expect("Failed to list quotes");

        assert_eq!(completed.len(), 2);
        assert!(completed.iter().all(|q| q.status == SwapStatus::Completed.to_string()));
    }

    #[tokio::test]
    async fn test_create_and_get_swap() {
        let db = setup_test_db().await;
        let quote = create_test_quote();

        db.create_quote(&quote).await.expect("Failed to create quote");

        let swap = SwapRecord {
            id: "swap-123".to_string(),
            quote_id: quote.id.clone(),
            source_proofs: r#"[{"amount":100}]"#.to_string(),
            target_proofs: None,
            encrypted_signature: Some("enc_sig_123".to_string()),
            decrypted_signature: None,
            adaptor_secret: None,
            started_at: Utc::now().to_rfc3339(),
            completed_at: None,
        };

        db.create_swap(&swap).await.expect("Failed to create swap");

        let retrieved = db
            .get_swap(&swap.id)
            .await
            .expect("Failed to get swap")
            .expect("Swap not found");

        assert_eq!(retrieved.id, swap.id);
        assert_eq!(retrieved.quote_id, quote.id);
    }

    #[tokio::test]
    async fn test_complete_swap() {
        let db = setup_test_db().await;
        let quote = create_test_quote();

        db.create_quote(&quote).await.expect("Failed to create quote");

        let swap = SwapRecord {
            id: "swap-123".to_string(),
            quote_id: quote.id.clone(),
            source_proofs: r#"[{"amount":100}]"#.to_string(),
            target_proofs: None,
            encrypted_signature: Some("enc_sig_123".to_string()),
            decrypted_signature: None,
            adaptor_secret: None,
            started_at: Utc::now().to_rfc3339(),
            completed_at: None,
        };

        db.create_swap(&swap).await.expect("Failed to create swap");

        // Complete swap
        db.complete_swap(
            &swap.id,
            r#"[{"amount":99}]"#,
            Some("dec_sig_123"),
            Some("adaptor_secret_123"),
        )
        .await
        .expect("Failed to complete swap");

        let completed = db
            .get_swap(&swap.id)
            .await
            .expect("Failed to get swap")
            .expect("Swap not found");

        assert!(completed.target_proofs.is_some());
        assert!(completed.decrypted_signature.is_some());
        assert!(completed.adaptor_secret.is_some());
        assert!(completed.completed_at.is_some());
    }

    #[tokio::test]
    async fn test_record_liquidity_event() {
        let db = setup_test_db().await;

        let event = LiquidityEvent {
            id: None,
            mint_url: "http://mint-a.test".to_string(),
            event_type: "swap_in".to_string(),
            amount: 100,
            balance_after: 500,
            quote_id: Some("quote-123".to_string()),
            created_at: Utc::now().to_rfc3339(),
        };

        db.record_liquidity_event(&event)
            .await
            .expect("Failed to record event");

        let events = db
            .get_liquidity_events("http://mint-a.test", 10)
            .await
            .expect("Failed to get events");

        assert_eq!(events.len(), 1);
        assert_eq!(events[0].event_type, "swap_in");
        assert_eq!(events[0].amount, 100);
    }

    #[tokio::test]
    async fn test_get_swap_by_quote_id() {
        let db = setup_test_db().await;
        let quote = create_test_quote();

        db.create_quote(&quote).await.expect("Failed to create quote");

        let swap = SwapRecord {
            id: "swap-123".to_string(),
            quote_id: quote.id.clone(),
            source_proofs: r#"[{"amount":100}]"#.to_string(),
            target_proofs: None,
            encrypted_signature: Some("enc_sig_123".to_string()),
            decrypted_signature: None,
            adaptor_secret: None,
            started_at: Utc::now().to_rfc3339(),
            completed_at: None,
        };

        db.create_swap(&swap).await.expect("Failed to create swap");

        let retrieved = db
            .get_swap_by_quote(&quote.id)
            .await
            .expect("Failed to get swap")
            .expect("Swap not found");

        assert_eq!(retrieved.quote_id, quote.id);
    }

    #[tokio::test]
    async fn test_delete_expired_quotes() {
        let db = setup_test_db().await;

        // Create an expired quote
        let mut expired_quote = create_test_quote();
        expired_quote.id = "expired-quote".to_string();
        expired_quote.expires_at = Utc::now()
            .checked_sub_signed(chrono::Duration::seconds(60))
            .unwrap()
            .to_rfc3339();

        db.create_quote(&expired_quote)
            .await
            .expect("Failed to create expired quote");

        // Create a valid quote
        let valid_quote = create_test_quote();
        db.create_quote(&valid_quote)
            .await
            .expect("Failed to create valid quote");

        // Delete expired
        let deleted = db
            .delete_expired_quotes()
            .await
            .expect("Failed to delete expired quotes");

        assert_eq!(deleted, 1);

        // Verify expired is gone but valid remains
        assert!(db.get_quote("expired-quote").await.unwrap().is_none());
        assert!(db.get_quote(&valid_quote.id).await.unwrap().is_some());
    }
}
