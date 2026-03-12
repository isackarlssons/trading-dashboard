"use client";

import AppShell from "@/components/layout/AppShell";
import { useEffect, useState } from "react";
import { signalsApi, positionsApi, tradesApi, positionActionsApi } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import type { Signal, Position, TradeStats, PositionAction } from "@/types";

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
  const [pendingActions, setPendingActions] = useState<PositionAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    try {
      setLoading(true);
      const [signals, positions, tradeStats, actions] = await Promise.all([
        signalsApi.pending(),
        positionsApi.open(),
        tradesApi.stats(),
        positionActionsApi.listPending().catch(() => []),
      ]);
      setPendingSignals(signals);
      setOpenPositions(positions);
      setStats(tradeStats);
      setPendingActions(actions);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="text-gray-500 font-mono text-sm py-12 text-center">
        Laddar dashboard...
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
        <p className="text-red-400">Fel: {error}</p>
        <button onClick={loadDashboard} className="btn-secondary mt-2">
          Försök igen
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Dashboard</h1>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard
          label="Väntande signaler"
          value={pendingSignals.length}
          icon="📡"
          color="amber"
        />
        <StatCard
          label="Öppna positioner"
          value={openPositions.length}
          icon="📈"
          color="cyan"
        />
        <StatCard
          label="Totalt trades"
          value={stats?.total_trades || 0}
          icon="📋"
          color="blue"
        />
        <StatCard
          label="Win Rate"
          value={`${stats?.win_rate || 0}%`}
          icon="🎯"
          color={(stats?.win_rate || 0) >= 50 ? "green" : "red"}
        />
        <StatCard
          label="Aktiva actions"
          value={pendingActions.length}
          icon="⚡"
          color={pendingActions.length > 0 ? "amber" : "gray"}
        />
      </div>

      {/* Stats Detail */}
      {stats && stats.total_trades > 0 && (
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
          <h2 className="text-sm font-semibold text-white mb-3">
            Trading-statistik
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">
                Vinster / Förluster
              </p>
              <p className="text-white font-mono text-sm mt-0.5">
                <span className="text-green-400">{stats.wins}</span>
                {" / "}
                <span className="text-red-400">{stats.losses}</span>
                {stats.breakeven > 0 && (
                  <span className="text-gray-500"> / {stats.breakeven} BE</span>
                )}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">
                Snitt P&L %
              </p>
              <p
                className={`font-mono text-sm mt-0.5 ${
                  stats.avg_pnl_percent >= 0 ? "text-green-400" : "text-red-400"
                }`}
              >
                {stats.avg_pnl_percent > 0 ? "+" : ""}
                {stats.avg_pnl_percent}%
              </p>
            </div>
            <div>
              <p className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">
                Bästa / Sämsta
              </p>
              <p className="text-white font-mono text-sm mt-0.5">
                <span className="text-green-400">+{stats.best_trade || 0}%</span>
                {" / "}
                <span className="text-red-400">{stats.worst_trade || 0}%</span>
              </p>
            </div>
            <div>
              <p className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">
                Profit Factor
              </p>
              <p className="text-white font-mono text-sm mt-0.5">
                {stats.profit_factor || "N/A"}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Pending Actions Alert */}
      {pendingActions.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
          <h2 className="text-sm font-semibold text-amber-400 mb-2">
            ⚡ {pendingActions.length} väntande management actions
          </h2>
          <p className="text-xs text-gray-400 mb-2">
            Boten har skickat instruktioner för dina öppna positioner.
          </p>
          <a
            href="/positions"
            className="text-xs font-mono text-amber-400 underline hover:text-amber-300"
          >
            Gå till Positioner →
          </a>
        </div>
      )}

      {/* Pending Signals */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
        <h2 className="text-sm font-semibold text-white mb-3">
          📡 Väntande signaler ({pendingSignals.length})
        </h2>
        {pendingSignals.length === 0 ? (
          <p className="text-gray-500 text-xs font-mono">Inga väntande signaler</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b border-gray-700 text-[9px] font-mono uppercase tracking-wider">
                  <th className="text-left py-2">Ticker</th>
                  <th className="text-left py-2">Dir</th>
                  <th className="text-right py-2">Entry</th>
                  <th className="text-right py-2">SL</th>
                  <th className="text-right py-2">TP</th>
                  <th className="text-left py-2">Strategi</th>
                  <th className="text-right py-2">Tid</th>
                </tr>
              </thead>
              <tbody>
                {pendingSignals.slice(0, 10).map((signal) => (
                  <tr
                    key={signal.id}
                    className="border-b border-gray-700/50 hover:bg-gray-700/20"
                  >
                    <td className="py-2 font-medium text-white font-mono">
                      {signal.ticker}
                      {signal.execution_type === "leverage" && (
                        <span className="ml-1 text-purple-400 text-[9px]">⚡</span>
                      )}
                    </td>
                    <td className="py-2">
                      <Badge variant={signal.direction}>
                        {signal.direction.toUpperCase()}
                      </Badge>
                    </td>
                    <td className="py-2 text-right text-gray-300 font-mono">
                      {signal.entry_price?.toFixed(2) || "-"}
                    </td>
                    <td className="py-2 text-right text-red-400 font-mono">
                      {signal.stop_loss?.toFixed(2) || "-"}
                    </td>
                    <td className="py-2 text-right text-green-400 font-mono">
                      {signal.take_profit?.toFixed(2) || "-"}
                    </td>
                    <td className="py-2 text-gray-500 font-mono">
                      {signal.strategies?.name || signal.strategy?.name || "-"}
                    </td>
                    <td className="py-2 text-right text-gray-500 font-mono text-[10px]">
                      {new Date(signal.signal_time).toLocaleString("sv-SE", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {pendingSignals.length > 10 && (
              <a
                href="/signals"
                className="block text-center text-xs font-mono text-blue-400 py-2 hover:text-blue-300"
              >
                Visa alla {pendingSignals.length} signaler →
              </a>
            )}
          </div>
        )}
      </div>

      {/* Open Positions */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
        <h2 className="text-sm font-semibold text-white mb-3">
          📈 Öppna positioner ({openPositions.length})
        </h2>
        {openPositions.length === 0 ? (
          <p className="text-gray-500 text-xs font-mono">Inga öppna positioner</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b border-gray-700 text-[9px] font-mono uppercase tracking-wider">
                  <th className="text-left py-2">Ticker</th>
                  <th className="text-left py-2">Dir</th>
                  <th className="text-right py-2">Entry</th>
                  <th className="text-right py-2">SL</th>
                  <th className="text-right py-2">TP</th>
                  <th className="text-right py-2">Qty</th>
                  <th className="text-left py-2">Actions</th>
                  <th className="text-right py-2">Öppnad</th>
                </tr>
              </thead>
              <tbody>
                {openPositions.map((pos) => {
                  const pendingActs = (pos.position_actions || []).filter(
                    (a) => a.execution_state === "pending"
                  );
                  return (
                    <tr
                      key={pos.id}
                      className="border-b border-gray-700/50 hover:bg-gray-700/20"
                    >
                      <td className="py-2 font-medium text-white font-mono">
                        {pos.ticker}
                      </td>
                      <td className="py-2">
                        <Badge variant={pos.direction}>
                          {pos.direction.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="py-2 text-right text-gray-300 font-mono">
                        {pos.entry_price.toFixed(2)}
                      </td>
                      <td className="py-2 text-right text-red-400 font-mono">
                        {pos.stop_loss?.toFixed(2) || "-"}
                      </td>
                      <td className="py-2 text-right text-green-400 font-mono">
                        {pos.take_profit?.toFixed(2) || "-"}
                      </td>
                      <td className="py-2 text-right text-gray-300 font-mono">
                        {pos.remaining_quantity != null
                          ? `${pos.remaining_quantity}${
                              pos.original_quantity
                                ? `/${pos.original_quantity}`
                                : ""
                            }`
                          : pos.quantity || "-"}
                      </td>
                      <td className="py-2">
                        {pendingActs.length > 0 ? (
                          <span className="text-amber-400 text-[10px] font-mono">
                            ⚡ {pendingActs.length}
                          </span>
                        ) : (
                          <span className="text-gray-600 text-[10px]">—</span>
                        )}
                      </td>
                      <td className="py-2 text-right text-gray-500 font-mono text-[10px]">
                        {new Date(pos.opened_at).toLocaleDateString("sv-SE")}
                      </td>
                    </tr>
                  );
                })}
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
    gray: "border-gray-600/30 text-gray-500",
  };

  return (
    <div
      className={`bg-gray-800/50 border rounded-lg p-3 ${
        colorMap[color] || colorMap.blue
      }`}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[9px] font-mono text-gray-500 uppercase tracking-wider">
            {label}
          </p>
          <p className="text-xl font-bold font-mono mt-0.5">{value}</p>
        </div>
        <span className="text-xl">{icon}</span>
      </div>
    </div>
  );
}
