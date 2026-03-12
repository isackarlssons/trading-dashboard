"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const navItems = [
  { href: "/", label: "Översikt", icon: "◆" },
  { href: "/signals", label: "Signaler", icon: "✎" },
  { href: "/positions", label: "Positioner", icon: "□" },
  { href: "/trades", label: "Trades", icon: "≡" },
];

export default function Sidebar({
  pendingSignalCount,
}: {
  pendingSignalCount?: number;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Mobile header bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-[var(--ink)] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[var(--green2)]" />
          <h1 className="font-['Fraunces'] text-sm font-bold text-white italic">
            Trading
          </h1>
        </div>
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="text-[var(--ink4)] hover:text-white transition-colors p-1"
        >
          {mobileOpen ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/30"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed lg:static z-40 top-0 left-0 h-full
          w-[200px] bg-[var(--ink)] p-5 flex flex-col
          transition-transform duration-200 ease-in-out
          ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
          lg:min-h-screen
        `}
      >
        <div className="mb-8 mt-2 lg:mt-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-[var(--green2)]" />
            <h1 className="font-['Fraunces'] text-lg font-bold text-white italic">
              Trading
            </h1>
          </div>
          <p className="text-[9px] font-['DM_Mono',monospace] text-[var(--ink4)] uppercase tracking-[1.5px] ml-4">
            Dashboard v1.0
          </p>
        </div>

        <p className="text-[8px] font-['DM_Mono',monospace] text-[var(--ink4)] uppercase tracking-[1.5px] mb-3">
          Navigering
        </p>

        <nav className="flex-1 space-y-0.5">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center justify-between px-3 py-2 rounded-[var(--r-sm)] text-[13px] font-medium transition-colors ${
                  isActive
                    ? "bg-[var(--green)] text-white"
                    : "text-[var(--ink4)] hover:text-white hover:bg-white/5"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-[11px] opacity-70">{item.icon}</span>
                  <span>{item.label}</span>
                </div>
                {item.href === "/signals" &&
                  pendingSignalCount != null &&
                  pendingSignalCount > 0 && (
                    <span className="bg-[var(--green2)] text-white text-[9px] font-['DM_Mono',monospace] w-5 h-5 rounded-full flex items-center justify-center">
                      {pendingSignalCount}
                    </span>
                  )}
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
