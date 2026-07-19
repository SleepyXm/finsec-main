package indicators

import (
	"database/sql"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"finsec-backend/entitlements"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func indicatorRoot() string {
	if root := os.Getenv("USER_INDICATORS_DIR"); root != "" {
		return root
	}
	root, _ := filepath.Abs("../app/backend/data/user_indicators")
	return root
}

func Save(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var body saveIndicatorRequest
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid indicator"})
			return
		}
		body.Name = strings.TrimSpace(body.Name)
		if body.Name == "" || strings.TrimSpace(body.Source) == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "name and source are required"})
			return
		}

		userID := c.MustGet("userID").(string)
		candidateID := uuid.NewString()
		candidatePath := filepath.Join(indicatorRoot(), userID, candidateID+".fin")
		tx, err := db.BeginTx(c, nil)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save indicator"})
			return
		}
		defer tx.Rollback()
		if err := checkIndicatorLimit(c, tx, userID, body.Name); err != nil {
			var limitErr *entitlements.LimitError
			if errors.As(err, &limitErr) {
				entitlements.WriteLimitError(c, limitErr)
			} else {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to verify indicator limit"})
			}
			return
		}

		var item savedIndicator
		var path string
		err = tx.QueryRowContext(c, `
			INSERT INTO indicators (id, owner_id, name, local_url)
			VALUES ($1, $2, $3, $4)
			ON CONFLICT (owner_id, name)
			DO UPDATE SET updated_at = NOW()
			RETURNING id, name, local_url, created_at, updated_at
		`, candidateID, userID, body.Name, candidatePath).Scan(
			&item.ID, &item.Name, &path, &item.CreatedAt, &item.UpdatedAt,
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save indicator"})
			return
		}
		if err := os.MkdirAll(filepath.Dir(path), 0750); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save indicator source"})
			return
		}
		if err := os.WriteFile(path, []byte(body.Source), 0640); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save indicator source"})
			return
		}
		if err := tx.Commit(); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save indicator"})
			return
		}
		c.JSON(http.StatusCreated, item)
	}
}

func checkIndicatorLimit(c *gin.Context, tx *sql.Tx, userID, name string) error {
	if err := entitlements.LockUser(c, tx, userID); err != nil {
		return err
	}
	return entitlements.CheckCreate(
		c, tx, entitlements.Normalize(c.GetString("subscriptionTier")),
		userID, entitlements.SavedIndicators, name,
	)
}

func List(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		rows, err := db.QueryContext(c, `
			SELECT id, name, created_at, updated_at
			FROM indicators
			WHERE owner_id = $1
			ORDER BY updated_at DESC
		`, c.MustGet("userID").(string))
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list indicators"})
			return
		}
		defer rows.Close()

		items := make([]savedIndicator, 0)
		for rows.Next() {
			var item savedIndicator
			if err := rows.Scan(&item.ID, &item.Name, &item.CreatedAt, &item.UpdatedAt); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read indicators"})
				return
			}
			items = append(items, item)
		}
		if err := rows.Err(); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list indicators"})
			return
		}
		c.JSON(http.StatusOK, items)
	}
}

func GetSource(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var item savedIndicator
		var path string
		err := db.QueryRowContext(c, `
			SELECT id, name, local_url, created_at, updated_at
			FROM indicators
			WHERE id = $1 AND owner_id = $2
		`, c.Param("id"), c.MustGet("userID").(string)).Scan(
			&item.ID, &item.Name, &path, &item.CreatedAt, &item.UpdatedAt,
		)
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "indicator not found"})
			return
		}
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load indicator"})
			return
		}
		source, err := os.ReadFile(path)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read indicator source"})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"id":         item.ID,
			"name":       item.Name,
			"source":     string(source),
			"created_at": item.CreatedAt,
			"updated_at": item.UpdatedAt,
		})
	}
}

func Delete(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		err := deleteIndicator(db, c, c.Param("id"), c.MustGet("userID").(string))
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "indicator not found"})
			return
		}
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete indicator"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"deleted": true})
	}
}

func deleteIndicator(db *sql.DB, c *gin.Context, indicatorID, userID string) (err error) {
	var path string
	err = db.QueryRowContext(c, `
		DELETE FROM indicators
		WHERE id = $1 AND owner_id = $2
		RETURNING local_url
	`, indicatorID, userID).Scan(&path)
	if err != nil {
		return err
	}
	if err = os.Remove(path); os.IsNotExist(err) {
		return nil
	}
	return err
}
