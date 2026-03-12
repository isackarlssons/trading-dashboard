"use client";

import AppShell from "@/components/layout/AppShell";
import { useEffect, useState, useCallback } from "react";
import { tradesApi } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    loadTrades();
  }, [filter]);

  const loadTrades = useCallback(async () => {
    try {
      setLoading(true);
      const params = filter !== "all" ? { result: filter } : undefined;
      const [tradesData, statsData] = await Promise.all([
        tradesApi.list(params),
        tradesApi.stats(),
      ]);
      setTrades(tradesData);
      setStats(statsData);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  async function handleDeleteTrade(tradeId: string) {
    if (deletingId === tradeId) {
      try {
        // Optimistic
        setTrades((prev) => prev.filter((t) => t.id !== tradeId));
        setDeletingId(null);
        await tradesApi.delete(tradeId);
        // Reload stats
        const statsData = await tradesApi.stats();
        setStats(statsData);
      } catch (err: any) {
        setError(err.message);
        loadTrades();
      }
    } else {
      setDeletingId(tradeId);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-white">📋 Avslutade Trades</h1>
        <div className="flex items-center gap-1 bg-gray-800/50 border border-gray-700 rounded-lg p-1">
          {["all", "win", "loss", "breakeven"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-md text-xs font-mono transition-all ${
                filter === f
                  ? "bg-gray-700 text-white shadow-sm"
                  : "text-gray-400 hover:text-gray-300"
              }`}
            >
              {f === "all" ? "Alla" : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Stats Summary */}
      {stats && stats.total_trades > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          <MiniStat label="Totalt" value={stats.total_trades} />
          <MiniStat
            label="Win Rate"
            value={`${stats.win_rate}%`}
            color={stats.win_rate >= 50 ? "green" : "red"}
          />
          <MiniStat
            label="Snitt P&L"
            value={`${stats.avg_pnl_percent > 0 ? "+" : ""}${stats.avg_pnl_percent}%`}
            color={stats.avg_pnl_percent >= 0 ? "green" : "red"}
          />
          <MiniStat
            label="Bästa"
            value={`+${stats.best_trade || 0}%`}
            color="green"
          />
          <MiniStat
            label="Sämsta"
            value={`${stats.worst_trade || 0}%`}
            color="red"
          />
          <MiniStat
            label="PF"
            value={stats.profit_factor?.toString() || "N/A"}
            color={stats.profit_factor && stats.profit_factor > 1 ? "green" : "red"}
          />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2 flex items-center justify-between">
          <p className="text-red-400 text-sm">{error}</p>
          <button onClick={() => setError("")} className="text-red-400 text-xs hover:text-red-300">
            ✕
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-gray-500 font-mono text-sm py-8 text-center">
          Laddar trades...
        </div>
      ) : trades.length === 0 ? (
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg py-12 text-center">
          <p className="text-gray-500 font-mono text-sm">Inga trades hittades</p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block bg-gray-800/50 border border-gray-700 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-500 border-b border-gray-700 text-[10px] font-mono uppercase tracking-wider">
                    <th className="text-left py-2.5 px-4">Ticker</th>
                    <th className="text-left py-2.5 px-2">Dir</th>
                    <th className="text-right py-2.5 px-2">Entry</th>
                    <th className="text-right py-2.5 px-2">Exit</th>
                    <th className="text-right py-2.5 px-2">P&L %</th>
                    <th className="text-right py-2.5 px-2">P&L</th>
                    <th className="text-center py-2.5 px-2">Resultat</th>
                    <th className="text-right py-2.5 px-2">Öppnad</th>
                    <th className="text-right py-2.5 px-2">Stängd</th>
                    <th className="text-right py-2.5 px-4"></th>
                  </tr>
                </thead>
                <tbody>
                  {trades.map((trade) => (
                    <tr
                      key={trade.id}
                      className="border-b border-gray-700/50 hover:bg-gray-700/20 transition-colors"
                    >
                      <td className="py-2.5 px-4 font-medium text-white font-mono text-xs">
                        {trade.ticker}
                      </td>
                      <td className="py-2.5 px-2">
                        <Badge variant={trade.direction}>
                          {trade.direction.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-2 text-right text-gray-300 font-mono text-xs">
                        {trade.entry_price.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-2 text-right text-gray-300 font-mono text-xs">
                        {trade.exit_price.toFixed(2)}
                      </td>
                      <td
                        className={`py-2.5 px-2 text-right font-mono text-xs font-medium ${
                          (trade.pnl_percent || 0) >= 0
                            ? "text-green-400"
                            : "text-red-400"
                        }`}
                      >
                        {(trade.pnl_percent || 0) > 0 ? "+" : ""}
                        {trade.pnl_percent?.toFixed(2) || "0.00"}%
                      </td>
                      <td
                        className={`py-2.5 px-2 text-right font-mono text-xs ${
                          (trade.pnl || 0) >= 0 ? "text-green-400" : "text-red-400"
                        }`}
                      >
                        {trade.pnl != null
                          ? `${trade.pnl > 0 ? "+" : ""}${trade.pnl.toFixed(2)}`
                          : "-"}
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        <Badge variant={trade.result}>
                          {trade.result.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-2 text-right text-gray-500 font-mono text-[10px]">
                        {new Date(trade.opened_at).toLocaleDateString("sv-SE")}
                      </td>
                      <td className="py-2.5 px-2 text-right text-gray-500 font-mono text-[10px]">
                        {new Date(trade.closed_at).toLocaleDateString("sv-SE")}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        {deletingId === trade.id ? (
                          <div className="flex items-center gap-1 justify-end">
                            <button
                              onClick={() => handleDeleteTrade(trade.id)}
                              className="text-[9px] font-mono text-red-400 border border-red-500/30 px-1.5 py-0.5 rounded hover:bg-red-500/10"
                            >
                              Bekräfta
                            </button>
                            <button
                              onClick={() => setDeletingId(null)}
                              className="text-[9px] font-mono text-gray-500 px-1.5 py-0.5 rounded hover:bg-gray-700"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeletingId(trade.id)}
                            className="text-[10px] text-gray-600 hover:text-red-400 transition-colors"
                          >
                            🗑
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {trades.map((trade) => (
              <div
                key={trade.id}
                className="bg-gray-800/50 border border-gray-700 rounded-lg p-3"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white text-sm">
                      {trade.ticker}
                    </span>
                    <Badge variant={trade.direction}>
                      {trade.direction.toUpperCase()}
                    </Badge>
                    <Badge variant={trade.result}>
                      {trade.result.toUpperCase()}
                    </Badge>
                  </div>
                  <span
                    className={`font-mono text-sm font-medium ${
                      (trade.pnl_percent || 0) >= 0
                        ? "text-green-400"
                        : "text-red-400"
                    }`}
                  >
                    {(trade.pnl_percent || 0) > 0 ? "+" : ""}
                    {trade.pnl_percent?.toFixed(2)}%
                  </span>
                </div>
                <div className="flex items-center gap-4 text-[11px] font-mono text-gray-400">
                  <span>Entry: {trade.entry_price.toFixed(2)}</span>
                  <span>Exit: {trade.exit_price.toFixed(2)}</span>
                  {trade.pnl != null && (
                    <span
                      className={
                        trade.pnl >= 0 ? "text-green-400" : "text-red-400"
                      }
                    >
                      {trade.pnl > 0 ? "+" : ""}
                      {trade.pnl.toFixed(2)}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-700/50">
                  <span className="text-[10px] font-mono text-gray-600">
                    {new Date(trade.opened_at).toLocaleDateString("sv-SE")} →{" "}
                    {new Date(trade.closed_at).toLocaleDateString("sv-SE")}
                  </span>
                  {deletingId === trade.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleDeleteTrade(trade.id)}
                        className="text-[9px] font-mono text-red-400 border border-red-500/30 px-1.5 py-0.5 rounded"
                      >
                        Bekräfta
                      </button>
                      <button
                        onClick={() => setDeletingId(null)}
                        className="text-[9px] font-mono text-gray-500 px-1.5 py-0.5"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeletingId(trade.id)}
                      className="text-[10px] text-gray-600 hover:text-red-400"
                    >
                      🗑
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function MiniStat({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color?: string;
}) {
  const colorClass =
    color === "green"
      ? "text-green-400"
      : color === "red"
      ? "text-red-400"
      : "text-white";

  return (
    <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-2.5 text-center">
      <p className="text-[9px] font-mono text-gray-500 uppercase tracking-wider">
        {label}
      </p>
      <p className={`text-base font-bold font-mono ${colorClass}`}>{value}</p>
    </div>
  );
}
