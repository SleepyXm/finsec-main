package services

import (
	"context"
	"database/sql"
	"strings"
	"testing"
)

type fakeLimitOrderStore struct {
	query string
	args  []any
}

func (store *fakeLimitOrderStore) ExecContext(_ context.Context, query string, args ...any) (sql.Result, error) {
	store.query = query
	store.args = args
	return fakeLimitOrderResult(1), nil
}

type fakeLimitOrderResult int64

func (result fakeLimitOrderResult) LastInsertId() (int64, error) {
	return 0, nil
}

func (result fakeLimitOrderResult) RowsAffected() (int64, error) {
	return int64(result), nil
}

func TestBuildQueueConfirmsPreservesOrderState(t *testing.T) {
	results := []bulkInsertResult{
		{
			entry: QueueEntry{
				TradeID: "market-id", Ticker: "AAPL", Action: "buy",
				OrderType: "market", Quantity: 2, Price: 100,
			},
			tradeID: "market-id",
		},
		{
			entry: QueueEntry{
				TradeID: "limit-id", Ticker: "AAPL", Action: "sell",
				OrderType: "limit", Quantity: 3, Price: 125,
			},
			tradeID: "limit-id",
		},
	}

	confirms, err := buildQueueConfirms(results)
	if err != nil {
		t.Fatal(err)
	}
	if confirms[0].Status != "open" || confirms[0].EntryPrice == nil || *confirms[0].EntryPrice != 100 {
		t.Fatalf("market confirmation = %#v", confirms[0])
	}
	if confirms[1].Status != "pending" || confirms[1].EntryPrice != nil || confirms[1].Price != 125 {
		t.Fatalf("limit confirmation = %#v", confirms[1])
	}
}

func TestFillPendingLimitOrdersUsesAskForBuysAndBidForSells(t *testing.T) {
	store := &fakeLimitOrderStore{}
	err := fillPendingLimitOrders(context.Background(), store, limitPriceTick{
		Ticker: "AAPL", Close: 124, BuyPrice: 124.05,
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(store.args) != 3 || store.args[0] != "AAPL" || store.args[1] != 124.05 || store.args[2] != 124.0 {
		t.Fatalf("fill arguments = %#v", store.args)
	}
	if !strings.Contains(store.query, "side = 'buy' AND price >= $2") ||
		!strings.Contains(store.query, "side = 'sell' AND price <= $3") {
		t.Fatalf("fill query does not preserve limit semantics: %s", store.query)
	}
}
