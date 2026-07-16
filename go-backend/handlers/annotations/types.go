package annotations

import "time"

type candle struct {
	Open  float64 `json:"open"`
	High  float64 `json:"high"`
	Low   float64 `json:"low"`
	Close float64 `json:"close"`
}

type payload struct {
	Symbol    string   `json:"symbol"`
	Label     string   `json:"label"`
	TimeStart int64    `json:"timeStart"`
	TimeEnd   int64    `json:"timeEnd"`
	Candles   []candle `json:"candles"`
}

type summary struct {
	Label    string `json:"label"`
	File     string `json:"file"`
	RowCount int    `json:"row_count"`
}

type previewCandle struct {
	Time  int64   `json:"time"`
	Open  float64 `json:"open"`
	High  float64 `json:"high"`
	Low   float64 `json:"low"`
	Close float64 `json:"close"`
}

type strategyPreview struct {
	Symbol      string          `json:"symbol"`
	AnnotatedAt string          `json:"annotated_at"`
	Candles     []previewCandle `json:"candles"`
}

type savedStrategy struct {
	ID            string          `json:"id"`
	Title         string          `json:"title"`
	SnapshotCount int             `json:"snapshot_count"`
	CreatedAt     time.Time       `json:"created_at"`
	UpdatedAt     time.Time       `json:"updated_at"`
	Preview       strategyPreview `json:"preview"`
}

type strategyDetails struct {
	ID            string            `json:"id"`
	Title         string            `json:"title"`
	SnapshotCount int               `json:"snapshot_count"`
	CreatedAt     time.Time         `json:"created_at"`
	UpdatedAt     time.Time         `json:"updated_at"`
	Snapshots     []strategyPreview `json:"snapshots"`
}
