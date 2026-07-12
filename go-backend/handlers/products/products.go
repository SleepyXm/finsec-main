package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/stripe/stripe-go/v85"
)

func GetSubscriptions(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		products, err := listProducts(c.Request.Context(), db)
		if err != nil {
			writeError(c, http.StatusInternalServerError, "Could not fetch subscription products")
			return
		}
		c.JSON(http.StatusOK, gin.H{"products": products})
	}
}

func CreateCheckoutSession(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var request checkoutRequest
		if err := c.ShouldBindJSON(&request); err != nil || strings.TrimSpace(request.PriceID) == "" {
			writeError(c, http.StatusBadRequest, "A valid price_id is required")
			return
		}

		product, err := findCheckoutProduct(c.Request.Context(), db, strings.TrimSpace(request.PriceID))
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
		if normalizeTier(c.GetString("subscriptionTier")) == normalizeTier(product.Tier) {
			writeError(c, http.StatusConflict, "You are already on this subscription tier")
			return
		}

		hasPrice, err := hasActiveSubscriptionForPrice(c.Request.Context(), db, userIDString, product.StripePriceID)
		if err != nil {
			writeError(c, http.StatusInternalServerError, "Could not validate current subscription")
			return
		}
		if hasPrice {
			writeError(c, http.StatusConflict, "You already have an active subscription for this product")
			return
		}

		customerID, err := getOrCreateStripeCustomer(c.Request.Context(), db, userIDString, c.GetString("email"))
		if err != nil {
			log.Printf("products: prepare Stripe customer user_id=%s: %v", userIDString, err)
			writeError(c, http.StatusInternalServerError, publicError("Could not prepare Stripe customer", err))
			return
		}
		session, err := createStripeCheckoutSession(userIDString, customerID, *product)
		if err != nil {
			log.Printf("products: create checkout user_id=%s price_id=%s: %v", userIDString, product.StripePriceID, err)
			writeError(c, http.StatusInternalServerError, publicError("Could not create checkout session", err))
			return
		}
		if session.URL == "" {
			writeError(c, http.StatusInternalServerError, "Stripe did not return a checkout URL")
			return
		}
		c.JSON(http.StatusOK, gin.H{"session_id": session.ID, "url": session.URL})
	}
}

func HandleStripeWebhook(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		body, err := io.ReadAll(c.Request.Body)
		if err != nil {
			writeError(c, http.StatusBadRequest, "Could not read webhook body")
			return
		}
		event, err := constructStripeEvent(body, c.GetHeader("Stripe-Signature"))
		if err != nil {
			log.Printf("products: rejected Stripe webhook: %v", err)
			writeError(c, http.StatusBadRequest, "Invalid Stripe webhook signature")
			return
		}

		switch event.Type {
		case stripe.EventTypeCheckoutSessionCompleted:
			var session stripe.CheckoutSession
			err = json.Unmarshal(event.Data.Raw, &session)
			if err == nil {
				err = reconcileCheckoutSession(c.Request.Context(), db, &session, "")
			}
		case stripe.EventTypeCustomerSubscriptionCreated,
			stripe.EventTypeCustomerSubscriptionUpdated,
			stripe.EventTypeCustomerSubscriptionDeleted:
			var subscription stripe.Subscription
			err = json.Unmarshal(event.Data.Raw, &subscription)
			if err == nil {
				err = reconcileSubscription(c.Request.Context(), db, event.Type, &subscription)
			}
		}

		if err != nil {
			log.Printf("products: Stripe event_id=%s event_type=%s: %v", event.ID, event.Type, err)
			writeError(c, http.StatusInternalServerError, "Could not process Stripe webhook")
			return
		}
		c.JSON(http.StatusOK, gin.H{"received": true})
	}
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
		if !checkoutPaid(session.PaymentStatus) {
			writeError(c, http.StatusPaymentRequired, "Payment not completed")
			return
		}
		userID, ok := c.Get("userID")
		if !ok {
			writeError(c, http.StatusUnauthorized, "Authentication required")
			return
		}
		if err := reconcileCheckoutSession(c.Request.Context(), db, session, fmt.Sprint(userID)); err != nil {
			log.Printf("products: confirm checkout session_id=%s: %v", sessionID, err)
			writeError(c, http.StatusInternalServerError, "Could not record subscription")
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": "active"})
	}
}

func writeError(c *gin.Context, status int, message string) {
	c.JSON(status, gin.H{"detail": message, "error": message})
}

func publicError(message string, err error) string {
	if err == nil || gin.Mode() == gin.ReleaseMode {
		return message
	}
	return fmt.Sprintf("%s: %v", message, err)
}
