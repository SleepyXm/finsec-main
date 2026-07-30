package market

import (
	"strings"
	"testing"
)

func TestNormalizeTicker(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
		valid    bool
	}{
		{name: "trims and uppercases", input: " nq=f ", expected: "NQ=F", valid: true},
		{name: "index", input: "^ftse", expected: "^FTSE", valid: true},
		{name: "crypto pair", input: "btc-usd", expected: "BTC-USD", valid: true},
		{name: "empty", input: "   ", valid: false},
		{name: "path separator", input: "../AAPL", valid: false},
		{name: "slash", input: "BTC/USD", valid: false},
		{name: "too long", input: strings.Repeat("A", MaxTickerLength+1), valid: false},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			actual, err := NormalizeTicker(test.input)
			if test.valid && err != nil {
				t.Fatalf("NormalizeTicker(%q) returned %v", test.input, err)
			}
			if !test.valid && err == nil {
				t.Fatalf("NormalizeTicker(%q) unexpectedly returned %q", test.input, actual)
			}
			if actual != test.expected {
				t.Fatalf("NormalizeTicker(%q) = %q, expected %q", test.input, actual, test.expected)
			}
		})
	}
}

func TestNormalizeInterval(t *testing.T) {
	for _, input := range []string{"1m", "5m", "15m", "30m", "1h", "1d"} {
		actual, err := NormalizeInterval(" " + strings.ToUpper(input) + " ")
		if err != nil || actual != input {
			t.Fatalf("NormalizeInterval(%q) = %q, %v", input, actual, err)
		}
	}
	for _, input := range []string{"", "4h", "1wk", "1m/../../"} {
		if actual, err := NormalizeInterval(input); err == nil {
			t.Fatalf("NormalizeInterval(%q) unexpectedly returned %q", input, actual)
		}
	}
}

func TestNormalizeProvider(t *testing.T) {
	actual, err := NormalizeProvider(" Finsec ")
	if err != nil || actual != "finsec" {
		t.Fatalf("NormalizeProvider returned %q, %v", actual, err)
	}
	if actual, err := NormalizeProvider("other"); err == nil {
		t.Fatalf("NormalizeProvider unexpectedly returned %q", actual)
	}
}
