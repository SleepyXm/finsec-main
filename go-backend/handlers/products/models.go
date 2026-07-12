package handlers

// Product is the exact product shape consumed by app/products/products.tsx.
type Product struct {
	ProductID       string  `json:"product_id"`
	StripePriceID   string  `json:"stripe_price_id"`
	ProductName     string  `json:"product_name"`
	Description     string  `json:"description"`
	Tier            string  `json:"tier"`
	Amount          int     `json:"amount"`
	Price           float64 `json:"price"`
	Currency        string  `json:"currency"`
	BillingInterval string  `json:"billing_interval"`
	IntervalCount   int     `json:"interval_count"`
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

type subscriptionRecord struct {
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
