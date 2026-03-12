"use client";

import AppShell from "@/components/layout/AppShell";
import { useEffect, useState, useCallback } from "react";
import { signalsApi, positionsApi, strategiesApi } from "@/lib/api";
import { SignalRow } from "@/components/signals/SignalRow";
import { Card } from "@/components/ui/Card";
import type { Signal, Strategy, CreatePositionFromSignal } from "@/types";

type TabFilter = "all" | "pending" | "taken" | "skipped" | "expired";

export default function SignalsPage() {
  return (
    <AppShell>
      <SignalsContent />
    </AppShell>
  );
}

function SignalsContent() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [tab, setTab] = useState<TabFilter>("all");
  const [tickerSearch, setTickerSearch] = useState("");
  const [strategyFilter, setStrategyFilter] = useState("");
  const [marketFilter, setMarketFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [generating, setGenerating] = useState(false);

  // Take trade modal state
  const [takingSignal, setTakingSignal] = useState<Signal | null>(null);
  const [entryPrice, setEntryPrice] = useState("");
  const [quantity, setQuantity] = useState("");

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

  const filteredSignals = signals
    .filter((s) => {
      if (tab === "all") return true;
      return s.status === tab;
    })
    .filter((s) =>
      tickerSearch ? s.ticker.toLowerCase().includes(tickerSearch.toLowerCase()) : true
    )
    .filter((s) => {
      if (!strategyFilter) return true;
      const stratName = s.strategies?.name || s.strategy?.name || "";
      return stratName === strategyFilter;
    })
    .filter((s) => {
      if (!marketFilter) return true;
      const market =
        typeof s.metadata === "object" && s.metadata !== null && "market" in s.metadata
          ? String(s.metadata.market).toLowerCase()
          : "";
      return market === marketFilter.toLowerCase();
    });

  // Optimistic Take Trade
  async function handleTakeSignal(signal: Signal) {
    if (takingSignal?.id === signal.id) {
      if (!entryPrice) return;
      try {
        const data: CreatePositionFromSignal = {
          signal_id: signal.id,
          entry_price: parseFloat(entryPrice),
          quantity: quantity ? parseFloat(quantity) : undefined,
          stop_loss: signal.stop_loss || undefined,
          take_profit: signal.take_profit || undefined,
        };
        setSignals((prev) =>
          prev.map((s) => (s.id === signal.id ? { ...s, status: "taken" as const } : s))
        );
        setTakingSignal(null);
        setEntryPrice("");
        setQuantity("");
        await positionsApi.fromSignal(data);
      } catch (err: any) {
        setSignals((prev) =>
          prev.map((s) => (s.id === signal.id ? { ...s, status: "pending" as const } : s))
        );
        setError(err.message);
      }
    } else {
      setTakingSignal(signal);
      setEntryPrice(signal.entry_price?.toString() || "");
    }
  }

  // Optimistic Skip
  async function handleSkipSignal(signalId: string) {
    setSignals((prev) =>
      prev.map((s) => (s.id === signalId ? { ...s, status: "skipped" as const } : s))
    );
    try {
      await signalsApi.update(signalId, { status: "skipped" });
    } catch (err: any) {
      setSignals((prev) =>
        prev.map((s) => (s.id === signalId ? { ...s, status: "pending" as const } : s))
      );
      setError(err.message);
    }
  }

  // Generate test signals
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

  const tabs: { key: TabFilter; label: string }[] = [
    { key: "all", label: "Alla" },
    { key: "pending", label: "Pending" },
    { key: "taken", label: "Tagna" },
    { key: "skipped", label: "Skippade" },
    { key: "expired", label: "Utgångna" },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-['Fraunces'] text-[22px] font-semibold text-[var(--ink)]">
          Signaler
        </h1>
        <div className="flex items-center gap-2">
          {/* Tabs */}
          <div className="flex bg-[var(--cream2)] border border-[var(--border)] rounded-[var(--r-sm)] p-[3px] gap-[2px]">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-[12px] py-[5px] text-[11px] font-['DM_Mono',monospace] rounded-[4px] border-0 cursor-pointer transition-all ${
                  tab === t.key
                    ? "bg-[var(--surface)] text-[var(--ink)] shadow-[var(--shadow)]"
                    : "bg-transparent text-[var(--ink3)]"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => handleGenerate(3)}
            disabled={generating}
            className="bg-[var(--green)] text-white font-['DM_Mono',monospace] text-[11px] font-medium px-[12px] py-[7px] rounded-[var(--r-sm)] hover:bg-[var(--green2)] transition-colors border-0 cursor-pointer disabled:opacity-50"
          >
            Generera 3
          </button>
          <button
            onClick={() => handleGenerate(8)}
            disabled={generating}
            className="bg-[var(--green)] text-white font-['DM_Mono',monospace] text-[11px] font-medium px-[12px] py-[7px] rounded-[var(--r-sm)] hover:bg-[var(--green2)] transition-colors border-0 cursor-pointer disabled:opacity-50"
          >
            Generera 8
          </button>
        </div>
      </div>

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
          <span className="font-['DM_Mono',monospace] text-[8.5px] text-[var(--ink4)] uppercase tracking-[1.1px]">
            Filter
          </span>
          <input
            type="text"
            placeholder="Ticker…"
            value={tickerSearch}
            onChange={(e) => setTickerSearch(e.target.value)}
            className="px-[9px] py-[5px] border border-[var(--border2)] rounded-[var(--r-sm)] text-[11.5px] font-['DM_Mono',monospace] bg-[var(--surface)] text-[var(--ink)] outline-none min-w-[126px] focus:border-[var(--green2)]"
          />
          <select
            value={strategyFilter}
            onChange={(e) => setStrategyFilter(e.target.value)}
            className="px-[9px] py-[5px] border border-[var(--border2)] rounded-[var(--r-sm)] text-[11.5px] font-['DM_Mono',monospace] bg-[var(--surface)] text-[var(--ink)] outline-none cursor-pointer"
          >
            <option value="">Alla strategier</option>
            {strategies.map((s) => (
              <option key={s.id} value={s.name}>{s.name}</option>
            ))}
          </select>
          <select
            value={marketFilter}
            onChange={(e) => setMarketFilter(e.target.value)}
            className="px-[9px] py-[5px] border border-[var(--border2)] rounded-[var(--r-sm)] text-[11.5px] font-['DM_Mono',monospace] bg-[var(--surface)] text-[var(--ink)] outline-none cursor-pointer"
          >
            <option value="">Alla marknader</option>
            <option value="SE">SE</option>
            <option value="US">US</option>
          </select>
          {(tickerSearch || strategyFilter || marketFilter) && (
            <button
              onClick={() => { setTickerSearch(""); setStrategyFilter(""); setMarketFilter(""); }}
              className="text-[10px] text-[var(--ink4)] font-['DM_Mono',monospace] underline bg-transparent border-0 cursor-pointer hover:text-[var(--ink2)]"
            >
              Rensa
            </button>
          )}
        </div>

        {/* Rows */}
        {loading ? (
          <div className="py-[52px] text-center font-['DM_Mono',monospace] text-[10.5px] text-[var(--ink4)]">
            Laddar signaler...
          </div>
        ) : filteredSignals.length === 0 ? (
          <div className="py-[52px] text-center font-['DM_Mono',monospace] text-[10.5px] text-[var(--ink4)]">
            Inga signaler hittades
          </div>
        ) : (
          <div>
            {filteredSignals.map((signal) => (
              <div key={signal.id}>
                <SignalRow
                  signal={signal}
                  onTake={handleTakeSignal}
                  onSkip={handleSkipSignal}
                />
                {/* Inline take form */}
                {takingSignal?.id === signal.id && (
                  <div className="flex items-center gap-[8px] px-[22px] py-[10px] bg-[var(--green4)] border-b border-[var(--border)] flex-wrap">
                    <span className="font-['DM_Mono',monospace] text-[9px] text-[var(--green)] uppercase tracking-[1px]">
                      Ta trade:
                    </span>
                    <input
                      type="number"
                      placeholder="Entry price"
                      value={entryPrice}
                      onChange={(e) => setEntryPrice(e.target.value)}
                      className="w-28 bg-[var(--surface)] border border-[var(--border2)] rounded-[var(--r-sm)] px-2 py-1 text-[11px] font-['DM_Mono',monospace] text-[var(--ink)] focus:border-[var(--green2)] outline-none"
                      step="0.01"
                      autoFocus
                    />
                    <input
                      type="number"
                      placeholder="Antal (valfritt)"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      className="w-28 bg-[var(--surface)] border border-[var(--border2)] rounded-[var(--r-sm)] px-2 py-1 text-[11px] font-['DM_Mono',monospace] text-[var(--ink)] outline-none"
                    />
                    <button
                      onClick={() => handleTakeSignal(signal)}
                      className="bg-[var(--green)] text-white font-['DM_Mono',monospace] text-[11px] px-3 py-1 rounded-[var(--r-sm)] hover:bg-[var(--green2)] transition-colors cursor-pointer border-0"
                    >
                      Bekräfta
                    </button>
                    <button
                      onClick={() => { setTakingSignal(null); setEntryPrice(""); setQuantity(""); }}
                      className="text-[var(--ink3)] font-['DM_Mono',monospace] text-[11px] px-3 py-1 rounded-[var(--r-sm)] hover:bg-[var(--cream2)] transition-colors cursor-pointer border border-[var(--border)] bg-transparent"
                    >
                      Avbryt
                    </button>
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
