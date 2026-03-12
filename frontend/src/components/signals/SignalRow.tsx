import { Badge } from "../ui/Badge";
import type { Signal } from "@/types";

interface SignalRowProps {
  signal: Signal;
  onTake: (signal: Signal) => void;
  onSkip: (signalId: string) => void;
  compact?: boolean;
}

export function SignalRow({ signal, onTake, onSkip, compact }: SignalRowProps) {
  const market =
    typeof signal.metadata === "object" &&
    signal.metadata !== null &&
    "market" in signal.metadata
      ? String(signal.metadata.market).toLowerCase()
      : null;

  const setupType =
    typeof signal.metadata === "object" &&
    signal.metadata !== null &&
    "setup_type" in signal.metadata
      ? String(signal.metadata.setup_type)
      : null;

  const isLeverage = signal.execution_type === "leverage";

  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-700/50 last:border-0 hover:bg-gray-700/20 transition-colors flex-wrap">
      {/* Left — ticker + badges */}
      <div className="flex-1 flex items-center gap-2 flex-wrap min-w-[180px]">
        <span className="font-bold text-base text-white min-w-[80px]">
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
        {setupType && !compact && (
          <span className="text-[10px] font-mono text-gray-500">
            {setupType}
          </span>
        )}
      </div>

      {/* Leverage instrument info */}
      {isLeverage && signal.execution_symbol && (
        <div className="w-full sm:w-auto flex items-center gap-2 text-[10px] font-mono text-purple-400 bg-purple-500/10 px-2 py-1 rounded">
          <span>Köp: {signal.execution_symbol}</span>
          {signal.issuer && <span className="text-gray-500">({signal.issuer})</span>}
          {signal.instrument_price && (
            <span className="text-gray-400">
              ~{signal.instrument_price} {signal.instrument_currency || "SEK"}
            </span>
          )}
          {signal.knockout_level && (
            <span className="text-red-400">KO: {signal.knockout_level}</span>
          )}
        </div>
      )}

      {/* Center — prices */}
      <div className="flex gap-4 items-center">
        <PriceBlock label="Entry" value={signal.entry_price} />
        <PriceBlock label="SL" value={signal.stop_loss} color="text-red-400" />
        <PriceBlock label="TP" value={signal.take_profit} color="text-green-400" />
        {signal.confidence != null && (
          <ScoreBlock score={Math.round(signal.confidence * 100)} />
        )}
      </div>

      {/* Right — time + actions */}
      <div className="flex items-center gap-2 ml-auto">
        <span className="text-[10px] font-mono text-gray-500 hidden lg:inline">
          {new Date(signal.signal_time).toLocaleString("sv-SE", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>

        {signal.status === "pending" && (
          <>
            <button
              onClick={() => onTake(signal)}
              className="bg-green-600 hover:bg-green-700 text-white font-mono text-[11px] font-medium px-3 py-1.5 rounded-md transition-colors"
            >
              Ta trade
            </button>
            <button
              onClick={() => onSkip(signal.id)}
              className="bg-transparent text-gray-400 font-mono text-[11px] border border-gray-600 px-3 py-1.5 rounded-md hover:bg-gray-700 transition-colors"
            >
              Skippa
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function PriceBlock({
  label,
  value,
  color = "text-white",
}: {
  label: string;
  value: number | null;
  color?: string;
}) {
  return (
    <div className="text-right">
      <div className="font-mono text-[9px] text-gray-500 uppercase tracking-wider mb-0.5">
        {label}
      </div>
      <div className={`font-mono font-medium text-xs ${color}`}>
        {value != null ? value.toFixed(2) : "-"}
      </div>
    </div>
  );
}

function ScoreBlock({ score }: { score: number }) {
  return (
    <div className="text-right">
      <div className="font-mono text-[9px] text-gray-500 uppercase tracking-wider mb-0.5">
        Score
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-10 h-1 bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 rounded-full transition-all"
            style={{ width: `${score}%` }}
          />
        </div>
        <span className="font-mono text-[10px] text-gray-400 min-w-[28px]">
          {score}%
        </span>
      </div>
    </div>
  );
}
