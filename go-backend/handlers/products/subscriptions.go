package handlers

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/stripe/stripe-go/v85"
)

func reconcileCheckoutSession(ctx context.Context, db *sql.DB, session *stripe.CheckoutSession, expectedUserID string) error {
	if session == nil || session.Subscription == nil || session.Subscription.ID == "" {
		return errors.New("checkout session missing subscription id")
	}

	customerID := stripeCustomerID(session.Customer)
	ownerID := firstNonEmpty(session.ClientReferenceID, session.Metadata["user_id"])
	if expectedUserID != "" {
		if ownerID != "" && ownerID != expectedUserID {
			return errors.New("checkout session belongs to another user")
		}
		ownerID = expectedUserID
	}
	if ownerID == "" {
		var err error
		ownerID, err = findUserIDByStripeCustomer(ctx, db, customerID)
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
	if err := setUserStripeCustomerID(ctx, db, ownerID, customerID); err != nil {
		return err
	}
	if err := upsertSubscription(ctx, db, subscriptionRecord{
		UserID: ownerID, ProductID: productID, StripeCustomerID: customerID,
		StripeSubscriptionID: session.Subscription.ID, StripePriceID: priceID,
		Status: checkoutStatus(session.PaymentStatus), Quantity: 1, Metadata: metadata,
	}); err != nil {
		return err
	}
	return syncUserSubscriptionTier(ctx, db, ownerID)
}

func reconcileSubscription(ctx context.Context, db *sql.DB, eventType stripe.EventType, subscription *stripe.Subscription) error {
	if subscription == nil || subscription.ID == "" {
		return errors.New("subscription event missing id")
	}
	customerID := stripeCustomerID(subscription.Customer)
	userID := strings.TrimSpace(subscription.Metadata["user_id"])
	if userID == "" {
		var err error
		userID, err = findUserIDBySubscription(ctx, db, subscription.ID)
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

	item := firstSubscriptionItem(subscription)
	priceID := firstNonEmpty(subscription.Metadata["stripe_price_id"], subscriptionPriceID(item))
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

	status := string(subscription.Status)
	if eventType == stripe.EventTypeCustomerSubscriptionDeleted {
		status = "canceled"
	}
	if err := setUserStripeCustomerID(ctx, db, userID, customerID); err != nil {
		return err
	}
	if err := upsertSubscription(ctx, db, subscriptionRecord{
		UserID: userID, ProductID: productID, StripeCustomerID: customerID,
		StripeSubscriptionID: subscription.ID, StripePriceID: priceID, Status: status,
		Quantity: subscriptionQuantity(item), CurrentPeriodStart: stripeTimestamp(itemPeriodStart(item)),
		CurrentPeriodEnd: stripeTimestamp(itemPeriodEnd(item)), TrialStart: stripeTimestamp(subscription.TrialStart),
		TrialEnd: stripeTimestamp(subscription.TrialEnd), CancelAtPeriodEnd: subscription.CancelAtPeriodEnd,
		CancelAt: stripeTimestamp(subscription.CancelAt), CanceledAt: stripeTimestamp(subscription.CanceledAt),
		EndedAt: stripeTimestamp(subscription.EndedAt), Metadata: copyMetadata(subscription.Metadata),
	}); err != nil {
		return err
	}
	return syncUserSubscriptionTier(ctx, db, userID)
}

func firstSubscriptionItem(subscription *stripe.Subscription) *stripe.SubscriptionItem {
	if subscription.Items == nil || len(subscription.Items.Data) == 0 {
		return nil
	}
	return subscription.Items.Data[0]
}

func subscriptionPriceID(item *stripe.SubscriptionItem) string {
	if item == nil || item.Price == nil {
		return ""
	}
	return strings.TrimSpace(item.Price.ID)
}

func subscriptionQuantity(item *stripe.SubscriptionItem) int {
	if item != nil && item.Quantity > 0 {
		return int(item.Quantity)
	}
	return 1
}

func itemPeriodStart(item *stripe.SubscriptionItem) int64 {
	if item == nil {
		return 0
	}
	return item.CurrentPeriodStart
}

func itemPeriodEnd(item *stripe.SubscriptionItem) int64 {
	if item == nil {
		return 0
	}
	return item.CurrentPeriodEnd
}

func stripeCustomerID(customer *stripe.Customer) string {
	if customer == nil {
		return ""
	}
	return strings.TrimSpace(customer.ID)
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

func checkoutPaid(status stripe.CheckoutSessionPaymentStatus) bool {
	return status == stripe.CheckoutSessionPaymentStatusPaid || status == stripe.CheckoutSessionPaymentStatusNoPaymentRequired
}

func checkoutStatus(status stripe.CheckoutSessionPaymentStatus) string {
	if checkoutPaid(status) {
		return "active"
	}
	return "incomplete"
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
	copy := make(map[string]string, len(metadata))
	for key, value := range metadata {
		copy[key] = value
	}
	return copy
}
