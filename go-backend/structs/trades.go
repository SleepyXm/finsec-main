package structs

type TradeAction struct {
	Ticker    string  `json:"ticker"`
	Action    string  `json:"action"`
	Price     float64 `json:"price"`    // was json:"float" — wrong tag
	Quantity  float64 `json:"quantity"` // same
	SessionID *string `json:"session_id,omitempty"`
}

type CloseTradeRequest struct {
	ExitPrice   float64 `json:"exit_price"`
	RealisedPnl float64 `json:"realised_pnl"`
	SessionID   *string `json:"session_id,omitempty"`
}
