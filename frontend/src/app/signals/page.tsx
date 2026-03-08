"use client";

import AppShell from "@/components/layout/AppShell";
import { useEffect, useState } from "react";
import { signalsApi, positionsApi, strategiesApi } from "@/lib/api";
import type { Signal, Strategy, CreatePositionFromSignal } from "@/types";

export default function SignalsPage() {
  return (
    <AppShell>
      <SignalsContent />
    </AppShell>
  );
}

function SignalsContent() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [takingSignal, setTakingSignal] = useState<string | null>(null);
  const [entryPrice, setEntryPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [generating, setGenerating] = useState(false);
  const [success, setSuccess] = useState("");

  useEffect(() => {
    strategiesApi.list().then(setStrategies).catch(console.error);
  }, []);

  useEffect(() => {
    loadSignals();
  }, [filter]);

  async function loadSignals() {
    try {
      setLoading(true);
      const params = filter !== "all" ? { status: filter } : undefined;
      const data = await signalsApi.list(params);
      setSignals(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleTakeSignal(signal: Signal) {
    if (!entryPrice) return;

    try {
      const data: CreatePositionFromSignal = {
        signal_id: signal.id,
        entry_price: parseFloat(entryPrice),
        quantity: quantity ? parseFloat(quantity) : undefined,
        stop_loss: signal.stop_loss || undefined,
        take_profit: signal.take_profit || undefined,
      };
      await positionsApi.fromSignal(data);
      setTakingSignal(null);
      setEntryPrice("");
      setQuantity("");
      loadSignals();
    } catch (err: any) {
      setError(err.message);
    }
  }

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

  async function handleSkipSignal(signalId: string) {
    try {
      await signalsApi.update(signalId, { status: "skipped" });
      loadSignals();
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">📡 Signals</h1>
        <div className="flex items-center gap-3">
          <div className="flex gap-2">
            {["all", "pending", "taken", "skipped", "expired"].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  filter === f
                    ? "bg-blue-600 text-white"
                    : "bg-gray-700 text-gray-400 hover:text-white"
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          <button
            onClick={() => handleGenerateTestSignals(3)}
            disabled={generating}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-600 hover:bg-amber-700 text-white transition-colors disabled:opacity-50"
          >
            {generating ? "⏳..." : "🤖 Generate 3"}
          </button>
          <button
            onClick={() => handleGenerateTestSignals(8)}
            disabled={generating}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-600 hover:bg-amber-700 text-white transition-colors disabled:opacity-50"
          >
            🤖 Generate 8
          </button>
        </div>
      </div>

      {success && (
        <div className="card border-green-500/30 bg-green-500/5">
          <p className="text-green-400 text-sm">{success}</p>
        </div>
      )}

      {error && (
        <div className="card border-red-500/50">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="text-gray-400">Loading signals...</div>
      ) : signals.length === 0 ? (
        <div className="card">
          <p className="text-gray-400">No signals found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {signals.map((signal) => (
            <div key={signal.id} className="card">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div>
                    <span className="text-lg font-bold text-white">
                      {signal.ticker}
                    </span>
                    <span
                      className={`ml-2 badge ${
                        signal.direction === "long"
                          ? "bg-green-500/20 text-green-400"
                          : "bg-red-500/20 text-red-400"
                      }`}
                    >
                      {signal.direction.toUpperCase()}
                    </span>
                  </div>
                  <StatusBadge status={signal.status} />
                  {typeof signal.metadata === "object" &&
                   signal.metadata !== null &&
                   "setup_type" in signal.metadata && (
                    <span className="badge bg-purple-500/20 text-purple-400">
                      {String((signal.metadata as Record<string, unknown>).setup_type)}
                    </span>
                  )}
                  {typeof signal.metadata === "object" &&
                   signal.metadata !== null &&
                   "market" in signal.metadata && (
                    <span className="badge bg-indigo-500/20 text-indigo-400">
                      {String((signal.metadata as Record<string, unknown>).market)}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-4 text-sm">
                  <div className="text-right">
                    <p className="text-gray-400">Entry</p>
                    <p className="text-white">
                      {signal.entry_price?.toFixed(2) || "-"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-gray-400">SL</p>
                    <p className="text-red-400">
                      {signal.stop_loss?.toFixed(2) || "-"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-gray-400">TP</p>
                    <p className="text-green-400">
                      {signal.take_profit?.toFixed(2) || "-"}
                    </p>
                  </div>
                  {signal.confidence != null && (
                    <div className="text-right">
                      <p className="text-gray-400">Score</p>
                      <p className="text-white">
                        {(signal.confidence * 100).toFixed(0)}%
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-700/50">
                <div className="text-xs text-gray-400">
                  {signal.strategies?.name || signal.strategy?.name || "Unknown strategy"} •{" "}
                  {new Date(signal.signal_time).toLocaleString()}
                </div>

                {signal.status === "pending" && (
                  <div className="flex gap-2">
                    {takingSignal === signal.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          placeholder="Entry price"
                          value={entryPrice}
                          onChange={(e) => setEntryPrice(e.target.value)}
                          className="w-28 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white"
                          step="0.01"
                        />
                        <input
                          type="number"
                          placeholder="Qty (opt)"
                          value={quantity}
                          onChange={(e) => setQuantity(e.target.value)}
                          className="w-24 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white"
                        />
                        <button
                          onClick={() => handleTakeSignal(signal)}
                          className="btn-success text-xs py-1 px-3"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => setTakingSignal(null)}
                          className="btn-secondary text-xs py-1 px-3"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            setTakingSignal(signal.id);
                            setEntryPrice(
                              signal.entry_price?.toString() || ""
                            );
                          }}
                          className="btn-success text-xs py-1 px-3"
                        >
                          Take Trade
                        </button>
                        <button
                          onClick={() => handleSkipSignal(signal.id)}
                          className="btn-secondary text-xs py-1 px-3"
                        >
                          Skip
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Create Signal Form ─────────────────────────────────────────────────────

function CreateSignalForm({
  onCreated,
  onCancel,
}: {
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Form fields
  const [ticker, setTicker] = useState("");
  const [strategyId, setStrategyId] = useState("");
  const [direction, setDirection] = useState<"long" | "short">("long");
  const [market, setMarket] = useState("US");
  const [signalDate, setSignalDate] = useState(
    new Date().toISOString().slice(0, 16) // YYYY-MM-DDTHH:mm
  );
  const [entryPrice, setEntryPrice] = useState("");
  const [stopLoss, setStopLoss] = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const [score, setScore] = useState("");
  const [setupType, setSetupType] = useState("");

  useEffect(() => {
    loadStrategies();
  }, []);

  async function loadStrategies() {
    try {
      const data = await strategiesApi.list();
      setStrategies(data);
      if (data.length > 0) {
        setStrategyId(data[0].id);
      }
    } catch (err: any) {
      setError("Could not load strategies: " + err.message);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ticker || !strategyId || !entryPrice) {
      setError("Ticker, Strategy and Entry price are required");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const signalData: any = {
        strategy_id: strategyId,
        ticker: ticker.toUpperCase(),
        direction,
        entry_price: parseFloat(entryPrice),
        stop_loss: stopLoss ? parseFloat(stopLoss) : null,
        take_profit: takeProfit ? parseFloat(takeProfit) : null,
        confidence: score ? parseFloat(score) / 100 : null,
        signal_time: new Date(signalDate).toISOString(),
        status: "pending",
        metadata: {
          market,
          setup_type: setupType || null,
        },
      };

      await signalsApi.create(signalData);
      onCreated();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500";
  const labelClass = "block text-xs text-gray-400 mb-1";

  return (
    <div className="card border-blue-500/30">
      <h2 className="text-lg font-semibold text-white mb-4">
        ✨ Create New Signal
      </h2>

      {error && (
        <div className="mb-4 p-2 bg-red-500/10 border border-red-500/30 rounded-lg">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          {/* Ticker */}
          <div>
            <label className={labelClass}>Ticker *</label>
            <input
              type="text"
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              placeholder="AAPL"
              className={inputClass}
              required
            />
          </div>

          {/* Strategy */}
          <div>
            <label className={labelClass}>Strategy *</label>
            <select
              value={strategyId}
              onChange={(e) => setStrategyId(e.target.value)}
              className={inputClass}
              required
            >
              <option value="">Select...</option>
              {strategies.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Direction */}
          <div>
            <label className={labelClass}>Direction</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDirection("long")}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                  direction === "long"
                    ? "bg-green-600 text-white"
                    : "bg-gray-700 text-gray-400"
                }`}
              >
                LONG
              </button>
              <button
                type="button"
                onClick={() => setDirection("short")}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                  direction === "short"
                    ? "bg-red-600 text-white"
                    : "bg-gray-700 text-gray-400"
                }`}
              >
                SHORT
              </button>
            </div>
          </div>

          {/* Market */}
          <div>
            <label className={labelClass}>Market</label>
            <select
              value={market}
              onChange={(e) => setMarket(e.target.value)}
              className={inputClass}
            >
              <option value="US">US</option>
              <option value="SE">SE (Sweden)</option>
              <option value="COMMODITIES">Commodities</option>
              <option value="CRYPTO">Crypto</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          {/* Signal Date */}
          <div>
            <label className={labelClass}>Signal Date</label>
            <input
              type="datetime-local"
              value={signalDate}
              onChange={(e) => setSignalDate(e.target.value)}
              className={inputClass}
            />
          </div>

          {/* Entry Price */}
          <div>
            <label className={labelClass}>Entry Price *</label>
            <input
              type="number"
              value={entryPrice}
              onChange={(e) => setEntryPrice(e.target.value)}
              placeholder="150.00"
              step="0.01"
              className={inputClass}
              required
            />
          </div>

          {/* Stop Loss */}
          <div>
            <label className={labelClass}>Stop Loss</label>
            <input
              type="number"
              value={stopLoss}
              onChange={(e) => setStopLoss(e.target.value)}
              placeholder="145.00"
              step="0.01"
              className={inputClass}
            />
          </div>

          {/* Take Profit / Target */}
          <div>
            <label className={labelClass}>Target (TP)</label>
            <input
              type="number"
              value={takeProfit}
              onChange={(e) => setTakeProfit(e.target.value)}
              placeholder="160.00"
              step="0.01"
              className={inputClass}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {/* Score */}
          <div>
            <label className={labelClass}>Score (0-100)</label>
            <input
              type="number"
              value={score}
              onChange={(e) => setScore(e.target.value)}
              placeholder="75"
              min="0"
              max="100"
              className={inputClass}
            />
          </div>

          {/* Setup Type */}
          <div>
            <label className={labelClass}>Setup Type</label>
            <select
              value={setupType}
              onChange={(e) => setSetupType(e.target.value)}
              className={inputClass}
            >
              <option value="">Select...</option>
              <option value="zone_bounce">Zone Bounce</option>
              <option value="zone_breakout">Zone Breakout</option>
              <option value="trend_follow">Trend Follow</option>
              <option value="reversal">Reversal</option>
              <option value="momentum">Momentum</option>
              <option value="mean_reversion">Mean Reversion</option>
              <option value="other">Other</option>
            </select>
          </div>

          {/* Risk/Reward preview */}
          {entryPrice && stopLoss && (
            <div>
              <label className={labelClass}>Risk</label>
              <p className="text-red-400 text-sm font-medium py-2">
                {Math.abs(
                  ((parseFloat(entryPrice) - parseFloat(stopLoss)) /
                    parseFloat(entryPrice)) *
                    100
                ).toFixed(1)}
                %
              </p>
            </div>
          )}
          {entryPrice && stopLoss && takeProfit && (
            <div>
              <label className={labelClass}>R:R Ratio</label>
              <p className="text-green-400 text-sm font-medium py-2">
                1:
                {(
                  Math.abs(parseFloat(takeProfit) - parseFloat(entryPrice)) /
                  Math.abs(parseFloat(entryPrice) - parseFloat(stopLoss))
                ).toFixed(1)}
              </p>
            </div>
          )}
        </div>

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={loading}
            className="btn-primary disabled:opacity-50"
          >
            {loading ? "Creating..." : "💾 Create Signal"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="btn-secondary"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Status Badge ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "badge-pending",
    taken: "badge-taken",
    skipped: "bg-gray-500/20 text-gray-400",
    expired: "bg-gray-500/20 text-gray-500",
  };

  return (
    <span className={`badge ${styles[status] || ""}`}>
      {status.toUpperCase()}
    </span>
  );
}
