"use client";

import AppShell from "@/components/layout/AppShell";
import { useEffect, useState, useCallback } from "react";
import { positionsApi, positionActionsApi } from "@/lib/api";
import { PositionCard } from "@/components/positions/PositionCard";
import { Card } from "@/components/ui/Card";
import type { Position, PositionAction } from "@/types";

type TabFilter = "all" | "open" | "closed";

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
  const [tickerSearch, setTickerSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Full-close form
  const [closingId, setClosingId] = useState<string | null>(null);
  const [exitPrice, setExitPrice] = useState("");
  const [closeFees, setCloseFees] = useState("");

  // Partial-close form
  const [partialClosingId, setPartialClosingId] = useState<string | null>(null);
  const [partialExitPrice, setPartialExitPrice] = useState("");
  const [partialQuantity, setPartialQuantity] = useState("");
  const [partialFees, setPartialFees] = useState("");

  // Tracks which action triggered the currently open form (so we can link action_id)
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => { loadPositions(); }, [tab]);

  const loadPositions = useCallback(async () => {
    try {
      setLoading(true);
      if (tab === "open") {
        setPositions(await positionsApi.open());
      } else {
        setPositions(await positionsApi.list(tab !== "all" ? { status: tab } : undefined));
      }
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }, [tab]);

  // ─── Full close ─────────────────────────────────────────────────────────────

  async function handleClose(positionId: string) {
    if (closingId === positionId) {
      if (!exitPrice) return;
      try {
        setPositions(prev => prev.map(p => p.id === positionId ? { ...p, status: "closed" as const } : p));
        const actionId = pendingActionId;
        setClosingId(null); setExitPrice(""); setCloseFees(""); setPendingActionId(null);
        await positionsApi.close(positionId, {
          exit_price: parseFloat(exitPrice),
          fees: closeFees ? parseFloat(closeFees) : 0,
          action_id: actionId ?? undefined,
        });
        loadPositions();
      } catch (err: any) { setError(err.message); loadPositions(); }
    } else {
      setClosingId(positionId);
      setPartialClosingId(null);
      setPendingActionId(null);
    }
  }

  // ─── Partial close ──────────────────────────────────────────────────────────

  async function handlePartialClose(positionId: string) {
    if (partialClosingId === positionId) {
      if (!partialExitPrice || !partialQuantity) return;
      try {
        const actionId = pendingActionId;
        setPartialClosingId(null); setPartialExitPrice(""); setPartialQuantity(""); setPartialFees(""); setPendingActionId(null);
        await positionsApi.partialClose(positionId, {
          exit_price: parseFloat(partialExitPrice),
          quantity: parseFloat(partialQuantity),
          fees: partialFees ? parseFloat(partialFees) : 0,
          action_id: actionId ?? undefined,
        });
        loadPositions();
      } catch (err: any) { setError(err.message); }
    } else {
      setPartialClosingId(positionId);
      setClosingId(null);
      setPendingActionId(null);
    }
  }

  // ─── Action: acknowledge ────────────────────────────────────────────────────

  async function handleAck(actionId: string) {
    try {
      setPositions(prev => prev.map(p => ({
        ...p,
        position_actions: p.position_actions?.map(a =>
          a.id === actionId ? { ...a, execution_state: "acknowledged" as const } : a
        ),
      })));
      await positionActionsApi.updateState(actionId, "acknowledged");
    } catch (err: any) { setError(err.message); loadPositions(); }
  }

  // ─── Action: execute (routes by action type) ─────────────────────────────────

  async function handleExec(action: PositionAction, positionId: string) {
    const pos = positions.find(p => p.id === positionId);

    if (action.action_type === "raise_stop" || action.action_type === "move_stop_to_breakeven") {
      // Backend PATCH auto-updates position stop loss — just mark executed
      const newSl = action.new_stop_loss
        ?? (action.action_type === "move_stop_to_breakeven"
          ? (pos?.actual_entry_price ?? pos?.entry_price ?? null)
          : null);
      setPositions(prev => prev.map(p => p.id === positionId
        ? {
            ...p,
            current_stop_loss: newSl ?? p.current_stop_loss,
            stop_loss: newSl ?? p.stop_loss,
            position_actions: p.position_actions?.map(a =>
              a.id === action.id ? { ...a, execution_state: "executed" as const } : a
            ),
          }
        : p
      ));
      try {
        await positionActionsApi.updateState(action.id, "executed");
        loadPositions();
      } catch (err: any) { setError(err.message); loadPositions(); }

    } else if (action.action_type === "take_partial" || action.action_type === "reduce_position") {
      // Open partial-close form, pre-fill quantity from action
      const qty = action.sell_quantity
        ?? (action.sell_percent != null && pos
          ? Math.floor((pos.remaining_quantity ?? pos.quantity ?? 0) * action.sell_percent / 100)
          : undefined);
      setPartialClosingId(positionId);
      setClosingId(null);
      setPendingActionId(action.id);
      if (qty != null) setPartialQuantity(qty.toString());

    } else if (action.action_type === "close_full") {
      // Open full-close form, link to action
      setClosingId(positionId);
      setPartialClosingId(null);
      setPendingActionId(action.id);

    } else {
      // hold or unknown — just mark executed
      setPositions(prev => prev.map(p => ({
        ...p,
        position_actions: p.position_actions?.map(a =>
          a.id === action.id ? { ...a, execution_state: "executed" as const } : a
        ),
      })));
      try {
        await positionActionsApi.updateState(action.id, "executed");
      } catch (err: any) { setError(err.message); loadPositions(); }
    }
  }

  // ─── Action: dismiss ────────────────────────────────────────────────────────

  async function handleDismiss(actionId: string) {
    setPositions(prev => prev.map(p => ({
      ...p,
      position_actions: p.position_actions?.map(a =>
        a.id === actionId ? { ...a, execution_state: "dismissed" as const } : a
      ),
    })));
    try {
      await positionActionsApi.updateState(actionId, "dismissed");
    } catch (err: any) { setError(err.message); loadPositions(); }
  }

  // ─── Delete (closed positions only) ─────────────────────────────────────────

  async function handleDelete(positionId: string) {
    if (deletingId === positionId) {
      try {
        setPositions(prev => prev.filter(p => p.id !== positionId));
        setDeletingId(null);
        await positionsApi.delete(positionId);
      } catch (err: any) { setError(err.message); loadPositions(); }
    } else { setDeletingId(positionId); }
  }

  const filtered = positions.filter(p =>
    tickerSearch ? p.ticker.toLowerCase().includes(tickerSearch.toLowerCase()) : true
  );

  const tabs: { key: TabFilter; label: string }[] = [
    { key: "all", label: "Alla" },
    { key: "open", label: "Öppna" },
    { key: "closed", label: "Stängda" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-['Fraunces'] text-[22px] font-semibold text-[var(--ink)]">Positioner</h1>
        <div className="flex bg-[var(--cream2)] border border-[var(--border)] rounded-[var(--r-sm)] p-[3px] gap-[2px]">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-[12px] py-[5px] text-[11px] font-['DM_Mono',monospace] rounded-[4px] border-0 cursor-pointer transition-all ${tab === t.key ? "bg-[var(--surface)] text-[var(--ink)] shadow-[var(--shadow)]" : "bg-transparent text-[var(--ink3)]"}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="bg-[var(--red2)] border border-[#dcc4c4] rounded-[var(--r-sm)] px-4 py-2 flex items-center justify-between">
          <p className="text-[var(--red)] text-xs font-['DM_Mono',monospace]">{error}</p>
          <button onClick={() => setError("")} className="text-[var(--red)] text-xs cursor-pointer border-0 bg-transparent">✕</button>
        </div>
      )}

      {/* Filter */}
      <Card>
        <div className="flex items-center gap-[10px] px-[22px] py-[11px] border-b border-[var(--border)] bg-[var(--cream)] flex-wrap">
          <span className="font-['DM_Mono',monospace] text-[8.5px] text-[var(--ink4)] uppercase tracking-[1.1px]">Filter</span>
          <input type="text" placeholder="Ticker…" value={tickerSearch} onChange={e => setTickerSearch(e.target.value)}
            className="px-[9px] py-[5px] border border-[var(--border2)] rounded-[var(--r-sm)] text-[11.5px] font-['DM_Mono',monospace] bg-[var(--surface)] text-[var(--ink)] outline-none min-w-[126px] focus:border-[var(--green2)]" />
          {tickerSearch && (
            <button onClick={() => setTickerSearch("")}
              className="text-[10px] text-[var(--ink4)] font-['DM_Mono',monospace] underline bg-transparent border-0 cursor-pointer">Rensa</button>
          )}
        </div>
      </Card>

      {loading ? (
        <div className="py-12 text-center font-['DM_Mono',monospace] text-[10.5px] text-[var(--ink4)]">Laddar positioner...</div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center font-['DM_Mono',monospace] text-[10.5px] text-[var(--ink4)]">Inga positioner hittades</div>
      ) : (
        <div className="space-y-3">
          {filtered.map(pos => (
            <div key={pos.id}>
              <PositionCard
                position={pos}
                onClose={handleClose}
                onPartialClose={handlePartialClose}
                onAcknowledgeAction={handleAck}
                onExecuteAction={(action) => handleExec(action, pos.id)}
                onDismissAction={handleDismiss}
              />

              {/* Full-close form */}
              {closingId === pos.id && (
                <div className="bg-[var(--red2)] border border-[var(--border)] rounded-b-[var(--r)] px-[22px] py-[10px] -mt-2 flex items-center gap-[8px] flex-wrap">
                  <span className="font-['DM_Mono',monospace] text-[9px] text-[var(--red)] uppercase tracking-[1px]">
                    Stäng{pendingActionId ? " (från bot-action)" : ""}:
                  </span>
                  <input type="number" placeholder="Exit price" value={exitPrice} onChange={e => setExitPrice(e.target.value)} autoFocus step="0.01"
                    className="w-28 bg-[var(--surface)] border border-[var(--border2)] rounded-[var(--r-sm)] px-2 py-1 text-[11px] font-['DM_Mono',monospace] text-[var(--ink)] outline-none" />
                  <input type="number" placeholder="Avgifter" value={closeFees} onChange={e => setCloseFees(e.target.value)} step="0.01"
                    className="w-24 bg-[var(--surface)] border border-[var(--border2)] rounded-[var(--r-sm)] px-2 py-1 text-[11px] font-['DM_Mono',monospace] text-[var(--ink)] outline-none" />
                  <button onClick={() => handleClose(pos.id)}
                    className="bg-[var(--red)] text-white font-['DM_Mono',monospace] text-[11px] px-3 py-1 rounded-[var(--r-sm)] cursor-pointer border-0">Stäng</button>
                  <button onClick={() => { setClosingId(null); setPendingActionId(null); }}
                    className="text-[var(--ink3)] font-['DM_Mono',monospace] text-[11px] px-3 py-1 rounded-[var(--r-sm)] cursor-pointer border border-[var(--border)] bg-transparent">Avbryt</button>
                </div>
              )}

              {/* Partial-close form */}
              {partialClosingId === pos.id && (
                <div className="bg-[#E8F4F0] border border-[var(--border)] rounded-b-[var(--r)] px-[22px] py-[10px] -mt-2 flex items-center gap-[8px] flex-wrap">
                  <span className="font-['DM_Mono',monospace] text-[9px] text-[#1A5C6A] uppercase tracking-[1px]">
                    Delsälj{pendingActionId ? " (från bot-action)" : ""}:
                  </span>
                  <input type="number" placeholder="Exit price" value={partialExitPrice} onChange={e => setPartialExitPrice(e.target.value)} autoFocus step="0.01"
                    className="w-28 bg-[var(--surface)] border border-[var(--border2)] rounded-[var(--r-sm)] px-2 py-1 text-[11px] font-['DM_Mono',monospace] text-[var(--ink)] outline-none" />
                  <input type="number" placeholder="Antal" value={partialQuantity} onChange={e => setPartialQuantity(e.target.value)}
                    className="w-24 bg-[var(--surface)] border border-[var(--border2)] rounded-[var(--r-sm)] px-2 py-1 text-[11px] font-['DM_Mono',monospace] text-[var(--ink)] outline-none" />
                  {(pos.remaining_quantity || pos.quantity) && (
                    <div className="flex gap-1">
                      {[25, 50, 75].map(pct => (
                        <button key={pct}
                          onClick={() => setPartialQuantity(Math.floor(((pos.remaining_quantity ?? pos.quantity ?? 0) * pct) / 100).toString())}
                          className="text-[10px] font-['DM_Mono',monospace] text-[#1A5C6A] border border-[#B0D4D4] px-1.5 py-0.5 rounded-[3px] hover:bg-[#D0E8E4] cursor-pointer bg-transparent">{pct}%</button>
                      ))}
                    </div>
                  )}
                  <input type="number" placeholder="Avgifter" value={partialFees} onChange={e => setPartialFees(e.target.value)} step="0.01"
                    className="w-24 bg-[var(--surface)] border border-[var(--border2)] rounded-[var(--r-sm)] px-2 py-1 text-[11px] font-['DM_Mono',monospace] text-[var(--ink)] outline-none" />
                  <button onClick={() => handlePartialClose(pos.id)}
                    className="bg-[#1A5C6A] text-white font-['DM_Mono',monospace] text-[11px] px-3 py-1 rounded-[var(--r-sm)] cursor-pointer border-0">Sälj</button>
                  <button onClick={() => { setPartialClosingId(null); setPendingActionId(null); }}
                    className="text-[var(--ink3)] font-['DM_Mono',monospace] text-[11px] px-3 py-1 rounded-[var(--r-sm)] cursor-pointer border border-[var(--border)] bg-transparent">Avbryt</button>
                </div>
              )}

              {/* Delete button for closed positions */}
              {pos.status === "closed" && (
                <div className="flex justify-end px-[22px] py-[6px]">
                  {deletingId === pos.id ? (
                    <div className="flex items-center gap-2">
                      <span className="font-['DM_Mono',monospace] text-[10px] text-[var(--red)]">Säker? Kan inte ångras.</span>
                      <button onClick={() => handleDelete(pos.id)}
                        className="font-['DM_Mono',monospace] text-[10px] text-[var(--red)] border border-[#dcc4c4] px-2 py-0.5 rounded-[3px] hover:bg-[var(--red2)] cursor-pointer bg-transparent">Ja, ta bort</button>
                      <button onClick={() => setDeletingId(null)}
                        className="font-['DM_Mono',monospace] text-[10px] text-[var(--ink4)] px-2 py-0.5 cursor-pointer border-0 bg-transparent">Avbryt</button>
                    </div>
                  ) : (
                    <button onClick={() => setDeletingId(pos.id)}
                      className="font-['DM_Mono',monospace] text-[10px] text-[var(--ink4)] hover:text-[var(--red)] cursor-pointer border-0 bg-transparent">✕ Ta bort</button>
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
