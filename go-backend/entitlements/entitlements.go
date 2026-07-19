package entitlements

import (
	"context"
	"database/sql"
	"fmt"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

type Tier string

const (
	Free         Tier = "free"
	Premium      Tier = "premium"
	Professional Tier = "professional"
	Enterprise   Tier = "enterprise"
)

type Resource string

const (
	SavedStrategies Resource = "saved_strategies"
	SavedIndicators Resource = "saved_indicators"
	ActiveBacktests Resource = "active_backtests"
)

type Limits struct {
	SavedStrategies *int `json:"saved_strategies"`
	SavedIndicators *int `json:"saved_indicators"`
	ActiveBacktests *int `json:"active_backtests"`
}

type Usage struct {
	SavedStrategies int `json:"saved_strategies"`
	SavedIndicators int `json:"saved_indicators"`
	ActiveBacktests int `json:"active_backtests"`
}

type queryer interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

type LimitError struct {
	Tier     Tier
	Resource Resource
	Limit    int
	Usage    int
}

func (err *LimitError) Error() string {
	return fmt.Sprintf("%s limit reached", resourceLabel(err.Resource))
}

func Normalize(value string) Tier {
	switch Tier(strings.ToLower(strings.TrimSpace(value))) {
	case Premium:
		return Premium
	case Professional:
		return Professional
	case Enterprise:
		return Enterprise
	default:
		return Free
	}
}

func LimitsFor(tier Tier) Limits {
	switch Normalize(string(tier)) {
	case Premium:
		return Limits{SavedStrategies: integer(10), SavedIndicators: integer(25), ActiveBacktests: integer(10)}
	case Professional:
		return Limits{SavedStrategies: integer(20), SavedIndicators: integer(100), ActiveBacktests: integer(50)}
	case Enterprise:
		return Limits{}
	default:
		return Limits{SavedStrategies: integer(3), SavedIndicators: integer(5), ActiveBacktests: integer(3)}
	}
}

func LoadUsage(ctx context.Context, db queryer, userID string) (Usage, error) {
	var usage Usage
	err := db.QueryRowContext(ctx, `
		SELECT
			(SELECT COUNT(*) FROM strategies WHERE owner_id = $1),
			(SELECT COUNT(*) FROM indicators WHERE owner_id = $1),
			(SELECT COUNT(*) FROM backtests WHERE user_id = $1 AND expires_at > NOW())
	`, userID).Scan(&usage.SavedStrategies, &usage.SavedIndicators, &usage.ActiveBacktests)
	return usage, err
}

func LockUser(ctx context.Context, tx *sql.Tx, userID string) error {
	var lockedID string
	return tx.QueryRowContext(ctx, `SELECT id::text FROM users WHERE id = $1 FOR UPDATE`, userID).Scan(&lockedID)
}

func CheckCreate(
	ctx context.Context,
	db queryer,
	tier Tier,
	userID string,
	resource Resource,
	name string,
) error {
	limits := LimitsFor(tier)
	limit := resourceLimit(limits, resource)
	if limit == nil {
		return nil
	}

	existing, err := resourceExists(ctx, db, userID, resource, name)
	if err != nil || existing {
		return err
	}

	usage, err := LoadUsage(ctx, db, userID)
	if err != nil {
		return err
	}
	used := resourceUsage(usage, resource)
	if used < *limit {
		return nil
	}
	return &LimitError{Tier: Normalize(string(tier)), Resource: resource, Limit: *limit, Usage: used}
}

func WriteLimitError(c *gin.Context, err *LimitError) {
	c.JSON(http.StatusForbidden, gin.H{
		"code":        "subscription_limit_reached",
		"error":       err.Error(),
		"detail":      fmt.Sprintf("Your %s plan allows %d %s.", err.Tier, err.Limit, resourceLabel(err.Resource)),
		"tier":        err.Tier,
		"resource":    err.Resource,
		"limit":       err.Limit,
		"usage":       err.Usage,
		"upgrade_url": "/products",
	})
}

func integer(value int) *int {
	return &value
}

func resourceLimit(limits Limits, resource Resource) *int {
	switch resource {
	case SavedStrategies:
		return limits.SavedStrategies
	case SavedIndicators:
		return limits.SavedIndicators
	case ActiveBacktests:
		return limits.ActiveBacktests
	default:
		return integer(0)
	}
}

func resourceUsage(usage Usage, resource Resource) int {
	switch resource {
	case SavedStrategies:
		return usage.SavedStrategies
	case SavedIndicators:
		return usage.SavedIndicators
	case ActiveBacktests:
		return usage.ActiveBacktests
	default:
		return 0
	}
}

func resourceExists(ctx context.Context, db queryer, userID string, resource Resource, name string) (bool, error) {
	if resource == ActiveBacktests {
		return false, nil
	}
	var exists bool
	var query string
	switch resource {
	case SavedStrategies:
		query = `SELECT EXISTS (SELECT 1 FROM strategies WHERE owner_id = $1 AND name = $2)`
	case SavedIndicators:
		query = `SELECT EXISTS (SELECT 1 FROM indicators WHERE owner_id = $1 AND name = $2)`
	default:
		return false, fmt.Errorf("unsupported entitlement resource %q", resource)
	}
	err := db.QueryRowContext(ctx, query, userID, name).Scan(&exists)
	return exists, err
}

func resourceLabel(resource Resource) string {
	switch resource {
	case SavedStrategies:
		return "saved strategies"
	case SavedIndicators:
		return "saved indicators"
	case ActiveBacktests:
		return "active backtests"
	default:
		return "resource"
	}
}
