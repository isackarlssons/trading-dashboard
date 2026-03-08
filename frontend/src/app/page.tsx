"use client";

import AppShell from "@/components/layout/AppShell";
import { useEffect, useState } from "react";
import { signalsApi, positionsApi, tradesApi } from "@/lib/api";
import type { Signal, Position, TradeStats } from "@/types";

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    try {
      setLoading(true);
      const [signals, positions, tradeStats] = await Promise.all([
        signalsApi.pending(),
        positionsApi.open(),
        tradesApi.stats(),
      ]);
      setPendingSignals(signals);
      setOpenPositions(positions);
      setStats(tradeStats);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div className="text-gray-400">Loading dashboard...</div>;
  }

  if (error) {
    return (
      <div className="card border-red-500/50">
        <p className="text-red-400">Error: {error}</p>
        <button onClick={loadDashboard} className="btn-secondary mt-2">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Dashboard</h1>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Pending Signals"
          value={pendingSignals.length}
          icon="📡"
          color="amber"
        />
        <StatCard
          label="Open Positions"
          value={openPositions.length}
          icon="📈"
          color="cyan"
        />
        <StatCard
          label="Total Trades"
          value={stats?.total_trades || 0}
          icon="📋"
          color="blue"
        />
        <StatCard
          label="Win Rate"
          value={`${stats?.win_rate || 0}%`}
          icon="🎯"
          color={
            (stats?.win_rate || 0) >= 50 ? "green" : "red"
          }
        />
      </div>

      {/* Stats Detail */}
      {stats && stats.total_trades > 0 && (
        <div className="card">
          <h2 className="text-lg font-semibold text-white mb-4">
            Trading Statistics
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-gray-400">Wins / Losses</p>
              <p className="text-white font-medium">
                <span className="text-green-400">{stats.wins}</span>
                {" / "}
                <span className="text-red-400">{stats.losses}</span>
                {stats.breakeven > 0 && (
                  <span className="text-gray-400"> / {stats.breakeven} BE</span>
                )}
              </p>
            </div>
            <div>
              <p className="text-gray-400">Avg P&L %</p>
              <p
                className={`font-medium ${
                  stats.avg_pnl_percent >= 0 ? "text-green-400" : "text-red-400"
                }`}
              >
                {stats.avg_pnl_percent > 0 ? "+" : ""}
                {stats.avg_pnl_percent}%
              </p>
            </div>
            <div>
              <p className="text-gray-400">Best / Worst</p>
              <p className="text-white font-medium">
                <span className="text-green-400">
                  +{stats.best_trade || 0}%
                </span>
                {" / "}
                <span className="text-red-400">{stats.worst_trade || 0}%</span>
              </p>
            </div>
            <div>
              <p className="text-gray-400">Profit Factor</p>
              <p className="text-white font-medium">
                {stats.profit_factor || "N/A"}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Pending Signals */}
      <div className="card">
        <h2 className="text-lg font-semibold text-white mb-4">
          📡 Pending Signals ({pendingSignals.length})
        </h2>
        {pendingSignals.length === 0 ? (
          <p className="text-gray-400 text-sm">No pending signals</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-400 border-b border-gray-700">
                  <th className="text-left py-2">Ticker</th>
                  <th className="text-left py-2">Direction</th>
                  <th className="text-left py-2">Entry</th>
                  <th className="text-left py-2">SL</th>
                  <th className="text-left py-2">TP</th>
                  <th className="text-left py-2">Strategy</th>
                  <th className="text-left py-2">Time</th>
                </tr>
              </thead>
              <tbody>
                {pendingSignals.map((signal) => (
                  <tr
                    key={signal.id}
                    className="border-b border-gray-700/50 hover:bg-gray-700/30"
                  >
                    <td className="py-2 font-medium text-white">
                      {signal.ticker}
                    </td>
                    <td className="py-2">
                      <span
                        className={`badge ${
                          signal.direction === "long"
                            ? "bg-green-500/20 text-green-400"
                            : "bg-red-500/20 text-red-400"
                        }`}
                      >
                        {signal.direction.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-2 text-gray-300">
                      {signal.entry_price?.toFixed(2) || "-"}
                    </td>
                    <td className="py-2 text-red-400">
                      {signal.stop_loss?.toFixed(2) || "-"}
                    </td>
                    <td className="py-2 text-green-400">
                      {signal.take_profit?.toFixed(2) || "-"}
                    </td>
                    <td className="py-2 text-gray-400">
                      {signal.strategies?.name || signal.strategy?.name || "-"}
                    </td>
                    <td className="py-2 text-gray-400">
                      {new Date(signal.signal_time).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Open Positions */}
      <div className="card">
        <h2 className="text-lg font-semibold text-white mb-4">
          📈 Open Positions ({openPositions.length})
        </h2>
        {openPositions.length === 0 ? (
          <p className="text-gray-400 text-sm">No open positions</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-400 border-b border-gray-700">
                  <th className="text-left py-2">Ticker</th>
                  <th className="text-left py-2">Direction</th>
                  <th className="text-left py-2">Entry</th>
                  <th className="text-left py-2">SL</th>
                  <th className="text-left py-2">TP</th>
                  <th className="text-left py-2">Qty</th>
                  <th className="text-left py-2">Opened</th>
                </tr>
              </thead>
              <tbody>
                {openPositions.map((pos) => (
                  <tr
                    key={pos.id}
                    className="border-b border-gray-700/50 hover:bg-gray-700/30"
                  >
                    <td className="py-2 font-medium text-white">
                      {pos.ticker}
                    </td>
                    <td className="py-2">
                      <span
                        className={`badge ${
                          pos.direction === "long"
                            ? "bg-green-500/20 text-green-400"
                            : "bg-red-500/20 text-red-400"
                        }`}
                      >
                        {pos.direction.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-2 text-gray-300">
                      {pos.entry_price.toFixed(2)}
                    </td>
                    <td className="py-2 text-red-400">
                      {pos.stop_loss?.toFixed(2) || "-"}
                    </td>
                    <td className="py-2 text-green-400">
                      {pos.take_profit?.toFixed(2) || "-"}
                    </td>
                    <td className="py-2 text-gray-300">
                      {pos.quantity || "-"}
                    </td>
                    <td className="py-2 text-gray-400">
                      {new Date(pos.opened_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: string | number;
  icon: string;
  color: string;
}) {
  const colorMap: Record<string, string> = {
    amber: "border-amber-500/30 text-amber-400",
    cyan: "border-cyan-500/30 text-cyan-400",
    blue: "border-blue-500/30 text-blue-400",
    green: "border-green-500/30 text-green-400",
    red: "border-red-500/30 text-red-400",
  };

  return (
    <div className={`card border ${colorMap[color] || colorMap.blue}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-400">{label}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
        </div>
        <span className="text-2xl">{icon}</span>
      </div>
    </div>
  );
}
