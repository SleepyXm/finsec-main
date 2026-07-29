package annotations

import (
	"os"
	"path/filepath"
	"testing"
)

func TestFinsecMarketplaceDiscovery(t *testing.T) {
	root := t.TempDir()
	t.Setenv("FINSEC_REPOSITORY_DIR", root)
	annotations := filepath.Join(root, "finsec-annotations")
	if err := os.MkdirAll(annotations, 0750); err != nil {
		t.Fatal(err)
	}

	path := filepath.Join(annotations, "bullish_fvg.csv")
	if err := writeRows(path, [][]string{
		{"symbol", "label", "timeStart", "timeEnd", "candle_count", "annotatedAt", "candles"},
		{"AAPL", "bullish_fvg", "1", "2", "2", "2026-01-01T00:00:00Z", `[{"open":0,"high":1,"low":0,"close":1},{"open":1,"high":2,"low":1,"close":2}]`},
	}); err != nil {
		t.Fatal(err)
	}

	items, err := listFinsecMarketplace()
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 {
		t.Fatalf("found %d Finsec strategies, expected 1", len(items))
	}
	if items[0].ID != "finsec:bullish_fvg" || items[0].Title != "Bullish FVG" {
		t.Fatalf("unexpected Finsec strategy: %#v", items[0])
	}
	if !items[0].Official || items[0].SnapshotCount != 1 {
		t.Fatalf("Finsec strategy metadata was not populated: %#v", items[0])
	}
}

func TestFinsecMarketplaceRejectsInvalidID(t *testing.T) {
	if _, _, err := finsecMarketplaceStrategy("finsec:../../private"); !os.IsNotExist(err) {
		t.Fatalf("invalid Finsec strategy ID returned %v", err)
	}
}
