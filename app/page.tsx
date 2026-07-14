"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Config, ProspectRow, ProspectsResponse } from "@/lib/types";

const STATUS_TEXT: Record<string, string> = {
  New: "text-status-new",
  Contacted: "text-status-contacted",
  Replied: "text-status-replied",
  "Not a fit": "text-status-nofit",
};

export default function Console() {
  const [config, setConfig] = useState<Config | null>(null);
  const [segment, setSegment] = useState("");
  const [keyword, setKeyword] = useState("");
  const [enrich, setEnrich] = useState(false);
  const [activeCities, setActiveCities] = useState<Record<string, boolean>>({});

  const [searching, setSearching] = useState(false);
  const [searchMsg, setSearchMsg] = useState("");

  const [data, setData] = useState<ProspectsResponse | null>(null);

  const load = useCallback(async () => {
    const res: ProspectsResponse = await (await fetch("/api/prospects")).json();
    setData(res);
  }, []);

  // Load config (default all city chips on) and the initial prospect list once.
  useEffect(() => {
    (async () => {
      const cfg: Config = await (await fetch("/api/config")).json();
      setConfig(cfg);
      setSegment(cfg.segments[0] ?? "");
      setActiveCities(Object.fromEntries(cfg.cities.map((c) => [c.city, true])));
      await load();
    })();
  }, [load]);

  const selectedCities = useMemo(
    () => (config?.cities ?? []).filter((c) => activeCities[c.city]),
    [config, activeCities]
  );

  const toggleCity = (city: string) =>
    setActiveCities((prev) => ({ ...prev, [city]: !prev[city] }));

  const setAllCities = (on: boolean) =>
    setActiveCities(Object.fromEntries((config?.cities ?? []).map((c) => [c.city, on])));

  async function runSearch() {
    const kw = keyword.trim();
    if (!kw) {
      setSearchMsg("Type what to search for first.");
      return;
    }
    if (selectedCities.length === 0) {
      setSearchMsg("Pick at least one city.");
      return;
    }

    setSearching(true);
    let added = 0;
    let updated = 0;

    try {
      for (let i = 0; i < selectedCities.length; i++) {
        const city = selectedCities[i].city;
        setSearchMsg(`Searching ${city} ${i + 1}/${selectedCities.length}…`);
        const res = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keyword: kw, segment, city }),
        });
        const d = await res.json();
        if (!res.ok) {
          setSearchMsg(d.error || `Search failed for ${city}.`);
          return; // stop the loop on the first error (e.g. missing API key)
        }
        added += d.added ?? 0;
        updated += d.updated ?? 0;
        await load(); // refresh incrementally so results appear as they arrive
      }
      setSearchMsg(`Added ${added} new, refreshed ${updated}.`);
    } catch {
      setSearchMsg("Could not reach the server. Please try again.");
    } finally {
      setSearching(false);
    }
  }

  const rows = data?.rows ?? [];

  return (
    <>
      <header className="flex items-baseline gap-3.5 border-b-[3px] border-ember bg-ink px-[22px] py-3.5 text-white">
        <h1 className="text-[17px] font-bold uppercase tracking-[0.14em]">
          Dimak Prospector
        </h1>
        <span className="text-xs tracking-[0.03em] text-[#9aa3af]">
          Gulf fire door lead pipeline
        </span>
      </header>

      <main className="mx-auto w-full max-w-[1220px] px-[22px] pb-16 pt-5">
        {/* Search panel */}
        <section className="mb-4 rounded-lg border border-line bg-panel px-[18px] py-4">
          <h2 className="mb-3 text-[11px] uppercase tracking-[0.16em] text-mute">
            Find companies
          </h2>

          <div className="flex flex-wrap items-end gap-2.5">
            <div className="min-w-[220px] flex-1">
              <label htmlFor="keyword" className="mb-1 block text-[11px] tracking-[0.05em] text-steel">
                What to search for
              </label>
              <input
                id="keyword"
                list="terms"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runSearch()}
                placeholder="e.g. fire door supplier"
                className="w-full rounded-md border border-line bg-white px-2.5 py-2 text-sm outline-none focus:border-ember focus:outline-2 focus:outline-ember"
              />
              <datalist id="terms">
                {config?.terms.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </div>

            <div>
              <label htmlFor="segment" className="mb-1 block text-[11px] tracking-[0.05em] text-steel">
                Tag results as
              </label>
              <select
                id="segment"
                value={segment}
                onChange={(e) => setSegment(e.target.value)}
                className="min-w-[150px] rounded-md border border-line bg-white px-2.5 py-2 text-sm outline-none focus:border-ember focus:outline-2 focus:outline-ember"
              >
                {config?.segments.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>

            <label
              className="flex items-center gap-1.5 text-[13px] text-mute"
              title="Email lookup is added in a later step"
            >
              <input
                type="checkbox"
                checked={enrich}
                disabled
                onChange={(e) => setEnrich(e.target.checked)}
              />
              Look up emails <span className="text-[11px]">(soon)</span>
            </label>

            <button
              onClick={runSearch}
              disabled={searching}
              className="rounded-md bg-ember px-[18px] py-2.5 text-sm font-semibold text-white hover:bg-ember-dk disabled:cursor-default disabled:opacity-50"
            >
              {searching ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Searching
                </span>
              ) : (
                "Search"
              )}
            </button>
          </div>

          {/* City chips */}
          <div className="mt-3">
            <div className="mb-1 text-[11px] tracking-[0.05em] text-steel">
              Cities{" "}
              <button
                type="button"
                onClick={() => setAllCities(true)}
                className="text-mute underline-offset-2 hover:underline"
              >
                all
              </button>{" "}
              /{" "}
              <button
                type="button"
                onClick={() => setAllCities(false)}
                className="text-mute underline-offset-2 hover:underline"
              >
                none
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {config?.cities.map((c) => {
                const on = !!activeCities[c.city];
                return (
                  <button
                    type="button"
                    key={c.city}
                    aria-pressed={on}
                    onClick={() => toggleCity(c.city)}
                    className={`rounded-full border px-2.5 py-1 text-xs ${
                      on
                        ? "border-ink bg-ink text-white"
                        : "border-line bg-white text-steel"
                    }`}
                  >
                    {c.city}
                  </button>
                );
              })}
            </div>
          </div>

          {searchMsg && <div className="mt-2.5 text-xs text-mute">{searchMsg}</div>}
        </section>

        {/* Stats strip */}
        <div className="mb-3.5 flex flex-wrap gap-2">
          <Stat label="SHOWING" value={data?.total ?? 0} />
          {config?.statuses.map((s) => (
            <Stat key={s} label={s.toUpperCase()} value={data?.counts[s] ?? 0} />
          ))}
        </div>

        {/* Results table */}
        {rows.length === 0 ? (
          <div className="rounded-lg border border-line bg-panel p-10 text-center text-mute">
            No prospects yet. Run a search above.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line bg-panel">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {["Company", "Segment", "Location", "Phone", "Email", "Rating", "Status", "Notes"].map(
                    (h) => (
                      <th
                        key={h}
                        className="border-b border-line bg-[#f6f8fa] p-2.5 text-left text-[10px] uppercase tracking-[0.1em] text-mute"
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <Row key={r.placeId} r={r} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-[92px] rounded-md border border-line bg-panel px-3.5 py-2">
      <b className="block text-xl">{value}</b>
      <span className="text-[11px] tracking-[0.05em] text-mute">{label}</span>
    </div>
  );
}

function Row({ r }: { r: ProspectRow }) {
  const emails = (r.emails ?? "").split(" | ").filter(Boolean);
  return (
    <tr className="align-top">
      <td className="border-b border-line p-2.5">
        <div className="font-semibold">{r.company}</div>
        {r.category && <div className="text-xs text-mute">{r.category}</div>}
        {r.googleMapsUrl && (
          <a
            href={r.googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-ember-dk hover:underline"
          >
            map
          </a>
        )}
      </td>
      <td className="border-b border-line p-2.5 text-xs text-mute">{r.segment}</td>
      <td className="border-b border-line p-2.5">
        {r.country}
        <div className="text-xs text-mute">{r.city}</div>
      </td>
      <td className="border-b border-line p-2.5 font-mono text-xs">
        {r.phone}
        <div className="mt-1 flex gap-2">
          {r.wa && (
            <a href={r.wa} target="_blank" rel="noopener noreferrer" className="text-ember-dk hover:underline">
              WhatsApp
            </a>
          )}
          {r.website && (
            <a href={r.website} target="_blank" rel="noopener noreferrer" className="text-ember-dk hover:underline">
              site
            </a>
          )}
        </div>
      </td>
      <td className="border-b border-line p-2.5 font-mono text-xs">
        {emails.length > 0 ? (
          emails.map((e) => (
            <a key={e} href={`mailto:${e}`} className="block text-ember-dk hover:underline">
              {e}
            </a>
          ))
        ) : (
          <span className="text-mute">—</span>
        )}
      </td>
      <td className="border-b border-line p-2.5 font-mono text-xs">
        {r.rating ?? ""}
        <div className="text-mute">{r.reviews ?? 0}</div>
      </td>
      <td className="border-b border-line p-2.5">
        <span
          className={`text-xs font-semibold ${STATUS_TEXT[r.status] ?? "text-steel"}`}
        >
          {r.status}
        </span>
      </td>
      <td className="border-b border-line p-2.5 text-xs text-steel">{r.notes}</td>
    </tr>
  );
}
