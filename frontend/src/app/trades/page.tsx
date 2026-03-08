"use client";

import AppShell from "@/components/layout/AppShell";
import { useEffect, useState } from "react";
import { tradesApi } from "@/lib/api";
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

  useEffect(() => {
    loadTrades();
  }, [filter]);

  async function loadTrades() {
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
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">📋 Trade History</h1>
        <div className="flex gap-2">
          {["all", "win", "loss", "breakeven"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filter === f
                  ? "bg-blue-600 text-white"
                  : "bg-gray-700 text-gray-400 hover:text-white"
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Stats Summary */}
      {stats && stats.total_trades > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <MiniStat label="Total" value={stats.total_trades} />
          <MiniStat
            label="Win Rate"
            value={`${stats.win_rate}%`}
            color={stats.win_rate >= 50 ? "green" : "red"}
          />
          <MiniStat
            label="Avg P&L"
            value={`${stats.avg_pnl_percent > 0 ? "+" : ""}${stats.avg_pnl_percent}%`}
            color={stats.avg_pnl_percent >= 0 ? "green" : "red"}
          />
          <MiniStat
            label="Best"
            value={`+${stats.best_trade || 0}%`}
            color="green"
          />
          <MiniStat
            label="Worst"
            value={`${stats.worst_trade || 0}%`}
            color="red"
          />
          <MiniStat
            label="PF"
            value={stats.profit_factor?.toString() || "N/A"}
            color={
              stats.profit_factor && stats.profit_factor > 1 ? "green" : "red"
            }
          />
        </div>
      )}

      {error && (
        <div className="card border-red-500/50">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="text-gray-400">Loading trades...</div>
      ) : trades.length === 0 ? (
        <div className="card">
          <p className="text-gray-400">No trades found</p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 border-b border-gray-700">
                <th className="text-left py-2">Ticker</th>
                <th className="text-left py-2">Dir</th>
                <th className="text-left py-2">Entry</th>
                <th className="text-left py-2">Exit</th>
                <th className="text-left py-2">P&L %</th>
                <th className="text-left py-2">P&L</th>
                <th className="text-left py-2">Result</th>
                <th className="text-left py-2">Closed</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((trade) => (
                <tr
                  key={trade.id}
                  className="border-b border-gray-700/50 hover:bg-gray-700/30"
                >
                  <td className="py-2 font-medium text-white">
                    {trade.ticker}
                  </td>
                  <td className="py-2">
                    <span
                      className={`badge ${
                        trade.direction === "long"
                          ? "bg-green-500/20 text-green-400"
                          : "bg-red-500/20 text-red-400"
                      }`}
                    >
                      {trade.direction.toUpperCase()}
                    </span>
                  </td>
                  <td className="py-2 text-gray-300">
                    {trade.entry_price.toFixed(2)}
                  </td>
                  <td className="py-2 text-gray-300">
                    {trade.exit_price.toFixed(2)}
                  </td>
                  <td
                    className={`py-2 font-medium ${
                      (trade.pnl_percent || 0) >= 0
                        ? "text-green-400"
                        : "text-red-400"
                    }`}
                  >
                    {(trade.pnl_percent || 0) > 0 ? "+" : ""}
                    {trade.pnl_percent?.toFixed(2) || "0.00"}%
                  </td>
                  <td
                    className={`py-2 ${
                      (trade.pnl || 0) >= 0 ? "text-green-400" : "text-red-400"
                    }`}
                  >
                    {trade.pnl != null
                      ? `${trade.pnl > 0 ? "+" : ""}${trade.pnl.toFixed(2)}`
                      : "-"}
                  </td>
                  <td className="py-2">
                    <ResultBadge result={trade.result} />
                  </td>
                  <td className="py-2 text-gray-400">
                    {new Date(trade.closed_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
    <div className="card text-center">
      <p className="text-xs text-gray-400">{label}</p>
      <p className={`text-lg font-bold ${colorClass}`}>{value}</p>
    </div>
  );
}

function ResultBadge({ result }: { result: string }) {
  const styles: Record<string, string> = {
    win: "badge-win",
    loss: "badge-loss",
    breakeven: "bg-gray-500/20 text-gray-400",
  };

  return (
    <span className={`badge ${styles[result] || ""}`}>
      {result.toUpperCase()}
    </span>
  );
}
