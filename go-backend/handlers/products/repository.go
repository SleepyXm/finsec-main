package handlers

import (
	"context"
	"database/sql"
	"encoding/json"
)

func listProducts(ctx context.Context, db *sql.DB) ([]Product, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT id::text, stripe_price_id, name, COALESCE(description, ''),
			tier, amount, currency, billing_interval, interval_count
		FROM products
		WHERE active = true
		ORDER BY amount ASC, name ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	products := make([]Product, 0)
	for rows.Next() {
		var product Product
		if err := rows.Scan(
			&product.ProductID, &product.StripePriceID, &product.ProductName,
			&product.Description, &product.Tier, &product.Amount, &product.Currency,
			&product.BillingInterval, &product.IntervalCount,
		); err != nil {
			return nil, err
		}
		product.Price = float64(product.Amount) / 100
		products = append(products, product)
	}
	return products, rows.Err()
}

func findCheckoutProduct(ctx context.Context, db *sql.DB, priceID string) (*checkoutProduct, error) {
	var product checkoutProduct
	err := db.QueryRowContext(ctx, `
		SELECT id::text, name, tier, amount, stripe_price_id
		FROM products
		WHERE stripe_price_id = $1 AND active = true
	`, priceID).Scan(
		&product.ProductID, &product.ProductName, &product.Tier,
		&product.Amount, &product.StripePriceID,
	)
	return &product, err
}

func hasActiveSubscriptionForPrice(ctx context.Context, db *sql.DB, userID, priceID string) (bool, error) {
	var exists bool
	err := db.QueryRowContext(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM subscriptions
			WHERE user_id = $1 AND stripe_price_id = $2
				AND status IN ('active', 'trialing', 'past_due')
		)
	`, userID, priceID).Scan(&exists)
	return exists, err
}

func findProductIDByPrice(ctx context.Context, db *sql.DB, priceID string) (string, error) {
	var productID string
	err := db.QueryRowContext(ctx, `
		SELECT id::text FROM products
		WHERE stripe_price_id = $1 AND active = true
	`, priceID).Scan(&productID)
	return productID, err
}

func findUserIDByStripeCustomer(ctx context.Context, db *sql.DB, customerID string) (string, error) {
	var userID string
	err := db.QueryRowContext(ctx, `
		SELECT id::text FROM users WHERE stripe_customer_id = $1
	`, customerID).Scan(&userID)
	return userID, err
}

func findUserIDBySubscription(ctx context.Context, db *sql.DB, subscriptionID string) (string, error) {
	var userID string
	err := db.QueryRowContext(ctx, `
		SELECT user_id::text FROM subscriptions WHERE stripe_subscription_id = $1
	`, subscriptionID).Scan(&userID)
	return userID, err
}

func setUserStripeCustomerID(ctx context.Context, db *sql.DB, userID, customerID string) error {
	if userID == "" || customerID == "" {
		return nil
	}
	_, err := db.ExecContext(ctx, `
		UPDATE users SET stripe_customer_id = $1
		WHERE id = $2 AND (stripe_customer_id IS NULL OR stripe_customer_id = '')
	`, customerID, userID)
	return err
}

func upsertSubscription(ctx context.Context, db *sql.DB, subscription subscriptionRecord) error {
	status, err := normalizeSubscriptionStatus(subscription.Status)
	if err != nil {
		return err
	}
	if subscription.Quantity <= 0 {
		subscription.Quantity = 1
	}
	metadata, err := json.Marshal(subscription.Metadata)
	if err != nil {
		return err
	}

	_, err = db.ExecContext(ctx, `
		INSERT INTO subscriptions (
			user_id, product_id, stripe_customer_id, stripe_subscription_id,
			stripe_price_id, status, quantity, current_period_start,
			current_period_end, trial_start, trial_end, cancel_at_period_end,
			cancel_at, canceled_at, ended_at, metadata
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8,
			$9, $10, $11, $12, $13, $14, $15, $16::jsonb
		)
		ON CONFLICT (stripe_subscription_id) DO UPDATE SET
			user_id = EXCLUDED.user_id, product_id = EXCLUDED.product_id,
			stripe_customer_id = EXCLUDED.stripe_customer_id,
			stripe_price_id = EXCLUDED.stripe_price_id, status = EXCLUDED.status,
			quantity = EXCLUDED.quantity, current_period_start = EXCLUDED.current_period_start,
			current_period_end = EXCLUDED.current_period_end, trial_start = EXCLUDED.trial_start,
			trial_end = EXCLUDED.trial_end, cancel_at_period_end = EXCLUDED.cancel_at_period_end,
			cancel_at = EXCLUDED.cancel_at, canceled_at = EXCLUDED.canceled_at,
			ended_at = EXCLUDED.ended_at, metadata = EXCLUDED.metadata
	`, subscription.UserID, subscription.ProductID, subscription.StripeCustomerID,
		subscription.StripeSubscriptionID, subscription.StripePriceID, status,
		subscription.Quantity, subscription.CurrentPeriodStart, subscription.CurrentPeriodEnd,
		subscription.TrialStart, subscription.TrialEnd, subscription.CancelAtPeriodEnd,
		subscription.CancelAt, subscription.CanceledAt, subscription.EndedAt, string(metadata))
	return err
}

func syncUserSubscriptionTier(ctx context.Context, db *sql.DB, userID string) error {
	_, err := db.ExecContext(ctx, `
		UPDATE users SET subscription_tier = COALESCE((
			SELECT p.tier FROM subscriptions s
			JOIN products p ON p.id::text = s.product_id
			WHERE s.user_id = $1 AND s.status IN ('active', 'trialing', 'past_due')
			ORDER BY p.amount DESC LIMIT 1
		), 'free'), updated_at = NOW()
		WHERE id = $1
	`, userID)
	return err
}
