package handlers

type point struct {
	Date       string  `json:"date"`
	DailyPnl   float64 `json:"daily_pnl"`
	Cumulative float64 `json:"cumulative"`
}
