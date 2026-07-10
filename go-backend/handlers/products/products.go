package handlers

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"finsec-backend/utils"

	"github.com/gin-gonic/gin"
)

type Product struct {
	ProductID       string  `json:"product_id"`
	StripeProductID string  `json:"stripe_product_id"`
	StripePriceID   string  `json:"stripe_price_id"`
	ProductName     string  `json:"product_name"`
	Name            string  `json:"name"`
	Description     string  `json:"description"`
	Tier            string  `json:"tier"`
	Amount          int     `json:"amount"`
	Price           float64 `json:"price"`
	Currency        string  `json:"currency"`
	BillingInterval string  `json:"billing_interval"`
	IntervalCount   int     `json:"interval_count"`
	Active          bool    `json:"active"`
}

type checkoutRequest struct {
	PriceID string `json:"price_id" binding:"required"`
}

type checkoutProduct struct {
	ProductID     string
	ProductName   string
	Tier          string
	Amount        int
	StripePriceID string
}

type stripeCustomer struct {
	ID string `json:"id"`
}

type stripeCheckoutSession struct {
	ID  string `json:"id"`
	URL string `json:"url"`
}

type stripeErrorResponse struct {
	Error struct {
		Message string `json:"message"`
		Type    string `json:"type"`
	} `json:"error"`
}

type stripeWebhookEvent struct {
	ID   string `json:"id"`
	Type string `json:"type"`
	Data struct {
		Object json.RawMessage `json:"object"`
	} `json:"data"`
}

type stripeCheckoutSessionEvent struct {
	ID                string            `json:"id"`
	Customer          stripeObjectID    `json:"customer"`
	Subscription      stripeObjectID    `json:"subscription"`
	ClientReferenceID string            `json:"client_reference_id"`
	PaymentStatus     string            `json:"payment_status"`
	Metadata          map[string]string `json:"metadata"`
}

type stripeSubscriptionEvent struct {
	ID                string            `json:"id"`
	Customer          stripeObjectID    `json:"customer"`
	Status            string            `json:"status"`
	Items             stripeLineItems   `json:"items"`
	Metadata          map[string]string `json:"metadata"`
	Quantity          int               `json:"quantity"`
	CurrentPeriodFrom int64             `json:"current_period_start"`
	CurrentPeriodTo   int64             `json:"current_period_end"`
	TrialStart        int64             `json:"trial_start"`
	TrialEnd          int64             `json:"trial_end"`
	CancelAtPeriodEnd bool              `json:"cancel_at_period_end"`
	CancelAt          int64             `json:"cancel_at"`
	CanceledAt        int64             `json:"canceled_at"`
	EndedAt           int64             `json:"ended_at"`
}

type stripeLineItems struct {
	Data []stripeLineItem `json:"data"`
}

type stripeLineItem struct {
	Price stripePriceRef `json:"price"`
}

type stripePriceRef struct {
	ID string `json:"id"`
}

type stripeObjectID string

func (id *stripeObjectID) UnmarshalJSON(data []byte) error {
	var value string
	if err := json.Unmarshal(data, &value); err == nil {
		*id = stripeObjectID(value)
		return nil
	}

	var object struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(data, &object); err != nil {
		return err
	}

	*id = stripeObjectID(object.ID)
	return nil
}

func (id stripeObjectID) String() string {
	return string(id)
}

var stripeHTTPClient = &http.Client{Timeout: 15 * time.Second}

func GetSubscriptions(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		products, err := getActiveProducts(c.Request.Context(), db)
		if err != nil {
			writeError(c, http.StatusInternalServerError, "Could not fetch subscription products")
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"products":      products,
			"subscriptions": products,
		})
	}
}

func GetExtras(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		products, err := getProductsByCategory(c.Request.Context(), db, "extra")
		if err != nil {
			writeError(c, http.StatusInternalServerError, "Could not fetch extra products")
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"products": products,
			"extras":   products,
		})
	}
}

func CreateCheckoutSession(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req checkoutRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			writeError(c, http.StatusBadRequest, "A valid price_id is required")
			return
		}

		priceID := strings.TrimSpace(req.PriceID)
		if priceID == "" {
			writeError(c, http.StatusBadRequest, "A valid price_id is required")
			return
		}

		product, err := getCheckoutProduct(c.Request.Context(), db, priceID)
		if err == sql.ErrNoRows {
			writeError(c, http.StatusNotFound, "Product not found")
			return
		}
		if err != nil {
			writeError(c, http.StatusInternalServerError, "Could not validate product")
			return
		}
		if product.Amount <= 0 {
			writeError(c, http.StatusBadRequest, "Free products do not require checkout")
			return
		}

		userID, ok := c.Get("userID")
		if !ok {
			writeError(c, http.StatusUnauthorized, "Authentication required")
			return
		}

		userIDString := fmt.Sprint(userID)
		currentTier := normalizeTier(c.GetString("subscriptionTier"))
		requestedTier := normalizeTier(product.Tier)
		if currentTier == requestedTier {
			writeError(c, http.StatusConflict, "You are already on this subscription tier")
			return
		}

		hasActivePrice, err := hasActiveSubscriptionForPrice(c.Request.Context(), db, userIDString, product.StripePriceID)
		if err != nil {
			writeError(c, http.StatusInternalServerError, "Could not validate current subscription")
			return
		}
		if hasActivePrice {
			writeError(c, http.StatusConflict, "You already have an active subscription for this product")
			return
		}

		email := c.GetString("email")
		customerID, err := getOrCreateStripeCustomer(c.Request.Context(), db, userIDString, email)
		if err != nil {
			log.Printf("products: could not prepare Stripe customer user_id=%s: %v", userIDString, err)
			writeError(c, http.StatusInternalServerError, publicError("Could not prepare Stripe customer", err))
			return
		}

		session, err := createStripeCheckoutSession(userIDString, customerID, product.ProductID, product.ProductName, priceID)
		if err != nil {
			log.Printf("products: could not create checkout session user_id=%s customer_id=%s price_id=%s: %v", userIDString, customerID, priceID, err)
			writeError(c, http.StatusInternalServerError, publicError("Could not create checkout session", err))
			return
		}
		if session.URL == "" {
			writeError(c, http.StatusInternalServerError, "Stripe did not return a checkout URL")
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"session_id": session.ID,
			"url":        session.URL,
		})
	}
}

func HandleStripeWebhook(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		body, err := io.ReadAll(c.Request.Body)
		if err != nil {
			writeError(c, http.StatusBadRequest, "Could not read webhook body")
			return
		}

		if err := verifyStripeWebhookSignature(body, c.GetHeader("Stripe-Signature")); err != nil {
			log.Printf("products: rejected Stripe webhook: %v", err)
			writeError(c, http.StatusBadRequest, "Invalid Stripe webhook signature")
			return
		}

		var event stripeWebhookEvent
		if err := json.Unmarshal(body, &event); err != nil {
			writeError(c, http.StatusBadRequest, "Invalid Stripe webhook payload")
			return
		}

		switch event.Type {
		case "checkout.session.completed":
			err = handleCheckoutSessionCompleted(c.Request.Context(), db, event.Data.Object)
		case "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted":
			err = handleStripeSubscriptionChanged(c.Request.Context(), db, event.Type, event.Data.Object)
		default:
			c.JSON(http.StatusOK, gin.H{"received": true})
			return
		}

		if err != nil {
			log.Printf("products: failed to handle Stripe webhook event_id=%s event_type=%s: %v", event.ID, event.Type, err)
			writeError(c, http.StatusInternalServerError, "Could not process Stripe webhook")
			return
		}

		c.JSON(http.StatusOK, gin.H{"received": true})
	}
}

func getActiveProducts(ctx context.Context, db *sql.DB) ([]Product, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT
			id::text,
			stripe_product_id,
			stripe_price_id,
			name,
			COALESCE(description, ''),
			tier,
			amount,
			currency,
			billing_interval,
			interval_count,
			active
		FROM products
		WHERE active = true
		ORDER BY amount ASC, name ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return scanProducts(rows)
}

func getProductsByCategory(ctx context.Context, db *sql.DB, category string) ([]Product, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT
			id::text,
			stripe_product_id,
			stripe_price_id,
			name,
			COALESCE(description, ''),
			tier,
			amount,
			currency,
			billing_interval,
			interval_count,
			active
		FROM products
		WHERE active = true
			AND COALESCE(metadata->>'category', metadata->>'type') = $1
		ORDER BY amount ASC, name ASC
	`, category)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return scanProducts(rows)
}

func scanProducts(rows *sql.Rows) ([]Product, error) {
	products := make([]Product, 0)
	for rows.Next() {
		var product Product
		if err := rows.Scan(
			&product.ProductID,
			&product.StripeProductID,
			&product.StripePriceID,
			&product.ProductName,
			&product.Description,
			&product.Tier,
			&product.Amount,
			&product.Currency,
			&product.BillingInterval,
			&product.IntervalCount,
			&product.Active,
		); err != nil {
			return nil, err
		}

		product.Name = product.ProductName
		product.Price = float64(product.Amount) / 100
		products = append(products, product)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return products, nil
}

func getCheckoutProduct(ctx context.Context, db *sql.DB, priceID string) (*checkoutProduct, error) {
	var product checkoutProduct
	err := db.QueryRowContext(ctx, `
		SELECT id::text, name, tier, amount, stripe_price_id
		FROM products
		WHERE stripe_price_id = $1 AND active = true
	`, priceID).Scan(
		&product.ProductID,
		&product.ProductName,
		&product.Tier,
		&product.Amount,
		&product.StripePriceID,
	)
	if err != nil {
		return nil, err
	}

	return &product, nil
}

func hasActiveSubscriptionForPrice(ctx context.Context, db *sql.DB, userID string, priceID string) (bool, error) {
	var exists bool
	err := db.QueryRowContext(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM subscriptions
			WHERE user_id = $1
				AND stripe_price_id = $2
				AND status IN ('active', 'trialing', 'past_due')
		)
	`, userID, priceID).Scan(&exists)

	return exists, err
}

func getOrCreateStripeCustomer(ctx context.Context, db *sql.DB, userID string, email string) (string, error) {
	var existing sql.NullString
	if err := db.QueryRowContext(ctx, `
		SELECT stripe_customer_id
		FROM users
		WHERE id = $1
	`, userID).Scan(&existing); err != nil {
		return "", err
	}

	if existing.Valid && strings.TrimSpace(existing.String) != "" {
		return existing.String, nil
	}

	customer, err := createStripeCustomer(userID, email)
	if err != nil {
		return "", err
	}

	if _, err := db.ExecContext(ctx, `
		UPDATE users
		SET stripe_customer_id = $1
		WHERE id = $2
	`, customer.ID, userID); err != nil {
		return "", err
	}

	return customer.ID, nil
}

func createStripeCustomer(userID string, email string) (*stripeCustomer, error) {
	form := url.Values{}
	if strings.TrimSpace(email) != "" {
		form.Set("email", email)
	}
	form.Set("metadata[user_id]", userID)

	var customer stripeCustomer
	if err := stripePostForm("customers", form, &customer); err != nil {
		return nil, err
	}
	if customer.ID == "" {
		return nil, errors.New("stripe customer response missing id")
	}

	return &customer, nil
}

func createStripeCheckoutSession(userID string, customerID string, productID string, productName string, priceID string) (*stripeCheckoutSession, error) {
	form := url.Values{}
	form.Set("mode", "subscription")
	form.Set("customer", customerID)
	form.Set("line_items[0][price]", priceID)
	form.Set("line_items[0][quantity]", "1")
	form.Set("client_reference_id", userID)
	form.Set("success_url", checkoutRedirectURL("CHECKOUT_SUCCESS_URL", "STRIPE_SUCCESS_URL", "/profile?checkout=success&session_id={CHECKOUT_SESSION_ID}"))
	form.Set("cancel_url", checkoutRedirectURL("CHECKOUT_CANCEL_URL", "STRIPE_CANCEL_URL", "/products?checkout=cancelled"))
	form.Set("allow_promotion_codes", "true")
	form.Set("metadata[user_id]", userID)
	form.Set("metadata[product_id]", productID)
	form.Set("metadata[product_name]", productName)
	form.Set("metadata[stripe_price_id]", priceID)
	form.Set("subscription_data[metadata][user_id]", userID)
	form.Set("subscription_data[metadata][product_id]", productID)
	form.Set("subscription_data[metadata][stripe_price_id]", priceID)

	var session stripeCheckoutSession
	if err := stripePostForm("checkout/sessions", form, &session); err != nil {
		return nil, err
	}

	return &session, nil
}

func stripePostForm(endpoint string, form url.Values, out any) error {
	secret := strings.TrimSpace(os.Getenv("STRIPE_SECRET_KEY"))
	if secret == "" {
		return errors.New("STRIPE_SECRET_KEY is not configured")
	}

	req, err := http.NewRequest(http.MethodPost, "https://api.stripe.com/v1/"+endpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return err
	}
	req.SetBasicAuth(secret, "")
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	res, err := stripeHTTPClient.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()

	body, err := io.ReadAll(res.Body)
	if err != nil {
		return err
	}

	if res.StatusCode < http.StatusOK || res.StatusCode >= http.StatusMultipleChoices {
		var stripeErr stripeErrorResponse
		if err := json.Unmarshal(body, &stripeErr); err == nil && stripeErr.Error.Message != "" {
			return fmt.Errorf("stripe %s error: %s", stripeErr.Error.Type, stripeErr.Error.Message)
		}
		return fmt.Errorf("stripe request failed with status %d", res.StatusCode)
	}

	return json.Unmarshal(body, out)
}

func checkoutRedirectURL(primaryEnv string, secondaryEnv string, fallbackPath string) string {
	if value := strings.TrimSpace(os.Getenv(primaryEnv)); value != "" {
		return value
	}
	if value := strings.TrimSpace(os.Getenv(secondaryEnv)); value != "" {
		return value
	}

	base := strings.TrimRight(utils.Cfg.DevServer, "/")
	if base == "" {
		base = "http://localhost:3000"
	}

	return base + fallbackPath
}

func normalizeTier(tier string) string {
	normalized := strings.ToLower(strings.TrimSpace(tier))
	if normalized == "" || normalized == "none" {
		return "free"
	}

	return normalized
}

func handleCheckoutSessionCompleted(ctx context.Context, db *sql.DB, payload json.RawMessage) error {
	var session stripeCheckoutSessionEvent
	if err := json.Unmarshal(payload, &session); err != nil {
		return err
	}

	subscriptionID := strings.TrimSpace(session.Subscription.String())
	if subscriptionID == "" {
		return errors.New("checkout session missing subscription id")
	}

	customerID := strings.TrimSpace(session.Customer.String())
	userID := firstNonEmpty(session.ClientReferenceID, session.Metadata["user_id"])
	if userID == "" {
		var err error
		userID, err = findUserIDByStripeCustomer(ctx, db, customerID)
		if err != nil {
			return err
		}
	}

	priceID := strings.TrimSpace(session.Metadata["stripe_price_id"])
	if priceID == "" {
		return errors.New("checkout session missing stripe_price_id metadata")
	}

	productID := strings.TrimSpace(session.Metadata["product_id"])
	if productID == "" {
		var err error
		productID, err = findProductIDByPrice(ctx, db, priceID)
		if err != nil {
			return err
		}
	}

	metadata := copyMetadata(session.Metadata)
	metadata["checkout_session_id"] = session.ID

	if err := setUserStripeCustomerID(ctx, db, userID, customerID); err != nil {
		return err
	}

	if err := upsertSubscription(ctx, db, subscriptionUpsert{
		UserID:               userID,
		ProductID:            productID,
		StripeCustomerID:     customerID,
		StripeSubscriptionID: subscriptionID,
		StripePriceID:        priceID,
		Status:               checkoutStatus(session.PaymentStatus),
		Quantity:             1,
		Metadata:             metadata,
	}); err != nil {
		return err
	}

	return syncUserSubscriptionTier(ctx, db, userID)
}

func handleStripeSubscriptionChanged(ctx context.Context, db *sql.DB, eventType string, payload json.RawMessage) error {
	var subscription stripeSubscriptionEvent
	if err := json.Unmarshal(payload, &subscription); err != nil {
		return err
	}

	subscriptionID := strings.TrimSpace(subscription.ID)
	if subscriptionID == "" {
		return errors.New("subscription event missing id")
	}

	customerID := strings.TrimSpace(subscription.Customer.String())
	userID := strings.TrimSpace(subscription.Metadata["user_id"])
	if userID == "" {
		var err error
		userID, err = findUserIDBySubscription(ctx, db, subscriptionID)
		if err != nil && err != sql.ErrNoRows {
			return err
		}
	}
	if userID == "" {
		var err error
		userID, err = findUserIDByStripeCustomer(ctx, db, customerID)
		if err != nil {
			return err
		}
	}

	priceID := firstNonEmpty(subscription.Metadata["stripe_price_id"], subscription.firstPriceID())
	if priceID == "" {
		return errors.New("subscription event missing price id")
	}

	productID := strings.TrimSpace(subscription.Metadata["product_id"])
	if productID == "" {
		var err error
		productID, err = findProductIDByPrice(ctx, db, priceID)
		if err != nil {
			return err
		}
	}

	status := subscription.Status
	if eventType == "customer.subscription.deleted" {
		status = "canceled"
	}

	if err := setUserStripeCustomerID(ctx, db, userID, customerID); err != nil {
		return err
	}

	if err := upsertSubscription(ctx, db, subscriptionUpsert{
		UserID:               userID,
		ProductID:            productID,
		StripeCustomerID:     customerID,
		StripeSubscriptionID: subscriptionID,
		StripePriceID:        priceID,
		Status:               status,
		Quantity:             subscription.quantity(),
		CurrentPeriodStart:   stripeTimestamp(subscription.CurrentPeriodFrom),
		CurrentPeriodEnd:     stripeTimestamp(subscription.CurrentPeriodTo),
		TrialStart:           stripeTimestamp(subscription.TrialStart),
		TrialEnd:             stripeTimestamp(subscription.TrialEnd),
		CancelAtPeriodEnd:    subscription.CancelAtPeriodEnd,
		CancelAt:             stripeTimestamp(subscription.CancelAt),
		CanceledAt:           stripeTimestamp(subscription.CanceledAt),
		EndedAt:              stripeTimestamp(subscription.EndedAt),
		Metadata:             copyMetadata(subscription.Metadata),
	}); err != nil {
		return err
	}

	return syncUserSubscriptionTier(ctx, db, userID)
}

type subscriptionUpsert struct {
	UserID               string
	ProductID            string
	StripeCustomerID     string
	StripeSubscriptionID string
	StripePriceID        string
	Status               string
	Quantity             int
	CurrentPeriodStart   any
	CurrentPeriodEnd     any
	TrialStart           any
	TrialEnd             any
	CancelAtPeriodEnd    bool
	CancelAt             any
	CanceledAt           any
	EndedAt              any
	Metadata             map[string]string
}

func upsertSubscription(ctx context.Context, db *sql.DB, subscription subscriptionUpsert) error {
	status, err := normalizeSubscriptionStatus(subscription.Status)
	if err != nil {
		return err
	}

	quantity := subscription.Quantity
	if quantity <= 0 {
		quantity = 1
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
		)
		VALUES (
			$1, $2, $3, $4,
			$5, $6, $7, $8,
			$9, $10, $11, $12,
			$13, $14, $15, $16::jsonb
		)
		ON CONFLICT (stripe_subscription_id) DO UPDATE
			SET user_id              = EXCLUDED.user_id,
				product_id           = EXCLUDED.product_id,
				stripe_customer_id  = EXCLUDED.stripe_customer_id,
				stripe_price_id     = EXCLUDED.stripe_price_id,
				status              = EXCLUDED.status,
				quantity            = EXCLUDED.quantity,
				current_period_start = EXCLUDED.current_period_start,
				current_period_end   = EXCLUDED.current_period_end,
				trial_start          = EXCLUDED.trial_start,
				trial_end            = EXCLUDED.trial_end,
				cancel_at_period_end = EXCLUDED.cancel_at_period_end,
				cancel_at            = EXCLUDED.cancel_at,
				canceled_at          = EXCLUDED.canceled_at,
				ended_at             = EXCLUDED.ended_at,
				metadata             = EXCLUDED.metadata
	`, subscription.UserID, subscription.ProductID, subscription.StripeCustomerID, subscription.StripeSubscriptionID,
		subscription.StripePriceID, status, quantity, subscription.CurrentPeriodStart,
		subscription.CurrentPeriodEnd, subscription.TrialStart, subscription.TrialEnd, subscription.CancelAtPeriodEnd,
		subscription.CancelAt, subscription.CanceledAt, subscription.EndedAt, string(metadata))

	return err
}

func syncUserSubscriptionTier(ctx context.Context, db *sql.DB, userID string) error {
	_, err := db.ExecContext(ctx, `
        UPDATE users
        SET subscription_tier = COALESCE(
            (
                SELECT p.tier
                FROM subscriptions s
                JOIN products p ON p.id::text = s.product_id
                WHERE s.user_id = $1
                    AND s.status IN ('active', 'trialing', 'past_due')
                ORDER BY p.amount DESC
                LIMIT 1
            ),
            'free'
        ),
        updated_at = NOW()
        WHERE id = $1
    `, userID)
	return err
}

func verifyStripeWebhookSignature(body []byte, signatureHeader string) error {
	secret := strings.TrimSpace(os.Getenv("STRIPE_WEBHOOK_SECRET"))
	if secret == "" {
		if gin.Mode() == gin.ReleaseMode {
			return errors.New("STRIPE_WEBHOOK_SECRET is not configured")
		}
		log.Println("products: STRIPE_WEBHOOK_SECRET is not configured; skipping Stripe webhook signature verification in non-release mode")
		return nil
	}

	timestamp, signatures, err := parseStripeSignatureHeader(signatureHeader)
	if err != nil {
		return err
	}

	signedPayload := []byte(timestamp + "." + string(body))
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(signedPayload)
	expected := []byte(hex.EncodeToString(mac.Sum(nil)))

	for _, signature := range signatures {
		if hmac.Equal(expected, []byte(signature)) {
			return verifyStripeTimestamp(timestamp)
		}
	}

	return errors.New("no matching Stripe webhook signature")
}

func parseStripeSignatureHeader(header string) (string, []string, error) {
	if strings.TrimSpace(header) == "" {
		return "", nil, errors.New("missing Stripe-Signature header")
	}

	var timestamp string
	signatures := make([]string, 0)
	for _, part := range strings.Split(header, ",") {
		key, value, ok := strings.Cut(strings.TrimSpace(part), "=")
		if !ok {
			continue
		}
		switch key {
		case "t":
			timestamp = value
		case "v1":
			signatures = append(signatures, value)
		}
	}

	if timestamp == "" || len(signatures) == 0 {
		return "", nil, errors.New("Stripe-Signature header missing timestamp or v1 signature")
	}

	return timestamp, signatures, nil
}

func verifyStripeTimestamp(timestamp string) error {
	seconds, err := strconv.ParseInt(timestamp, 10, 64)
	if err != nil {
		return err
	}

	signedAt := time.Unix(seconds, 0)
	if time.Since(signedAt) > 5*time.Minute || time.Until(signedAt) > 5*time.Minute {
		return errors.New("Stripe webhook timestamp outside tolerance")
	}

	return nil
}

func normalizeSubscriptionStatus(status string) (string, error) {
	normalized := strings.ToLower(strings.TrimSpace(status))
	if normalized == "" {
		normalized = "incomplete"
	}

	switch normalized {
	case "incomplete", "incomplete_expired", "trialing", "active", "past_due", "canceled", "unpaid", "paused":
		return normalized, nil
	default:
		return "", fmt.Errorf("unsupported subscription status %q", status)
	}
}

func checkoutStatus(paymentStatus string) string {
	switch strings.ToLower(strings.TrimSpace(paymentStatus)) {
	case "paid", "no_payment_required":
		return "active"
	default:
		return "incomplete"
	}
}

func findProductIDByPrice(ctx context.Context, db *sql.DB, priceID string) (string, error) {
	var productID string
	err := db.QueryRowContext(ctx, `
		SELECT id::text
		FROM products
		WHERE stripe_price_id = $1 AND active = true
	`, priceID).Scan(&productID)

	return productID, err
}

func findUserIDByStripeCustomer(ctx context.Context, db *sql.DB, customerID string) (string, error) {
	if strings.TrimSpace(customerID) == "" {
		return "", errors.New("missing Stripe customer id")
	}

	var userID string
	err := db.QueryRowContext(ctx, `
		SELECT id::text
		FROM users
		WHERE stripe_customer_id = $1
	`, customerID).Scan(&userID)

	return userID, err
}

func findUserIDBySubscription(ctx context.Context, db *sql.DB, subscriptionID string) (string, error) {
	var userID string
	err := db.QueryRowContext(ctx, `
		SELECT user_id::text
		FROM subscriptions
		WHERE stripe_subscription_id = $1
	`, subscriptionID).Scan(&userID)

	return userID, err
}

func setUserStripeCustomerID(ctx context.Context, db *sql.DB, userID string, customerID string) error {
	if strings.TrimSpace(userID) == "" || strings.TrimSpace(customerID) == "" {
		return nil
	}

	_, err := db.ExecContext(ctx, `
		UPDATE users
		SET stripe_customer_id = $1
		WHERE id = $2
			AND (stripe_customer_id IS NULL OR stripe_customer_id = '')
	`, customerID, userID)

	return err
}

func stripeTimestamp(value int64) any {
	if value <= 0 {
		return nil
	}

	return time.Unix(value, 0).UTC()
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			return trimmed
		}
	}

	return ""
}

func copyMetadata(metadata map[string]string) map[string]string {
	copied := make(map[string]string, len(metadata))
	for key, value := range metadata {
		copied[key] = value
	}

	return copied
}

func (subscription stripeSubscriptionEvent) firstPriceID() string {
	if len(subscription.Items.Data) == 0 {
		return ""
	}

	return strings.TrimSpace(subscription.Items.Data[0].Price.ID)
}

func (subscription stripeSubscriptionEvent) quantity() int {
	if subscription.Quantity > 0 {
		return subscription.Quantity
	}

	return 1
}

func writeError(c *gin.Context, status int, message string) {
	c.JSON(status, gin.H{
		"detail": message,
		"error":  message,
	})
}

func publicError(message string, err error) string {
	if err == nil || gin.Mode() == gin.ReleaseMode {
		return message
	}

	return fmt.Sprintf("%s: %v", message, err)
}

func HandleCheckoutSuccess(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		sessionID := strings.TrimSpace(c.Query("session_id"))
		if sessionID == "" {
			writeError(c, http.StatusBadRequest, "Missing session_id")
			return
		}

		session, err := retrieveStripeCheckoutSession(sessionID)
		if err != nil {
			writeError(c, http.StatusInternalServerError, "Could not retrieve checkout session")
			return
		}

		if session.PaymentStatus != "paid" && session.PaymentStatus != "no_payment_required" {
			writeError(c, http.StatusPaymentRequired, "Payment not completed")
			return
		}

		userID, ok := c.Get("userID")
		if !ok {
			writeError(c, http.StatusUnauthorized, "Authentication required")
			return
		}
		userIDString := fmt.Sprint(userID)

		priceID := strings.TrimSpace(session.Metadata["stripe_price_id"])
		if priceID == "" {
			writeError(c, http.StatusInternalServerError, "Session missing price metadata")
			return
		}

		productID := strings.TrimSpace(session.Metadata["product_id"])
		if productID == "" {
			productID, err = findProductIDByPrice(c.Request.Context(), db, priceID)
			if err != nil {
				writeError(c, http.StatusInternalServerError, "Could not resolve product")
				return
			}
		}

		metadata := copyMetadata(session.Metadata)
		metadata["checkout_session_id"] = session.ID

		if err := upsertSubscription(c.Request.Context(), db, subscriptionUpsert{
			UserID:               userIDString,
			ProductID:            productID,
			StripeCustomerID:     session.Customer.String(),
			StripeSubscriptionID: session.Subscription.String(),
			StripePriceID:        priceID,
			Status:               "active",
			Quantity:             1,
			Metadata:             metadata,
		}); err != nil {
			writeError(c, http.StatusInternalServerError, "Could not record subscription")
			return
		}

		if err := syncUserSubscriptionTier(c.Request.Context(), db, userIDString); err != nil {
			writeError(c, http.StatusInternalServerError, "Could not update subscription tier")
			return
		}

		c.JSON(http.StatusOK, gin.H{"status": "active"})
	}
}

func retrieveStripeCheckoutSession(sessionID string) (*stripeCheckoutSessionEvent, error) {
	secret := strings.TrimSpace(os.Getenv("STRIPE_SECRET_KEY"))
	if secret == "" {
		return nil, errors.New("STRIPE_SECRET_KEY is not configured")
	}

	req, err := http.NewRequest(http.MethodGet, "https://api.stripe.com/v1/checkout/sessions/"+sessionID, nil)
	if err != nil {
		return nil, err
	}
	req.SetBasicAuth(secret, "")

	res, err := stripeHTTPClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()

	body, err := io.ReadAll(res.Body)
	if err != nil {
		return nil, err
	}

	if res.StatusCode != http.StatusOK {
		var stripeErr stripeErrorResponse
		if err := json.Unmarshal(body, &stripeErr); err == nil && stripeErr.Error.Message != "" {
			return nil, fmt.Errorf("stripe error: %s", stripeErr.Error.Message)
		}
		return nil, fmt.Errorf("stripe request failed with status %d", res.StatusCode)
	}

	var session stripeCheckoutSessionEvent
	if err := json.Unmarshal(body, &session); err != nil {
		return nil, err
	}

	return &session, nil
}
