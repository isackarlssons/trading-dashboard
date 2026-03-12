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
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--r)] shadow-[var(--shadow)] overflow-hidden">
      {/* Header row */}
      <div className="flex items-center justify-between px-[22px] py-[15px] flex-wrap gap-2">
        <div className="flex items-center gap-[9px] flex-wrap">
          <span className="font-['Fraunces'] font-bold text-[17px] tracking-[-0.3px] text-[var(--ink)]">
            {position.ticker}
          </span>
          <Badge variant={position.direction}>
            {position.direction.toUpperCase()}
          </Badge>
          <Badge variant={position.status}>
            {isPartiallyReduced ? "DELVIS REDUCERAD" : position.status.toUpperCase()}
          </Badge>
          <span className="font-['DM_Mono',monospace] text-[9.5px] text-[var(--ink4)]">
            Öppnad: {new Date(position.opened_at).toLocaleDateString("sv-SE")}
            {position.closed_at && (
              <> · Stängd: {new Date(position.closed_at).toLocaleDateString("sv-SE")}</>
            )}
          </span>
        </div>

        <div className="flex items-center gap-[18px]">
          <PriceInfo label="Entry" value={position.entry_price} />
          <PriceInfo label="SL" value={position.stop_loss} color="var(--red)" />
          <PriceInfo label="TP" value={position.take_profit} color="var(--green)" />
          {(position.remaining_quantity != null || position.quantity != null) && (
            <div className="text-right">
              <div className="font-['DM_Mono',monospace] text-[8px] text-[var(--ink4)] tracking-[0.9px] uppercase mb-[2px]">
                Qty
              </div>
              <div className="font-['DM_Mono',monospace] font-medium text-[13px] text-[var(--ink)]">
                {position.remaining_quantity ?? position.quantity}
                {(position.original_quantity || position.quantity) && (
                  <span className="text-[var(--ink4)]">/{position.original_quantity ?? position.quantity}</span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Pending management actions */}
      {pendingActions.length > 0 && (
        <div className="px-[22px] py-[10px] border-t border-[var(--border)] bg-[var(--amber2)]">
          <div className="font-['DM_Mono',monospace] text-[8px] text-[var(--amber)] uppercase tracking-[1px] mb-[6px]">
            ⚡ Management Actions
          </div>
          <div className="space-y-[6px]">
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
        <div className="px-[22px] py-[10px] border-t border-[var(--border)] bg-[#E8F4F0]">
          <div className="font-['DM_Mono',monospace] text-[8px] text-[#1A5C6A] uppercase tracking-[1px] mb-[4px]">
            Partial Exits
          </div>
          {partialExits.map((pe) => (
            <div
              key={pe.id}
              className="flex items-center gap-3 font-['DM_Mono',monospace] text-[11px] text-[var(--ink3)] py-[2px]"
            >
              <span>
                {pe.quantity} st @ {pe.exit_price.toFixed(2)}
              </span>
              <span
                style={{
                  color:
                    (pe.pnl_percent || 0) >= 0 ? "var(--green)" : "var(--red)",
                }}
              >
                {(pe.pnl_percent || 0) > 0 ? "+" : ""}
                {pe.pnl_percent?.toFixed(1)}%
              </span>
              <span className="text-[var(--ink4)]">
                {new Date(pe.exited_at).toLocaleDateString("sv-SE")}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Footer with actions */}
      {position.status === "open" && (
        <div className="flex items-center justify-end gap-[6px] px-[22px] py-[10px] border-t border-[var(--border)]">
          {(position.remaining_quantity || position.quantity) && (position.remaining_quantity ?? position.quantity ?? 0) > 0 && (
            <button
              onClick={() => onPartialClose(position.id)}
              className="font-['DM_Mono',monospace] text-[11px] text-[#1A5C6A] border border-[#B0D4D4] px-[11px] py-[5px] rounded-[var(--r-sm)] hover:bg-[#E0F0F0] transition-colors cursor-pointer bg-transparent"
            >
              Delsälj
            </button>
          )}
          <button
            onClick={() => onClose(position.id)}
            className="font-['DM_Mono',monospace] text-[11px] text-[var(--red)] border border-[#dcc4c4] px-[11px] py-[5px] rounded-[var(--r-sm)] hover:bg-[var(--red2)] transition-colors cursor-pointer bg-transparent"
          >
            Stäng position
          </button>
        </div>
      )}
    </div>
  );
}

function PriceInfo({
  label,
  value,
  color = "var(--ink)",
}: {
  label: string;
  value: number | null;
  color?: string;
}) {
  return (
    <div className="text-right">
      <div className="font-['DM_Mono',monospace] text-[8px] text-[var(--ink4)] tracking-[0.9px] uppercase mb-[2px]">
        {label}
      </div>
      <div
        className="font-['DM_Mono',monospace] font-medium text-[13px]"
        style={{ color }}
      >
        {value != null ? value.toFixed(2) : "-"}
      </div>
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
    <div className="flex items-center gap-[8px] flex-wrap">
      <Badge variant={action.action_type}>{label}</Badge>
      {action.target_value != null && (
        <span className="font-['DM_Mono',monospace] text-[11px] text-[var(--ink)]">
          → {action.target_value.toFixed(2)}
        </span>
      )}
      {action.description && (
        <span className="text-[11px] text-[var(--ink3)]">{action.description}</span>
      )}
      <div className="ml-auto flex items-center gap-[4px]">
        <Badge variant={action.execution_state}>{action.execution_state}</Badge>
        {action.execution_state === "pending" && (
          <button
            onClick={() => onAcknowledge(action.id)}
            className="font-['DM_Mono',monospace] text-[10px] text-[var(--blue)] border border-[#B0C4D4] px-[8px] py-[2px] rounded-[3px] hover:bg-[var(--blue2)] transition-colors cursor-pointer bg-transparent"
          >
            OK
          </button>
        )}
        {action.execution_state === "acknowledged" && (
          <button
            onClick={() => onExecute(action.id)}
            className="font-['DM_Mono',monospace] text-[10px] text-[var(--green)] border border-[#B0D4B0] px-[8px] py-[2px] rounded-[3px] hover:bg-[var(--green3)] transition-colors cursor-pointer bg-transparent"
          >
            Utförd ✓
          </button>
        )}
      </div>
    </div>
  );
}
