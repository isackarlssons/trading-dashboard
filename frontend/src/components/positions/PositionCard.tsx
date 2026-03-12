import { useState } from "react";
import { Badge } from "../ui/Badge";
import type { Position, PositionAction } from "@/types";

const ACTION_LABELS: Record<string, string> = {
  raise_stop: "Höj stop",
  move_stop_to_breakeven: "Stop → breakeven",
  take_partial: "Delsälj",
  reduce_position: "Reducera",
  close_full: "Stäng allt",
  hold: "Håll kvar",
};

interface PositionCardProps {
  position: Position;
  onClose: (positionId: string) => void;
  onPartialClose: (positionId: string) => void;
  onUpdateStop: (positionId: string, newStop: number) => void;
  onAcknowledgeAction: (actionId: string) => void;
  onExecuteAction: (actionId: string) => void;
}

export function PositionCard({
  position,
  onClose,
  onPartialClose,
  onUpdateStop,
  onAcknowledgeAction,
  onExecuteAction,
}: PositionCardProps) {
  const pendingActions = (position.position_actions || []).filter(
    (a) => a.execution_state === "pending" || a.execution_state === "acknowledged"
  );
  const partialExits = position.partial_exits || [];
  const hasPartials = partialExits.length > 0;
  const isPartiallyReduced =
    position.remaining_quantity != null &&
    position.original_quantity != null &&
    position.remaining_quantity < position.original_quantity &&
    position.remaining_quantity > 0;

  return (
    <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-lg overflow-hidden">
      {/* Header row */}
      <div className="flex items-center justify-between px-4 py-3 flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-lg font-bold text-white">{position.ticker}</span>
          <Badge variant={position.direction}>
            {position.direction.toUpperCase()}
          </Badge>
          <Badge variant={position.status}>
            {isPartiallyReduced ? "PARTIALLY REDUCED" : position.status.toUpperCase()}
          </Badge>
        </div>

        <div className="flex items-center gap-4 text-sm">
          <PriceInfo label="Entry" value={position.entry_price} />
          <PriceInfo label="SL" value={position.stop_loss} color="text-red-400" />
          <PriceInfo label="TP" value={position.take_profit} color="text-green-400" />
          {position.remaining_quantity != null && (
            <PriceInfo
              label="Qty"
              value={position.remaining_quantity}
              suffix={
                position.original_quantity
                  ? ` / ${position.original_quantity}`
                  : undefined
              }
            />
          )}
        </div>
      </div>

      {/* Pending management actions */}
      {pendingActions.length > 0 && (
        <div className="px-4 py-2 border-t border-gray-700/50 bg-amber-500/5">
          <div className="text-[10px] font-mono text-amber-400 uppercase tracking-wider mb-1.5">
            ⚡ Management Actions
          </div>
          <div className="space-y-1.5">
            {pendingActions.map((action) => (
              <ActionRow
                key={action.id}
                action={action}
                onAcknowledge={onAcknowledgeAction}
                onExecute={onExecuteAction}
              />
            ))}
          </div>
        </div>
      )}

      {/* Partial exits history */}
      {hasPartials && (
        <div className="px-4 py-2 border-t border-gray-700/50 bg-cyan-500/5">
          <div className="text-[10px] font-mono text-cyan-400 uppercase tracking-wider mb-1">
            Partial Exits
          </div>
          {partialExits.map((pe) => (
            <div
              key={pe.id}
              className="flex items-center gap-3 text-[11px] font-mono text-gray-400 py-0.5"
            >
              <span>
                {pe.quantity} st @ {pe.exit_price.toFixed(2)}
              </span>
              <span
                className={
                  (pe.pnl_percent || 0) >= 0 ? "text-green-400" : "text-red-400"
                }
              >
                {(pe.pnl_percent || 0) > 0 ? "+" : ""}
                {pe.pnl_percent?.toFixed(1)}%
              </span>
              <span className="text-gray-600">
                {new Date(pe.exited_at).toLocaleDateString("sv-SE")}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Footer with actions */}
      <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-700/50 flex-wrap gap-2">
        <div className="text-[11px] text-gray-500 font-mono">
          Öppnad: {new Date(position.opened_at).toLocaleDateString("sv-SE")}
          {position.closed_at && (
            <> · Stängd: {new Date(position.closed_at).toLocaleDateString("sv-SE")}</>
          )}
        </div>

        {position.status === "open" && (
          <div className="flex gap-2">
            {position.remaining_quantity && position.remaining_quantity > 0 && (
              <button
                onClick={() => onPartialClose(position.id)}
                className="text-[11px] font-mono text-cyan-400 border border-cyan-500/30 px-2.5 py-1 rounded hover:bg-cyan-500/10 transition-colors"
              >
                Delsälj
              </button>
            )}
            <button
              onClick={() => onClose(position.id)}
              className="text-[11px] font-mono text-red-400 border border-red-500/30 px-2.5 py-1 rounded hover:bg-red-500/10 transition-colors"
            >
              Stäng position
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function PriceInfo({
  label,
  value,
  color = "text-white",
  suffix,
}: {
  label: string;
  value: number | null;
  color?: string;
  suffix?: string;
}) {
  return (
    <div className="text-right">
      <p className="text-[9px] font-mono text-gray-500 uppercase tracking-wider">
        {label}
      </p>
      <p className={`font-mono text-xs font-medium ${color}`}>
        {value != null ? value.toFixed(2) : "-"}
        {suffix && <span className="text-gray-600">{suffix}</span>}
      </p>
    </div>
  );
}

function ActionRow({
  action,
  onAcknowledge,
  onExecute,
}: {
  action: PositionAction;
  onAcknowledge: (id: string) => void;
  onExecute: (id: string) => void;
}) {
  const label = ACTION_LABELS[action.action_type] || action.action_type;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Badge variant={action.action_type}>{label}</Badge>
      {action.target_value != null && (
        <span className="font-mono text-[11px] text-white">
          → {action.target_value.toFixed(2)}
        </span>
      )}
      {action.description && (
        <span className="text-[11px] text-gray-400">{action.description}</span>
      )}
      <Badge variant={action.execution_state} className="ml-auto">
        {action.execution_state}
      </Badge>

      {action.execution_state === "pending" && (
        <button
          onClick={() => onAcknowledge(action.id)}
          className="text-[10px] font-mono text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded hover:bg-blue-500/10 transition-colors"
        >
          OK
        </button>
      )}
      {action.execution_state === "acknowledged" && (
        <button
          onClick={() => onExecute(action.id)}
          className="text-[10px] font-mono text-green-400 border border-green-500/30 px-2 py-0.5 rounded hover:bg-green-500/10 transition-colors"
        >
          Utförd ✓
        </button>
      )}
    </div>
  );
}
