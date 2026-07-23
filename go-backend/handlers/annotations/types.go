package annotations

import "time"

type candle struct {
	Open  float64 `json:"open"`
	High  float64 `json:"high"`
	Low   float64 `json:"low"`
	Close float64 `json:"close"`
}

type strategyAnnotation struct {
	ID         string `json:"id"`
	ConceptID  string `json:"conceptId"`
	Label      string `json:"label"`
	Kind       string `json:"kind"`
	Role       string `json:"role"`
	Importance string `json:"importance"`
	Trigger    string `json:"trigger"`
	// ranged annotations
	StartIndex *int     `json:"startIndex,omitempty"`
	EndIndex   *int     `json:"endIndex,omitempty"`
	StartRatio *float64 `json:"startRatio,omitempty"` // legacy
	EndRatio   *float64 `json:"endRatio,omitempty"`   // legacy
	// zone only
	PriceHigh *float64 `json:"priceHigh,omitempty"`
	PriceLow  *float64 `json:"priceLow,omitempty"`
	// level / marker only
	Price *float64 `json:"price,omitempty"`
	// marker only
	CandleIndex *int     `json:"candleIndex,omitempty"`
	PriceAnchor string   `json:"priceAnchor,omitempty"`
	Candles     []candle `json:"candles,omitempty"` // legacy candle_group identity
}

type annotationUpdate struct {
	Annotations []strategyAnnotation `json:"annotations"`
}

type payload struct {
	Symbol    string   `json:"symbol"`
	Label     string   `json:"label"`
	TimeStart int64    `json:"timeStart"`
	TimeEnd   int64    `json:"timeEnd"`
	Candles   []candle `json:"candles"`
}

type previewCandle struct {
	Time  int64   `json:"time"`
	Open  float64 `json:"open"`
	High  float64 `json:"high"`
	Low   float64 `json:"low"`
	Close float64 `json:"close"`
}

type strategyPreview struct {
	Symbol      string               `json:"symbol"`
	AnnotatedAt string               `json:"annotated_at"`
	Candles     []previewCandle      `json:"candles"`
	Annotations []strategyAnnotation `json:"annotations"`
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
