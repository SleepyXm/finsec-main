package market

import (
	"fmt"
	"strings"
)

const MaxTickerLength = 24
const FinsecProvider = "finsec"

var intervals = map[string]struct{}{
	"1m": {}, "5m": {}, "15m": {}, "30m": {}, "1h": {}, "1d": {},
}

func NormalizeProvider(value string) (string, error) {
	provider := strings.ToLower(strings.TrimSpace(value))
	if provider != FinsecProvider {
		return "", fmt.Errorf("unsupported provider")
	}
	return provider, nil
}

func NormalizeTicker(value string) (string, error) {
	ticker := strings.ToUpper(strings.TrimSpace(value))
	if ticker == "" || len(ticker) > MaxTickerLength {
		return "", fmt.Errorf("ticker must be between 1 and %d characters", MaxTickerLength)
	}
	for _, char := range ticker {
		if (char >= 'A' && char <= 'Z') || (char >= '0' && char <= '9') || strings.ContainsRune(".^=_-", char) {
			continue
		}
		return "", fmt.Errorf("ticker contains unsupported characters")
	}
	return ticker, nil
}

func NormalizeInterval(value string) (string, error) {
	interval := strings.ToLower(strings.TrimSpace(value))
	if _, ok := intervals[interval]; !ok {
		return "", fmt.Errorf("unsupported interval")
	}
	return interval, nil
}
