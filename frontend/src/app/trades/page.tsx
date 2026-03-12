"use client";

import AppShell from "@/components/layout/AppShell";
import { useEffect, useState, useCallback } from "react";
import { tradesApi } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import type { Trade, TradeStats } from "@/types";

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
      const [t, s] = await Promise.all([tradesApi.list(params), tradesApi.stats()]);
      setTrades(t); setStats(s);
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

function MiniStat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--r)] shadow-[var(--shadow)] p-3 text-center">
      <p className="font-['DM_Mono',monospace] text-[8px] text-[var(--ink4)] uppercase tracking-[1px]">{label}</p>
      <p className="font-['Fraunces'] text-[18px] font-bold mt-0.5" style={{ color: color || "var(--ink)" }}>{value}</p>
    </div>
  );
}
