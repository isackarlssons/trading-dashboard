// ─── API Types matching backend schemas ─────────────────────────────────────

export type SignalDirection = "long" | "short";
export type SignalStatus = "pending" | "taken" | "skipped" | "expired";
export type PositionStatus = "open" | "closed";
export type TradeResult = "win" | "loss" | "breakeven";

export interface Strategy {
  id: string;
  name: string;
  description: string | null;
  version: string;
  config: Record<string, unknown> | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Signal {
  id: string;
  strategy_id: string;
  ticker: string;
  direction: SignalDirection;
  entry_price: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  confidence: number | null;
  status: SignalStatus;
  metadata: Record<string, unknown> | null;
  signal_time: string;
  expires_at: string | null;
  created_at: string;
  strategy?: Strategy;
  strategies?: Strategy;
}

export interface Position {
  id: string;
  signal_id: string | null;
  ticker: string;
  direction: SignalDirection;
  entry_price: number;
  stop_loss: number | null;
  take_profit: number | null;
  quantity: number | null;
  status: PositionStatus;
  notes: string | null;
  opened_at: string;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Trade {
  id: string;
  position_id: string;
  ticker: string;
  direction: SignalDirection;
  entry_price: number;
  exit_price: number;
  quantity: number | null;
  pnl: number | null;
  pnl_percent: number | null;
  result: TradeResult;
  fees: number;
  notes: string | null;
  opened_at: string;
  closed_at: string;
  created_at: string;
}

export interface TradeStats {
  total_trades: number;
  wins: number;
  losses: number;
  breakeven: number;
  win_rate: number;
  total_pnl: number;
  avg_pnl: number;
  avg_pnl_percent: number;
  best_trade: number | null;
  worst_trade: number | null;
  avg_win: number | null;
  avg_loss: number | null;
  profit_factor: number | null;
}

// ─── Request types ──────────────────────────────────────────────────────────

export interface CreatePositionFromSignal {
  signal_id: string;
  entry_price: number;
  quantity?: number;
  stop_loss?: number;
  take_profit?: number;
  notes?: string;
}

export interface ClosePosition {
  exit_price: number;
  fees?: number;
  notes?: string;
}

export interface CreateSignal {
  strategy_id: string;
  ticker: string;
  direction: SignalDirection;
  entry_price?: number;
  stop_loss?: number;
  take_profit?: number;
  confidence?: number;
  metadata?: Record<string, unknown>;
  expires_at?: string;
}

export interface UpdateSignal {
  status?: SignalStatus;
  entry_price?: number;
  stop_loss?: number;
  take_profit?: number;
}
