"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Config, ProspectRow, ProspectsResponse } from "@/lib/types";

const STATUS_TEXT: Record<string, string> = {
  New: "text-status-new",
  Contacted: "text-status-contacted",
  Replied: "text-status-replied",
  "Not a fit": "text-status-nofit",
};

type Filters = { country: string; segment: string; status: string; q: string };

const DEFAULT_FILTERS: Filters = { country: "All", segment: "All", status: "All", q: "" };

export default function Console() {
  const [config, setConfig] = useState<Config | null>(null);
  const [segment, setSegment] = useState("");
  const [keyword, setKeyword] = useState("");
  const [enrich, setEnrich] = useState(false);
  const [activeCities, setActiveCities] = useState<Record<string, boolean>>({});

  const [searching, setSearching] = useState(false);
  const [searchMsg, setSearchMsg] = useState("");

  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [data, setData] = useState<ProspectsResponse | null>(null);
  const [enriching, setEnriching] = useState<Record<string, boolean>>({});
  const qTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch prospects for a given filter set and return the response too, so
  // callers (search, enrich loop) can act on the fresh rows.
  const reload = useCallback(async (f: Filters): Promise<ProspectsResponse> => {
    const params = new URLSearchParams(f as unknown as Record<string, string>);
    const res: ProspectsResponse = await (await fetch("/api/prospects?" + params)).json();
    setData(res);
    return res;
  }, []);

  // Load config (all city chips on) + the initial list once.
  useEffect(() => {
    (async () => {
      const cfg: Config = await (await fetch("/api/config")).json();
      setConfig(cfg);
      setSegment(cfg.segments[0] ?? "");
      setActiveCities(Object.fromEntries(cfg.cities.map((c) => [c.city, true])));
      const res: ProspectsResponse = await (await fetch("/api/prospects")).json();
      setData(res);
    })();
  }, []);

  const countries = useMemo(
    () => ["All", ...new Set((config?.cities ?? []).map((c) => c.country))],
    [config]
  );
  const selectedCities = useMemo(
    () => (config?.cities ?? []).filter((c) => activeCities[c.city]),
    [config, activeCities]
  );

  const toggleCity = (city: string) =>
    setActiveCities((prev) => ({ ...prev, [city]: !prev[city] }));
  const setAllCities = (on: boolean) =>
    setActiveCities(Object.fromEntries((config?.cities ?? []).map((c) => [c.city, on])));

  const changeFilter = (key: keyof Filters, value: string) => {
    const next = { ...filters, [key]: value };
    setFilters(next);
    reload(next);
  };
  const changeFind = (value: string) => {
    const next = { ...filters, q: value };
    setFilters(next);
    if (qTimer.current) clearTimeout(qTimer.current);
    qTimer.current = setTimeout(() => reload(next), 300);
  };

  async function save(placeId: string, fields: { status?: string; notes?: string }) {
    await fetch("/api/prospects/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ place_id: placeId, ...fields }),
    });
  }

  const onStatus = async (placeId: string, status: string) => {
    await save(placeId, { status });
    reload(filters);
  };
  const onNotes = (placeId: string, notes: string) => save(placeId, { notes });

  // Patch a single row's emails in place (avoids a full reload per lookup).
  const patchEmails = (placeId: string, emails: string) =>
    setData((prev) =>
      prev
        ? { ...prev, rows: prev.rows.map((r) => (r.placeId === placeId ? { ...r, emails } : r)) }
        : prev
    );

  const enrichOne = useCallback(async (placeId: string): Promise<string> => {
    setEnriching((prev) => ({ ...prev, [placeId]: true }));
    try {
      const res = await fetch("/api/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ place_id: placeId }),
      });
      const d = await res.json();
      const emails: string = d.emails ?? "";
      patchEmails(placeId, emails);
      return emails;
    } finally {
      setEnriching((prev) => ({ ...prev, [placeId]: false }));
    }
  }, []);

  async function runSearch() {
    const kw = keyword.trim();
    if (!kw) return setSearchMsg("Type what to search for first.");
    if (selectedCities.length === 0) return setSearchMsg("Pick at least one city.");

    setSearching(true);
    let added = 0;
    let updated = 0;
    try {
      let latest = data;
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
          return;
        }
        added += d.added ?? 0;
        updated += d.updated ?? 0;
        latest = await reload(filters);
      }

      // Optional convenience: after the searches, look up emails for the loaded
      // rows that have a website and none yet. Each is a separate /api/enrich
      // call (never inline in search).
      if (enrich && latest) {
        const todo = latest.rows.filter((r) => r.website && !(r.emails ?? "").length);
        for (let i = 0; i < todo.length; i++) {
          setSearchMsg(`Looking up emails ${i + 1}/${todo.length}…`);
          await enrichOne(todo[i].placeId);
        }
      }

      setSearchMsg(`Added ${added} new, refreshed ${updated}.`);
    } catch {
      setSearchMsg("Could not reach the server. Please try again.");
    } finally {
      setSearching(false);
    }
  }

  const rows = data?.rows ?? [];
  const inputCls =
    "rounded-md border border-line bg-white px-2.5 py-2 text-sm outline-none focus:border-ember focus:outline-2 focus:outline-ember";

  return (
    <>
      <header className="flex items-baseline gap-3.5 border-b-[3px] border-ember bg-ink px-[22px] py-3.5 text-white">
        <h1 className="text-[17px] font-bold uppercase tracking-[0.14em]">Dimak Prospector</h1>
        <span className="text-xs tracking-[0.03em] text-[#9aa3af]">Gulf fire door lead pipeline</span>
      </header>

      <main className="mx-auto w-full max-w-[1220px] px-[22px] pb-16 pt-5">
        {/* Search panel */}
        <section className="mb-4 rounded-lg border border-line bg-panel px-[18px] py-4">
          <h2 className="mb-3 text-[11px] uppercase tracking-[0.16em] text-mute">Find companies</h2>

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
                className={`w-full ${inputCls}`}
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
                className={`min-w-[150px] ${inputCls}`}
              >
                {config?.segments.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>

            <label className="flex items-center gap-1.5 text-[13px] text-steel" title="Fetch public emails from each company website after searching">
              <input type="checkbox" checked={enrich} onChange={(e) => setEnrich(e.target.checked)} />
              Look up emails <span className="text-[11px] text-mute">(slower)</span>
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

          <div className="mt-3">
            <div className="mb-1 text-[11px] tracking-[0.05em] text-steel">
              Cities{" "}
              <button type="button" onClick={() => setAllCities(true)} className="text-mute underline-offset-2 hover:underline">
                all
              </button>{" "}
              /{" "}
              <button type="button" onClick={() => setAllCities(false)} className="text-mute underline-offset-2 hover:underline">
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
                      on ? "border-ink bg-ink text-white" : "border-line bg-white text-steel"
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

        {/* Filters */}
        <div className="mb-3 flex flex-wrap items-end gap-2.5">
          <FilterSelect label="Country" value={filters.country} options={countries} onChange={(v) => changeFilter("country", v)} cls={inputCls} />
          <FilterSelect label="Segment" value={filters.segment} options={["All", ...(config?.segments ?? [])]} onChange={(v) => changeFilter("segment", v)} cls={inputCls} />
          <FilterSelect label="Status" value={filters.status} options={["All", ...(config?.statuses ?? [])]} onChange={(v) => changeFilter("status", v)} cls={inputCls} />
          <div className="min-w-[200px] flex-1">
            <label className="mb-1 block text-[11px] tracking-[0.05em] text-steel">Find in list</label>
            <input value={filters.q} onChange={(e) => changeFind(e.target.value)} placeholder="company or city" className={`w-full ${inputCls}`} />
          </div>
        </div>

        {/* Results table */}
        {rows.length === 0 ? (
          <div className="rounded-lg border border-line bg-panel p-10 text-center text-mute">
            {data ? "No prospects match. Adjust the filters or run a search." : "Loading…"}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line bg-panel">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {["Company", "Segment", "Location", "Phone", "Email", "Rating", "Status", "Notes"].map((h) => (
                    <th key={h} className="border-b border-line bg-[#f6f8fa] p-2.5 text-left text-[10px] uppercase tracking-[0.1em] text-mute">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <Row
                    key={r.placeId}
                    r={r}
                    statuses={config?.statuses ?? []}
                    enriching={!!enriching[r.placeId]}
                    onStatus={onStatus}
                    onNotes={onNotes}
                    onFind={enrichOne}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {rows.length > 0 && (
          <p className="mt-2.5 text-[11px] text-mute">
            Phone numbers are shown exactly as Google Places provides them. The
            WhatsApp link is generated from that number and may not be registered
            on WhatsApp.
          </p>
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

function FilterSelect({
  label,
  value,
  options,
  onChange,
  cls,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  cls: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] tracking-[0.05em] text-steel">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={cls}>
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </div>
  );
}

function Row({
  r,
  statuses,
  enriching,
  onStatus,
  onNotes,
  onFind,
}: {
  r: ProspectRow;
  statuses: string[];
  enriching: boolean;
  onStatus: (placeId: string, status: string) => void;
  onNotes: (placeId: string, notes: string) => void;
  onFind: (placeId: string) => void;
}) {
  const emails = (r.emails ?? "").split(" | ").filter(Boolean);
  return (
    <tr className="align-top">
      <td className="border-b border-line p-2.5">
        <div className="font-semibold">{r.company}</div>
        {r.category && <div className="text-xs text-mute">{r.category}</div>}
        {r.googleMapsUrl && (
          <a href={r.googleMapsUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-ember-dk hover:underline">
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
            <a
              href={r.wa}
              target="_blank"
              rel="noopener noreferrer"
              title="WhatsApp link generated from the phone number above (via Google Places). The number may not be registered on WhatsApp."
              aria-label="Open WhatsApp for this phone number (may not be registered on WhatsApp)"
              className="text-ember-dk hover:underline"
            >
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
        ) : r.website ? (
          <button
            onClick={() => onFind(r.placeId)}
            disabled={enriching}
            className="rounded border border-line px-2 py-1 text-[11px] text-steel hover:border-ember hover:text-ember-dk disabled:opacity-50"
          >
            {enriching ? "Finding…" : "Find email"}
          </button>
        ) : (
          <span className="text-mute">—</span>
        )}
      </td>
      <td className="border-b border-line p-2.5 font-mono text-xs">
        {r.rating ?? ""}
        <div className="text-mute">{r.reviews ?? 0}</div>
      </td>
      <td className="border-b border-line p-2.5">
        <select
          value={r.status}
          onChange={(e) => onStatus(r.placeId, e.target.value)}
          className={`rounded-full border border-line px-2 py-1 text-xs font-semibold outline-none focus:border-ember ${
            STATUS_TEXT[r.status] ?? "text-steel"
          }`}
        >
          {statuses.map((s) => (
            <option key={s} value={s} className="text-ink">
              {s}
            </option>
          ))}
        </select>
      </td>
      <td className="border-b border-line p-2.5" style={{ minWidth: 150 }}>
        <textarea
          key={`${r.placeId}:${r.updatedAt}`}
          defaultValue={r.notes}
          onBlur={(e) => onNotes(r.placeId, e.target.value)}
          rows={2}
          className="min-h-[34px] w-full resize-y rounded border border-line p-1.5 text-xs outline-none focus:border-ember"
        />
      </td>
    </tr>
  );
}
