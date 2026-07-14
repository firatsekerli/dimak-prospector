"use client";

import { useState } from "react";

export default function Login() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        window.location.href = "/";
        return;
      }
      const d = await res.json().catch(() => ({}));
      setError(d.error || "Login failed.");
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="flex items-baseline gap-3.5 border-b-[3px] border-ember bg-ink px-[22px] py-3.5 text-white">
        <h1 className="text-[17px] font-bold uppercase tracking-[0.14em]">Dimak Prospector</h1>
        <span className="text-xs tracking-[0.03em] text-[#9aa3af]">Gulf fire door lead pipeline</span>
      </header>

      <main className="mx-auto flex w-full max-w-[420px] flex-col px-[22px] pt-16">
        <form onSubmit={submit} className="rounded-lg border border-line bg-panel px-[18px] py-5">
          <h2 className="mb-4 text-[11px] uppercase tracking-[0.16em] text-mute">Sign in</h2>

          <label htmlFor="password" className="mb-1 block text-[11px] tracking-[0.05em] text-steel">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-line bg-white px-2.5 py-2 text-sm outline-none focus:border-ember focus:outline-2 focus:outline-ember"
          />

          {error && <div className="mt-2 text-xs text-status-nofit">{error}</div>}

          <button
            type="submit"
            disabled={busy || !password}
            className="mt-4 w-full rounded-md bg-ember px-[18px] py-2.5 text-sm font-semibold text-white hover:bg-ember-dk disabled:cursor-default disabled:opacity-50"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-3 text-[11px] text-mute">
          This shared password protects the app and prevents strangers from triggering
          billed Google Places searches.
        </p>
      </main>
    </>
  );
}
