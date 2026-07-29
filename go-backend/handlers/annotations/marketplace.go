package annotations

import (
	"database/sql"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

type marketplaceStrategy struct {
	ID            string            `json:"id"`
	Title         string            `json:"title"`
	Description   string            `json:"description"`
	Author        string            `json:"author"`
	Official      bool              `json:"official"`
	SnapshotCount int               `json:"snapshot_count"`
	CreatedAt     time.Time         `json:"created_at"`
	UpdatedAt     time.Time         `json:"updated_at"`
	Preview       *strategyPreview  `json:"preview,omitempty"`
	Snapshots     []strategyPreview `json:"snapshots,omitempty"`
}

type marketplaceVisibility struct {
	Published   bool   `json:"published"`
	Description string `json:"description"`
}

type rowScanner interface {
	Scan(dest ...any) error
}

const marketplaceSelect = `
	SELECT s.id, s.name, COALESCE(s.description, ''),
	       u.username, FALSE,
	       s.local_url, s.created_at, s.updated_at
	FROM strategies s
	JOIN users u ON u.id = s.owner_id
`

func ListMarketplace(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		items, err := listFinsecMarketplace()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load Finsec strategies"})
			return
		}

		rows, err := db.QueryContext(c, marketplaceSelect+`
			WHERE s.is_public = TRUE
			ORDER BY s.updated_at DESC
		`)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list marketplace strategies"})
			return
		}
		defer rows.Close()

		for rows.Next() {
			item, path, err := scanMarketplaceStrategy(rows)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read marketplace strategies"})
				return
			}
			preview, count, err := readFirstSnapshot(path)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read marketplace snapshots"})
				return
			}
			item.Preview, item.SnapshotCount = &preview, count
			items = append(items, item)
		}
		if err := rows.Err(); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list marketplace strategies"})
			return
		}
		c.JSON(http.StatusOK, items)
	}
}

func GetMarketplace(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		if strings.HasPrefix(c.Param("id"), finsecStrategyPrefix) {
			item, path, err := finsecMarketplaceStrategy(c.Param("id"))
			if os.IsNotExist(err) {
				c.JSON(http.StatusNotFound, gin.H{"error": "strategy not found"})
				return
			}
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load Finsec strategy"})
				return
			}
			item.Snapshots, err = readSnapshots(path)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read marketplace snapshots"})
				return
			}
			item.SnapshotCount = len(item.Snapshots)
			c.JSON(http.StatusOK, item)
			return
		}

		item, path, err := scanMarketplaceStrategy(db.QueryRowContext(
			c,
			marketplaceSelect+" WHERE s.id = $1 AND s.is_public = TRUE",
			c.Param("id"),
		))
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "strategy not found"})
			return
		}
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load marketplace strategy"})
			return
		}
		item.Snapshots, err = readSnapshots(path)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read marketplace snapshots"})
			return
		}
		item.SnapshotCount = len(item.Snapshots)
		c.JSON(http.StatusOK, item)
	}
}

func PublishUserStrategy(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var body marketplaceVisibility
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 8<<10)
		if c.ShouldBindJSON(&body) != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid marketplace settings"})
			return
		}
		body.Description = strings.TrimSpace(body.Description)
		if len(body.Description) > 500 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "description must be 500 characters or fewer"})
			return
		}

		var id string
		err := db.QueryRowContext(c, `
			UPDATE strategies
			SET is_public = $3, description = NULLIF($4, ''), updated_at = NOW()
			WHERE id = $1 AND owner_id = $2
			RETURNING id
		`, c.Param("id"), c.MustGet("userID").(string), body.Published, body.Description).Scan(&id)
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "strategy not found"})
			return
		}
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update marketplace strategy"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"id": id, "published": body.Published})
	}
}

func scanMarketplaceStrategy(row rowScanner) (marketplaceStrategy, string, error) {
	var item marketplaceStrategy
	var path string
	err := row.Scan(
		&item.ID, &item.Title, &item.Description, &item.Author, &item.Official,
		&path, &item.CreatedAt, &item.UpdatedAt,
	)
	return item, path, err
}

const finsecStrategyPrefix = "finsec:"

func finsecRepositoryRoot() string {
	if root := os.Getenv("FINSEC_REPOSITORY_DIR"); root != "" {
		return root
	}
	root, _ := filepath.Abs("../app/backend/data/finsec-repository")
	return root
}

func listFinsecMarketplace() ([]marketplaceStrategy, error) {
	root := filepath.Join(finsecRepositoryRoot(), "finsec-annotations")
	entries, err := os.ReadDir(root)
	if err != nil {
		return nil, err
	}

	items := make([]marketplaceStrategy, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || !strings.EqualFold(filepath.Ext(entry.Name()), ".csv") {
			continue
		}
		id := finsecStrategyPrefix + strings.TrimSuffix(entry.Name(), filepath.Ext(entry.Name()))
		item, path, err := finsecMarketplaceStrategy(id)
		if err != nil {
			return nil, err
		}
		preview, count, err := readFirstSnapshot(path)
		if err != nil {
			return nil, err
		}
		item.Preview, item.SnapshotCount = &preview, count
		items = append(items, item)
	}
	return items, nil
}

func finsecMarketplaceStrategy(id string) (marketplaceStrategy, string, error) {
	key := strings.TrimPrefix(id, finsecStrategyPrefix)
	if key == id || key == "" || strings.ContainsAny(key, `/\.`) {
		return marketplaceStrategy{}, "", os.ErrNotExist
	}
	path := filepath.Join(finsecRepositoryRoot(), "finsec-annotations", key+".csv")
	info, err := os.Stat(path)
	if err != nil {
		return marketplaceStrategy{}, "", err
	}
	if info.IsDir() {
		return marketplaceStrategy{}, "", os.ErrNotExist
	}

	title := strategyDisplayName(key)
	return marketplaceStrategy{
		ID:          id,
		Title:       title,
		Description: "Official Finsec examples for " + title + ".",
		Author:      "Finsec",
		Official:    true,
		CreatedAt:   info.ModTime(),
		UpdatedAt:   info.ModTime(),
	}, path, nil
}

func strategyDisplayName(key string) string {
	words := strings.Split(key, "_")
	for index, word := range words {
		if strings.EqualFold(word, "fvg") {
			words[index] = "FVG"
		} else if word != "" {
			words[index] = strings.ToUpper(word[:1]) + word[1:]
		}
	}
	return strings.Join(words, " ")
}
