"use client";

import AppShell from "@/components/layout/AppShell";
import { useEffect, useState, useCallback } from "react";
import { signalsApi, positionsApi, strategiesApi } from "@/lib/api";
import { SignalRow } from "@/components/signals/SignalRow";
import { Card } from "@/components/ui/Card";
import type { Signal, Strategy, CreatePositionFromSignal } from "@/types";

type TabFilter = "active" | "skipped" | "expired" | "all";

export default function SignalsPage() {
  return (
    <AppShell>
      <SignalsContent />
    </AppShell>
  );
}

function SignalsContent() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [tab, setTab] = useState<TabFilter>("active");
  const [tickerSearch, setTickerSearch] = useState("");
  const [strategyFilter, setStrategyFilter] = useState("");
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

  // ─── Filtered signals by tab ──────────────────────────────────────────────

  const filteredSignals = signals
    .filter((s) => {
      if (tab === "active") return s.status === "pending" || s.status === "taken";
      if (tab === "skipped") return s.status === "skipped";
      if (tab === "expired") return s.status === "expired";
      return true; // "all"
    })
    .filter((s) =>
      tickerSearch
        ? s.ticker.toLowerCase().includes(tickerSearch.toLowerCase())
        : true
    )
    .filter((s) => {
      if (!strategyFilter) return true;
      const stratName = s.strategies?.name || s.strategy?.name || "";
      return stratName === strategyFilter;
    });

  const pendingCount = signals.filter((s) => s.status === "pending").length;
  const takenCount = signals.filter((s) => s.status === "taken").length;
  const skippedCount = signals.filter((s) => s.status === "skipped").length;
  const expiredCount = signals.filter((s) => s.status === "expired").length;

  // ─── Optimistic Take Trade ────────────────────────────────────────────────

  async function handleTakeSignal(signal: Signal) {
    if (takingSignal?.id === signal.id) {
      // Confirm take
      if (!entryPrice) return;
      try {
        const data: CreatePositionFromSignal = {
          signal_id: signal.id,
          entry_price: parseFloat(entryPrice),
          quantity: quantity ? parseFloat(quantity) : undefined,
          stop_loss: signal.stop_loss || undefined,
          take_profit: signal.take_profit || undefined,
        };

        // Optimistic update
        setSignals((prev) =>
          prev.map((s) =>
            s.id === signal.id ? { ...s, status: "taken" as const } : s
          )
        );
        setTakingSignal(null);
        setEntryPrice("");
        setQuantity("");

        await positionsApi.fromSignal(data);
      } catch (err: any) {
        // Revert on error
        setSignals((prev) =>
          prev.map((s) =>
            s.id === signal.id ? { ...s, status: "pending" as const } : s
          )
        );
        setError(err.message);
      }
    } else {
      // Open take form
      setTakingSignal(signal);
      setEntryPrice(signal.entry_price?.toString() || "");
    }
  }

  // ─── Optimistic Skip ─────────────────────────────────────────────────────

  async function handleSkipSignal(signalId: string) {
    // Optimistic update
    setSignals((prev) =>
      prev.map((s) =>
        s.id === signalId ? { ...s, status: "skipped" as const } : s
      )
    );

    try {
      await signalsApi.update(signalId, { status: "skipped" });
    } catch (err: any) {
      // Revert
      setSignals((prev) =>
        prev.map((s) =>
          s.id === signalId ? { ...s, status: "pending" as const } : s
        )
      );
      setError(err.message);
    }
  }

  // ─── Generate test signals ────────────────────────────────────────────────

  async function handleGenerateTestSignals(count: number) {
    if (strategies.length === 0) {
      setError("No strategies loaded yet");
      return;
    }
    setGenerating(true);
    setError("");
    setSuccess("");

    const tickers: Record<string, { t: string; p: number }[]> = {
      US: [
        { t: "AAPL", p: 195 }, { t: "MSFT", p: 420 }, { t: "NVDA", p: 136 },
        { t: "AMZN", p: 186 }, { t: "TSLA", p: 249 }, { t: "META", p: 505 },
        { t: "GOOGL", p: 175 }, { t: "AMD", p: 162 }, { t: "NFLX", p: 686 },
        { t: "CRM", p: 273 }, { t: "COST", p: 912 }, { t: "AVGO", p: 179 },
      ],
      SE: [
        { t: "ABB.ST", p: 612 }, { t: "AZN.ST", p: 2145 },
        { t: "VOLV-B.ST", p: 285 }, { t: "ASSA-B.ST", p: 313 },
        { t: "BOL.ST", p: 345 }, { t: "ELUX-B.ST", p: 89 },
      ],
    };
    const setups = ["zone_bounce", "zone_breakout", "trend_follow", "reversal", "momentum"];

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
        const hoursAgo = Math.random() * 4;
        const sigTime = new Date(Date.now() - hoursAgo * 3600000).toISOString();

        // Randomly make some leverage signals
        const isLeverage = Math.random() > 0.7;

        await signalsApi.create({
          strategy_id: strat.id,
          ticker: stock.t,
          direction: dir as "long" | "short",
          entry_price: entry,
          stop_loss: sl,
          take_profit: tp,
          confidence: score,
          metadata: { market, setup_type: setup, generated: "test_bot", strategy_version: strat.version },
          expires_at: sigTime,
          ...(isLeverage
            ? {
                execution_type: "leverage",
                execution_symbol: `BULL ${stock.t.replace(".ST", "")} X3 AVA`,
                issuer: "Avanza",
                target_leverage: 3,
                instrument_currency: market === "SE" ? "SEK" : "USD",
                instrument_price: +(Math.random() * 50 + 5).toFixed(2),
              }
            : {}),
        });
      }
      setSuccess(`🤖 Bot generated ${count} test signals!`);
      loadSignals();
      setTimeout(() => setSuccess(""), 4000);
    } catch (err: any) {
      setError("Generate failed: " + err.message);
    } finally {
      setGenerating(false);
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  const tabs: { key: TabFilter; label: string; count: number }[] = [
    { key: "active", label: "Aktiva", count: pendingCount + takenCount },
    { key: "skipped", label: "Skippade", count: skippedCount },
    { key: "expired", label: "Utgångna", count: expiredCount },
    { key: "all", label: "Alla", count: signals.length },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-white">📡 Signaler</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleGenerateTestSignals(3)}
            disabled={generating}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-600 hover:bg-amber-700 text-white transition-colors disabled:opacity-50"
          >
            {generating ? "⏳..." : "🤖 +3"}
          </button>
          <button
            onClick={() => handleGenerateTestSignals(8)}
            disabled={generating}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-600 hover:bg-amber-700 text-white transition-colors disabled:opacity-50"
          >
            🤖 +8
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-gray-800/50 border border-gray-700 rounded-lg p-1 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 rounded-md text-xs font-mono whitespace-nowrap transition-all ${
              tab === t.key
                ? "bg-gray-700 text-white shadow-sm"
                : "text-gray-400 hover:text-gray-300"
            }`}
          >
            {t.label}
            <span className="ml-1.5 text-[10px] opacity-60">{t.count}</span>
          </button>
        ))}
      </div>

      {/* Feedback */}
      {success && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-lg px-4 py-2">
          <p className="text-green-400 text-sm">{success}</p>
        </div>
      )}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2 flex items-center justify-between">
          <p className="text-red-400 text-sm">{error}</p>
          <button
            onClick={() => setError("")}
            className="text-red-400 text-xs hover:text-red-300"
          >
            ✕
          </button>
        </div>
      )}

      {/* Filter bar */}
      <Card>
        <div className="flex items-center gap-3 px-4 py-2.5 bg-gray-900/30 flex-wrap">
          <span className="font-mono text-[9px] text-gray-500 uppercase tracking-widest">
            Filter
          </span>
          <input
            type="text"
            placeholder="Ticker…"
            value={tickerSearch}
            onChange={(e) => setTickerSearch(e.target.value)}
            className="px-2.5 py-1.5 border border-gray-600 rounded-md text-xs font-mono bg-gray-800 text-white outline-none min-w-[110px] focus:border-blue-500 transition-colors"
          />
          <select
            value={strategyFilter}
            onChange={(e) => setStrategyFilter(e.target.value)}
            className="px-2.5 py-1.5 border border-gray-600 rounded-md text-xs font-mono bg-gray-800 text-white outline-none cursor-pointer"
          >
            <option value="">Alla strategier</option>
            {strategies.map((s) => (
              <option key={s.id} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
          {(tickerSearch || strategyFilter) && (
            <button
              onClick={() => {
                setTickerSearch("");
                setStrategyFilter("");
              }}
              className="text-[10px] text-gray-500 font-mono underline hover:text-gray-300 transition-colors"
            >
              Rensa
            </button>
          )}
          <span className="ml-auto text-[10px] font-mono text-gray-600">
            {filteredSignals.length} signaler
          </span>
        </div>

        {/* Signal rows */}
        {loading ? (
          <div className="py-12 text-center text-gray-500 font-mono text-sm">
            Laddar signaler...
          </div>
        ) : filteredSignals.length === 0 ? (
          <div className="py-12 text-center font-mono text-xs text-gray-500">
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
                  <div className="flex items-center gap-2 px-4 py-2.5 bg-green-500/5 border-b border-gray-700/50 flex-wrap">
                    <span className="text-[10px] font-mono text-green-400 uppercase tracking-wider">
                      Ta trade:
                    </span>
                    <input
                      type="number"
                      placeholder="Entry price"
                      value={entryPrice}
                      onChange={(e) => setEntryPrice(e.target.value)}
                      className="w-28 bg-gray-800 border border-gray-600 rounded-md px-2 py-1 text-xs font-mono text-white focus:border-green-500 outline-none"
                      step="0.01"
                      autoFocus
                    />
                    <input
                      type="number"
                      placeholder="Antal (valfritt)"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      className="w-28 bg-gray-800 border border-gray-600 rounded-md px-2 py-1 text-xs font-mono text-white focus:border-green-500 outline-none"
                    />
                    <button
                      onClick={() => handleTakeSignal(signal)}
                      className="bg-green-600 hover:bg-green-700 text-white font-mono text-[11px] px-3 py-1 rounded-md transition-colors"
                    >
                      Bekräfta
                    </button>
                    <button
                      onClick={() => {
                        setTakingSignal(null);
                        setEntryPrice("");
                        setQuantity("");
                      }}
                      className="text-gray-400 font-mono text-[11px] px-3 py-1 rounded-md hover:bg-gray-700 transition-colors"
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
