"use client";

import AppShell from "@/components/layout/AppShell";
import { useEffect, useState } from "react";
import { positionsApi } from "@/lib/api";
import type { Position, ClosePosition } from "@/types";

export default function PositionsPage() {
  return (
    <AppShell>
      <PositionsContent />
    </AppShell>
  );
}

function PositionsContent() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [filter, setFilter] = useState<string>("open");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [closingPosition, setClosingPosition] = useState<string | null>(null);
  const [exitPrice, setExitPrice] = useState("");
  const [fees, setFees] = useState("");

  useEffect(() => {
    loadPositions();
  }, [filter]);

  async function loadPositions() {
    try {
      setLoading(true);
      if (filter === "open") {
        const data = await positionsApi.open();
        setPositions(data);
      } else {
        const params = filter !== "all" ? { status: filter } : undefined;
        const data = await positionsApi.list(params);
        setPositions(data);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleClosePosition(positionId: string) {
    if (!exitPrice) return;

    try {
      const data: ClosePosition = {
        exit_price: parseFloat(exitPrice),
        fees: fees ? parseFloat(fees) : 0,
      };
      await positionsApi.close(positionId, data);
      setClosingPosition(null);
      setExitPrice("");
      setFees("");
      loadPositions();
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">📈 Positions</h1>
        <div className="flex gap-2">
          {["open", "closed", "all"].map((f) => (
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

      {error && (
        <div className="card border-red-500/50">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="text-gray-400">Loading positions...</div>
      ) : positions.length === 0 ? (
        <div className="card">
          <p className="text-gray-400">No positions found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {positions.map((pos) => (
            <div key={pos.id} className="card">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div>
                    <span className="text-lg font-bold text-white">
                      {pos.ticker}
                    </span>
                    <span
                      className={`ml-2 badge ${
                        pos.direction === "long"
                          ? "bg-green-500/20 text-green-400"
                          : "bg-red-500/20 text-red-400"
                      }`}
                    >
                      {pos.direction.toUpperCase()}
                    </span>
                  </div>
                  <span
                    className={`badge ${
                      pos.status === "open" ? "badge-open" : "badge-closed"
                    }`}
                  >
                    {pos.status.toUpperCase()}
                  </span>
                </div>

                <div className="flex items-center gap-4 text-sm">
                  <div className="text-right">
                    <p className="text-gray-400">Entry</p>
                    <p className="text-white">{pos.entry_price.toFixed(2)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-gray-400">SL</p>
                    <p className="text-red-400">
                      {pos.stop_loss?.toFixed(2) || "-"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-gray-400">TP</p>
                    <p className="text-green-400">
                      {pos.take_profit?.toFixed(2) || "-"}
                    </p>
                  </div>
                  {pos.quantity && (
                    <div className="text-right">
                      <p className="text-gray-400">Qty</p>
                      <p className="text-white">{pos.quantity}</p>
                    </div>
                  )}
                </div>
              </div>

              {pos.notes && (
                <p className="text-sm text-gray-400 mt-2">{pos.notes}</p>
              )}

              <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-700/50">
                <div className="text-xs text-gray-400">
                  Opened: {new Date(pos.opened_at).toLocaleString()}
                  {pos.closed_at && (
                    <> • Closed: {new Date(pos.closed_at).toLocaleString()}</>
                  )}
                </div>

                {pos.status === "open" && (
                  <div>
                    {closingPosition === pos.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          placeholder="Exit price"
                          value={exitPrice}
                          onChange={(e) => setExitPrice(e.target.value)}
                          className="w-28 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white"
                          step="0.01"
                        />
                        <input
                          type="number"
                          placeholder="Fees"
                          value={fees}
                          onChange={(e) => setFees(e.target.value)}
                          className="w-20 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white"
                          step="0.01"
                        />
                        <button
                          onClick={() => handleClosePosition(pos.id)}
                          className="btn-danger text-xs py-1 px-3"
                        >
                          Close
                        </button>
                        <button
                          onClick={() => setClosingPosition(null)}
                          className="btn-secondary text-xs py-1 px-3"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setClosingPosition(pos.id)}
                        className="btn-danger text-xs py-1 px-3"
                      >
                        Close Position
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
