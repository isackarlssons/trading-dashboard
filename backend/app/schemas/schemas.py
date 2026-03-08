from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from uuid import UUID


# ─── Strategy Schemas ────────────────────────────────────────────────────────

class StrategyBase(BaseModel):
    name: str
    description: Optional[str] = None
    version: str = "1.0"
    config: Optional[dict] = None
    is_active: bool = True


class StrategyCreate(StrategyBase):
    pass


class StrategyResponse(StrategyBase):
    id: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ─── Signal Schemas ──────────────────────────────────────────────────────────

class SignalBase(BaseModel):
    strategy_id: UUID
    ticker: str
    direction: str  # "long" or "short"
    entry_price: Optional[float] = None
    stop_loss: Optional[float] = None
    take_profit: Optional[float] = None
    confidence: Optional[float] = None
    metadata: Optional[dict] = None
    expires_at: Optional[datetime] = None


class SignalCreate(SignalBase):
    pass


class SignalUpdate(BaseModel):
    status: Optional[str] = None  # "pending", "taken", "skipped", "expired"
    entry_price: Optional[float] = None
    stop_loss: Optional[float] = None
    take_profit: Optional[float] = None


class SignalResponse(SignalBase):
    id: UUID
    status: str
    signal_time: datetime
    created_at: datetime
    strategy: Optional[StrategyResponse] = None

    class Config:
        from_attributes = True


# ─── Position Schemas ────────────────────────────────────────────────────────

class PositionBase(BaseModel):
    signal_id: Optional[UUID] = None
    ticker: str
    direction: str
    entry_price: float
    stop_loss: Optional[float] = None
    take_profit: Optional[float] = None
    quantity: Optional[float] = None
    notes: Optional[str] = None


class PositionCreate(PositionBase):
    pass


class PositionFromSignal(BaseModel):
    """Create a position from an existing signal (mark as taken)."""
    signal_id: UUID
    entry_price: float
    quantity: Optional[float] = None
    stop_loss: Optional[float] = None
    take_profit: Optional[float] = None
    notes: Optional[str] = None


class PositionClose(BaseModel):
    """Close a position and create a trade record."""
    exit_price: float
    fees: float = 0.0
    notes: Optional[str] = None


class PositionResponse(PositionBase):
    id: UUID
    status: str
    opened_at: datetime
    closed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ─── Trade Schemas ───────────────────────────────────────────────────────────

class TradeBase(BaseModel):
    position_id: UUID
    ticker: str
    direction: str
    entry_price: float
    exit_price: float
    quantity: Optional[float] = None
    pnl: Optional[float] = None
    pnl_percent: Optional[float] = None
    result: str  # "win", "loss", "breakeven"
    fees: float = 0.0
    notes: Optional[str] = None
    opened_at: datetime
    closed_at: datetime


class TradeResponse(TradeBase):
    id: UUID
    created_at: datetime

    class Config:
        from_attributes = True


# ─── Stats Schema ────────────────────────────────────────────────────────────

class TradeStats(BaseModel):
    total_trades: int = 0
    wins: int = 0
    losses: int = 0
    breakeven: int = 0
    win_rate: float = 0.0
    total_pnl: float = 0.0
    avg_pnl: float = 0.0
    avg_pnl_percent: float = 0.0
    best_trade: Optional[float] = None
    worst_trade: Optional[float] = None
    avg_win: Optional[float] = None
    avg_loss: Optional[float] = None
    profit_factor: Optional[float] = None


# ─── Market Snapshot Schemas ─────────────────────────────────────────────────

class MarketSnapshotCreate(BaseModel):
    ticker: str
    price: float
    volume: Optional[float] = None
    rsi: Optional[float] = None
    atr: Optional[float] = None
    metadata: Optional[dict] = None


class MarketSnapshotResponse(MarketSnapshotCreate):
    id: UUID
    snapshot_time: datetime
    created_at: datetime

    class Config:
        from_attributes = True


# ─── Bot Run Schemas ─────────────────────────────────────────────────────────

class BotRunCreate(BaseModel):
    strategy_id: UUID


class BotRunUpdate(BaseModel):
    status: Optional[str] = None
    signals_generated: Optional[int] = None
    tickers_scanned: Optional[int] = None
    error_message: Optional[str] = None
    completed_at: Optional[datetime] = None


class BotRunResponse(BaseModel):
    id: UUID
    strategy_id: UUID
    status: str
    signals_generated: int
    tickers_scanned: int
    error_message: Optional[str] = None
    started_at: datetime
    completed_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True
