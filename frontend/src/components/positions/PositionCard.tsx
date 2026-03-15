import { useState } from "react";
import { Badge } from "../ui/Badge";
import type { Position, PositionAction } from "@/types";

const ACTION_LABELS: Record<string, string> = {
  raise_stop:             "Höj stop",
  move_stop_to_breakeven: "Stop → breakeven",
  take_partial:           "Delsälj",
  reduce_position:        "Reducera",
  close_full:             "Stäng allt",
  hold:                   "Håll kvar",
};

const ACTIVE_STATES  = new Set(["pending", "acknowledged"]);
const HISTORY_STATES = new Set(["executed", "dismissed", "expired"]);

interface ExecutionMeta {
  price?: number;
  note?: string;
}

interface PositionCardProps {
  position: Position;
  onClose: (positionId: string) => void;
  onPartialClose: (positionId: string) => void;
  onAcknowledgeAction: (actionId: string) => void;
  onExecuteAction: (action: PositionAction, meta?: ExecutionMeta) => void;
  onDismissAction: (actionId: string, note?: string) => void;
}

export function PositionCard({
  position,
  onClose,
  onPartialClose,
  onAcknowledgeAction,
  onExecuteAction,
  onDismissAction,
}: PositionCardProps) {
  const allActions    = position.position_actions || [];
  const activeActions = allActions.filter(a => ACTIVE_STATES.has(a.execution_state));
  const historyActions = allActions
    .filter(a => HISTORY_STATES.has(a.execution_state))
    .slice(0, 5);

  const partialExits = position.partial_exits || [];
  const hasPartials  = partialExits.length > 0;
  const isReduced    =
    position.remaining_quantity != null &&
    position.original_quantity  != null &&
    position.remaining_quantity < position.original_quantity &&
    position.remaining_quantity > 0;

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--r)] shadow-[var(--shadow)] overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-[22px] py-[15px] flex-wrap gap-2">
        <div className="flex items-center gap-[9px] flex-wrap">
          <span className="font-['Fraunces'] font-bold text-[17px] tracking-[-0.3px] text-[var(--ink)]">
            {position.ticker}
          </span>
          <Badge variant={position.direction}>{position.direction.toUpperCase()}</Badge>
          <Badge variant={position.status}>{isReduced ? "DELVIS REDUCERAD" : position.status.toUpperCase()}</Badge>
          <span className="font-['DM_Mono',monospace] text-[9.5px] text-[var(--ink4)]">
            Öppnad: {new Date(position.opened_at).toLocaleDateString("sv-SE")}
            {position.closed_at && <> · Stängd: {new Date(position.closed_at).toLocaleDateString("sv-SE")}</>}
          </span>
        </div>
        <div className="flex items-center gap-[18px]">
          <PriceInfo label="Entry" value={position.actual_entry_price ?? position.entry_price} />
          {position.avg_entry_price != null &&
            position.avg_entry_price !== (position.actual_entry_price ?? position.entry_price) && (
              <PriceInfo label="Avg Entry" value={position.avg_entry_price} />
            )}
          <PriceInfo label="SL" value={position.current_stop_loss ?? position.stop_loss} color="var(--red)" />
          <PriceInfo label="TP" value={position.take_profit} color="var(--green)" />
          {(position.remaining_quantity != null || position.quantity != null) && (
            <div className="text-right">
              <div className="font-['DM_Mono',monospace] text-[8px] text-[var(--ink4)] tracking-[0.9px] uppercase mb-[2px]">Qty</div>
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

      {/* ── Active management actions ───────────────────────────────────────── */}
      {activeActions.length > 0 && (
        <div className="px-[22px] py-[10px] border-t border-[var(--border)] bg-[var(--amber2)]">
          <div className="font-['DM_Mono',monospace] text-[8px] text-[var(--amber)] uppercase tracking-[1px] mb-[6px]">
            ⚡ Management Actions
          </div>
          <div className="space-y-[8px]">
            {activeActions.map(action => (
              <ActionRow
                key={action.id}
                action={action}
                onAcknowledge={onAcknowledgeAction}
                onExecute={onExecuteAction}
                onDismiss={onDismissAction}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Action history ──────────────────────────────────────────────────── */}
      {historyActions.length > 0 && (
        <div className="px-[22px] py-[8px] border-t border-[var(--border)] bg-[var(--cream)]">
          <div className="font-['DM_Mono',monospace] text-[8px] text-[var(--ink4)] uppercase tracking-[1px] mb-[4px]">
            Action historik
          </div>
          <div className="space-y-[4px]">
            {historyActions.map(action => (
              <HistoryRow key={action.id} action={action} />
            ))}
          </div>
        </div>
      )}

      {/* ── Partial exits ───────────────────────────────────────────────────── */}
      {hasPartials && (
        <div className="px-[22px] py-[10px] border-t border-[var(--border)] bg-[#E8F4F0]">
          <div className="font-['DM_Mono',monospace] text-[8px] text-[#1A5C6A] uppercase tracking-[1px] mb-[4px]">
            Partial Exits
          </div>
          {partialExits.map(pe => (
            <div key={pe.id} className="flex items-center gap-3 font-['DM_Mono',monospace] text-[11px] text-[var(--ink3)] py-[2px]">
              <span>{pe.quantity} st @ {pe.exit_price.toFixed(2)}</span>
              <span style={{ color: (pe.pnl_percent || 0) >= 0 ? "var(--green)" : "var(--red)" }}>
                {(pe.pnl_percent || 0) > 0 ? "+" : ""}{pe.pnl_percent?.toFixed(1)}%
              </span>
              <span className="text-[var(--ink4)]">{new Date(pe.exited_at).toLocaleDateString("sv-SE")}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      {(position.status === "open" || position.status === "reduced") && (
        <div className="flex items-center justify-end gap-[6px] px-[22px] py-[10px] border-t border-[var(--border)]">
          {(position.remaining_quantity || position.quantity) &&
            (position.remaining_quantity ?? position.quantity ?? 0) > 0 && (
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

// ─── Sub-components ───────────────────────────────────────────────────────────

function PriceInfo({ label, value, color = "var(--ink)" }: { label: string; value: number | null; color?: string }) {
  return (
    <div className="text-right">
      <div className="font-['DM_Mono',monospace] text-[8px] text-[var(--ink4)] tracking-[0.9px] uppercase mb-[2px]">{label}</div>
      <div className="font-['DM_Mono',monospace] font-medium text-[13px]" style={{ color }}>
        {value != null ? value.toFixed(2) : "-"}
      </div>
    </div>
  );
}

function ActionRow({
  action,
  onAcknowledge,
  onExecute,
  onDismiss,
}: {
  action: PositionAction;
  onAcknowledge: (id: string) => void;
  onExecute: (action: PositionAction, meta?: ExecutionMeta) => void;
  onDismiss: (id: string, note?: string) => void;
}) {
  const [execPrice,      setExecPrice]      = useState("");
  const [execNote,       setExecNote]       = useState("");
  const [showDismissRow, setShowDismissRow] = useState(false);
  const [dismissNote,    setDismissNote]    = useState("");

  const label       = ACTION_LABELS[action.action_type] || action.action_type;
  const isStopAction = action.action_type === "raise_stop" ||
                       action.action_type === "move_stop_to_breakeven";

  function handleExecute() {
    onExecute(action, {
      price: execPrice ? parseFloat(execPrice) : undefined,
      note:  execNote  || undefined,
    });
    setExecPrice(""); setExecNote("");
  }

  function confirmDismiss() {
    onDismiss(action.id, dismissNote || undefined);
    setShowDismissRow(false); setDismissNote("");
  }

  const createdDate = new Date(action.created_at).toLocaleDateString("sv-SE");

  return (
    <div className="space-y-[5px]">
      {/* Main info row */}
      <div className="flex items-center gap-[8px] flex-wrap">
        <Badge variant={action.action_type}>{label}</Badge>

        {action.new_stop_loss != null && (
          <span className="font-['DM_Mono',monospace] text-[11px] text-[var(--ink)]">
            {action.old_stop_loss != null ? `${action.old_stop_loss.toFixed(2)} → ` : "→ "}
            {action.new_stop_loss.toFixed(2)}
          </span>
        )}
        {action.sell_percent != null && (
          <span className="font-['DM_Mono',monospace] text-[11px] text-[var(--ink)]">
            {action.sell_percent.toFixed(0)}%
            {action.sell_quantity != null && ` (${action.sell_quantity} st)`}
          </span>
        )}
        {action.reason && (
          <span className="text-[11px] text-[var(--ink3)]">{action.reason}</span>
        )}
        {!action.new_stop_loss && !action.sell_percent && action.target_value != null && (
          <span className="font-['DM_Mono',monospace] text-[11px] text-[var(--ink)]">→ {action.target_value.toFixed(2)}</span>
        )}
        {!action.reason && action.description && (
          <span className="text-[11px] text-[var(--ink3)]">{action.description}</span>
        )}

        <span className="font-['DM_Mono',monospace] text-[9px] text-[var(--ink4)] ml-1">
          {createdDate}
        </span>

        {/* Controls — pushed to the right */}
        <div className="ml-auto flex items-center gap-[4px]">
          <Badge variant={action.execution_state}>{action.execution_state}</Badge>

          {/* Acknowledge */}
          {action.execution_state === "pending" && (
            <button
              onClick={() => onAcknowledge(action.id)}
              className="font-['DM_Mono',monospace] text-[10px] text-[var(--blue)] border border-[#B0C4D4] px-[8px] py-[2px] rounded-[3px] hover:bg-[var(--blue2)] transition-colors cursor-pointer bg-transparent"
            >
              OK
            </button>
          )}

          {/* Execute — trade actions: one click; stop actions: show price input first */}
          {action.execution_state === "acknowledged" && !isStopAction && (
            <button
              onClick={handleExecute}
              className="font-['DM_Mono',monospace] text-[10px] text-[var(--green)] border border-[#B0D4B0] px-[8px] py-[2px] rounded-[3px] hover:bg-[var(--green3)] transition-colors cursor-pointer bg-transparent"
            >
              Utförd ✓
            </button>
          )}

          {/* Dismiss toggle */}
          {!showDismissRow && (
            <button
              onClick={() => setShowDismissRow(true)}
              className="font-['DM_Mono',monospace] text-[10px] text-[var(--ink4)] border border-[var(--border)] px-[6px] py-[2px] rounded-[3px] hover:bg-[var(--cream2)] transition-colors cursor-pointer bg-transparent"
              title="Avfärda"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Stop execution row (acknowledged stop actions) */}
      {action.execution_state === "acknowledged" && isStopAction && (
        <div className="flex items-center gap-[6px] pl-[4px] flex-wrap">
          <span className="font-['DM_Mono',monospace] text-[9px] text-[var(--ink4)] uppercase tracking-[0.8px]">Exec:</span>
          <input
            type="number"
            placeholder="Utfört pris (opt.)"
            value={execPrice}
            onChange={e => setExecPrice(e.target.value)}
            step="0.01"
            className="w-[110px] bg-[var(--surface)] border border-[var(--border2)] rounded-[3px] px-[6px] py-[3px] text-[10px] font-['DM_Mono',monospace] text-[var(--ink)] outline-none focus:border-[var(--green2)]"
          />
          <input
            type="text"
            placeholder="Notering (opt.)"
            value={execNote}
            onChange={e => setExecNote(e.target.value)}
            className="w-[130px] bg-[var(--surface)] border border-[var(--border2)] rounded-[3px] px-[6px] py-[3px] text-[10px] font-['DM_Mono',monospace] text-[var(--ink)] outline-none focus:border-[var(--green2)]"
          />
          <button
            onClick={handleExecute}
            className="font-['DM_Mono',monospace] text-[10px] text-[var(--green)] border border-[#B0D4B0] px-[8px] py-[3px] rounded-[3px] hover:bg-[var(--green3)] transition-colors cursor-pointer bg-transparent"
          >
            Utförd ✓
          </button>
        </div>
      )}

      {/* Dismiss note row */}
      {showDismissRow && (
        <div className="flex items-center gap-[6px] pl-[4px] flex-wrap">
          <span className="font-['DM_Mono',monospace] text-[9px] text-[var(--red)] uppercase tracking-[0.8px]">Avfärda:</span>
          <input
            type="text"
            placeholder="Anledning (opt.)"
            value={dismissNote}
            onChange={e => setDismissNote(e.target.value)}
            className="w-[160px] bg-[var(--surface)] border border-[#dcc4c4] rounded-[3px] px-[6px] py-[3px] text-[10px] font-['DM_Mono',monospace] text-[var(--ink)] outline-none"
          />
          <button
            onClick={confirmDismiss}
            className="font-['DM_Mono',monospace] text-[10px] text-[var(--red)] border border-[#dcc4c4] px-[8px] py-[3px] rounded-[3px] hover:bg-[var(--red2)] cursor-pointer bg-transparent"
          >
            Bekräfta
          </button>
          <button
            onClick={() => { setShowDismissRow(false); setDismissNote(""); }}
            className="font-['DM_Mono',monospace] text-[10px] text-[var(--ink4)] px-[4px] py-[3px] cursor-pointer border-0 bg-transparent"
          >
            Avbryt
          </button>
        </div>
      )}
    </div>
  );
}

function HistoryRow({ action }: { action: PositionAction }) {
  const label = ACTION_LABELS[action.action_type] || action.action_type;

  // Pick the most informative timestamp for display
  const ts = action.executed_at || action.dismissed_at || action.expired_at || action.created_at;
  const dateStr = new Date(ts).toLocaleDateString("sv-SE");

  return (
    <div className="flex items-center gap-[7px] flex-wrap font-['DM_Mono',monospace] text-[10px] text-[var(--ink3)]">
      <Badge variant={action.action_type}>{label}</Badge>

      {action.new_stop_loss != null && (
        <span>→ {action.new_stop_loss.toFixed(2)}</span>
      )}
      {action.sell_percent != null && (
        <span>{action.sell_percent.toFixed(0)}%</span>
      )}

      <Badge variant={action.execution_state}>{action.execution_state}</Badge>

      {/* Extra metadata */}
      {action.executed_price != null && (
        <span className="text-[var(--green)]">@ {action.executed_price.toFixed(2)}</span>
      )}
      {action.execution_note && (
        <span className="text-[var(--ink4)] italic">"{action.execution_note}"</span>
      )}
      {action.dismissed_note && (
        <span className="text-[var(--ink4)] italic">"{action.dismissed_note}"</span>
      )}

      <span className="text-[var(--ink4)] ml-auto">{dateStr}</span>
    </div>
  );
}
