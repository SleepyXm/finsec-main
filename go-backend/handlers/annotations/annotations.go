package annotations

import (
	"encoding/csv"
	"encoding/json"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
	"unicode"

	"github.com/gin-gonic/gin"
)

var labelAliases = map[string]string{
	"fvg":            "fvg",
	"fair_value_gap": "fvg",
	"fairvaluegap":   "fvg",
	"order_block":    "order_block",
	"orderblock":     "order_block",
	"ob":             "order_block",
	"breaker":        "breaker",
	"breaker_block":  "breaker",
}

var csvHeaders = []string{
	"symbol", "label", "timeStart", "timeEnd", "candle_count", "annotatedAt", "candles",
}

const strategyAnnotationsColumn = 7

const maxAnnotationCandles = 5_000

func canonicalLabel(label string) string {
	cleaned := strings.TrimSpace(strings.ToLower(label))
	var builder strings.Builder
	lastUnderscore := false
	for _, char := range cleaned {
		switch {
		case unicode.IsLetter(char) || unicode.IsDigit(char):
			builder.WriteRune(char)
			lastUnderscore = false
		case !lastUnderscore:
			builder.WriteByte('_')
			lastUnderscore = true
		}
	}
	cleaned = strings.Trim(builder.String(), "_")
	if alias, ok := labelAliases[cleaned]; ok {
		return alias
	}
	return cleaned
}

func bindPayload(c *gin.Context) (payload, bool) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 2<<20)
	var body payload
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid annotation"})
		return body, false
	}
	body.Symbol = strings.ToUpper(strings.TrimSpace(body.Symbol))
	body.Label = canonicalLabel(body.Label)
	if body.Symbol == "" || body.Label == "" || len(body.Label) > 80 ||
		len(body.Candles) == 0 || len(body.Candles) > maxAnnotationCandles ||
		body.TimeStart <= 0 || body.TimeEnd < body.TimeStart || !validCandles(body.Candles) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid annotation"})
		return body, false
	}
	return body, true
}

func validCandles(candles []candle) bool {
	for _, item := range candles {
		values := []float64{item.Open, item.High, item.Low, item.Close}
		for _, value := range values {
			if math.IsNaN(value) || math.IsInf(value, 0) {
				return false
			}
		}
		if item.High < math.Max(item.Open, item.Close) || item.Low > math.Min(item.Open, item.Close) {
			return false
		}
	}
	return true
}

func appendAnnotation(path string, body payload, annotatedAt time.Time) error {
	if err := os.MkdirAll(filepath.Dir(path), 0750); err != nil {
		return err
	}

	needsHeader := false
	info, err := os.Stat(path)
	if os.IsNotExist(err) {
		needsHeader = true
	} else if err != nil {
		return err
	} else if info.Size() == 0 {
		needsHeader = true
	}

	file, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0640)
	if err != nil {
		return err
	}
	defer file.Close()

	writer := csv.NewWriter(file)
	if needsHeader {
		if err := writer.Write(csvHeaders); err != nil {
			return err
		}
	}
	candlesJSON, err := json.Marshal(body.Candles)
	if err != nil {
		return err
	}
	row := []string{
		body.Symbol,
		body.Label,
		strconv.FormatInt(body.TimeStart, 10),
		strconv.FormatInt(body.TimeEnd, 10),
		strconv.Itoa(len(body.Candles)),
		annotatedAt.UTC().Format(time.RFC3339Nano),
		string(candlesJSON),
	}
	if !needsHeader {
		rows, readErr := readRows(path)
		if readErr == nil && len(rows) > 0 && len(rows[0]) > strategyAnnotationsColumn {
			row = append(row, "[]")
		}
	}
	if err := writer.Write(row); err != nil {
		return err
	}
	writer.Flush()
	return writer.Error()
}

func readRows(path string) ([][]string, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	reader := csv.NewReader(file)
	reader.FieldsPerRecord = -1
	return reader.ReadAll()
}
