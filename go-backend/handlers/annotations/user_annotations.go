package annotations

import (
	"database/sql"
	"encoding/csv"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

var errSnapshotNotFound = errors.New("snapshot not found")

func userAnnotationRoot() string {
	if root := os.Getenv("USER_ANNOTATIONS_DIR"); root != "" {
		return root
	}
	root, _ := filepath.Abs("../app/backend/data/user_annotations")
	return root
}

func SaveUser(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		body, ok := bindPayload(c)
		if !ok {
			return
		}
		userID := c.MustGet("userID").(string)
		candidateID := uuid.NewString()
		candidatePath := filepath.Join(userAnnotationRoot(), userID, candidateID+".csv")

		tx, err := db.BeginTx(c, nil)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save strategy"})
			return
		}
		defer tx.Rollback()
		if !checkStrategyLimit(c, tx, userID, body.Label) {
			return
		}

		var strategyID, path string
		err = tx.QueryRowContext(c, `
			INSERT INTO strategies (id, owner_id, name, local_url)
			VALUES ($1, $2, $3, $4)
			ON CONFLICT (owner_id, name)
			DO UPDATE SET updated_at = NOW()
			RETURNING id, local_url
		`, candidateID, userID, body.Label, candidatePath).Scan(&strategyID, &path)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save strategy"})
			return
		}

		if err := appendAnnotation(path, body, time.Now()); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save strategy snapshot"})
			return
		}
		rows, err := readRows(path)
		if err != nil || len(rows) < 2 {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read saved strategy"})
			return
		}
		if err := tx.Commit(); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save strategy"})
			return
		}

		c.JSON(http.StatusCreated, gin.H{
			"id":             strategyID,
			"title":          body.Label,
			"snapshot_count": len(rows) - 1,
		})
	}
}

func ListUser(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		rows, err := db.QueryContext(c, `
			SELECT id, name, local_url, created_at, updated_at
			FROM strategies
			WHERE owner_id = $1
			ORDER BY updated_at DESC
		`, c.MustGet("userID").(string))
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list strategies"})
			return
		}
		defer rows.Close()

		items := make([]savedStrategy, 0)
		for rows.Next() {
			var item savedStrategy
			var path string
			if err := rows.Scan(&item.ID, &item.Title, &path, &item.CreatedAt, &item.UpdatedAt); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read strategies"})
				return
			}
			item.Preview, item.SnapshotCount, err = readFirstSnapshot(path)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read strategy snapshots"})
				return
			}
			items = append(items, item)
		}
		if err := rows.Err(); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list strategies"})
			return
		}
		c.JSON(http.StatusOK, items)
	}
}

func GetUser(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var item strategyDetails
		var path string
		err := db.QueryRowContext(c, `
			SELECT id, name, local_url, created_at, updated_at
			FROM strategies
			WHERE id = $1 AND owner_id = $2
		`, c.Param("id"), c.MustGet("userID").(string)).Scan(
			&item.ID, &item.Title, &path, &item.CreatedAt, &item.UpdatedAt,
		)
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "strategy not found"})
			return
		}
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load strategy"})
			return
		}

		item.Snapshots, err = readSnapshots(path)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read strategy snapshots"})
			return
		}
		item.SnapshotCount = len(item.Snapshots)
		c.JSON(http.StatusOK, item)
	}
}

func DeleteUser(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		err := deleteUserStrategy(db, c, c.Param("id"), c.MustGet("userID").(string))
		if errors.Is(err, sql.ErrNoRows) {
			c.JSON(http.StatusNotFound, gin.H{"error": "strategy not found"})
			return
		}
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete strategy"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"deleted": true})
	}
}

func DeleteUserSnapshot(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		index, err := strconv.Atoi(c.Param("index"))
		if err != nil || index < 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid snapshot"})
			return
		}

		userID := c.MustGet("userID").(string)
		var path string
		err = db.QueryRowContext(c, `
			SELECT local_url
			FROM strategies
			WHERE id = $1 AND owner_id = $2
		`, c.Param("id"), userID).Scan(&path)
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "strategy not found"})
			return
		}
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load strategy"})
			return
		}

		remaining, err := deleteSnapshot(path, index)
		if errors.Is(err, errSnapshotNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "snapshot not found"})
			return
		}
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete snapshot"})
			return
		}
		if remaining == 0 {
			if err := deleteUserStrategy(db, c, c.Param("id"), userID); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete empty strategy"})
				return
			}
		}

		c.JSON(http.StatusOK, gin.H{"remaining_snapshot_count": remaining})
	}
}

func UpdateUserSnapshotAnnotations(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		index, err := strconv.Atoi(c.Param("index"))
		var body annotationUpdate
		if err != nil || index < 0 || c.ShouldBindJSON(&body) != nil || !validStrategyAnnotations(body.Annotations) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid strategy annotations"})
			return
		}
		var path string
		err = db.QueryRowContext(c, `SELECT local_url FROM strategies WHERE id = $1 AND owner_id = $2`,
			c.Param("id"), c.MustGet("userID").(string)).Scan(&path)
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "strategy not found"})
			return
		}
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load strategy"})
			return
		}
		if err = updateSnapshotAnnotations(path, index, body.Annotations); errors.Is(err, errSnapshotNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "snapshot not found"})
			return
		} else if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save strategy annotations"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"annotations": body.Annotations})
	}
}

func deleteUserStrategy(db *sql.DB, c *gin.Context, strategyID, userID string) (err error) {
	var path string
	err = db.QueryRowContext(c, `
		DELETE FROM strategies
		WHERE id = $1 AND owner_id = $2
		RETURNING local_url
	`, strategyID, userID).Scan(&path)
	if err != nil {
		return err
	}
	if err = os.Remove(path); os.IsNotExist(err) {
		return nil
	}
	return err
}

func readFirstSnapshot(path string) (strategyPreview, int, error) {
	snapshots, err := readSnapshots(path)
	if err != nil {
		return strategyPreview{}, 0, err
	}
	return snapshots[0], len(snapshots), nil
}

func readSnapshots(path string) ([]strategyPreview, error) {
	rows, err := readRows(path)
	if err != nil {
		return nil, err
	}
	if len(rows) < 2 {
		return nil, strconv.ErrSyntax
	}

	snapshots := make([]strategyPreview, 0, len(rows)-1)
	for _, row := range rows[1:] {
		if len(row) < 7 {
			return nil, strconv.ErrSyntax
		}
		start, err := strconv.ParseInt(row[2], 10, 64)
		if err != nil {
			return nil, err
		}
		end, err := strconv.ParseInt(row[3], 10, 64)
		if err != nil {
			return nil, err
		}
		var stored []candle
		if err := json.Unmarshal([]byte(row[6]), &stored); err != nil {
			return nil, err
		}
		if len(stored) == 0 {
			return nil, strconv.ErrSyntax
		}
		storedAnnotations := make([]strategyAnnotation, 0)
		if len(row) > strategyAnnotationsColumn && row[strategyAnnotationsColumn] != "" {
			if err := json.Unmarshal([]byte(row[strategyAnnotationsColumn]), &storedAnnotations); err != nil {
				return nil, err
			}
		}

		step := int64(1)
		if len(stored) > 1 {
			step = (end - start) / int64(len(stored)-1)
		}
		candles := make([]previewCandle, len(stored))
		for index, item := range stored {
			candles[index] = previewCandle{
				Time:  start + int64(index)*step,
				Open:  item.Open,
				High:  item.High,
				Low:   item.Low,
				Close: item.Close,
			}
		}
		snapshots = append(snapshots, strategyPreview{
			Symbol:      row[0],
			AnnotatedAt: row[5],
			Candles:     candles,
			Annotations: storedAnnotations,
		})
	}
	return snapshots, nil
}

func deleteSnapshot(path string, index int) (int, error) {
	rows, err := readRows(path)
	if err != nil {
		return 0, err
	}
	rowIndex := index + 1
	if index < 0 || rowIndex >= len(rows) {
		return 0, errSnapshotNotFound
	}

	remaining := len(rows) - 2
	if remaining == 0 {
		return 0, nil
	}
	rows = append(rows[:rowIndex], rows[rowIndex+1:]...)
	if err := writeRows(path, rows); err != nil {
		return 0, err
	}
	return remaining, nil
}

func updateSnapshotAnnotations(path string, index int, annotations []strategyAnnotation) error {
	rows, err := readRows(path)
	if err != nil {
		return err
	}
	rowIndex := index + 1
	if index < 0 || rowIndex >= len(rows) {
		return errSnapshotNotFound
	}
	for row := range rows {
		for len(rows[row]) <= strategyAnnotationsColumn {
			rows[row] = append(rows[row], "")
		}
	}
	rows[0][strategyAnnotationsColumn] = "annotations"
	encoded, err := json.Marshal(annotations)
	if err != nil {
		return err
	}
	rows[rowIndex][strategyAnnotationsColumn] = string(encoded)
	return writeRows(path, rows)
}

func writeRows(path string, rows [][]string) error {
	temp, err := os.CreateTemp(filepath.Dir(path), ".strategy-snapshots-*.csv")
	if err != nil {
		return err
	}
	tempPath := temp.Name()
	defer os.Remove(tempPath)

	writer := csv.NewWriter(temp)
	writer.WriteAll(rows)
	if err := writer.Error(); err != nil {
		temp.Close()
		return err
	}
	if err := temp.Chmod(0640); err != nil {
		temp.Close()
		return err
	}
	if err := temp.Close(); err != nil {
		return err
	}
	return os.Rename(tempPath, path)
}
