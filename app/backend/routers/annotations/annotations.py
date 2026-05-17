import csv
import json
import os
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
 
annotations_router = APIRouter()
 
# ── Storage path ──────────────────────────────────────────────────────────────
ANNOTATIONS_DIR = os.path.join("data", "annotations")
 
# ── Label aliases — all variations map to one canonical name ──────────────────
LABEL_ALIASES: dict[str, str] = {
    "fvg": "fvg",
    "fair_value_gap": "fvg",
    "fair value gap": "fvg",
    "fairvaluegap": "fvg",
    "order_block": "order_block",
    "orderblock": "order_block",
    "order block": "order_block",
    "ob": "order_block",
    "breaker": "breaker",
    "breaker_block": "breaker",
    "breaker block": "breaker",
}
 
# ── Schema ────────────────────────────────────────────────────────────────────
class Candle(BaseModel):
    # time intentionally excluded — frontend strips it before sending
    open: float
    high: float
    low: float
    close: float
 
class AnnotationPayload(BaseModel):
    symbol: str
    label: str
    timeStart: int
    timeEnd: int
    candles: list[Candle]  # already normalised 0-1 by frontend
 
# ── Helpers ───────────────────────────────────────────────────────────────────
def canonical_label(label: str) -> str:
    cleaned = label.strip().lower().replace(" ", "_").replace("-", "_")
    return LABEL_ALIASES.get(cleaned, cleaned)
 
def csv_path(label: str) -> str:
    return os.path.join(ANNOTATIONS_DIR, f"{canonical_label(label)}.csv")
 
CSV_HEADERS = ["symbol", "label", "timeStart", "timeEnd", "candle_count", "annotatedAt", "candles"]
 
def ensure_file(path: str):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if not os.path.exists(path):
        with open(path, "w", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(CSV_HEADERS)
 
def build_row(payload: AnnotationPayload) -> list:
    candles_json = json.dumps([
        {
            "open":  c.open,
            "high":  c.high,
            "low":   c.low,
            "close": c.close,
        }
        for c in payload.candles
    ])
 
    return [
        payload.symbol.upper(),
        canonical_label(payload.label),
        payload.timeStart,
        payload.timeEnd,
        len(payload.candles),
        datetime.now(timezone.utc).isoformat(),
        candles_json,
    ]
 
# ── Routes ────────────────────────────────────────────────────────────────────
@annotations_router.post("/annotations")
async def save_annotation(payload: AnnotationPayload):
    if not payload.candles:
        raise HTTPException(status_code=400, detail="candles array is empty")
 
    path = csv_path(payload.label)
    ensure_file(path)
 
    with open(path, "a", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(build_row(payload))
 
    return {
        "success": True,
        "file": os.path.basename(csv_path(payload.label)),
        "symbol": payload.symbol.upper(),
        "label": canonical_label(payload.label),
        "candle_count": len(payload.candles),
    }
 
 
@annotations_router.get("/annotations")
async def get_annotation_summary():
    """Row counts per label — track dataset growth at a glance."""
    if not os.path.exists(ANNOTATIONS_DIR):
        return {"annotations": []}
 
    summary = []
    for filename in os.listdir(ANNOTATIONS_DIR):
        if not filename.endswith(".csv"):
            continue
        filepath = os.path.join(ANNOTATIONS_DIR, filename)
        with open(filepath, "r") as f:
            row_count = sum(1 for _ in f) - 1  # exclude header
        summary.append({
            "label": filename.replace(".csv", ""),
            "file": filename,
            "row_count": row_count,
        })
 
    return {"annotations": summary}
 