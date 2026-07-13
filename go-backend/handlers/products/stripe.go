package handlers

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"os"
	"strings"

	"finsec-backend/utils"

	"github.com/gin-gonic/gin"
	"github.com/stripe/stripe-go/v85"
	"github.com/stripe/stripe-go/v85/checkout/session"
	"github.com/stripe/stripe-go/v85/customer"
	"github.com/stripe/stripe-go/v85/webhook"
)

func configureStripe() error {
	stripe.Key = strings.TrimSpace(os.Getenv("STRIPE_SECRET_KEY"))
	if stripe.Key == "" {
		return errors.New("STRIPE_SECRET_KEY is not configured")
	}
	return nil
}

func getOrCreateStripeCustomer(ctx context.Context, db *sql.DB, userID, email string) (string, error) {
	var existing sql.NullString
	if err := db.QueryRowContext(ctx, `
		SELECT stripe_customer_id FROM users WHERE id = $1
	`, userID).Scan(&existing); err != nil {
		return "", err
	}
	if existing.Valid && strings.TrimSpace(existing.String) != "" {
		return existing.String, nil
	}
	if err := configureStripe(); err != nil {
		return "", err
	}

	params := &stripe.CustomerParams{}
	if strings.TrimSpace(email) != "" {
		params.Email = stripe.String(email)
	}
	params.AddMetadata("user_id", userID)
	created, err := customer.New(params)
	if err != nil {
		return "", err
	}
	if created.ID == "" {
		return "", errors.New("Stripe customer response missing id")
	}
	_, err = db.ExecContext(ctx, `
		UPDATE users SET stripe_customer_id = $1 WHERE id = $2
	`, created.ID, userID)
	return created.ID, err
}

func createStripeCheckoutSession(userID, customerID string, product checkoutProduct) (*stripe.CheckoutSession, error) {
	if err := configureStripe(); err != nil {
		return nil, err
	}
	metadata := map[string]string{
		"user_id": userID, "product_id": product.ProductID,
		"product_name": product.ProductName, "stripe_price_id": product.StripePriceID,
	}
	return session.New(&stripe.CheckoutSessionParams{
		Mode:                stripe.String("subscription"),
		Customer:            stripe.String(customerID),
		ClientReferenceID:   stripe.String(userID),
		SuccessURL:          stripe.String(checkoutRedirectURL("CHECKOUT_SUCCESS_URL", "STRIPE_SUCCESS_URL", "/checkout/success?session_id={CHECKOUT_SESSION_ID}")),
		CancelURL:           stripe.String(checkoutRedirectURL("CHECKOUT_CANCEL_URL", "STRIPE_CANCEL_URL", "/products?checkout=cancelled")),
		AllowPromotionCodes: stripe.Bool(true),
		LineItems: []*stripe.CheckoutSessionLineItemParams{{
			Price: stripe.String(product.StripePriceID), Quantity: stripe.Int64(1),
		}},
		Metadata:         metadata,
		SubscriptionData: &stripe.CheckoutSessionSubscriptionDataParams{Metadata: metadata},
	})
}

func retrieveStripeCheckoutSession(sessionID string) (*stripe.CheckoutSession, error) {
	if err := configureStripe(); err != nil {
		return nil, err
	}
	return session.Get(sessionID, nil)
}

func constructStripeEvent(body []byte, signature string) (stripe.Event, error) {
	secret := strings.TrimSpace(os.Getenv("STRIPE_WEBHOOK_SECRET"))
	if secret != "" {
		return webhook.ConstructEventWithOptions(body, signature, secret, webhook.ConstructEventOptions{
			IgnoreAPIVersionMismatch: true,
		})
	}
	if gin.Mode() == gin.ReleaseMode {
		return stripe.Event{}, errors.New("STRIPE_WEBHOOK_SECRET is not configured")
	}
	var event stripe.Event
	return event, json.Unmarshal(body, &event)
}

func checkoutRedirectURL(primaryEnv, secondaryEnv, fallbackPath string) string {
	for _, name := range []string{primaryEnv, secondaryEnv} {
		if value := strings.TrimSpace(os.Getenv(name)); value != "" {
			return value
		}
	}
	base := strings.TrimRight(utils.Cfg.DevServer, "/")
	if base == "" {
		base = "http://localhost:3000"
	}
	return base + fallbackPath
}
