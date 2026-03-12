// ─── API Types matching backend schemas ─────────────────────────────────────

export type SignalDirection = "long" | "short";
export type SignalStatus = "pending" | "taken" | "skipped" | "expired";
export type PositionStatus = "open" | "closed";
export type TradeResult = "win" | "loss" | "breakeven";
export type ExecutionType = "stock" | "leverage";
export type PositionActionType =
  | "raise_stop"
  | "move_stop_to_breakeven"
  | "take_partial"
  | "reduce_position"
  | "close_full"
  | "hold";
export type ActionExecutionState = "pending" | "acknowledged" | "executed";

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
  // Leverage execution fields
  execution_type: ExecutionType | null;
  execution_symbol: string | null;
  execution_isin: string | null;
  issuer: string | null;
  target_leverage: number | null;
  knockout_level: number | null;
  instrument_currency: string | null;
  instrument_price: number | null;
  execution_note: string | null;
}

export interface PositionAction {
  id: string;
  position_id: string;
  action_type: PositionActionType;
  target_value: number | null;
  description: string | null;
  execution_state: ActionExecutionState;
  created_by: string;
  created_at: string;
  executed_at: string | null;
}

export interface PartialExit {
  id: string;
  position_id: string;
  exit_price: number;
  quantity: number;
  pnl: number | null;
  pnl_percent: number | null;
  fees: number;
  notes: string | null;
  exited_at: string;
  created_at: string;
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
  original_quantity: number | null;
  remaining_quantity: number | null;
  status: PositionStatus;
  notes: string | null;
  opened_at: string;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  position_actions?: PositionAction[];
  partial_exits?: PartialExit[];
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

export interface PartialClosePosition {
  exit_price: number;
  quantity: number;
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
  // Leverage fields
  execution_type?: ExecutionType;
  execution_symbol?: string;
  execution_isin?: string;
  issuer?: string;
  target_leverage?: number;
  knockout_level?: number;
  instrument_currency?: string;
  instrument_price?: number;
  execution_note?: string;
}

export interface UpdateSignal {
  status?: SignalStatus;
  entry_price?: number;
  stop_loss?: number;
  take_profit?: number;
}

export interface UpdatePosition {
  stop_loss?: number;
  take_profit?: number;
  notes?: string;
  remaining_quantity?: number;
}

export interface CreatePositionAction {
  position_id: string;
  action_type: PositionActionType;
  target_value?: number;
  description?: string;
  created_by?: string;
}
