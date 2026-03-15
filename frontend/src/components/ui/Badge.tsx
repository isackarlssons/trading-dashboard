const styles: Record<string, string> = {
  long: "bg-[var(--green3)] text-[var(--green)]",
  short: "bg-[var(--red2)] text-[var(--red)]",
  pending: "bg-[var(--amber2)] text-[var(--amber)]",
  taken: "bg-[var(--blue2)] text-[var(--blue)]",
  skipped: "bg-[var(--cream3)] text-[var(--ink3)]",
  expired: "bg-[var(--red2)] text-[var(--red)]",
  win: "bg-[var(--green3)] text-[var(--green)]",
  loss: "bg-[var(--red2)] text-[var(--red)]",
  breakeven: "bg-[var(--cream3)] text-[var(--ink3)]",
  open: "bg-[var(--blue2)] text-[var(--blue)]",
  closed: "bg-[var(--cream3)] text-[var(--ink3)]",
  se: "bg-[#E6EAF6] text-[#2A3F82]",
  us: "bg-[#F4E6E0] text-[#82271A]",
  leverage: "bg-[var(--purple2)] text-[var(--purple)]",
  stock: "bg-[var(--cream3)] text-[var(--ink3)]",
  raise_stop: "bg-[var(--amber2)] text-[var(--amber)]",
  move_stop_to_breakeven: "bg-[var(--blue2)] text-[var(--blue)]",
  take_partial: "bg-[#E0F0F4] text-[#1A5C6A]",
  reduce_position: "bg-[#F4E6E0] text-[#82271A]",
  close_full: "bg-[var(--red2)] text-[var(--red)]",
  hold: "bg-[var(--green3)] text-[var(--green)]",
  acknowledged: "bg-[var(--blue2)] text-[var(--blue)]",
  executed: "bg-[var(--green3)] text-[var(--green)]",
  dismissed: "bg-[var(--cream3)] text-[var(--ink4)]",
  expired: "bg-[var(--cream3)] text-[var(--ink4)]",
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
      className={`inline-flex items-center text-[9px] font-['DM_Mono',monospace] font-medium tracking-[0.7px] px-[7px] py-[3px] rounded-[3px] uppercase ${
        styles[variant] || "bg-[var(--cream3)] text-[var(--ink3)]"
      } ${className}`}
    >
      {children}
    </span>
  );
}
