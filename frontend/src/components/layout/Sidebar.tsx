"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "Dashboard", icon: "📊" },
  { href: "/signals", label: "Signals", icon: "📡" },
  { href: "/positions", label: "Positions", icon: "📈" },
  { href: "/trades", label: "Trades", icon: "📋" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-gray-900/80 border-r border-gray-700 min-h-screen p-4 flex flex-col">
      <div className="mb-8">
        <h1 className="text-xl font-bold text-white">⚡ Trading</h1>
        <p className="text-xs text-gray-400 mt-1">Dashboard v1.0</p>
      </div>

      <nav className="flex-1 space-y-1">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-blue-600/20 text-blue-400 border border-blue-500/30"
                  : "text-gray-400 hover:text-white hover:bg-gray-800"
              }`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto pt-4 border-t border-gray-700">
        <p className="text-xs text-gray-500">Single user mode</p>
      </div>
    </aside>
  );
}
