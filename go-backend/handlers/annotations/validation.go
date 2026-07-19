package annotations

func validStrategyAnnotations(items []strategyAnnotation) bool {
	kinds := map[string]bool{"candle_group": true, "zone": true, "level": true, "marker": true}
	roles := map[string]bool{"structure": true, "entry": true, "exit": true, "stop_loss": true, "take_profit": true}
	importance := map[string]bool{"required": true, "preferred": true, "informational": true}
	triggers := map[string]bool{"presence": true, "touch": true, "cross": true, "close_above": true, "close_below": true, "rejection": true}
	anchors := map[string]bool{"open": true, "high": true, "low": true, "close": true}

	for _, item := range items {
		if item.ID == "" || item.ConceptID == "" || item.Label == "" || !kinds[item.Kind] || !roles[item.Role] ||
			!importance[item.Importance] || !triggers[item.Trigger] || item.StartRatio < 0 || item.StartRatio > 1 || item.EndRatio < 0 || item.EndRatio > 1 {
			return false
		}
		if (item.Kind == "candle_group" || item.Kind == "zone") && (item.PriceHigh == nil || item.PriceLow == nil) {
			return false
		}
		if (item.Kind == "level" || item.Kind == "marker") && item.Price == nil {
			return false
		}
		if item.Kind == "marker" && (item.CandleIndex == nil || *item.CandleIndex < 0 || !anchors[item.PriceAnchor]) {
			return false
		}
	}
	return true
}
