import { Badge } from "../ui/Badge";
import type { Signal } from "@/types";

interface SignalRowProps {
  signal: Signal;
  onTake: (signal: Signal) => void;
  onSkip: (signalId: string) => void;
  onDelete?: (signalId: string) => void;
}

export function SignalRow({ signal, onTake, onSkip, onDelete }: SignalRowProps) {
  const market =
    typeof signal.metadata === "object" &&
    signal.metadata !== null &&
    "market" in signal.metadata
      ? String(signal.metadata.market).toLowerCase()
      : null;

  const strategyName = signal.strategies?.name || signal.strategy?.name || "";

  const isLeverage = signal.execution_type === "leverage";

  return (
    <div className="flex items-center gap-[14px] px-[22px] py-[15px] border-b border-[var(--border)] last:border-0 hover:bg-[var(--cream)] transition-colors flex-wrap">
      {/* Left — ticker + badges + meta */}
      <div className="flex-1 flex items-center gap-[9px] flex-wrap min-w-[200px]">
        <span className="font-['Fraunces'] font-bold text-[17px] tracking-[-0.3px] min-w-[88px] text-[var(--ink)]">
          {signal.ticker}
        </span>
        <Badge variant={signal.direction}>{signal.direction.toUpperCase()}</Badge>
        <Badge variant={signal.status}>{signal.status.toUpperCase()}</Badge>
        {market && <Badge variant={market}>{market.toUpperCase()}</Badge>}
        {isLeverage && (
          <Badge variant="leverage">
            {signal.target_leverage ? `${signal.target_leverage}x` : "LEV"}
          </Badge>
        )}
        <span className="font-['DM_Mono',monospace] text-[9.5px] text-[var(--ink4)]">
          {strategyName}
          {strategyName && " · "}
          {new Date(signal.signal_time).toLocaleString("sv-SE", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>

      {/* Leverage instrument info */}
      {isLeverage && signal.execution_symbol && (
        <div className="w-full sm:w-auto flex items-center gap-2 text-[9.5px] font-['DM_Mono',monospace] text-[var(--purple)] bg-[var(--purple2)] px-2 py-1 rounded-[3px]">
          <span>Köp: {signal.execution_symbol}</span>
          {signal.issuer && <span className="text-[var(--ink4)]">({signal.issuer})</span>}
          {signal.instrument_price && (
            <span className="text-[var(--ink3)]">
              ~{signal.instrument_price} {signal.instrument_currency || "SEK"}
            </span>
          )}
          {signal.knockout_level && (
            <span className="text-[var(--red)]">KO: {signal.knockout_level}</span>
          )}
        </div>
      )}

      {/* Center — prices */}
      <div className="flex gap-[18px] items-center">
        <PriceBlock label="Entry" value={signal.entry_price} />
        <PriceBlock label="SL" value={signal.stop_loss} color="var(--red)" />
        <PriceBlock label="TP" value={signal.take_profit} color="var(--green)" />
        {signal.confidence != null && (
          <ScoreBlock score={Math.round(signal.confidence * 100)} />
        )}
      </div>

      {/* Right — actions */}
      <div className="flex items-center gap-[6px]">
        {signal.status === "pending" && (
          <>
            <button
              onClick={() => onTake(signal)}
              className="bg-[var(--green)] text-white font-['DM_Mono',monospace] text-[11px] font-medium px-[11px] py-[5px] rounded-[var(--r-sm)] hover:bg-[var(--green2)] transition-colors cursor-pointer border-0"
            >
              Ta trade
            </button>
            <button
              onClick={() => onSkip(signal.id)}
              className="bg-transparent text-[var(--ink2)] font-['DM_Mono',monospace] text-[11px] border border-[var(--border2)] px-[11px] py-[5px] rounded-[var(--r-sm)] hover:bg-[var(--cream2)] transition-colors cursor-pointer"
            >
              Skippa
            </button>
          </>
        )}
        {onDelete && (
          <button
            onClick={() => onDelete(signal.id)}
            className="bg-[var(--red2)] text-[var(--red)] font-['DM_Mono',monospace] text-[10.5px] border border-[#dcc4c4] px-[9px] py-[3px] rounded-[var(--r-sm)] hover:bg-[#eccece] transition-colors cursor-pointer"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

function PriceBlock({
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

function ScoreBlock({ score }: { score: number }) {
  return (
    <div className="text-right">
      <div className="font-['DM_Mono',monospace] text-[8px] text-[var(--ink4)] tracking-[0.9px] uppercase mb-[2px]">
        Score
      </div>
      <div className="flex items-center gap-[5px]">
        <div className="w-[40px] h-[3px] bg-[var(--cream3)] rounded-full overflow-hidden">
          <div
            className="h-full bg-[var(--green)] rounded-full transition-all"
            style={{ width: `${score}%` }}
          />
        </div>
        <span className="font-['DM_Mono',monospace] text-[10.5px] text-[var(--ink3)] min-w-[28px]">
          {score}%
        </span>
      </div>
    </div>
  );
}
