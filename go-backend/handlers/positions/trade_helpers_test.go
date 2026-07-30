package positions

import (
	"strings"
	"testing"
)

func TestDecodeTradeActionNormalizesInput(t *testing.T) {
	request, err := decodeTradeAction([]byte(`{"ticker":" nq=f ","action":" BUY ","price":20000.5,"quantity":2}`))
	if err != nil {
		t.Fatal(err)
	}
	if request.Ticker != "NQ=F" || request.Action != "buy" {
		t.Fatalf("request was not normalized: %#v", request)
	}
	if request.OrderType != "market" {
		t.Fatalf("default order type = %q, expected market", request.OrderType)
	}
}

func TestDecodeTradeActionAcceptsLimitOrder(t *testing.T) {
	request, err := decodeTradeAction([]byte(`{"ticker":"AAPL","action":"sell","order_type":"limit","price":250,"quantity":3}`))
	if err != nil {
		t.Fatal(err)
	}
	if request.OrderType != "limit" || request.Price != 250 {
		t.Fatalf("limit order was not preserved: %#v", request)
	}
}

func TestDecodeTradeActionRejectsMalformedInput(t *testing.T) {
	tests := []string{
		`{"ticker":"NQ=F","action":"hold","price":1,"quantity":1}`,
		`{"ticker":"NQ=F","action":"buy","price":0,"quantity":1}`,
		`{"ticker":"NQ=F","action":"buy","price":1,"quantity":1000001}`,
		`{"ticker":"NQ=F","action":"buy","price":1,"quantity":1,"admin":true}`,
		`{"ticker":"NQ=F","action":"buy","order_type":"stop","price":1,"quantity":1}`,
		`{"ticker":"../NQ","action":"buy","price":1,"quantity":1}`,
		`{"ticker":"NQ=F","action":"buy","price":1,"quantity":1}{}`,
		strings.Repeat("x", maxTradeMessageBytes+1),
	}
	for _, raw := range tests {
		if request, err := decodeTradeAction([]byte(raw)); err == nil {
			t.Fatalf("unexpectedly accepted %#v", request)
		}
	}
}

func TestMoneyAndSideHelpers(t *testing.T) {
	if positionSide("buy") != "long" || positionSide("sell") != "short" {
		t.Fatal("trade side mapping changed")
	}
	if actual := roundMoney(1.0051); actual != 1.01 {
		t.Fatalf("roundMoney = %v", actual)
	}
	if validPositiveNumber(0, maxTradePrice) || validPositiveNumber(maxTradePrice+1, maxTradePrice) {
		t.Fatal("out-of-range number was accepted")
	}
}
