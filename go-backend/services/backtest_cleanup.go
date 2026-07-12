package services

import (
	"context"
	"database/sql"
	"log"
	"time"
)

const backtestCleanupInterval = time.Minute

// RunBacktestCleanup removes expired backtests for the lifetime of the server.
// The database constraint prevents a backtest from extending its own expiry
// beyond three days; this worker performs the corresponding physical deletion.
func RunBacktestCleanup(ctx context.Context, db *sql.DB) {
	purge := func() {
		result, err := db.ExecContext(ctx, `
			DELETE FROM backtests
			WHERE expires_at <= NOW()
		`)
		if err != nil {
			if ctx.Err() == nil {
				log.Printf("backtest cleanup failed: %v", err)
			}
			return
		}

		deleted, err := result.RowsAffected()
		if err == nil && deleted > 0 {
			log.Printf("deleted %d expired backtest(s)", deleted)
		}
	}

	purge()
	ticker := time.NewTicker(backtestCleanupInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			purge()
		}
	}
}
