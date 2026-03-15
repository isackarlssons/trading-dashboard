"use client";

import AppShell from "@/components/layout/AppShell";
import { useEffect, useState, useCallback } from "react";
import { signalsApi, strategiesApi, riskApi } from "@/lib/api";
import { SignalRow } from "@/components/signals/SignalRow";
import { Card } from "@/components/ui/Card";
import type { Signal, Strategy, TakeSignal } from "@/types";

type TabFilter = "pending" | "taken" | "skipped" | "expired";

export default function SignalsPage() {
  return (
    <AppShell>
      <SignalsContent />
    </AppShell>
  );
}

function SignalsContent() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [tab, setTab] = useState<TabFilter>("pending");
  const [tickerSearch, setTickerSearch] = useState("");
  const [strategyFilter, setStrategyFilter] = useState("");
  const [marketFilter, setMarketFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [generating, setGenerating] = useState(false);

  // Take trade state
  const [takingSignal, setTakingSignal] = useState<Signal | null>(null);
  const [entryPrice, setEntryPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [validating, setValidating] = useState(false);
  const [riskBlock, setRiskBlock] = useState<string[] | null>(null);

  // Create signal form
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    strategiesApi.list().then(setStrategies).catch(console.error);
  }, []);

  useEffect(() => {
    loadSignals();
  }, []);

  const loadSignals = useCallback(async () => {
    try {
      setLoading(true);
      const data = await signalsApi.list();
      setSignals(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // ─── Filter by tab ────────────────────────────────────────────────────────
  const filteredSignals = signals
    .filter((s) => s.status === tab)
    .filter((s) => (tickerSearch ? s.ticker.toLowerCase().includes(tickerSearch.toLowerCase()) : true))
    .filter((s) => {
      if (!strategyFilter) return true;
      return (s.strategies?.name || s.strategy?.name || "") === strategyFilter;
    })
    .filter((s) => {
      if (!marketFilter) return true;
      // Prefer the dedicated market column; fall back to metadata for old rows
      const m = s.market || (typeof s.metadata === "object" && s.metadata !== null && "market" in s.metadata ? String(s.metadata.market) : "");
      return m.toLowerCase() === marketFilter.toLowerCase();
    });

  const counts = {
    pending: signals.filter((s) => s.status === "pending").length,
    taken: signals.filter((s) => s.status === "taken").length,
    skipped: signals.filter((s) => s.status === "skipped").length,
    expired: signals.filter((s) => s.status === "expired").length,
  };

  // ─── Optimistic Take Trade ────────────────────────────────────────────────
  async function handleTakeSignal(signal: Signal) {
    if (takingSignal?.id === signal.id) {
      if (!entryPrice) return;

      const entryPriceNum = parseFloat(entryPrice);
      const quantityNum   = quantity ? parseFloat(quantity) : undefined;

      // ── Step 1: Risk validation ────────────────────────────────────────────
      setValidating(true);
      setRiskBlock(null);
      try {
        const validation = await riskApi.validateEntry({
          ticker:          signal.ticker,
          direction:       signal.direction,
          entry_price:     entryPriceNum,
          stop_loss:       signal.stop_loss ?? undefined,
          quantity:        quantityNum,
          strategy_id:     signal.strategy_id ?? undefined,
          strategy_family: (signal.strategies as any)?.strategy_family
                           ?? (signal.strategy as any)?.strategy_family
                           ?? undefined,
          market:          signal.market ?? undefined,
          instrument_currency: signal.instrument_currency ?? undefined,
        });

        if (!validation.allowed) {
          setRiskBlock(validation.blocking_reasons);
          setValidating(false);
          return; // blocked — do not proceed
        }
        // Warnings are non-blocking; proceed silently
      } catch {
        // Validation endpoint unreachable — fail open to avoid blocking trades
        // due to infra issues, but log so it's visible in the console.
        console.warn("[risk] validation endpoint unreachable — proceeding without check");
      }
      setValidating(false);

      // ── Step 2: Create position (original flow) ────────────────────────────
      try {
        const data: TakeSignal = {
          actual_entry_price: entryPriceNum,
          quantity: quantityNum,
        };
        setSignals((prev) => prev.map((s) => (s.id === signal.id ? { ...s, status: "taken" as const } : s)));
        setTakingSignal(null);
        setEntryPrice("");
        setQuantity("");
        setRiskBlock(null);
        await signalsApi.take(signal.id, data);
      } catch (err: any) {
        setSignals((prev) => prev.map((s) => (s.id === signal.id ? { ...s, status: "pending" as const } : s)));
        setError(err.message);
      }
    } else {
      setTakingSignal(signal);
      setRiskBlock(null);
      // For leverage signals, pre-fill with instrument_price if available
      if (signal.execution_type === "leverage" && signal.instrument_price) {
        setEntryPrice(signal.instrument_price.toString());
      } else {
        setEntryPrice(signal.entry_price?.toString() || "");
      }
    }
  }

  // ─── Optimistic Skip ──────────────────────────────────────────────────────
  async function handleSkipSignal(signalId: string) {
    setSignals((prev) => prev.map((s) => (s.id === signalId ? { ...s, status: "skipped" as const } : s)));
    try {
      await signalsApi.update(signalId, { status: "skipped" });
    } catch (err: any) {
      setSignals((prev) => prev.map((s) => (s.id === signalId ? { ...s, status: "pending" as const } : s)));
      setError(err.message);
    }
  }

  // ─── Generate test signals ────────────────────────────────────────────────
  async function handleGenerate(count: number) {
    if (strategies.length === 0) { setError("No strategies loaded"); return; }
    setGenerating(true); setError(""); setSuccess("");
    const tickers: Record<string, { t: string; p: number }[]> = {
      US: [{ t: "AAPL", p: 195 },{ t: "MSFT", p: 420 },{ t: "NVDA", p: 136 },{ t: "AMZN", p: 186 },{ t: "TSLA", p: 249 },{ t: "META", p: 505 }],
      SE: [{ t: "ABB.ST", p: 612 },{ t: "AZN.ST", p: 2145 },{ t: "VOLV-B.ST", p: 285 },{ t: "ASSA-B.ST", p: 313 }],
    };
    const setups = ["zone_bounce","zone_breakout","trend_follow","reversal","momentum"];
    try {
      for (let i = 0; i < count; i++) {
        const strat = strategies[Math.floor(Math.random() * strategies.length)];
        const cfg = strat.config as Record<string, string> | null;
        const market = cfg?.market || "US";
        const stocks = tickers[market] || tickers.US;
        const stock = stocks[Math.floor(Math.random() * stocks.length)];
        const dir = Math.random() > 0.2 ? "long" : "short";
        const vary = 1 + (Math.random() - 0.5) * 0.04;
        const entry = +(stock.p * vary).toFixed(2);
        const slPct = 0.02 + Math.random() * 0.03;
        const sl = dir === "long" ? +(entry * (1 - slPct)).toFixed(2) : +(entry * (1 + slPct)).toFixed(2);
        const rr = 1.5 + Math.random() * 1.5;
        const risk = Math.abs(entry - sl);
        const tp = dir === "long" ? +(entry + risk * rr).toFixed(2) : +(entry - risk * rr).toFixed(2);
        const score = +(0.55 + Math.random() * 0.4).toFixed(2);
        const setup = setups[Math.floor(Math.random() * setups.length)];
        const sigTime = new Date(Date.now() - Math.random() * 4 * 3600000).toISOString();
        const isLev = Math.random() > 0.7;
        await signalsApi.create({
          strategy_id: strat.id, ticker: stock.t, direction: dir as "long"|"short",
          entry_price: entry, stop_loss: sl, take_profit: tp, confidence: score,
          metadata: { market, setup_type: setup, generated: "test_bot" }, expires_at: sigTime,
          ...(isLev ? { execution_type: "leverage" as const, execution_symbol: `BULL ${stock.t.replace(".ST","")} X3 AVA`, issuer: "Avanza", target_leverage: 3, instrument_currency: market === "SE" ? "SEK" : "USD", instrument_price: +(Math.random()*50+5).toFixed(2) } : {}),
        });
      }
      setSuccess(`Genererade ${count} signaler`);
      loadSignals();
      setTimeout(() => setSuccess(""), 3000);
    } catch (err: any) { setError(err.message); }
    finally { setGenerating(false); }
  }

  // ─── Tabs config ──────────────────────────────────────────────────────────
  const tabs: { key: TabFilter; label: string; count: number }[] = [
    { key: "pending", label: "Pending", count: counts.pending },
    { key: "taken", label: "Tagna", count: counts.taken },
    { key: "skipped", label: "Skippade", count: counts.skipped },
    { key: "expired", label: "Utgångna", count: counts.expired },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-['Fraunces'] text-[22px] font-semibold text-[var(--ink)]">Signaler</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex bg-[var(--cream2)] border border-[var(--border)] rounded-[var(--r-sm)] p-[3px] gap-[2px]">
            {tabs.map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`px-[12px] py-[5px] text-[11px] font-['DM_Mono',monospace] rounded-[4px] border-0 cursor-pointer transition-all ${
                  tab === t.key ? "bg-[var(--surface)] text-[var(--ink)] shadow-[var(--shadow)]" : "bg-transparent text-[var(--ink3)]"
                }`}>
                {t.label} <span className="opacity-50">{t.count}</span>
              </button>
            ))}
          </div>
          <button onClick={() => setShowCreate(!showCreate)}
            className="bg-[var(--blue)] text-white font-['DM_Mono',monospace] text-[11px] font-medium px-[12px] py-[7px] rounded-[var(--r-sm)] hover:opacity-90 transition-colors border-0 cursor-pointer">
            + Ny signal
          </button>
          <button onClick={() => handleGenerate(3)} disabled={generating}
            className="bg-[var(--green)] text-white font-['DM_Mono',monospace] text-[11px] font-medium px-[12px] py-[7px] rounded-[var(--r-sm)] hover:bg-[var(--green2)] transition-colors border-0 cursor-pointer disabled:opacity-50">
            Generera 3
          </button>
          <button onClick={() => handleGenerate(8)} disabled={generating}
            className="bg-[var(--green)] text-white font-['DM_Mono',monospace] text-[11px] font-medium px-[12px] py-[7px] rounded-[var(--r-sm)] hover:bg-[var(--green2)] transition-colors border-0 cursor-pointer disabled:opacity-50">
            Generera 8
          </button>
        </div>
      </div>

      {/* Create Signal Form */}
      {showCreate && (
        <CreateSignalForm
          strategies={strategies}
          onCreated={() => { setShowCreate(false); loadSignals(); setSuccess("Signal skapad!"); setTimeout(() => setSuccess(""), 3000); }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {success && (
        <div className="bg-[var(--green4)] border border-[var(--green3)] rounded-[var(--r-sm)] px-4 py-2">
          <p className="text-[var(--green)] text-xs font-['DM_Mono',monospace]">{success}</p>
        </div>
      )}
      {error && (
        <div className="bg-[var(--red2)] border border-[#dcc4c4] rounded-[var(--r-sm)] px-4 py-2 flex items-center justify-between">
          <p className="text-[var(--red)] text-xs font-['DM_Mono',monospace]">{error}</p>
          <button onClick={() => setError("")} className="text-[var(--red)] text-xs cursor-pointer border-0 bg-transparent">✕</button>
        </div>
      )}

      {/* Signal list */}
      <Card>
        {/* Filter bar */}
        <div className="flex items-center gap-[10px] px-[22px] py-[11px] border-b border-[var(--border)] bg-[var(--cream)] flex-wrap">
          <span className="font-['DM_Mono',monospace] text-[8.5px] text-[var(--ink4)] uppercase tracking-[1.1px]">Filter</span>
          <input type="text" placeholder="Ticker…" value={tickerSearch} onChange={(e) => setTickerSearch(e.target.value)}
            className="px-[9px] py-[5px] border border-[var(--border2)] rounded-[var(--r-sm)] text-[11.5px] font-['DM_Mono',monospace] bg-[var(--surface)] text-[var(--ink)] outline-none min-w-[126px] focus:border-[var(--green2)]" />
          <select value={strategyFilter} onChange={(e) => setStrategyFilter(e.target.value)}
            className="px-[9px] py-[5px] border border-[var(--border2)] rounded-[var(--r-sm)] text-[11.5px] font-['DM_Mono',monospace] bg-[var(--surface)] text-[var(--ink)] outline-none cursor-pointer">
            <option value="">Alla strategier</option>
            {strategies.map((s) => (<option key={s.id} value={s.name}>{s.name}</option>))}
          </select>
          <select value={marketFilter} onChange={(e) => setMarketFilter(e.target.value)}
            className="px-[9px] py-[5px] border border-[var(--border2)] rounded-[var(--r-sm)] text-[11.5px] font-['DM_Mono',monospace] bg-[var(--surface)] text-[var(--ink)] outline-none cursor-pointer">
            <option value="">Alla marknader</option>
            <option value="SE">SE</option>
            <option value="US">US</option>
          </select>
          {(tickerSearch || strategyFilter || marketFilter) && (
            <button onClick={() => { setTickerSearch(""); setStrategyFilter(""); setMarketFilter(""); }}
              className="text-[10px] text-[var(--ink4)] font-['DM_Mono',monospace] underline bg-transparent border-0 cursor-pointer hover:text-[var(--ink2)]">Rensa</button>
          )}
          <span className="ml-auto font-['DM_Mono',monospace] text-[9px] text-[var(--ink4)]">{filteredSignals.length} signaler</span>
        </div>

        {/* Rows */}
        {loading ? (
          <div className="py-[52px] text-center font-['DM_Mono',monospace] text-[10.5px] text-[var(--ink4)]">Laddar signaler...</div>
        ) : filteredSignals.length === 0 ? (
          <div className="py-[52px] text-center font-['DM_Mono',monospace] text-[10.5px] text-[var(--ink4)]">Inga signaler hittades</div>
        ) : (
          <div>
            {filteredSignals.map((signal) => (
              <div key={signal.id}>
                <SignalRow signal={signal} onTake={handleTakeSignal} onSkip={handleSkipSignal} />
                {/* Inline take form */}
                {takingSignal?.id === signal.id && (
                  <div className="border-b border-[var(--border)]">
                    {/* Input row */}
                    <div className="flex items-center gap-[8px] px-[22px] py-[10px] bg-[var(--green4)] flex-wrap">
                      <span className="font-['DM_Mono',monospace] text-[9px] text-[var(--green)] uppercase tracking-[1px]">
                        {signal.execution_type === "leverage" ? "Ta leverage-trade:" : "Ta trade:"}
                      </span>
                      {signal.execution_type === "leverage" && signal.execution_symbol && (
                        <span className="font-['DM_Mono',monospace] text-[10px] text-[var(--purple)] bg-[var(--purple2)] px-2 py-0.5 rounded-[3px]">
                          {signal.execution_symbol}
                        </span>
                      )}
                      <input type="number" placeholder={signal.execution_type === "leverage" ? "Instrument-pris" : "Entry price"}
                        value={entryPrice} onChange={(e) => { setEntryPrice(e.target.value); setRiskBlock(null); }}
                        className="w-32 bg-[var(--surface)] border border-[var(--border2)] rounded-[var(--r-sm)] px-2 py-1 text-[11px] font-['DM_Mono',monospace] text-[var(--ink)] focus:border-[var(--green2)] outline-none"
                        step="0.01" autoFocus />
                      <input type="number" placeholder="Antal" value={quantity} onChange={(e) => { setQuantity(e.target.value); setRiskBlock(null); }}
                        className="w-24 bg-[var(--surface)] border border-[var(--border2)] rounded-[var(--r-sm)] px-2 py-1 text-[11px] font-['DM_Mono',monospace] text-[var(--ink)] outline-none" />
                      <button onClick={() => handleTakeSignal(signal)} disabled={validating}
                        className="bg-[var(--green)] text-white font-['DM_Mono',monospace] text-[11px] px-3 py-1 rounded-[var(--r-sm)] hover:bg-[var(--green2)] transition-colors cursor-pointer border-0 disabled:opacity-60">
                        {validating ? "Kontrollerar..." : "Bekräfta"}
                      </button>
                      <button onClick={() => { setTakingSignal(null); setEntryPrice(""); setQuantity(""); setRiskBlock(null); }}
                        className="text-[var(--ink3)] font-['DM_Mono',monospace] text-[11px] px-3 py-1 rounded-[var(--r-sm)] hover:bg-[var(--cream2)] transition-colors cursor-pointer border border-[var(--border)] bg-transparent">Avbryt</button>
                    </div>
                    {/* Risk blocking message */}
                    {riskBlock && riskBlock.length > 0 && (
                      <div className="px-[22px] py-[10px] bg-[var(--red2)] border-t border-[#dcc4c4]">
                        <p className="font-['DM_Mono',monospace] text-[9px] text-[var(--red)] uppercase tracking-[1px] mb-[6px]">
                          Trade blockerad — portföljriskgränser överskrids
                        </p>
                        {riskBlock.map((reason, i) => (
                          <p key={i} className="font-['DM_Mono',monospace] text-[10.5px] text-[var(--red)] leading-[1.6]">
                            · {reason}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Create Signal Form ─────────────────────────────────────────────────────

function CreateSignalForm({ strategies, onCreated, onCancel }: {
  strategies: Strategy[];
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [ticker, setTicker] = useState("");
  const [strategyId, setStrategyId] = useState(strategies[0]?.id || "");
  const [direction, setDirection] = useState<"long" | "short">("long");
  const [market, setMarket] = useState("US");
  const [entryPrice, setEntryPrice] = useState("");
  const [stopLoss, setStopLoss] = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const [score, setScore] = useState("");
  const [note, setNote] = useState("");
  const [isLeverage, setIsLeverage] = useState(false);
  const [execSymbol, setExecSymbol] = useState("");
  const [execPrice, setExecPrice] = useState("");
  const [targetLeverage, setTargetLeverage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const inputCls = "w-full bg-[var(--surface)] border border-[var(--border2)] rounded-[var(--r-sm)] px-[9px] py-[6px] text-[11.5px] font-['DM_Mono',monospace] text-[var(--ink)] outline-none focus:border-[var(--green2)]";
  const labelCls = "block font-['DM_Mono',monospace] text-[8px] text-[var(--ink4)] uppercase tracking-[1px] mb-[4px]";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ticker || !strategyId || !entryPrice) { setFormError("Ticker, strategi och entry krävs"); return; }
    setSubmitting(true); setFormError("");
    try {
      await signalsApi.create({
        strategy_id: strategyId,
        ticker: ticker.toUpperCase(),
        direction,
        entry_price: parseFloat(entryPrice),
        stop_loss: stopLoss ? parseFloat(stopLoss) : undefined,
        take_profit: takeProfit ? parseFloat(takeProfit) : undefined,
        confidence: score ? parseFloat(score) / 100 : undefined,
        metadata: { market, note: note || undefined, manual: true },
        ...(isLeverage ? {
          execution_type: "leverage" as const,
          execution_symbol: execSymbol || undefined,
          instrument_price: execPrice ? parseFloat(execPrice) : undefined,
          target_leverage: targetLeverage ? parseFloat(targetLeverage) : undefined,
        } : {}),
      });
      onCreated();
    } catch (err: any) { setFormError(err.message); }
    finally { setSubmitting(false); }
  }

  return (
    <Card>
      <div className="px-[22px] py-[14px] border-b border-[var(--border)]">
        <h2 className="font-['Fraunces'] font-semibold text-[14px] text-[var(--ink)]">Ny signal</h2>
      </div>
      <form onSubmit={handleSubmit} className="px-[22px] py-[16px] space-y-4">
        {formError && (
          <div className="bg-[var(--red2)] border border-[#dcc4c4] rounded-[var(--r-sm)] px-3 py-2">
            <p className="text-[var(--red)] text-[10px] font-['DM_Mono',monospace]">{formError}</p>
          </div>
        )}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className={labelCls}>Ticker *</label>
            <input type="text" value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} placeholder="AAPL" className={inputCls} required />
          </div>
          <div>
            <label className={labelCls}>Strategi *</label>
            <select value={strategyId} onChange={(e) => setStrategyId(e.target.value)} className={inputCls} required>
              <option value="">Välj...</option>
              {strategies.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Riktning</label>
            <div className="flex gap-1">
              <button type="button" onClick={() => setDirection("long")}
                className={`flex-1 py-[6px] rounded-[var(--r-sm)] text-[11px] font-['DM_Mono',monospace] font-medium border-0 cursor-pointer transition-colors ${direction === "long" ? "bg-[var(--green)] text-white" : "bg-[var(--cream2)] text-[var(--ink3)]"}`}>LONG</button>
              <button type="button" onClick={() => setDirection("short")}
                className={`flex-1 py-[6px] rounded-[var(--r-sm)] text-[11px] font-['DM_Mono',monospace] font-medium border-0 cursor-pointer transition-colors ${direction === "short" ? "bg-[var(--red)] text-white" : "bg-[var(--cream2)] text-[var(--ink3)]"}`}>SHORT</button>
            </div>
          </div>
          <div>
            <label className={labelCls}>Marknad</label>
            <select value={market} onChange={(e) => setMarket(e.target.value)} className={inputCls}>
              <option value="US">US</option>
              <option value="SE">SE</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className={labelCls}>Entry *</label>
            <input type="number" value={entryPrice} onChange={(e) => setEntryPrice(e.target.value)} placeholder="150.00" step="0.01" className={inputCls} required />
          </div>
          <div>
            <label className={labelCls}>Stop Loss</label>
            <input type="number" value={stopLoss} onChange={(e) => setStopLoss(e.target.value)} placeholder="145.00" step="0.01" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Take Profit</label>
            <input type="number" value={takeProfit} onChange={(e) => setTakeProfit(e.target.value)} placeholder="160.00" step="0.01" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Score (0-100)</label>
            <input type="number" value={score} onChange={(e) => setScore(e.target.value)} placeholder="75" min="0" max="100" className={inputCls} />
          </div>
        </div>
        <div>
          <label className={labelCls}>Anteckning (valfritt)</label>
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Fritext..." className={inputCls} />
        </div>

        {/* Leverage toggle */}
        <div className="flex items-center gap-2">
          <input type="checkbox" id="isLev" checked={isLeverage} onChange={(e) => setIsLeverage(e.target.checked)} className="cursor-pointer" />
          <label htmlFor="isLev" className="font-['DM_Mono',monospace] text-[10px] text-[var(--ink3)] cursor-pointer">Hävstångsprodukt</label>
        </div>
        {isLeverage && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 bg-[var(--purple2)] p-3 rounded-[var(--r-sm)]">
            <div>
              <label className={labelCls}>Instrument (symbol)</label>
              <input type="text" value={execSymbol} onChange={(e) => setExecSymbol(e.target.value)} placeholder="BULL AAPL X3 AVA" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Instrument-pris</label>
              <input type="number" value={execPrice} onChange={(e) => setExecPrice(e.target.value)} placeholder="25.50" step="0.01" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Hävstång (x)</label>
              <input type="number" value={targetLeverage} onChange={(e) => setTargetLeverage(e.target.value)} placeholder="3" className={inputCls} />
            </div>
          </div>
        )}

        {/* R:R preview */}
        {entryPrice && stopLoss && (
          <div className="flex gap-4 font-['DM_Mono',monospace] text-[10px]">
            <span className="text-[var(--red)]">Risk: {Math.abs(((parseFloat(entryPrice) - parseFloat(stopLoss)) / parseFloat(entryPrice)) * 100).toFixed(1)}%</span>
            {takeProfit && (
              <span className="text-[var(--green)]">R:R 1:{(Math.abs(parseFloat(takeProfit) - parseFloat(entryPrice)) / Math.abs(parseFloat(entryPrice) - parseFloat(stopLoss))).toFixed(1)}</span>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <button type="submit" disabled={submitting}
            className="bg-[var(--green)] text-white font-['DM_Mono',monospace] text-[11px] font-medium px-4 py-[7px] rounded-[var(--r-sm)] hover:bg-[var(--green2)] transition-colors border-0 cursor-pointer disabled:opacity-50">
            {submitting ? "Sparar..." : "Skapa signal"}
          </button>
          <button type="button" onClick={onCancel}
            className="text-[var(--ink3)] font-['DM_Mono',monospace] text-[11px] px-4 py-[7px] rounded-[var(--r-sm)] hover:bg-[var(--cream2)] transition-colors cursor-pointer border border-[var(--border)] bg-transparent">
            Avbryt
          </button>
        </div>
      </form>
    </Card>
  );
}
