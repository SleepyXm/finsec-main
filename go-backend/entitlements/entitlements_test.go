package entitlements

import "testing"

func TestLimitsFor(t *testing.T) {
	tests := []struct {
		tier                              Tier
		strategies, indicators, backtests int
	}{
		{Free, 3, 5, 3},
		{Premium, 10, 25, 10},
		{Professional, 20, 100, 50},
		{Enterprise, -1, -1, -1},
	}

	for _, test := range tests {
		limits := LimitsFor(test.tier)
		if limitValue(limits.SavedStrategies) != test.strategies ||
			limitValue(limits.SavedIndicators) != test.indicators ||
			limitValue(limits.ActiveBacktests) != test.backtests {
			t.Fatalf("unexpected limits for %s: %+v", test.tier, limits)
		}
	}
}

func limitValue(limit *int) int {
	if limit == nil {
		return -1
	}
	return *limit
}

func TestNormalizeUnknownTier(t *testing.T) {
	if tier := Normalize("unknown"); tier != Free {
		t.Fatalf("expected unknown tier to normalize to free, got %s", tier)
	}
}
