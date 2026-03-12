export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`bg-[var(--surface)] border border-[var(--border)] rounded-[var(--r)] shadow-[var(--shadow)] overflow-hidden ${className}`}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center gap-[9px] px-[22px] py-[16px] border-b border-[var(--border)] ${className}`}
    >
      {children}
    </div>
  );
}

export function CardTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-['Fraunces'] font-semibold text-[14px] tracking-[-0.1px] flex-1 text-[var(--ink)]">
      {children}
    </h2>
  );
}
