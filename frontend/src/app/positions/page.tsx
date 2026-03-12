"use client";

import AppShell from "@/components/layout/AppShell";
import { useEffect, useState, useCallback } from "react";
import { positionsApi, positionActionsApi } from "@/lib/api";
import { PositionCard } from "@/components/positions/PositionCard";
import { Badge } from "@/components/ui/Badge";
import type { Position, ClosePosition, PartialClosePosition } from "@/types";

type TabFilter = "open" | "closed" | "all";

export default function PositionsPage() {
  return (
    <AppShell>
      <PositionsContent />
    </AppShell>
  );
}

function PositionsContent() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [tab, setTab] = useState<TabFilter>("open");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Close modal
  const [closingId, setClosingId] = useState<string | null>(null);
  const [exitPrice, setExitPrice] = useState("");
  const [closeFees, setCloseFees] = useState("");

  // Partial close modal
  const [partialClosingId, setPartialClosingId] = useState<string | null>(null);
  const [partialExitPrice, setPartialExitPrice] = useState("");
  const [partialQuantity, setPartialQuantity] = useState("");
  const [partialFees, setPartialFees] = useState("");

  // Delete confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    loadPositions();
  }, [tab]);

  const loadPositions = useCallback(async () => {
    try {
      setLoading(true);
      if (tab === "open") {
        const data = await positionsApi.open();
        setPositions(data);
      } else {
        const params = tab !== "all" ? { status: tab } : undefined;
        const data = await positionsApi.list(params);
        setPositions(data);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  // ─── Close position ──────────────────────────────────────────────────────

  async function handleClosePosition(positionId: string) {
    if (closingId === positionId) {
      if (!exitPrice) return;
      try {
        const data: ClosePosition = {
          exit_price: parseFloat(exitPrice),
          fees: closeFees ? parseFloat(closeFees) : 0,
        };

        // Optimistic: remove from list
        setPositions((prev) =>
          prev.map((p) =>
            p.id === positionId ? { ...p, status: "closed" as const } : p
          )
        );
        setClosingId(null);
        setExitPrice("");
        setCloseFees("");

        await positionsApi.close(positionId, data);
        loadPositions();
      } catch (err: any) {
        setError(err.message);
        loadPositions();
      }
    } else {
      setClosingId(positionId);
      setPartialClosingId(null);
    }
  }

  // ─── Partial close ───────────────────────────────────────────────────────

  async function handlePartialClose(positionId: string) {
    if (partialClosingId === positionId) {
      if (!partialExitPrice || !partialQuantity) return;
      try {
        const data: PartialClosePosition = {
          exit_price: parseFloat(partialExitPrice),
          quantity: parseFloat(partialQuantity),
          fees: partialFees ? parseFloat(partialFees) : 0,
        };

        setPartialClosingId(null);
        setPartialExitPrice("");
        setPartialQuantity("");
        setPartialFees("");

        await positionsApi.partialClose(positionId, data);
        loadPositions();
      } catch (err: any) {
        setError(err.message);
      }
    } else {
      setPartialClosingId(positionId);
      setClosingId(null);
    }
  }

  // ─── Update stop ─────────────────────────────────────────────────────────

  async function handleUpdateStop(positionId: string, newStop: number) {
    try {
      setPositions((prev) =>
        prev.map((p) =>
          p.id === positionId ? { ...p, stop_loss: newStop } : p
        )
      );
      await positionsApi.update(positionId, { stop_loss: newStop });
    } catch (err: any) {
      setError(err.message);
      loadPositions();
    }
  }

  // ─── Acknowledge / Execute action ─────────────────────────────────────────

  async function handleAcknowledgeAction(actionId: string) {
    try {
      // Optimistic
      setPositions((prev) =>
        prev.map((p) => ({
          ...p,
          position_actions: p.position_actions?.map((a) =>
            a.id === actionId ? { ...a, execution_state: "acknowledged" as const } : a
          ),
        }))
      );
      await positionActionsApi.updateState(actionId, "acknowledged");
    } catch (err: any) {
      setError(err.message);
      loadPositions();
    }
  }

  async function handleExecuteAction(actionId: string) {
    try {
      // Optimistic
      setPositions((prev) =>
        prev.map((p) => ({
          ...p,
          position_actions: p.position_actions?.map((a) =>
            a.id === actionId ? { ...a, execution_state: "executed" as const } : a
          ),
        }))
      );
      await positionActionsApi.updateState(actionId, "executed");
    } catch (err: any) {
      setError(err.message);
      loadPositions();
    }
  }

  // ─── Delete position ─────────────────────────────────────────────────────

  async function handleDeletePosition(positionId: string) {
    if (deletingId === positionId) {
      try {
        setPositions((prev) => prev.filter((p) => p.id !== positionId));
        setDeletingId(null);
        await positionsApi.delete(positionId);
      } catch (err: any) {
        setError(err.message);
        loadPositions();
      }
    } else {
      setDeletingId(positionId);
    }
  }

  // ─── Counts ────────────────────────────────────���──────────────────────────

  const openCount = positions.filter((p) => p.status === "open").length;

  const tabs: { key: TabFilter; label: string }[] = [
    { key: "open", label: "Öppna" },
    { key: "closed", label: "Stängda" },
    { key: "all", label: "Alla" },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-white">📈 Positioner</h1>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-gray-800/50 border border-gray-700 rounded-lg p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 rounded-md text-xs font-mono transition-all ${
              tab === t.key
                ? "bg-gray-700 text-white shadow-sm"
                : "text-gray-400 hover:text-gray-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2 flex items-center justify-between">
          <p className="text-red-400 text-sm">{error}</p>
          <button onClick={() => setError("")} className="text-red-400 text-xs hover:text-red-300">
            ✕
          </button>
        </div>
      )}

      {/* Positions */}
      {loading ? (
        <div className="text-gray-500 font-mono text-sm py-8 text-center">
          Laddar positioner...
        </div>
      ) : positions.length === 0 ? (
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg py-12 text-center">
          <p className="text-gray-500 font-mono text-sm">Inga positioner hittades</p>
        </div>
      ) : (
        <div className="space-y-3">
          {positions.map((pos) => (
            <div key={pos.id}>
              <PositionCard
                position={pos}
                onClose={handleClosePosition}
                onPartialClose={handlePartialClose}
                onUpdateStop={handleUpdateStop}
                onAcknowledgeAction={handleAcknowledgeAction}
                onExecuteAction={handleExecuteAction}
              />

              {/* Close form */}
              {closingId === pos.id && (
                <div className="bg-red-500/5 border border-gray-700 rounded-b-lg px-4 py-3 -mt-1 flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-mono text-red-400 uppercase tracking-wider">
                    Stäng position:
                  </span>
                  <input
                    type="number"
                    placeholder="Exit price"
                    value={exitPrice}
                    onChange={(e) => setExitPrice(e.target.value)}
                    className="w-28 bg-gray-800 border border-gray-600 rounded-md px-2 py-1 text-xs font-mono text-white focus:border-red-500 outline-none"
                    step="0.01"
                    autoFocus
                  />
                  <input
                    type="number"
                    placeholder="Avgifter"
                    value={closeFees}
                    onChange={(e) => setCloseFees(e.target.value)}
                    className="w-24 bg-gray-800 border border-gray-600 rounded-md px-2 py-1 text-xs font-mono text-white outline-none"
                    step="0.01"
                  />
                  <button
                    onClick={() => handleClosePosition(pos.id)}
                    className="bg-red-600 hover:bg-red-700 text-white font-mono text-[11px] px-3 py-1 rounded-md transition-colors"
                  >
                    Stäng
                  </button>
                  <button
                    onClick={() => setClosingId(null)}
                    className="text-gray-400 font-mono text-[11px] px-3 py-1 rounded-md hover:bg-gray-700 transition-colors"
                  >
                    Avbryt
                  </button>
                </div>
              )}

              {/* Partial close form */}
              {partialClosingId === pos.id && (
                <div className="bg-cyan-500/5 border border-gray-700 rounded-b-lg px-4 py-3 -mt-1 flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-mono text-cyan-400 uppercase tracking-wider">
                    Delsälj:
                  </span>
                  <input
                    type="number"
                    placeholder="Exit price"
                    value={partialExitPrice}
                    onChange={(e) => setPartialExitPrice(e.target.value)}
                    className="w-28 bg-gray-800 border border-gray-600 rounded-md px-2 py-1 text-xs font-mono text-white focus:border-cyan-500 outline-none"
                    step="0.01"
                    autoFocus
                  />
                  <input
                    type="number"
                    placeholder="Antal"
                    value={partialQuantity}
                    onChange={(e) => setPartialQuantity(e.target.value)}
                    className="w-24 bg-gray-800 border border-gray-600 rounded-md px-2 py-1 text-xs font-mono text-white focus:border-cyan-500 outline-none"
                  />
                  <input
                    type="number"
                    placeholder="Avgifter"
                    value={partialFees}
                    onChange={(e) => setPartialFees(e.target.value)}
                    className="w-24 bg-gray-800 border border-gray-600 rounded-md px-2 py-1 text-xs font-mono text-white outline-none"
                    step="0.01"
                  />
                  {pos.remaining_quantity && (
                    <div className="flex gap-1">
                      {[25, 50, 75].map((pct) => (
                        <button
                          key={pct}
                          onClick={() =>
                            setPartialQuantity(
                              Math.floor(
                                (pos.remaining_quantity! * pct) / 100
                              ).toString()
                            )
                          }
                          className="text-[10px] font-mono text-cyan-400 border border-cyan-500/30 px-1.5 py-0.5 rounded hover:bg-cyan-500/10 transition-colors"
                        >
                          {pct}%
                        </button>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() => handlePartialClose(pos.id)}
                    className="bg-cyan-600 hover:bg-cyan-700 text-white font-mono text-[11px] px-3 py-1 rounded-md transition-colors"
                  >
                    Sälj
                  </button>
                  <button
                    onClick={() => setPartialClosingId(null)}
                    className="text-gray-400 font-mono text-[11px] px-3 py-1 rounded-md hover:bg-gray-700 transition-colors"
                  >
                    Avbryt
                  </button>
                </div>
              )}

              {/* Delete button for closed positions */}
              {pos.status === "closed" && (
                <div className="flex justify-end px-4 py-1.5">
                  {deletingId === pos.id ? (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-red-400">
                        Säker? Kan inte ångras.
                      </span>
                      <button
                        onClick={() => handleDeletePosition(pos.id)}
                        className="text-[10px] font-mono text-red-400 border border-red-500/30 px-2 py-0.5 rounded hover:bg-red-500/10 transition-colors"
                      >
                        Ja, ta bort
                      </button>
                      <button
                        onClick={() => setDeletingId(null)}
                        className="text-[10px] font-mono text-gray-500 px-2 py-0.5 rounded hover:bg-gray-700 transition-colors"
                      >
                        Avbryt
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeletingId(pos.id)}
                      className="text-[10px] font-mono text-gray-600 hover:text-red-400 transition-colors"
                    >
                      🗑 Ta bort
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
