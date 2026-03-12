type BadgeVariant =
  | "long"
  | "short"
  | "pending"
  | "taken"
  | "skipped"
  | "expired"
  | "win"
  | "loss"
  | "breakeven"
  | "open"
  | "closed"
  | "se"
  | "us"
  | "leverage"
  | "stock"
  | "raise_stop"
  | "move_stop_to_breakeven"
  | "take_partial"
  | "reduce_position"
  | "close_full"
  | "hold"
  | "acknowledged"
  | "executed";

const styles: Record<string, string> = {
  long: "bg-green-500/20 text-green-400",
  short: "bg-red-500/20 text-red-400",
  pending: "bg-amber-500/20 text-amber-400",
  taken: "bg-blue-500/20 text-blue-400",
  skipped: "bg-gray-500/20 text-gray-400",
  expired: "bg-gray-600/20 text-gray-500",
  win: "bg-green-500/20 text-green-400",
  loss: "bg-red-500/20 text-red-400",
  breakeven: "bg-gray-500/20 text-gray-400",
  open: "bg-cyan-500/20 text-cyan-400",
  closed: "bg-gray-500/20 text-gray-400",
  se: "bg-indigo-500/20 text-indigo-400",
  us: "bg-orange-500/20 text-orange-400",
  leverage: "bg-purple-500/20 text-purple-400",
  stock: "bg-gray-500/20 text-gray-400",
  raise_stop: "bg-amber-500/20 text-amber-400",
  move_stop_to_breakeven: "bg-blue-500/20 text-blue-400",
  take_partial: "bg-cyan-500/20 text-cyan-400",
  reduce_position: "bg-orange-500/20 text-orange-400",
  close_full: "bg-red-500/20 text-red-400",
  hold: "bg-green-500/20 text-green-400",
  acknowledged: "bg-blue-500/20 text-blue-400",
  executed: "bg-green-500/20 text-green-400",
};

export function Badge({
  variant,
  children,
  className = "",
}: {
  variant: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center text-[10px] font-mono font-medium tracking-wide px-2 py-0.5 rounded-md uppercase ${
        styles[variant] || "bg-gray-500/20 text-gray-400"
      } ${className}`}
    >
      {children}
    </span>
  );
}
