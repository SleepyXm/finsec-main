package annotations

import "math"

var annotationKinds = map[string]bool{"candle_group": true, "zone": true, "level": true, "marker": true}
var annotationRoles = map[string]bool{"structure": true, "entry": true, "exit": true, "stop_loss": true, "take_profit": true}
var annotationImportance = map[string]bool{"required": true, "preferred": true, "informational": true}
var annotationTriggers = map[string]bool{
	"presence": true, "touch": true, "cross": true, "close_above": true, "close_below": true, "rejection": true,
}
var priceAnchors = map[string]bool{"open": true, "high": true, "low": true, "close": true}

func validStrategyAnnotations(items []strategyAnnotation) bool {
	for _, item := range items {
		if item.ID == "" || item.ConceptID == "" || item.Label == "" || !annotationKinds[item.Kind] ||
			!annotationRoles[item.Role] || !annotationImportance[item.Importance] || !annotationTriggers[item.Trigger] {
			return false
		}
		if item.Kind == "marker" {
			if item.Price == nil || item.CandleIndex == nil || *item.CandleIndex < 0 || !priceAnchors[item.PriceAnchor] {
				return false
			}
			continue
		}
		if !validAnnotationRange(item) || item.Kind == "zone" && (item.PriceHigh == nil || item.PriceLow == nil) ||
			item.Kind == "level" && item.Price == nil {
			return false
		}
	}
	return true
}

func validAnnotationRange(item strategyAnnotation) bool {
	if item.StartIndex != nil || item.EndIndex != nil {
		return item.StartIndex != nil && item.EndIndex != nil && *item.StartIndex >= 0 && *item.EndIndex >= *item.StartIndex
	}
	if item.Kind == "candle_group" {
		return len(item.Candles) > 0 && validCandles(item.Candles)
	}
	return item.StartRatio != nil && item.EndRatio != nil && !math.IsNaN(*item.StartRatio) && !math.IsNaN(*item.EndRatio) &&
		*item.StartRatio >= 0 && *item.StartRatio <= 1 && *item.EndRatio >= *item.StartRatio && *item.EndRatio <= 1
}
