package backtest

import (
	"encoding/json"
	"math"
	"testing"
	"time"

	"finsec-backend/structs"
)

func validBacktestRequest() structs.BacktestRequest {
	today := time.Now().UTC().Format("2006-01-02")
	return structs.BacktestRequest{
		Ticker: " nq=f ", Interval: " 1H ",
		DateFrom: "2024-01-01", DateTo: today,
	}
}

func TestNormalizeBacktestRequest(t *testing.T) {
	request := validBacktestRequest()
	if err := normalizeBacktestRequest(&request); err != nil {
		t.Fatal(err)
	}
	if request.Ticker != "NQ=F" || request.Interval != "1h" || request.StartingBalance != defaultStartingBalance {
		t.Fatalf("request was not normalized: %#v", request)
	}
}

func TestNormalizeBacktestRequestRejectsInvalidValues(t *testing.T) {
	tomorrow := time.Now().UTC().AddDate(0, 0, 1).Format("2006-01-02")
	tests := []struct {
		name   string
		mutate func(*structs.BacktestRequest)
	}{
		{name: "bad ticker", mutate: func(r *structs.BacktestRequest) { r.Ticker = "../NQ" }},
		{name: "bad interval", mutate: func(r *structs.BacktestRequest) { r.Interval = "4h" }},
		{name: "reverse dates", mutate: func(r *structs.BacktestRequest) { r.DateFrom = "2025-01-02"; r.DateTo = "2025-01-01" }},
		{name: "future date", mutate: func(r *structs.BacktestRequest) { r.DateTo = tomorrow }},
		{name: "negative balance", mutate: func(r *structs.BacktestRequest) { r.StartingBalance = -1 }},
		{name: "infinite balance", mutate: func(r *structs.BacktestRequest) { r.StartingBalance = math.Inf(1) }},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			request := validBacktestRequest()
			test.mutate(&request)
			if err := normalizeBacktestRequest(&request); err == nil {
				t.Fatal("expected validation error")
			}
		})
	}
}

func TestValidateBacktestPositions(t *testing.T) {
	valid := json.RawMessage(`[{"trade_id":"one","symbol":"NQ=F","side":"long","quantity":1,"entry_price":20000,"entry_candle":2,"exit_price":null,"exit_candle":null,"status":"open"}]`)
	if err := validateBacktestPositions(valid, 5); err != nil {
		t.Fatal(err)
	}

	invalid := json.RawMessage(`[{"trade_id":"one","symbol":"NQ=F","side":"sideways","quantity":1,"entry_price":20000,"entry_candle":2,"status":"open"}]`)
	if err := validateBacktestPositions(invalid, 5); err == nil {
		t.Fatal("expected invalid position to be rejected")
	}
}
