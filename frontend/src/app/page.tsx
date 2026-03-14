"use client";

import AppShell from "@/components/layout/AppShell";
import { useEffect, useState } from "react";
import { signalsApi, positionsApi, tradesApi, positionActionsApi } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import type { Signal, Position, TradeStats, RiskSummary } from "@/types";

export default function DashboardPage() {
  return (
    <AppShell>
      <DashboardContent />
    </AppShell>
  );
}

function DashboardContent() {
  const [pendingSignals, setPendingSignals] = useState<Signal[]>([]);
  const [openPositions, setOpenPositions] = useState<Position[]>([]);
  const [stats, setStats] = useState<TradeStats | null>(null);
  const [riskSummary, setRiskSummary] = useState<RiskSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    try {
      setLoading(true);
      const [signals, positions, tradeStats, risk] = await Promise.all([
        signalsApi.pending(),
        positionsApi.open(),
        tradesApi.stats(),
        positionsApi.riskSummary().catch(() => null),
      ]);
      setPendingSignals(signals);
      setOpenPositions(positions);
      setStats(tradeStats);
      setRiskSummary(risk);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="text-[var(--ink4)] font-['DM_Mono',monospace] text-xs py-12 text-center">
        Laddar...
      </div>
    );
  }

  if (error) {
    return (
      <Card className="p-5">
        <p className="text-[var(--red)] text-sm">Fel: {error}</p>
        <button
          onClick={loadDashboard}
          className="mt-2 font-['DM_Mono',monospace] text-[11px] text-[var(--ink2)] border border-[var(--border2)] px-3 py-1.5 rounded-[var(--r-sm)] hover:bg-[var(--cream2)] transition-colors cursor-pointer"
        >
          Försök igen
        </button>
      </Card>
    );
  }

  const now = new Date();
  const dateStr = now.toLocaleDateString("sv-SE", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-['Fraunces'] text-[22px] font-semibold text-[var(--ink)]">
          Översikt
        </h1>
        <span className="font-['DM_Mono',monospace] text-[10px] text-[var(--ink4)]">
          {dateStr}
        </span>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Pending Signals"
          value={pendingSignals.length}
          sub={`${pendingSignals.length} signaler väntar`}
        />
        <StatCard
          label="Öppna Positioner"
          value={openPositions.length}
          sub="Just nu"
        />
        <StatCard
          label="Totalt Trades"
          value={stats?.total_trades || 0}
          sub="Historik"
        />
        <StatCard
          label="Win Rate"
          value={`${stats?.win_rate || 0}%`}
          sub={`${stats?.wins || 0} vinster · ${stats?.losses || 0} förluster`}
          highlight={(stats?.win_rate || 0) >= 50}
        />
      </div>

      {/* Stats Detail */}
      {stats && stats.total_trades > 0 && (
        <Card>
          <div className="px-[22px] py-[16px]">
            <h2 className="font-['Fraunces'] font-semibold text-[14px] text-[var(--ink)] mb-4">
              Trading Statistik
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div>
                <p className="font-['DM_Mono',monospace] text-[8px] text-[var(--ink4)] uppercase tracking-[1px] mb-1">
                  Vinster / Förluster
                </p>
                <p className="font-['Fraunces'] text-[22px] font-bold text-[var(--ink)]">
                  <span style={{ color: "var(--green)" }}>{stats.wins}</span>
                  <span className="text-[var(--ink4)]"> / </span>
                  <span style={{ color: "var(--red)" }}>{stats.losses}</span>
                </p>
              </div>
              <div>
                <p className="font-['DM_Mono',monospace] text-[8px] text-[var(--ink4)] uppercase tracking-[1px] mb-1">
                  Avg P&L %
                </p>
                <p
                  className="font-['Fraunces'] text-[22px] font-bold"
                  style={{
                    color:
                      stats.avg_pnl_percent >= 0 ? "var(--green)" : "var(--red)",
                  }}
                >
                  {stats.avg_pnl_percent > 0 ? "+" : ""}
                  {stats.avg_pnl_percent}%
                </p>
              </div>
              <div>
                <p className="font-['DM_Mono',monospace] text-[8px] text-[var(--ink4)] uppercase tracking-[1px] mb-1">
                  Bäst / Sämst
                </p>
                <p className="font-['Fraunces'] text-[22px] font-bold text-[var(--ink)]">
                  <span style={{ color: "var(--green)" }}>
                    +{stats.best_trade || 0}%
                  </span>
                  <span className="text-[var(--ink4)]"> / </span>
                  <span style={{ color: "var(--red)" }}>
                    {stats.worst_trade || 0}%
                  </span>
                </p>
              </div>
              <div>
                <p className="font-['DM_Mono',monospace] text-[8px] text-[var(--ink4)] uppercase tracking-[1px] mb-1">
                  Profit Factor
                </p>
                <p className="font-['Fraunces'] text-[22px] font-bold text-[var(--ink)]">
                  {stats.profit_factor || "N/A"}
                </p>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Risk Monitor */}
      {riskSummary && (riskSummary.open_positions_count + riskSummary.reduced_positions_count) > 0 && (
        <Card>
          <div className="px-[22px] py-[16px]">
            <h2 className="font-['Fraunces'] font-semibold text-[14px] text-[var(--ink)] mb-4">
              Risk Monitor
            </h2>

            {/* Summary row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-5">
              <div>
                <p className="font-['DM_Mono',monospace] text-[8px] text-[var(--ink4)] uppercase tracking-[1px] mb-1">Total riskexponering</p>
                <p className="font-['Fraunces'] text-[22px] font-bold" style={{ color: "var(--red)" }}>
                  {riskSummary.total_open_risk > 0 ? `-${riskSummary.total_open_risk.toFixed(2)}` : "0.00"}
                </p>
              </div>
              <div>
                <p className="font-['DM_Mono',monospace] text-[8px] text-[var(--ink4)] uppercase tracking-[1px] mb-1">Orealiserad P&L</p>
                <p className="font-['Fraunces'] text-[22px] font-bold" style={{ color: riskSummary.total_unrealized_pnl >= 0 ? "var(--green)" : "var(--red)" }}>
                  {riskSummary.total_unrealized_pnl >= 0 ? "+" : ""}{riskSummary.total_unrealized_pnl.toFixed(2)}
                  {riskSummary.per_position.some(p => p.price_unavailable) && (
                    <span className="font-['DM_Mono',monospace] text-[9px] text-[var(--ink4)] ml-1">*</span>
                  )}
                </p>
              </div>
              <div>
                <p className="font-['DM_Mono',monospace] text-[8px] text-[var(--ink4)] uppercase tracking-[1px] mb-1">Öppna / Reducerade</p>
                <p className="font-['Fraunces'] text-[22px] font-bold text-[var(--ink)]">
                  {riskSummary.open_positions_count}
                  <span className="text-[var(--ink4)]"> / </span>
                  {riskSummary.reduced_positions_count}
                </p>
              </div>
              <div>
                <p className="font-['DM_Mono',monospace] text-[8px] text-[var(--ink4)] uppercase tracking-[1px] mb-1">Max nedsida (stops)</p>
                <p className="font-['Fraunces'] text-[22px] font-bold" style={{ color: "var(--red)" }}>
                  {riskSummary.max_downside_to_stops > 0 ? `-${riskSummary.max_downside_to_stops.toFixed(2)}` : "0.00"}
                </p>
              </div>
            </div>

            {/* Per-position table */}
            <div className="border border-[var(--border)] rounded-[var(--r-sm)] overflow-hidden">
              <div className="grid grid-cols-[1fr_60px_70px_80px_80px_80px] font-['DM_Mono',monospace] text-[8px] text-[var(--ink4)] uppercase tracking-[0.9px] px-3 py-[6px] bg-[var(--cream)] border-b border-[var(--border)]">
                <span>Ticker</span>
                <span>Dir</span>
                <span>Entry</span>
                <span>SL</span>
                <span className="text-right">Risk</span>
                <span className="text-right">P&L</span>
              </div>
              {riskSummary.per_position.map((p) => (
                <div key={p.position_id} className="grid grid-cols-[1fr_60px_70px_80px_80px_80px] items-center px-3 py-[8px] border-b border-[var(--border)] last:border-0 hover:bg-[var(--cream)] transition-colors">
                  <div className="flex items-center gap-[6px]">
                    <span className="font-['Fraunces'] font-bold text-[13px] text-[var(--ink)]">{p.ticker}</span>
                    {p.status === "reduced" && (
                      <span className="font-['DM_Mono',monospace] text-[8px] text-[var(--amber)] border border-[var(--amber)] px-[4px] py-[1px] rounded-[2px]">RED</span>
                    )}
                  </div>
                  <Badge variant={p.direction}>{p.direction.toUpperCase()}</Badge>
                  <span className="font-['DM_Mono',monospace] text-[11px] text-[var(--ink3)]">
                    {p.actual_entry_price?.toFixed(2) ?? "-"}
                  </span>
                  <span className="font-['DM_Mono',monospace] text-[11px]" style={{ color: "var(--red)" }}>
                    {p.current_stop_loss?.toFixed(2) ?? "-"}
                  </span>
                  <span className="font-['DM_Mono',monospace] text-[11px] text-right" style={{ color: "var(--red)" }}>
                    {p.risk_to_stop != null ? `-${p.risk_to_stop.toFixed(2)}` : "-"}
                  </span>
                  <span className="font-['DM_Mono',monospace] text-[11px] text-right" style={{
                    color: p.price_unavailable ? "var(--ink4)" : (p.unrealized_pnl ?? 0) >= 0 ? "var(--green)" : "var(--red)"
                  }}>
                    {p.price_unavailable ? "N/A" : p.unrealized_pnl != null ? `${p.unrealized_pnl >= 0 ? "+" : ""}${p.unrealized_pnl.toFixed(2)}` : "-"}
                  </span>
                </div>
              ))}
            </div>
            {riskSummary.per_position.some(p => p.price_unavailable) && (
              <p className="font-['DM_Mono',monospace] text-[9px] text-[var(--ink4)] mt-2">
                * Livepris ej tillgängligt för vissa positioner — orealiserad P&L är partiell
              </p>
            )}
          </div>
        </Card>
      )}

      {/* Two column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Pending Signals */}
        <Card>
          <div className="flex items-center justify-between px-[22px] py-[14px] border-b border-[var(--border)]">
            <h2 className="font-['Fraunces'] font-semibold text-[14px] text-[var(--ink)]">
              Pending Signals
            </h2>
            <div className="flex items-center gap-2">
              <span className="font-['DM_Mono',monospace] text-[10px] bg-[var(--cream2)] text-[var(--ink3)] px-2 py-0.5 rounded-full">
                {pendingSignals.length}
              </span>
              <a
                href="/signals"
                className="font-['DM_Mono',monospace] text-[10px] text-[var(--ink3)] border border-[var(--border)] px-2 py-0.5 rounded-[var(--r-sm)] hover:bg-[var(--cream2)] transition-colors"
              >
                Visa alla →
              </a>
            </div>
          </div>
          {pendingSignals.length === 0 ? (
            <div className="py-10 text-center font-['DM_Mono',monospace] text-[10.5px] text-[var(--ink4)]">
              Inga väntande signaler
            </div>
          ) : (
            <div>
              {pendingSignals.slice(0, 6).map((signal) => {
                const market =
                  typeof signal.metadata === "object" &&
                  signal.metadata !== null &&
                  "market" in signal.metadata
                    ? String(signal.metadata.market).toLowerCase()
                    : null;
                return (
                  <div
                    key={signal.id}
                    className="flex items-center gap-[9px] px-[22px] py-[11px] border-b border-[var(--border)] last:border-0 hover:bg-[var(--cream)] transition-colors flex-wrap"
                  >
                    <span className="font-['Fraunces'] font-bold text-[14px] text-[var(--ink)] min-w-[80px]">
                      {signal.ticker}
                    </span>
                    <Badge variant={signal.direction}>
                      {signal.direction.toUpperCase()}
                    </Badge>
                    {market && (
                      <Badge variant={market}>{market.toUpperCase()}</Badge>
                    )}
                    <span className="font-['DM_Mono',monospace] text-[9px] text-[var(--ink4)] ml-auto">
                      {signal.strategies?.name || ""}
                    </span>
                    <div className="flex gap-3 font-['DM_Mono',monospace] text-[11px]">
                      <span className="text-[var(--ink3)]">
                        E {signal.entry_price?.toFixed(2)}
                      </span>
                      <span style={{ color: "var(--red)" }}>
                        SL {signal.stop_loss?.toFixed(2)}
                      </span>
                      <span style={{ color: "var(--green)" }}>
                        TP {signal.take_profit?.toFixed(2)}
                      </span>
                    </div>
                  </div>
                );
              })}
              {pendingSignals.length > 6 && (
                <a
                  href="/signals"
                  className="block text-center font-['DM_Mono',monospace] text-[10px] text-[var(--ink3)] py-2 hover:text-[var(--ink)] underline"
                >
                  +{pendingSignals.length - 6} fler · Visa alla
                </a>
              )}
            </div>
          )}
        </Card>

        {/* Open Positions */}
        <Card>
          <div className="flex items-center justify-between px-[22px] py-[14px] border-b border-[var(--border)]">
            <h2 className="font-['Fraunces'] font-semibold text-[14px] text-[var(--ink)]">
              Öppna Positioner
            </h2>
            <span className="font-['DM_Mono',monospace] text-[10px] bg-[var(--cream2)] text-[var(--ink3)] px-2 py-0.5 rounded-full">
              {openPositions.length}
            </span>
          </div>
          {openPositions.length === 0 ? (
            <div className="py-10 text-center">
              <div className="text-[var(--ink4)] text-lg mb-1">□</div>
              <p className="font-['DM_Mono',monospace] text-[10.5px] text-[var(--ink4)]">
                Inga öppna positioner
              </p>
            </div>
          ) : (
            <div>
              {openPositions.map((pos) => {
                const pendingActs = (pos.position_actions || []).filter(
                  (a) => a.execution_state === "pending"
                );
                return (
                  <div
                    key={pos.id}
                    className="flex items-center gap-[9px] px-[22px] py-[11px] border-b border-[var(--border)] last:border-0 hover:bg-[var(--cream)] transition-colors flex-wrap"
                  >
                    <span className="font-['Fraunces'] font-bold text-[14px] text-[var(--ink)] min-w-[80px]">
                      {pos.ticker}
                    </span>
                    <Badge variant={pos.direction}>
                      {pos.direction.toUpperCase()}
                    </Badge>
                    {pendingActs.length > 0 && (
                      <span className="font-['DM_Mono',monospace] text-[9px] text-[var(--amber)]">
                        ⚡ {pendingActs.length}
                      </span>
                    )}
                    <div className="flex gap-3 font-['DM_Mono',monospace] text-[11px] ml-auto">
                      <span className="text-[var(--ink3)]">
                        {pos.entry_price.toFixed(2)}
                      </span>
                      <span style={{ color: "var(--red)" }}>
                        {pos.stop_loss?.toFixed(2) || "-"}
                      </span>
                      <span style={{ color: "var(--green)" }}>
                        {pos.take_profit?.toFixed(2) || "-"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string | number;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-[var(--r)] border border-[var(--border)] shadow-[var(--shadow)] p-5 ${
        highlight
          ? "bg-[var(--green)] text-white"
          : "bg-[var(--surface)]"
      }`}
    >
      <p
        className={`font-['DM_Mono',monospace] text-[8px] uppercase tracking-[1px] mb-2 ${
          highlight ? "text-white/70" : "text-[var(--ink4)]"
        }`}
      >
        {label}
      </p>
      <p
        className={`font-['Fraunces'] text-[32px] font-bold leading-none ${
          highlight ? "text-white" : "text-[var(--ink)]"
        }`}
      >
        {value}
      </p>
      {sub && (
        <p
          className={`font-['DM_Mono',monospace] text-[9px] mt-2 ${
            highlight ? "text-white/60" : "text-[var(--ink4)]"
          }`}
        >
          {sub}
        </p>
      )}
    </div>
  );
}
