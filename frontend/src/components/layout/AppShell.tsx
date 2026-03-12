"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Sidebar from "@/components/layout/Sidebar";
import type { Session } from "@supabase/supabase-js";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--cream)]">
        <div className="text-[var(--ink4)] font-['DM_Mono',monospace] text-xs">Laddar...</div>
      </div>
    );
  }

  if (!session) {
    return <LoginPage />;
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-5 lg:p-8 overflow-auto pt-16 lg:pt-8">
        {children}
      </main>
    </div>
  );
}

function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--cream)] px-4">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--r)] shadow-[var(--shadow-md)] p-8 w-full max-w-sm">
        <div className="flex items-center gap-2 mb-6 justify-center">
          <span className="w-2.5 h-2.5 rounded-full bg-[var(--green2)]" />
          <h1 className="font-['Fraunces'] text-xl font-bold text-[var(--ink)] italic">
            Trading
          </h1>
        </div>
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-[9px] font-['DM_Mono',monospace] text-[var(--ink4)] uppercase tracking-[1px] mb-1.5">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-[var(--surface)] border border-[var(--border2)] rounded-[var(--r-sm)] px-3 py-2 text-[var(--ink)] text-sm font-['DM_Mono',monospace] focus:outline-none focus:border-[var(--green2)]"
              required
            />
          </div>
          <div>
            <label className="block text-[9px] font-['DM_Mono',monospace] text-[var(--ink4)] uppercase tracking-[1px] mb-1.5">
              Lösenord
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[var(--surface)] border border-[var(--border2)] rounded-[var(--r-sm)] px-3 py-2 text-[var(--ink)] text-sm font-['DM_Mono',monospace] focus:outline-none focus:border-[var(--green2)]"
              required
            />
          </div>
          {error && <p className="text-[var(--red)] text-xs">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[var(--green)] hover:bg-[var(--green2)] text-white font-['DM_Mono',monospace] text-[12px] font-medium py-2.5 px-4 rounded-[var(--r-sm)] transition-colors disabled:opacity-50"
          >
            {loading ? "Loggar in..." : "Logga in"}
          </button>
        </form>
      </div>
    </div>
  );
}
