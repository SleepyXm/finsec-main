package services

import (
	"testing"
	"time"
)

func TestTradeFlushConfiguration(t *testing.T) {
	if flushEvery != 75*time.Millisecond {
		t.Fatalf("flush interval = %s, want 75ms", flushEvery)
	}
	if maxBatchSize != 1000 {
		t.Fatalf("max batch size = %d, want 1000", maxBatchSize)
	}
}
