"use client";

import { useState } from "react";
import { Brand, SiteFooter } from "@/components/branding";

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
      <header className="flex items-center gap-3.5 border-b-[3px] border-ember bg-ink px-[22px] py-3.5 text-white">
        <Brand />
      </header>

      <main className="mx-auto flex w-full max-w-[420px] flex-col px-[22px] pt-16">
        <form onSubmit={submit} className="border border-line bg-panel px-[18px] py-5">
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
            className="control w-full"
          />

          {error && <div className="mt-2 text-xs text-status-nofit">{error}</div>}

          <button type="submit" disabled={busy || !password} className="btn btn-primary mt-4 w-full">
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-3 text-[11px] text-mute">
          This shared password protects the app and prevents strangers from triggering
          billed Google Places searches.
        </p>
      </main>

      <SiteFooter />
    </>
  );
}
