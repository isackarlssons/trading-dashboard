"use client";

import AppShell from "@/components/layout/AppShell";
import { useEffect, useState, useCallback } from "react";
import { tradesApi } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import type { Trade, TradeStats, TradeAnalytics, BreakdownGroup } from "@/types";

export default function TradesPage() {
  return (
    <AppShell>
      <TradesContent />
    </AppShell>
  );
}

function TradesContent() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [stats, setStats] = useState<TradeStats | null>(null);
  const [analytics, setAnalytics] = useState<TradeAnalytics | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [tickerSearch, setTickerSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => { loadTrades(); }, [filter]);

  const loadTrades = useCallback(async () => {
    try {
      setLoading(true);
      const params = filter !== "all" ? { result: filter } : undefined;
      const [t, s, a] = await Promise.all([
        tradesApi.list(params),
        tradesApi.stats(),
        tradesApi.analytics().catch(() => null),
      ]);
      setTrades(t); setStats(s); setAnalytics(a);
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }, [filter]);

  async function handleDelete(tradeId: string) {
    if (deletingId === tradeId) {
      try {
        setTrades(prev => prev.filter(t => t.id !== tradeId)); setDeletingId(null);
        await tradesApi.delete(tradeId);
        setStats(await tradesApi.stats());
      } catch (err: any) { setError(err.message); loadTrades(); }
    } else { setDeletingId(tradeId); }
  }

  const tabs = [
    { key: "all", label: "Alla" },
    { key: "win", label: "Vinster" },
    { key: "loss", label: "Förluster" },
    { key: "breakeven", label: "Breakeven" },
  ];

  const filtered = trades.filter(t => tickerSearch ? t.ticker.toLowerCase().includes(tickerSearch.toLowerCase()) : true);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-['Fraunces'] text-[22px] font-semibold text-[var(--ink)]">Trade Historik</h1>
        <div className="flex bg-[var(--cream2)] border border-[var(--border)] rounded-[var(--r-sm)] p-[3px] gap-[2px]">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setFilter(t.key)}
              className={`px-[12px] py-[5px] text-[11px] font-['DM_Mono',monospace] rounded-[4px] border-0 cursor-pointer transition-all ${filter === t.key ? "bg-[var(--surface)] text-[var(--ink)] shadow-[var(--shadow)]" : "bg-transparent text-[var(--ink3)]"}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      {stats && stats.total_trades > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          <MiniStat label="Totalt" value={stats.total_trades} />
          <MiniStat label="Win Rate" value={`${stats.win_rate}%`} color={stats.win_rate >= 50 ? "var(--green)" : "var(--red)"} />
          <MiniStat label="Avg P&L %" value={`${stats.avg_pnl_percent > 0 ? "+" : ""}${stats.avg_pnl_percent}%`} color={stats.avg_pnl_percent >= 0 ? "var(--green)" : "var(--red)"} />
          <MiniStat label="Bäst" value={`+${stats.best_trade || 0}%`} color="var(--green)" />
          <MiniStat label="Sämst" value={`${stats.worst_trade || 0}%`} color="var(--red)" />
          <MiniStat label="PF" value={stats.profit_factor?.toString() || "N/A"} />
        </div>
      )}

      {analytics && analytics.total_trades > 0 && (
        <AnalyticsSection a={analytics} />
      )}

      {error && (
        <div className="bg-[var(--red2)] border border-[#dcc4c4] rounded-[var(--r-sm)] px-4 py-2 flex items-center justify-between">
          <p className="text-[var(--red)] text-xs font-['DM_Mono',monospace]">{error}</p>
          <button onClick={() => setError("")} className="text-[var(--red)] text-xs cursor-pointer border-0 bg-transparent">✕</button>
        </div>
      )}

      <Card>
        {/* Filter */}
        <div className="flex items-center gap-[10px] px-[22px] py-[11px] border-b border-[var(--border)] bg-[var(--cream)] flex-wrap">
          <span className="font-['DM_Mono',monospace] text-[8.5px] text-[var(--ink4)] uppercase tracking-[1.1px]">Filter</span>
          <input type="text" placeholder="Ticker…" value={tickerSearch} onChange={e => setTickerSearch(e.target.value)}
            className="px-[9px] py-[5px] border border-[var(--border2)] rounded-[var(--r-sm)] text-[11.5px] font-['DM_Mono',monospace] bg-[var(--surface)] text-[var(--ink)] outline-none min-w-[126px] focus:border-[var(--green2)]" />
          <select className="px-[9px] py-[5px] border border-[var(--border2)] rounded-[var(--r-sm)] text-[11.5px] font-['DM_Mono',monospace] bg-[var(--surface)] text-[var(--ink)] outline-none cursor-pointer">
            <option value="">Alla datum</option>
          </select>
          {tickerSearch && (
            <button onClick={() => setTickerSearch("")} className="text-[10px] text-[var(--ink4)] font-['DM_Mono',monospace] underline bg-transparent border-0 cursor-pointer">Rensa</button>
          )}
        </div>

        {loading ? (
          <div className="py-[52px] text-center font-['DM_Mono',monospace] text-[10.5px] text-[var(--ink4)]">Laddar trades...</div>
        ) : filtered.length === 0 ? (
          <div className="py-[52px] text-center font-['DM_Mono',monospace] text-[10.5px] text-[var(--ink4)]">Inga trades hittades</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  {["Ticker","Dir","Entry","Exit","P&L %","P&L","Resultat","Öppnad","Stängd",""].map(h => (
                    <th key={h} className="text-left py-[10px] px-[12px] font-['DM_Mono',monospace] text-[8px] text-[var(--ink4)] uppercase tracking-[1px] font-medium first:pl-[22px] last:pr-[22px]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(trade => (
                  <tr key={trade.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--cream)] transition-colors">
                    <td className="py-[12px] px-[12px] pl-[22px] font-['Fraunces'] font-bold text-[14px] text-[var(--ink)]">{trade.ticker}</td>
                    <td className="py-[12px] px-[12px]"><Badge variant={trade.direction}>{trade.direction.toUpperCase()}</Badge></td>
                    <td className="py-[12px] px-[12px] font-['DM_Mono',monospace] text-[12px] text-[var(--ink2)]">{trade.entry_price.toFixed(2)}</td>
                    <td className="py-[12px] px-[12px] font-['DM_Mono',monospace] text-[12px] text-[var(--ink2)]">{trade.exit_price.toFixed(2)}</td>
                    <td className="py-[12px] px-[12px] font-['DM_Mono',monospace] text-[12px] font-medium" style={{ color: (trade.pnl_percent || 0) >= 0 ? "var(--green)" : "var(--red)" }}>
                      {(trade.pnl_percent || 0) > 0 ? "+" : ""}{trade.pnl_percent?.toFixed(2)}%
                    </td>
                    <td className="py-[12px] px-[12px] font-['DM_Mono',monospace] text-[12px]" style={{ color: (trade.pnl || 0) >= 0 ? "var(--green)" : "var(--red)" }}>
                      {trade.pnl != null ? `${trade.pnl > 0 ? "+" : ""}${trade.pnl.toFixed(2)}` : "-"}
                    </td>
                    <td className="py-[12px] px-[12px]"><Badge variant={trade.result}>{trade.result.toUpperCase()}</Badge></td>
                    <td className="py-[12px] px-[12px] font-['DM_Mono',monospace] text-[10px] text-[var(--ink4)]">{new Date(trade.opened_at).toLocaleDateString("sv-SE")}</td>
                    <td className="py-[12px] px-[12px] font-['DM_Mono',monospace] text-[10px] text-[var(--ink4)]">{new Date(trade.closed_at).toLocaleDateString("sv-SE")}</td>
                    <td className="py-[12px] px-[12px] pr-[22px]">
                      {deletingId === trade.id ? (
                        <div className="flex items-center gap-1">
                          <button onClick={() => handleDelete(trade.id)} className="font-['DM_Mono',monospace] text-[9px] text-[var(--red)] border border-[#dcc4c4] px-1.5 py-0.5 rounded-[3px] hover:bg-[var(--red2)] cursor-pointer bg-transparent">Bekräfta</button>
                          <button onClick={() => setDeletingId(null)} className="font-['DM_Mono',monospace] text-[9px] text-[var(--ink4)] px-1.5 py-0.5 cursor-pointer border-0 bg-transparent">✕</button>
                        </div>
                      ) : (
                        <button onClick={() => setDeletingId(trade.id)} className="text-[var(--red2)] hover:text-[var(--red)] text-[12px] cursor-pointer border-0 bg-transparent transition-colors">✕</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Analytics Section ────────────────────────────────────────────────────────

function AnalyticsSection({ a }: { a: TradeAnalytics }) {
  const fmt = (v: number | null, decimals = 2, suffix = "") =>
    v != null ? `${v.toFixed(decimals)}${suffix}` : "N/A";
  const fmtR = (v: number | null) =>
    v != null ? `${v > 0 ? "+" : ""}${v.toFixed(2)}R` : "N/A";

  const hasStrategies = Object.keys(a.by_strategy).length > 0;
  const hasRegimes    = Object.keys(a.by_regime).filter(k => k !== "Unknown").length > 0;
  const hasExitReasons = Object.keys(a.by_exit_reason || {}).filter(k => k !== "Unknown").length > 0;
  const hasScoreBuckets = Object.keys(a.by_score_bucket || {}).filter(k => k !== "Unknown").length > 0;

  return (
    <div className="space-y-3">
      {/* Header */}
      <h2 className="font-['DM_Mono',monospace] text-[9px] text-[var(--ink4)] uppercase tracking-[1.4px]">
        Analytik · R-multiplar & Strategi
      </h2>

      {/* R-metric row */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        <MiniStat label="Expectancy" value={fmtR(a.expectancy_r)}
          color={a.expectancy_r != null ? (a.expectancy_r >= 0 ? "var(--green)" : "var(--red)") : undefined} />
        <MiniStat label="Avg R" value={fmtR(a.avg_r)}
          color={a.avg_r != null ? (a.avg_r >= 0 ? "var(--green)" : "var(--red)") : undefined} />
        <MiniStat label="Avg Vinst R" value={fmtR(a.avg_win_r)} color="var(--green)" />
        <MiniStat label="Avg Förlust R" value={fmtR(a.avg_loss_r)} color="var(--red)" />
        <MiniStat label="Max Drawdown" value={fmt(a.max_drawdown_pct, 1, "%")}
          color={a.max_drawdown_pct != null && a.max_drawdown_pct > 0 ? "var(--red)" : undefined} />
        <MiniStat label="Snitt Dagar" value={fmt(a.avg_holding_days, 1)} />
      </div>

      {/* Strategy & Regime breakdown */}
      {(hasStrategies || hasRegimes) && (
        <div className={`grid gap-3 ${hasStrategies && hasRegimes ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"}`}>
          {hasStrategies && (
            <BreakdownTable title="Per Strategi" data={a.by_strategy} />
          )}
          {hasRegimes && (
            <BreakdownTable title="Per Regime" data={a.by_regime} />
          )}
        </div>
      )}

      {/* Exit & Score analytics */}
      {(hasExitReasons || hasScoreBuckets) && (
        <>
          <h2 className="font-['DM_Mono',monospace] text-[9px] text-[var(--ink4)] uppercase tracking-[1.4px] pt-1">
            Exit Attribution & Signal Kvalitet
          </h2>
          <div className={`grid gap-3 ${hasExitReasons && hasScoreBuckets ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"}`}>
            {hasExitReasons && (
              <BreakdownTable title="Per Exit-orsak" data={a.by_exit_reason} showPnlPct />
            )}
            {hasScoreBuckets && (
              <BreakdownTable title="Per Signal-score (bucket)" data={a.by_score_bucket} showPnlPct sortByKey />
            )}
          </div>
        </>
      )}
    </div>
  );
}

function BreakdownTable({
  title,
  data,
  showPnlPct = false,
  sortByKey = false,
}: {
  title: string;
  data: Record<string, BreakdownGroup>;
  showPnlPct?: boolean;
  sortByKey?: boolean;
}) {
  const rows = Object.entries(data).sort((a, b) =>
    sortByKey ? a[0].localeCompare(b[0]) : b[1].trades - a[1].trades
  );
  const headers = ["Namn", "Trades", "Win %", "Avg R", ...(showPnlPct ? ["Avg P&L %"] : [])];
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--r)] shadow-[var(--shadow)] overflow-hidden">
      <div className="px-[14px] py-[8px] border-b border-[var(--border)] bg-[var(--cream)]">
        <span className="font-['DM_Mono',monospace] text-[8.5px] text-[var(--ink4)] uppercase tracking-[1.1px]">{title}</span>
      </div>
      <table className="w-full">
        <thead>
          <tr className="border-b border-[var(--border)]">
            {headers.map(h => (
              <th key={h} className="text-left py-[7px] px-[12px] font-['DM_Mono',monospace] text-[7.5px] text-[var(--ink4)] uppercase tracking-[1px] first:pl-[14px] last:pr-[14px]">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([name, g]) => (
            <tr key={name} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--cream)] transition-colors">
              <td className="py-[8px] px-[12px] pl-[14px] font-['DM_Mono',monospace] text-[11px] text-[var(--ink)]">{name}</td>
              <td className="py-[8px] px-[12px] font-['DM_Mono',monospace] text-[11px] text-[var(--ink3)]">{g.trades}</td>
              <td className="py-[8px] px-[12px] font-['DM_Mono',monospace] text-[11px] font-medium"
                style={{ color: g.win_rate >= 50 ? "var(--green)" : "var(--red)" }}>
                {g.win_rate.toFixed(1)}%
              </td>
              <td className="py-[8px] px-[12px] font-['DM_Mono',monospace] text-[11px]"
                style={{ color: g.avg_r != null ? (g.avg_r >= 0 ? "var(--green)" : "var(--red)") : "var(--ink4)" }}>
                {g.avg_r != null ? `${g.avg_r > 0 ? "+" : ""}${g.avg_r.toFixed(2)}R` : "N/A"}
              </td>
              {showPnlPct && (
                <td className="py-[8px] px-[12px] pr-[14px] font-['DM_Mono',monospace] text-[11px]"
                  style={{ color: g.avg_pnl_pct != null ? (g.avg_pnl_pct >= 0 ? "var(--green)" : "var(--red)") : "var(--ink4)" }}>
                  {g.avg_pnl_pct != null ? `${g.avg_pnl_pct > 0 ? "+" : ""}${g.avg_pnl_pct.toFixed(2)}%` : "N/A"}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--r)] shadow-[var(--shadow)] p-3 text-center">
      <p className="font-['DM_Mono',monospace] text-[8px] text-[var(--ink4)] uppercase tracking-[1px]">{label}</p>
      <p className="font-['Fraunces'] text-[18px] font-bold mt-0.5" style={{ color: color || "var(--ink)" }}>{value}</p>
    </div>
  );
}
