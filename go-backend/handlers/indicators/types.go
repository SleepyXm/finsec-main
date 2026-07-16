package indicators

import "time"

type savedIndicator struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type saveIndicatorRequest struct {
	Name   string `json:"name"`
	Source string `json:"source"`
}
