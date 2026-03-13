"use client";

import { useState } from "react";
import { Badge } from "../ui/Badge";
import type { Signal } from "@/types";

interface SignalRowProps {
  signal: Signal;
  onTake: (signal: Signal) => void;
  onSkip: (signalId: string) => void;
  onDelete?: (signalId: string) => void;
}

// ─── Unified scoring helpers ────────────────────────────────────────────────

function normalizeScore(signal: Signal): number {
  if (signal.confidence == null) return 0;
  const raw = signal.confidence;
  // Already 0-1 range → convert to 0-100
  if (raw <= 1) return Math.round(raw * 100);
  // Already 0-100
  return Math.round(raw);
}

function scoreLabel(score: number): { label: string; color: string; bg: string } {
  if (score >= 80) return { label: "Stark",  color: "#1a7a4a", bg: "#e6f7ee" };
  if (score >= 60) return { label: "Bra",    color: "#2563eb", bg: "#eff6ff" };
  if (score >= 40) return { label: "Medel",  color: "#92400e", bg: "#fef3c7" };
  return             { label: "Svag",   color: "#b91c1c", bg: "#fee2e2" };
}

// ─── Metadata extraction helpers ────────────────────────────────────────────

function getMeta(signal: Signal, key: string): string | number | null {
  if (typeof signal.metadata !== "object" || signal.metadata === null) return null;
  const m = signal.metadata as Record<string, unknown>;
  return (m[key] as string | number) ?? null;
}

function getBreakdown(signal: Signal): Record<string, number> | null {
  if (typeof signal.metadata !== "object" || signal.metadata === null) return null;
  const m = signal.metadata as Record<string, unknown>;
  const bd = m["score_breakdown"];
  if (typeof bd === "object" && bd !== null) return bd as Record<string, number>;
  return null;
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function PriceBlock({ label, value, color = "var(--ink)" }: {
  label: string; value: number | null; color?: string;
}) {
  return (
    <div className="text-right">
      <div className="font-['DM_Mono',monospace] text-[8px] text-[var(--ink4)] tracking-[0.9px] uppercase mb-[2px]">
        {label}
      </div>
      <div className="font-['DM_Mono',monospace] font-medium text-[13px]" style={{ color }}>
        {value != null ? value.toFixed(2) : "—"}
      </div>
    </div>
  );
}

function ScoreBlock({ score }: { score: number }) {
  const { label, color, bg } = scoreLabel(score);
  const barColor = score >= 80 ? "#1a7a4a" : score >= 60 ? "#2563eb" : score >= 40 ? "#d97706" : "#b91c1c";

  return (
    <div className="text-right">
      <div className="font-['DM_Mono',monospace] text-[8px] text-[var(--ink4)] tracking-[0.9px] uppercase mb-[2px]">
        Score
      </div>
      <div className="flex items-center gap-[6px]">
        <div className="w-[44px] h-[3px] bg-[var(--cream3)] rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${score}%`, backgroundColor: barColor }} />
        </div>
        <span className="font-['DM_Mono',monospace] text-[10.5px] min-w-[24px]" style={{ color }}>
          {score}
        </span>
        <span className="font-['DM_Mono',monospace] text-[9px] px-[5px] py-[2px] rounded-[3px]"
          style={{ color, backgroundColor: bg }}>
          {label}
        </span>
      </div>
    </div>
  );
}

function BreakdownBar({ label, value, max, color = "#1a7a4a" }: {
  label: string; value: number; max: number; color?: string;
}) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex items-center gap-[8px]">
      <span className="font-['DM_Mono',monospace] text-[9px] text-[var(--ink4)] w-[120px] truncate">{label}</span>
      <div className="flex-1 h-[3px] bg-[var(--cream3)] rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="font-['DM_Mono',monospace] text-[9px] text-[var(--ink3)] w-[32px] text-right">
        {value}/{max}
      </span>
    </div>
  );
}

function MetaTag({ label, value, highlight = false }: {
  label: string; value: string | number; highlight?: boolean;
}) {
  return (
    <div className={`flex flex-col gap-[1px] px-[8px] py-[5px] rounded-[4px] ${
      highlight ? "bg-[var(--green4)] border border-[var(--green3)]" : "bg-[var(--cream2)]"
    }`}>
      <span className="font-['DM_Mono',monospace] text-[7.5px] text-[var(--ink4)] uppercase tracking-[0.8px]">{label}</span>
      <span className={`font-['DM_Mono',monospace] text-[10.5px] font-medium ${
        highlight ? "text-[var(--green)]" : "text-[var(--ink)]"
      }`}>{value}</span>
    </div>
  );
}

function RegimeBadge({ regime }: { regime: string }) {
  const config: Record<string, { emoji: string; color: string; bg: string }> = {
    TRENDING: { emoji: "📈", color: "#1a7a4a", bg: "#e6f7ee" },
    CHOPPY:   { emoji: "〰️", color: "#92400e", bg: "#fef3c7" },
    VOLATILE: { emoji: "⚡", color: "#b91c1c", bg: "#fee2e2" },
    BULL:     { emoji: "🟢", color: "#1a7a4a", bg: "#e6f7ee" },
    CAUTION:  { emoji: "🟡", color: "#92400e", bg: "#fef3c7" },
    BEAR:     { emoji: "🔴", color: "#b91c1c", bg: "#fee2e2" },
  };
  const c = config[regime?.toUpperCase()] ?? { emoji: "⚪", color: "var(--ink3)", bg: "var(--cream2)" };
  return (
    <span className="font-['DM_Mono',monospace] text-[9px] px-[6px] py-[2px] rounded-[3px]"
      style={{ color: c.color, backgroundColor: c.bg }}>
      {c.emoji} {regime}
    </span>
  );
}

// ─── Detail Panel ────────────────────────────────────────────────────────────

function SignalDetailPanel({ signal }: { signal: Signal }) {
  const score        = normalizeScore(signal);
  const breakdown    = getBreakdown(signal);
  const regime       = getMeta(signal, "regime") as string | null;
  const adx          = getMeta(signal, "adx");
  const diPlus       = getMeta(signal, "di_plus");
  const diMinus      = getMeta(signal, "di_minus");
  const volRatio     = getMeta(signal, "volume_ratio") ?? getMeta(signal, "vol_ratio");
  const pivotAge     = getMeta(signal, "pivot_age_bars");
  const ma50pct      = getMeta(signal, "ma50_above_ma200_pct");
  const trailMult    = getMeta(signal, "trail_multiplier");
  const partialTgt   = getMeta(signal, "partial_exit_target");
  const maxExitDate  = getMeta(signal, "max_exit_date");
  const tier         = getMeta(signal, "tier") as string | null;
  const rsi          = getMeta(signal, "rsi");
  const bbSignal     = getMeta(signal, "bb_signal");
  const volSpike     = getMeta(signal, "volume_spike");
  const barDate      = getMeta(signal, "bar_date");
  const strategy     = signal.strategies?.name || signal.strategy?.name || "";

  // Detect strategy type from name
  const isMeanRev    = strategy.includes("mean") || strategy.includes("reversion");
  const isVeryStrong = strategy.includes("verystrong") || strategy.includes("strong");

  return (
    <div className="px-[22px] py-[14px] bg-[var(--cream)] border-b border-[var(--border)] space-y-[14px]">

      {/* Row 1 — Score + Regime + Tier */}
      <div className="flex items-center gap-[10px] flex-wrap">
        <div className="flex items-center gap-[6px]">
          <span className="font-['DM_Mono',monospace] text-[8px] text-[var(--ink4)] uppercase tracking-[0.9px]">Signalstyrka</span>
          <span className="font-['DM_Mono',monospace] font-bold text-[15px] text-[var(--ink)]">{score}/100</span>
          <span className="font-['DM_Mono',monospace] text-[9px] px-[6px] py-[2px] rounded-[3px]"
            style={{ color: scoreLabel(score).color, backgroundColor: scoreLabel(score).bg }}>
            {scoreLabel(score).label}
          </span>
        </div>
        {regime && <RegimeBadge regime={regime} />}
        {tier && (
          <span className="font-['DM_Mono',monospace] text-[9px] px-[6px] py-[2px] rounded-[3px] bg-[var(--cream2)] text-[var(--ink3)]">
            {tier === "STRONG" ? "⭐⭐ STRONG" : "⭐ MEDIUM"}
          </span>
        )}
        {barDate && (
          <span className="font-['DM_Mono',monospace] text-[9px] text-[var(--ink4)]">Signal-bar: {barDate}</span>
        )}
      </div>

      {/* Row 2 — Score breakdown (VeryStrong) */}
      {breakdown && (
        <div className="space-y-[5px]">
          <span className="font-['DM_Mono',monospace] text-[8px] text-[var(--ink4)] uppercase tracking-[0.9px]">Score breakdown</span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-[4px]">
            {breakdown.trend_strength  != null && <BreakdownBar label="Trend styrka"     value={breakdown.trend_strength}  max={25} />}
            {breakdown.di_direction    != null && <BreakdownBar label="DI+ riktning"     value={breakdown.di_direction}    max={20} color="#2563eb" />}
            {breakdown.volume         != null && <BreakdownBar label="Volym"             value={breakdown.volume}          max={15} color="#7c3aed" />}
            {breakdown.pivot_freshness != null && <BreakdownBar label="Pivot färskhet"   value={breakdown.pivot_freshness} max={15} color="#0891b2" />}
            {breakdown.adx_strength    != null && <BreakdownBar label="ADX styrka"       value={breakdown.adx_strength}    max={15} color="#d97706" />}
            {breakdown.entry_proximity != null && <BreakdownBar label="Entry proximity"  value={breakdown.entry_proximity} max={10} color="#059669" />}
          </div>
        </div>
      )}

      {/* Row 3 — Technical indicators */}
      <div className="flex flex-wrap gap-[6px]">
        {adx      != null && <MetaTag label="ADX"          value={Number(adx).toFixed(1)}      highlight={Number(adx) > 30} />}
        {diPlus   != null && <MetaTag label="DI+"          value={Number(diPlus).toFixed(1)}   highlight={Number(diPlus) > Number(diMinus ?? 0)} />}
        {diMinus  != null && <MetaTag label="DI−"          value={Number(diMinus).toFixed(1)} />}
        {ma50pct  != null && <MetaTag label="MA50 > MA200" value={`${Number(ma50pct).toFixed(1)}%`} highlight={Number(ma50pct) > 10} />}
        {volRatio != null && <MetaTag label="Volym ratio"  value={`${Number(volRatio).toFixed(2)}x`} highlight={Number(volRatio) > 1.2} />}
        {pivotAge != null && <MetaTag label="Pivot ålder"  value={`${pivotAge} bars`}           highlight={Number(pivotAge) <= 5} />}
        {rsi      != null && <MetaTag label="RSI"          value={Number(rsi).toFixed(1)}       highlight={Number(rsi) < 35} />}
        {bbSignal != null && <MetaTag label="Under BB"     value={bbSignal ? "Ja ✅" : "Nej"} highlight={!!bbSignal} />}
        {volSpike != null && <MetaTag label="Vol spike"    value={volSpike ? "Ja ✅" : "Nej"} highlight={!!volSpike} />}
      </div>

      {/* Row 4 — Exit plan */}
      {(partialTgt || trailMult || maxExitDate) && (
        <div className="space-y-[4px]">
          <span className="font-['DM_Mono',monospace] text-[8px] text-[var(--ink4)] uppercase tracking-[0.9px]">Exit-plan</span>
          <div className="flex flex-wrap gap-[6px]">
            {partialTgt  && <MetaTag label="Partiell exit (1.5R)" value={Number(partialTgt).toFixed(2)} />}
            {trailMult   && <MetaTag label="Trailing"             value={`${trailMult}x ATR (${regime ?? ""})`} />}
            {maxExitDate && <MetaTag label="Max håll till"        value={String(maxExitDate)} />}
            {signal.stop_loss  && <MetaTag label="Hard stop"     value={signal.stop_loss.toFixed(2)} />}
          </div>
          {isMeanRev && (
            <p className="font-['DM_Mono',monospace] text-[9px] text-[var(--ink4)]">
              Target +6% eller RSI &gt; 55 — fast exit, ingen trailing
            </p>
          )}
          {isVeryStrong && partialTgt && (
            <p className="font-['DM_Mono',monospace] text-[9px] text-[var(--ink4)]">
              Sälj 50% vid {Number(partialTgt).toFixed(2)} → trailing stop på resten
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main SignalRow ──────────────────────────────────────────────────────────

export function SignalRow({ signal, onTake, onSkip, onDelete }: SignalRowProps) {
  const [expanded, setExpanded] = useState(false);

  const market = getMeta(signal, "market") as string | null;
  const strategyName = signal.strategies?.name || signal.strategy?.name || "";
  const isLeverage = signal.execution_type === "leverage";
  const score = normalizeScore(signal);

  // Check if there's detail data worth showing
  const hasDetails = signal.metadata != null && typeof signal.metadata === "object" &&
    Object.keys(signal.metadata as object).length > 2;

  return (
    <>
      <div
        className={`flex items-center gap-[14px] px-[22px] py-[15px] border-b border-[var(--border)] last:border-0 transition-colors flex-wrap ${
          hasDetails ? "cursor-pointer hover:bg-[var(--cream)]" : "hover:bg-[var(--cream)]"
        } ${expanded ? "bg-[var(--cream)]" : ""}`}
        onClick={hasDetails ? () => setExpanded(!expanded) : undefined}
      >
        {/* Left — ticker + badges */}
        <div className="flex-1 flex items-center gap-[9px] flex-wrap min-w-[200px]">
          <span className="font-['Fraunces'] font-bold text-[17px] tracking-[-0.3px] min-w-[88px] text-[var(--ink)]">
            {signal.ticker}
          </span>
          <Badge variant={signal.direction}>{signal.direction.toUpperCase()}</Badge>
          <Badge variant={signal.status}>{signal.status.toUpperCase()}</Badge>
          {market && <Badge variant={market.toLowerCase()}>{market.toUpperCase()}</Badge>}
          {isLeverage && (
            <Badge variant="leverage">
              {signal.target_leverage ? `${signal.target_leverage}x` : "LEV"}
            </Badge>
          )}
          <span className="font-['DM_Mono',monospace] text-[9.5px] text-[var(--ink4)]">
            {strategyName}{strategyName && " · "}
            {new Date(signal.signal_time).toLocaleString("sv-SE", {
              month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
            })}
          </span>
          {/* Expand chevron */}
          {hasDetails && (
            <span className="font-['DM_Mono',monospace] text-[10px] text-[var(--ink4)] ml-1 transition-transform"
              style={{ display: "inline-block", transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}>
              ▾
            </span>
          )}
        </div>

        {/* Leverage instrument info */}
        {isLeverage && signal.execution_symbol && (
          <div className="w-full sm:w-auto flex items-center gap-2 text-[9.5px] font-['DM_Mono',monospace] text-[var(--purple)] bg-[var(--purple2)] px-2 py-1 rounded-[3px]">
            <span>Köp: {signal.execution_symbol}</span>
            {signal.issuer && <span className="text-[var(--ink4)]">({signal.issuer})</span>}
            {signal.instrument_price && (
              <span className="text-[var(--ink3)]">~{signal.instrument_price} {signal.instrument_currency || "SEK"}</span>
            )}
            {signal.knockout_level && <span className="text-[var(--red)]">KO: {signal.knockout_level}</span>}
          </div>
        )}

        {/* Center — prices + score */}
        <div className="flex gap-[18px] items-center" onClick={(e) => e.stopPropagation()}>
          <PriceBlock label="Entry" value={signal.entry_price} />
          <PriceBlock label="SL"    value={signal.stop_loss}   color="var(--red)" />
          <PriceBlock label="TP"    value={signal.take_profit} color="var(--green)" />
          {signal.confidence != null && <ScoreBlock score={score} />}
        </div>

        {/* Right — actions */}
        <div className="flex items-center gap-[6px]" onClick={(e) => e.stopPropagation()}>
          {signal.status === "pending" && (
            <>
              <button onClick={() => onTake(signal)}
                className="bg-[var(--green)] text-white font-['DM_Mono',monospace] text-[11px] font-medium px-[11px] py-[5px] rounded-[var(--r-sm)] hover:bg-[var(--green2)] transition-colors cursor-pointer border-0">
                Ta trade
              </button>
              <button onClick={() => onSkip(signal.id)}
                className="bg-transparent text-[var(--ink2)] font-['DM_Mono',monospace] text-[11px] border border-[var(--border2)] px-[11px] py-[5px] rounded-[var(--r-sm)] hover:bg-[var(--cream2)] transition-colors cursor-pointer">
                Skippa
              </button>
            </>
          )}
          {onDelete && (
            <button onClick={() => onDelete(signal.id)}
              className="bg-[var(--red2)] text-[var(--red)] font-['DM_Mono',monospace] text-[10.5px] border border-[#dcc4c4] px-[9px] py-[3px] rounded-[var(--r-sm)] hover:bg-[#eccece] transition-colors cursor-pointer">
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Expandable detail panel */}
      {expanded && hasDetails && <SignalDetailPanel signal={signal} />}
    </>
  );
}
