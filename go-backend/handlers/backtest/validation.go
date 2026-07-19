package backtest

import (
	"encoding/json"
	"fmt"
	"math"
	"time"

	"finsec-backend/market"
	"finsec-backend/structs"
)

const (
	defaultStartingBalance = 100_000
	maxStartingBalance     = 1_000_000_000_000
	maxBacktestCandles     = 100_000
)

func normalizeBacktestRequest(request *structs.BacktestRequest) error {
	ticker, err := market.NormalizeTicker(request.Ticker)
	if err != nil {
		return err
	}
	interval, err := market.NormalizeInterval(request.Interval)
	if err != nil {
		return err
	}
	dateFrom, err := time.Parse("2006-01-02", request.DateFrom)
	if err != nil {
		return fmt.Errorf("date_from must use YYYY-MM-DD")
	}
	dateTo, err := time.Parse("2006-01-02", request.DateTo)
	if err != nil {
		return fmt.Errorf("date_to must use YYYY-MM-DD")
	}
	if dateFrom.After(dateTo) {
		return fmt.Errorf("date_from must be on or before date_to")
	}
	today := time.Now().UTC().Truncate(24 * time.Hour)
	if dateTo.After(today) {
		return fmt.Errorf("date_to cannot be in the future")
	}
	if request.StartingBalance == 0 {
		request.StartingBalance = defaultStartingBalance
	}
	if math.IsNaN(request.StartingBalance) || math.IsInf(request.StartingBalance, 0) ||
		request.StartingBalance < 1 || request.StartingBalance > maxStartingBalance {
		return fmt.Errorf("starting_balance must be between 1 and %.0f", float64(maxStartingBalance))
	}

	request.Ticker = ticker
	request.Interval = interval
	request.DateFrom = dateFrom.Format("2006-01-02")
	request.DateTo = dateTo.Format("2006-01-02")
	return nil
}

func validateBacktestPositions(raw json.RawMessage, currentCandle int) error {
	var positions []backtestPosition
	if err := json.Unmarshal(raw, &positions); err != nil {
		return fmt.Errorf("positions must be an array")
	}
	if len(positions) > 1_000 {
		return fmt.Errorf("too many backtest positions")
	}
	for _, position := range positions {
		if position.TradeID == "" || position.Symbol == "" ||
			(position.Side != "long" && position.Side != "short") ||
			(position.Status != "open" && position.Status != "closed") ||
			position.EntryCandle < 0 || position.EntryCandle > currentCandle ||
			!validSnapshotNumber(position.Quantity) || !validSnapshotNumber(position.EntryPrice) {
			return fmt.Errorf("positions contain invalid values")
		}
		if position.ExitCandle != nil && (*position.ExitCandle < position.EntryCandle || *position.ExitCandle > currentCandle) {
			return fmt.Errorf("positions contain invalid exit candles")
		}
		if position.ExitPrice != nil && !validSnapshotNumber(*position.ExitPrice) {
			return fmt.Errorf("positions contain invalid exit prices")
		}
	}
	return nil
}

func validSnapshotNumber(value float64) bool {
	return !math.IsNaN(value) && !math.IsInf(value, 0) && value > 0 && value <= maxStartingBalance
}
