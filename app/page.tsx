"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  Config,
  ProspectRow,
  ProspectsResponse,
  MarketRow,
  MarketResponse,
} from "@/lib/types";

const STATUS_TEXT: Record<string, string> = {
  New: "text-status-new",
  Contacted: "text-status-contacted",
  Replied: "text-status-replied",
  "Not a fit": "text-status-nofit",
};

const usdCompact = new Intl.NumberFormat("en", {
  notation: "compact",
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 1,
});
const fmtUSD = (v: number | null) => (v == null ? "—" : usdCompact.format(v));

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
  const [marketBusy, setMarketBusy] = useState(false);
  const [marketMsg, setMarketMsg] = useState("");
  const [market, setMarket] = useState<MarketResponse | null>(null);
  const qTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reload = useCallback(async (f: Filters): Promise<ProspectsResponse> => {
    const params = new URLSearchParams(f as unknown as Record<string, string>);
    const res: ProspectsResponse = await (await fetch("/api/prospects?" + params)).json();
    setData(res);
    return res;
  }, []);

  const loadMarket = useCallback(async () => {
    const m: MarketResponse = await (await fetch("/api/market")).json();
    setMarket(m);
  }, []);

  useEffect(() => {
    (async () => {
      const cfg: Config = await (await fetch("/api/config")).json();
      setConfig(cfg);
      setSegment(cfg.segments[0] ?? "");
      setActiveCities(Object.fromEntries(cfg.cities.map((c) => [c.city, true])));
      const res: ProspectsResponse = await (await fetch("/api/prospects")).json();
      setData(res);
      const m: MarketResponse = await (await fetch("/api/market")).json();
      setMarket(m);
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

  async function refreshMarket() {
    setMarketBusy(true);
    setMarketMsg("Fetching steel-door import data from UN Comtrade…");
    try {
      const res = await fetch("/api/market/refresh", { method: "POST" });
      const d = await res.json();
      if (!res.ok) return setMarketMsg(d.error || "Refresh failed.");
      if (!d.upserted) return setMarketMsg(d.note || "No data returned.");
      const yrs = d.years ?? [];
      setMarketMsg(
        `Updated ${d.upserted} rows across ${d.countries?.length ?? 0} countries` +
          (yrs.length ? ` (years ${yrs[0]}–${yrs[yrs.length - 1]}).` : ".")
      );
      await loadMarket();
    } catch {
      setMarketMsg("Could not reach the server. Please try again.");
    } finally {
      setMarketBusy(false);
    }
  }

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
        if (!res.ok) return setSearchMsg(d.error || `Search failed for ${city}.`);
        added += d.added ?? 0;
        updated += d.updated ?? 0;
        latest = await reload(filters);
      }

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
  const label = "mb-1 block text-[11px] tracking-[0.05em] text-steel";

  return (
    <>
      <header className="flex items-baseline gap-3.5 border-b-[3px] border-ember bg-ink px-[22px] py-3.5 text-white">
        <h1 className="text-[17px] font-bold uppercase tracking-[0.14em]">DİMAK Prospector</h1>
        <span className="text-xs tracking-[0.03em] text-[#9aa3af]">Gulf fire door lead pipeline</span>
        <button
          onClick={async () => {
            await fetch("/api/auth/logout", { method: "POST" });
            window.location.href = "/login";
          }}
          className="ml-auto text-xs text-[#9aa3af] hover:text-white"
        >
          Log out
        </button>
      </header>

      <main className="mx-auto w-full max-w-[1220px] px-[22px] pb-16 pt-5">
        {/* Search panel */}
        <section className="mb-4 border border-line bg-panel px-[18px] py-4">
          <h2 className="mb-3 text-[11px] uppercase tracking-[0.16em] text-mute">Find companies</h2>

          <div className="flex flex-wrap items-end gap-2.5">
            <div className="min-w-[220px] flex-1">
              <label htmlFor="keyword" className={label}>What to search for</label>
              <input
                id="keyword"
                list="terms"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runSearch()}
                placeholder="e.g. fire door supplier"
                className="control w-full"
              />
              <datalist id="terms">
                {config?.terms.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </div>

            <div>
              <label htmlFor="segment" className={label}>Tag results as</label>
              <select
                id="segment"
                value={segment}
                onChange={(e) => setSegment(e.target.value)}
                className="control min-w-[190px]"
              >
                {config?.segments.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>

            <label className="clickable flex h-[38px] items-center gap-1.5 text-[13px] text-steel" title="Fetch public emails from each company website after searching">
              <input type="checkbox" checked={enrich} onChange={(e) => setEnrich(e.target.checked)} />
              Look up emails <span className="text-[11px] text-mute">(slower)</span>
            </label>

            <button onClick={runSearch} disabled={searching} className="btn btn-primary">
              {searching ? (
                <>
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Searching
                </>
              ) : (
                "Search"
              )}
            </button>
          </div>

          <div className="mt-3">
            <div className="mb-1.5 text-[11px] tracking-[0.05em] text-steel">
              Cities{" "}
              <button type="button" onClick={() => setAllCities(true)} className="text-mute underline-offset-2 hover:underline">all</button>
              {" / "}
              <button type="button" onClick={() => setAllCities(false)} className="text-mute underline-offset-2 hover:underline">none</button>
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
                    className={`h-[30px] border px-3 text-xs ${
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

        {/* Market intelligence (v2) */}
        <section className="mb-4 border border-line bg-panel px-[18px] py-4">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-[11px] uppercase tracking-[0.16em] text-mute">
              Market — steel door imports (HS 730830)
            </h2>
            <button onClick={refreshMarket} disabled={marketBusy} className="btn btn-ghost btn-sm">
              {marketBusy ? "Refreshing…" : "Refresh data"}
            </button>
            {marketMsg ? (
              <span className="text-xs text-mute">{marketMsg}</span>
            ) : (
              market?.updatedAt && (
                <span className="text-xs text-mute">
                  as of {new Date(market.updatedAt).toLocaleDateString()}
                </span>
              )
            )}
          </div>

          {market && market.markets.some((m) => m.importValue != null) ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {market.markets.map((m, i) => (
                <MarketCard key={m.country} m={m} top={i === 0 && m.importValue != null} />
              ))}
            </div>
          ) : (
            <p className="mt-2 text-[11px] text-mute">
              No market data yet. Click “Refresh data” to pull the latest steel-door
              import figures from UN Comtrade.
            </p>
          )}

          <p className="mt-2.5 text-[10px] text-mute">
            Imports of HS&nbsp;730830 (steel doors &amp; frames), USD, source UN Comtrade.
            Ranked biggest market first; trade data typically lags 1–2 years.
          </p>
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
          <FilterSelect label="Country" value={filters.country} options={countries} onChange={(v) => changeFilter("country", v)} />
          <FilterSelect label="Segment" value={filters.segment} options={["All", ...(config?.segments ?? [])]} onChange={(v) => changeFilter("segment", v)} />
          <FilterSelect label="Status" value={filters.status} options={["All", ...(config?.statuses ?? [])]} onChange={(v) => changeFilter("status", v)} />
          <div className="min-w-[200px] flex-1">
            <label className={label}>Find in list</label>
            <input value={filters.q} onChange={(e) => changeFind(e.target.value)} placeholder="company or city" className="control w-full" />
          </div>
          <a href="/api/export" className="btn btn-ghost">Export to Excel</a>
        </div>

        {/* Results table */}
        {rows.length === 0 ? (
          <div className="border border-line bg-panel p-10 text-center text-mute">
            {data ? "No prospects match. Adjust the filters or run a search." : "Loading…"}
          </div>
        ) : (
          <div className="overflow-x-auto border border-line bg-panel">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {["Company", "Segment", "Location", "Contact details", "Rating", "Status", "Notes"].map((h) => (
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
            Phone numbers are shown exactly as Google Places provides them. The WhatsApp
            link is generated from that number and may not be registered on WhatsApp.
          </p>
        )}
      </main>
    </>
  );
}

function Growth({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-mute">—</span>;
  const up = pct >= 0;
  return (
    <span className={up ? "text-status-replied" : "text-status-nofit"}>
      {up ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

function MarketCard({ m, top }: { m: MarketRow; top: boolean }) {
  return (
    <div className={`min-w-[150px] flex-1 border bg-white px-3 py-2 ${top ? "border-ember" : "border-line"}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold text-ink">{m.country}</div>
        {top && <span className="text-[9px] font-bold uppercase tracking-wider text-ember-dk">top market</span>}
      </div>
      <div className="mt-0.5 font-mono text-base">{fmtUSD(m.importValue)}</div>
      <div className="text-[11px] text-mute">
        {m.year ?? "no data"}
        {m.prevYear != null && (
          <>
            {" · vs "}
            {m.prevYear} <Growth pct={m.growthPct} />
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-[92px] border border-line bg-panel px-3.5 py-2">
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
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] tracking-[0.05em] text-steel">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="control min-w-[150px]">
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
  const cell = "border-b border-line p-2.5 align-top";
  return (
    <tr>
      <td className={cell}>
        <div className="font-semibold">{r.company}</div>
        {r.category && <div className="text-xs text-mute">{r.category}</div>}
        {r.googleMapsUrl && (
          <a href={r.googleMapsUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-ember-dk hover:underline">
            map
          </a>
        )}
      </td>
      <td className={`${cell} text-xs text-mute`}>{r.segment}</td>
      <td className={cell}>
        {r.country}
        <div className="text-xs text-mute">{r.city}</div>
      </td>

      {/* Contact details: phone + WhatsApp/site + email in one column */}
      <td className={cell}>
        <div className="font-mono text-xs">
          {r.phone || <span className="text-mute">—</span>}
        </div>
        {(r.wa || r.website) && (
          <div className="mt-1 flex gap-2 text-xs">
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
        )}
        <div className="mt-1.5 font-mono text-xs">
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
              className="border border-line px-2 py-1 text-[11px] text-steel hover:border-ember hover:text-ember-dk disabled:opacity-50"
            >
              {enriching ? "Finding…" : "Find email"}
            </button>
          ) : (
            <span className="text-mute">—</span>
          )}
        </div>
      </td>

      <td className={`${cell} font-mono text-xs`}>
        {r.rating ?? ""}
        <div className="text-mute">{r.reviews ?? 0}</div>
      </td>
      <td className={cell}>
        <select
          value={r.status}
          onChange={(e) => onStatus(r.placeId, e.target.value)}
          className={`control control-sm font-semibold ${STATUS_TEXT[r.status] ?? "text-steel"}`}
        >
          {statuses.map((s) => (
            <option key={s} value={s} className="text-ink">
              {s}
            </option>
          ))}
        </select>
      </td>
      <td className={cell} style={{ minWidth: 150 }}>
        <textarea
          key={`${r.placeId}:${r.updatedAt}`}
          defaultValue={r.notes}
          onBlur={(e) => onNotes(r.placeId, e.target.value)}
          rows={2}
          className="control w-full text-xs"
        />
      </td>
    </tr>
  );
}
