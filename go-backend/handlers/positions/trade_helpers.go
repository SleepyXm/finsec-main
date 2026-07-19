package positions

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"strings"

	"finsec-backend/market"
	"finsec-backend/services"
	"finsec-backend/structs"

	"github.com/google/uuid"
)

const (
	maxTradeMessageBytes = 8 << 10
	maxTradeQuantity     = 1_000_000
	maxTradePrice        = 1_000_000_000_000
)

func decodeTradeAction(raw []byte) (structs.TradeAction, error) {
	var request structs.TradeAction
	if len(raw) > maxTradeMessageBytes {
		return request, fmt.Errorf("trade request is too large")
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&request); err != nil {
		return request, fmt.Errorf("invalid trade request")
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		return request, fmt.Errorf("invalid trade request")
	}

	ticker, err := market.NormalizeTicker(request.Ticker)
	if err != nil {
		return request, err
	}
	request.Ticker = ticker
	request.Action = normalizeAction(request.Action)
	if request.Action == "" {
		return request, fmt.Errorf("action must be buy or sell")
	}
	if !validPositiveNumber(request.Price, maxTradePrice) {
		return request, fmt.Errorf("price must be a positive finite number")
	}
	if !validPositiveNumber(request.Quantity, maxTradeQuantity) {
		return request, fmt.Errorf("quantity must be between 0 and %d", maxTradeQuantity)
	}
	return request, nil
}

func normalizeAction(action string) string {
	switch strings.ToLower(strings.TrimSpace(action)) {
	case "buy":
		return "buy"
	case "sell":
		return "sell"
	default:
		return ""
	}
}

func validPositiveNumber(value, maximum float64) bool {
	return !math.IsNaN(value) && !math.IsInf(value, 0) && value > 0 && value <= maximum
}

func validateTradeID(value string) error {
	if _, err := uuid.Parse(value); err != nil {
		return fmt.Errorf("invalid trade id")
	}
	return nil
}

func positionSide(action string) string {
	if action == "buy" {
		return "long"
	}
	return "short"
}

func roundMoney(value float64) float64 {
	return math.Round(value*100) / 100
}

func writeTradeSocketError(conn *services.WSConn, message string) {
	payload, _ := json.Marshal(services.QueueConfirm{Status: "error", Error: message})
	_ = conn.Write(payload)
}

func nullableFloat(raw json.RawMessage) (any, error) {
	var value *float64
	if err := json.Unmarshal(raw, &value); err != nil {
		return nil, err
	}
	if value == nil {
		return nil, nil
	}
	if !validPositiveNumber(*value, maxTradePrice) {
		return nil, fmt.Errorf("must be a positive finite number or null")
	}
	return *value, nil
}

func nullableFloatValue(value sql.NullFloat64) any {
	if !value.Valid {
		return nil
	}
	return value.Float64
}

func updateAccountStats(ctx context.Context, tx *sql.Tx, accountID string, pnl float64) error {
	isWin, isLoss := 0, 0
	if pnl > 0 {
		isWin = 1
	} else if pnl < 0 {
		isLoss = 1
	}

	_, err := tx.ExecContext(ctx, `
		UPDATE user_accounts SET
			net_pnl = net_pnl + $1,
			trade_count = trade_count + 1,
			wins = wins + $2,
			losses = losses + $3,
			best_trade = GREATEST(best_trade, $1),
			worst_trade = LEAST(worst_trade, $1)
		WHERE id = $4
	`, pnl, isWin, isLoss, accountID)
	return err
}
