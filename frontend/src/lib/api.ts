import { supabase } from "./supabase";
import type {
  Signal,
  Position,
  Trade,
  TradeStats,
  Strategy,
  CreateSignal,
  UpdateSignal,
  CreatePositionFromSignal,
  ClosePosition,
  PartialClosePosition,
  UpdatePosition,
  PositionAction,
  CreatePositionAction,
  PartialExit,
} from "@/types";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1").replace(/\/+$/, "");

async function getAuthHeaders(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("Not authenticated");
  }

  return {
    Authorization: `Bearer ${session.access_token}`,
    "Content-Type": "application/json",
  };
}

async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: { ...headers, ...options.headers },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(error.detail || `API error: ${response.status}`);
  }

  return response.json();
}

// ─── Strategies ─────────────────────────────────────────────────────────────

export const strategiesApi = {
  list: () => apiFetch<Strategy[]>("/strategies/"),
  get: (id: string) => apiFetch<Strategy>(`/strategies/${id}`),
};

// ─── Signals ────────────────────────────────────────────────────────────────

export const signalsApi = {
  list: (params?: { status?: string; strategy_id?: string; ticker?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set("status", params.status);
    if (params?.strategy_id) searchParams.set("strategy_id", params.strategy_id);
    if (params?.ticker) searchParams.set("ticker", params.ticker);
    const qs = searchParams.toString();
    return apiFetch<Signal[]>(`/signals/${qs ? `?${qs}` : ""}`);
  },

  pending: () => apiFetch<Signal[]>("/signals/pending"),

  get: (id: string) => apiFetch<Signal>(`/signals/${id}`),

  create: (data: CreateSignal) =>
    apiFetch<Signal>("/signals/", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  update: (id: string, data: UpdateSignal) =>
    apiFetch<Signal>(`/signals/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
};

// ─── Positions ──────────────────────────────────────────────────────────────

export const positionsApi = {
  list: (params?: { status?: string; ticker?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set("status", params.status);
    if (params?.ticker) searchParams.set("ticker", params.ticker);
    const qs = searchParams.toString();
    return apiFetch<Position[]>(`/positions/${qs ? `?${qs}` : ""}`);
  },

  open: () => apiFetch<Position[]>("/positions/open"),

  get: (id: string) => apiFetch<Position>(`/positions/${id}`),

  fromSignal: (data: CreatePositionFromSignal) =>
    apiFetch<Position>("/positions/from-signal", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  update: (id: string, data: UpdatePosition) =>
    apiFetch<Position>(`/positions/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  close: (id: string, data: ClosePosition) =>
    apiFetch<Trade>(`/positions/${id}/close`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  partialClose: (id: string, data: PartialClosePosition) =>
    apiFetch<{ partial_exit: PartialExit; remaining_quantity: number; position_closed: boolean }>(
      `/positions/${id}/partial-close`,
      {
        method: "POST",
        body: JSON.stringify(data),
      }
    ),

  delete: (id: string) =>
    apiFetch<{ deleted: boolean }>(`/positions/${id}`, {
      method: "DELETE",
    }),
};

// ─── Position Actions ───────────────────────────────────────────────────────

export const positionActionsApi = {
  listForPosition: (positionId: string, state?: string) => {
    const qs = state ? `?state=${state}` : "";
    return apiFetch<PositionAction[]>(`/position-actions/by-position/${positionId}${qs}`);
  },

  listPending: () => apiFetch<PositionAction[]>("/position-actions/pending"),

  create: (data: CreatePositionAction) =>
    apiFetch<PositionAction>("/position-actions/", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateState: (actionId: string, execution_state: string) =>
    apiFetch<PositionAction>(`/position-actions/${actionId}`, {
      method: "PATCH",
      body: JSON.stringify({ execution_state }),
    }),

  delete: (actionId: string) =>
    apiFetch<{ deleted: boolean }>(`/position-actions/${actionId}`, {
      method: "DELETE",
    }),
};

// ─── Trades ─────────────────────────────────────────────────────────────────

export const tradesApi = {
  list: (params?: { ticker?: string; result?: string; direction?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.ticker) searchParams.set("ticker", params.ticker);
    if (params?.result) searchParams.set("result", params.result);
    if (params?.direction) searchParams.set("direction", params.direction);
    const qs = searchParams.toString();
    return apiFetch<Trade[]>(`/trades/${qs ? `?${qs}` : ""}`);
  },

  stats: (ticker?: string) => {
    const qs = ticker ? `?ticker=${ticker}` : "";
    return apiFetch<TradeStats>(`/trades/stats${qs}`);
  },

  get: (id: string) => apiFetch<Trade>(`/trades/${id}`),

  delete: (id: string) =>
    apiFetch<{ deleted: boolean }>(`/trades/${id}`, {
      method: "DELETE",
    }),
};
