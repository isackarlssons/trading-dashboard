"""
market_snapshots.py — Store and retrieve latest market price snapshots.

The bot writes a snapshot after each successful yfinance price fetch.
The risk-summary endpoint reads from here instead of calling Yahoo directly,
avoiding rate-limit errors on Railway.
"""

from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime

from app.core.supabase import get_supabase
from app.core.auth import get_current_user

router = APIRouter(prefix="/market-snapshots", tags=["market-snapshots"])


@router.post("/")
async def create_snapshot(
    data: dict,
    user: dict = Depends(get_current_user),
):
    """Insert a market price snapshot.

    Expected body: {"ticker": "SLB", "price": 42.31}
    Optional:      {"volume": ..., "snapshot_time": "2024-01-01T12:00:00"}
    """
    ticker = data.get("ticker")
    price = data.get("price")

    if not ticker or price is None:
        raise HTTPException(status_code=400, detail="ticker and price are required")

    sb = get_supabase()
    now = datetime.utcnow().isoformat()

    row = {
        "ticker": str(ticker).upper(),
        "price": float(price),
        "snapshot_time": data.get("snapshot_time", now),
    }
    if "volume" in data:
        row["volume"] = data["volume"]

    result = sb.table("market_snapshots").insert(row).execute()
    return result.data[0] if result.data else row


@router.get("/latest")
async def latest_snapshots(
    user: dict = Depends(get_current_user),
):
    """Return the most recent snapshot for every ticker (debug endpoint)."""
    sb = get_supabase()
    result = (
        sb.table("market_snapshots")
        .select("ticker, price, snapshot_time")
        .order("snapshot_time", desc=True)
        .limit(200)
        .execute()
    )
    # Deduplicate: keep only the latest snapshot per ticker
    seen: set[str] = set()
    latest = []
    for row in (result.data or []):
        if row["ticker"] not in seen:
            seen.add(row["ticker"])
            latest.append(row)
    return latest
