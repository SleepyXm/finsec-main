package annotations

import (
	"path/filepath"
	"testing"
	"time"
)

func TestCanonicalLabel(t *testing.T) {
	tests := map[string]string{
		"Fair Value Gap":   "fvg",
		"order-block":      "order_block",
		"Head & Shoulders": "head_shoulders",
	}
	for input, expected := range tests {
		if actual := canonicalLabel(input); actual != expected {
			t.Fatalf("canonicalLabel(%q) = %q, expected %q", input, actual, expected)
		}
	}
}

func TestFirstSnapshotRemainsPreviewAfterAppend(t *testing.T) {
	path := filepath.Join(t.TempDir(), "strategy.csv")
	first := payload{
		Symbol: "NQ=F", Label: "entry", TimeStart: 100, TimeEnd: 200,
		Candles: []candle{
			{Open: 0, High: 1, Low: -1, Close: 0.5},
			{Open: 0.5, High: 2, Low: 0, Close: 1},
		},
	}
	second := payload{
		Symbol: "ES=F", Label: "entry", TimeStart: 300, TimeEnd: 400,
		Candles: []candle{
			{Open: 0, High: 3, Low: -2, Close: 2},
			{Open: 2, High: 4, Low: 1, Close: 3},
		},
	}
	firstTime := time.Date(2026, 7, 16, 1, 0, 0, 0, time.UTC)
	if err := appendAnnotation(path, first, firstTime); err != nil {
		t.Fatal(err)
	}
	if err := appendAnnotation(path, second, firstTime.Add(time.Hour)); err != nil {
		t.Fatal(err)
	}

	preview, count, err := readFirstSnapshot(path)
	if err != nil {
		t.Fatal(err)
	}
	if count != 2 {
		t.Fatalf("snapshot count = %d, expected 2", count)
	}
	if preview.Symbol != first.Symbol || preview.AnnotatedAt != firstTime.Format(time.RFC3339Nano) {
		t.Fatalf("preview changed after append: %#v", preview)
	}
	if len(preview.Candles) != 2 || preview.Candles[0].Time != 100 || preview.Candles[1].Time != 200 {
		t.Fatalf("preview candles were not reconstructed: %#v", preview.Candles)
	}

	snapshots, err := readSnapshots(path)
	if err != nil {
		t.Fatal(err)
	}
	if len(snapshots) != 2 {
		t.Fatalf("snapshot length = %d, expected 2", len(snapshots))
	}
	if snapshots[0].Symbol != first.Symbol || snapshots[1].Symbol != second.Symbol {
		t.Fatalf("snapshot order changed: %#v", snapshots)
	}
	if snapshots[1].Candles[0].Time != 300 || snapshots[1].Candles[1].Time != 400 {
		t.Fatalf("second snapshot candles were not reconstructed: %#v", snapshots[1].Candles)
	}

	remaining, err := deleteSnapshot(path, 0)
	if err != nil {
		t.Fatal(err)
	}
	if remaining != 1 {
		t.Fatalf("remaining snapshot count = %d, expected 1", remaining)
	}
	snapshots, err = readSnapshots(path)
	if err != nil {
		t.Fatal(err)
	}
	if len(snapshots) != 1 || snapshots[0].Symbol != second.Symbol {
		t.Fatalf("wrong snapshot remained after deletion: %#v", snapshots)
	}
	if _, err := deleteSnapshot(path, 1); err != errSnapshotNotFound {
		t.Fatalf("out-of-range deletion error = %v, expected %v", err, errSnapshotNotFound)
	}
}
