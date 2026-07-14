"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  Config,
  ProspectRow,
  ProspectsResponse,
  MarketResponse,
  GeoResponse,
  CitiesResponse,
  CityRow,
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

type Filters = { country: string; segment: string; category: string; status: string; website: string; q: string };
const DEFAULT_FILTERS: Filters = { country: "All", segment: "All", category: "All", status: "All", website: "All", q: "" };

export default function Console() {
  const [config, setConfig] = useState<Config | null>(null);
  const [geo, setGeo] = useState<GeoResponse | null>(null);
  const [continentCode, setContinentCode] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [cities, setCities] = useState<CityRow[]>([]);
  const [citiesBusy, setCitiesBusy] = useState(false);
  const [activeCities, setActiveCities] = useState<Record<string, boolean>>({});

  const [segment, setSegment] = useState(""); // "tag new results as" ("" = don't tag)
  const [segments, setSegments] = useState<string[]>([]);
  const [newSegment, setNewSegment] = useState("");
  const [keyword, setKeyword] = useState("");
  const [enrich, setEnrich] = useState(false);

  const [searching, setSearching] = useState(false);
  const [searchMsg, setSearchMsg] = useState("");

  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [data, setData] = useState<ProspectsResponse | null>(null);
  const [enriching, setEnriching] = useState<Record<string, boolean>>({});
  const [marketBusy, setMarketBusy] = useState(false);
  const [marketMsg, setMarketMsg] = useState("");
  const [market, setMarket] = useState<MarketResponse | null>(null);
  const [cleanupBusy, setCleanupBusy] = useState(false);
  const [cleanupMsg, setCleanupMsg] = useState("");
  const qTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reload = useCallback(async (f: Filters): Promise<ProspectsResponse> => {
    const params = new URLSearchParams(f as unknown as Record<string, string>);
    const res: ProspectsResponse = await (await fetch("/api/prospects?" + params)).json();
    setData(res);
    return res;
  }, []);

  const loadMarket = useCallback(async (code: string) => {
    if (!code) return;
    const m: MarketResponse = await (await fetch(`/api/market?country=${code}`)).json();
    setMarket(m);
  }, []);

  const loadSegments = useCallback(async () => {
    const r = await (await fetch("/api/segments")).json();
    setSegments(r.segments ?? []);
  }, []);

  const loadCities = useCallback(async (code: string) => {
    if (!code) return;
    setCitiesBusy(true);
    try {
      const r: CitiesResponse = await (await fetch(`/api/geo/cities?country=${code}`)).json();
      const list = r.cities ?? [];
      setCities(list);
      setActiveCities(Object.fromEntries(list.map((c) => [c.city, true])));
    } finally {
      setCitiesBusy(false);
    }
  }, []);

  // Only load config + geography on mount. No continent/country selected, no
  // filters applied, empty list — the user searches or filters to populate.
  useEffect(() => {
    (async () => {
      const cfg: Config = await (await fetch("/api/config")).json();
      setConfig(cfg);
      const g: GeoResponse = await (await fetch("/api/geo")).json();
      setGeo(g);
      const seg = await (await fetch("/api/segments")).json();
      setSegments(seg.segments ?? []);
    })();
  }, []);

  const continentCountries = useMemo(
    () => geo?.continents.find((c) => c.code === continentCode)?.countries ?? [],
    [geo, continentCode]
  );
  const selectedCities = useMemo(
    () => cities.filter((c) => activeCities[c.city]),
    [cities, activeCities]
  );
  const selectedCountry = useMemo(
    () => continentCountries.find((c) => c.code === countryCode) ?? null,
    [continentCountries, countryCode]
  );
  const filterCountries = useMemo(() => {
    const set = new Set<string>(["All", ...(data?.allCountries ?? [])]);
    if (filters.country && filters.country !== "All") set.add(filters.country);
    return [...set];
  }, [data, filters.country]);
  const filterSegments = useMemo(() => ["All", ...segments], [segments]);
  const filterCategories = useMemo(
    () => ["All", ...(data?.allCategories ?? [])],
    [data]
  );
  const exportFilteredHref = useMemo(() => {
    const p = new URLSearchParams();
    if (filters.country !== "All") p.set("country", filters.country);
    if (filters.segment !== "All") p.set("segment", filters.segment);
    if (filters.category !== "All") p.set("category", filters.category);
    if (filters.status !== "All") p.set("status", filters.status);
    if (filters.website !== "All") p.set("website", filters.website);
    if (filters.q) p.set("q", filters.q);
    const s = p.toString();
    return "/api/export" + (s ? "?" + s : "");
  }, [filters]);

  const addSegment = async () => {
    const name = newSegment.trim();
    if (!name) return;
    await fetch("/api/segments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setNewSegment("");
    loadSegments();
  };
  const deleteSegment = async (name: string) => {
    if (!window.confirm(`Delete segment “${name}”? It will be removed from any tagged businesses.`)) return;
    await fetch("/api/segments", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    loadSegments();
    reload(filters);
  };
  const onTag = async (placeId: string, segmentStr: string) => {
    await save(placeId, { segment: segmentStr });
    reload(filters);
  };

  const onContinent = (code: string) => {
    setContinentCode(code);
    setCountryCode("");
    setCities([]);
    setActiveCities({});
    setMarket(null);
  };
  const onCountry = (code: string) => {
    setCountryCode(code);
    if (code) {
      loadCities(code);
      loadMarket(code);
      // Also show this country's already-collected prospects in the table.
      const name = continentCountries.find((c) => c.code === code)?.name ?? "";
      const next = { ...filters, country: name || "All" };
      setFilters(next);
      reload(next);
    } else {
      setCities([]);
      setActiveCities({});
      setMarket(null);
    }
  };

  const showAll = () => {
    setFilters(DEFAULT_FILTERS);
    reload(DEFAULT_FILTERS);
  };

  async function runCleanup() {
    if (
      !window.confirm(
        "Re-check every saved business against Google and remove ones now permanently closed?\n\nThis makes one billed Places call per business."
      )
    )
      return;
    setCleanupBusy(true);
    setCleanupMsg("Checking businesses against Google…");
    try {
      const res = await fetch("/api/prospects/cleanup-closed", { method: "POST" });
      const d = await res.json();
      if (!res.ok) {
        setCleanupMsg(d.error || "Cleanup failed.");
        return;
      }
      setCleanupMsg(`Removed ${d.removed} permanently-closed of ${d.checked} checked.`);
      await reload(filters);
    } catch {
      setCleanupMsg("Could not reach the server. Please try again.");
    } finally {
      setCleanupBusy(false);
    }
  }

  const toggleCity = (city: string) =>
    setActiveCities((prev) => ({ ...prev, [city]: !prev[city] }));
  const setAllCities = (on: boolean) =>
    setActiveCities(Object.fromEntries(cities.map((c) => [c.city, on])));

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

  async function save(placeId: string, fields: { status?: string; notes?: string; segment?: string }) {
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
    if (!selectedCountry?.isoNumeric) {
      setMarketMsg("This country has no UN numeric code, so Comtrade data isn't available.");
      return;
    }
    setMarketBusy(true);
    setMarketMsg(`Fetching ${selectedCountry.name} steel-door import data…`);
    try {
      const res = await fetch("/api/market/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reporterCode: selectedCountry.isoNumeric, country: selectedCountry.name }),
      });
      const d = await res.json();
      if (!res.ok) return setMarketMsg(d.error || "Refresh failed.");
      if (!d.upserted) return setMarketMsg(d.note || "No data returned.");
      const yrs = d.years ?? [];
      setMarketMsg(
        `Updated ${d.upserted} year(s) for ${d.country}` +
          (yrs.length ? ` (${yrs[0]}–${yrs[yrs.length - 1]}).` : ".")
      );
      await loadMarket(countryCode);
    } catch {
      setMarketMsg("Could not reach the server. Please try again.");
    } finally {
      setMarketBusy(false);
    }
  }

  async function runSearch() {
    const kw = keyword.trim();
    if (!kw) return setSearchMsg("Type what to search for first.");
    if (!countryCode) return setSearchMsg("Pick a country first.");
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
          body: JSON.stringify({ keyword: kw, segment, city, countryCode }),
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
        <span className="text-xs tracking-[0.03em] text-[#9aa3af]">Fire door lead pipeline</span>
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
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runSearch()}
                placeholder="e.g. fire door supplier"
                className="control w-full"
              />
            </div>

            <div>
              <label htmlFor="segment" className={label}>Tag new results as</label>
              <select id="segment" value={segment} onChange={(e) => setSegment(e.target.value)} className="control min-w-[190px]">
                <option value="">Don&apos;t tag</option>
                {segments.map((s) => (
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

          {/* Continent -> Country */}
          <div className="mt-3 flex flex-wrap items-end gap-2.5">
            <div>
              <label htmlFor="continent" className={label}>Continent</label>
              <select id="continent" value={continentCode} onChange={(e) => onContinent(e.target.value)} className="control min-w-[150px]">
                <option value="">Select continent</option>
                {geo?.continents.map((c) => (
                  <option key={c.code} value={c.code}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="country" className={label}>Country</label>
              <select
                id="country"
                value={countryCode}
                onChange={(e) => onCountry(e.target.value)}
                disabled={!continentCode}
                className="control min-w-[220px] disabled:opacity-50"
              >
                <option value="">{continentCode ? "Select country" : "—"}</option>
                {continentCountries.map((c) => (
                  <option key={c.code} value={c.code}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Cities of the selected country */}
          <div className="mt-3">
            <div className="mb-1.5 text-[11px] tracking-[0.05em] text-steel">
              Cities{" "}
              <button type="button" onClick={() => setAllCities(true)} className="text-mute underline-offset-2 hover:underline">all</button>
              {" / "}
              <button type="button" onClick={() => setAllCities(false)} className="text-mute underline-offset-2 hover:underline">none</button>
            </div>
            {!countryCode ? (
              <div className="text-xs text-mute">Pick a country to list its cities.</div>
            ) : citiesBusy ? (
              <div className="text-xs text-mute">Loading cities…</div>
            ) : cities.length === 0 ? (
              <div className="text-xs text-mute">No cities found for this country.</div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {cities.map((c) => {
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
            )}
          </div>

          {/* Manage your segments (labels you tag businesses with) */}
          <div className="mt-3 border-t border-line pt-3">
            <div className="mb-1.5 text-[11px] tracking-[0.05em] text-steel">Your segments</div>
            <div className="flex flex-wrap items-center gap-1.5">
              {segments.map((s) => (
                <span key={s} className="inline-flex items-center gap-1 border border-line px-2 py-1 text-xs text-steel">
                  {s}
                  <button
                    onClick={() => deleteSegment(s)}
                    className="text-mute hover:text-status-nofit"
                    aria-label={`Delete segment ${s}`}
                  >
                    ×
                  </button>
                </span>
              ))}
              {segments.length === 0 && (
                <span className="text-xs text-mute">No segments yet — add your own labels.</span>
              )}
              <input
                value={newSegment}
                onChange={(e) => setNewSegment(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSegment())}
                placeholder="new segment"
                className="control control-sm ml-1 w-[150px]"
              />
              <button onClick={addSegment} className="btn btn-ghost btn-sm">Add</button>
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
            <button
              onClick={refreshMarket}
              disabled={marketBusy || !countryCode || !selectedCountry?.isoNumeric}
              className="btn btn-ghost btn-sm"
            >
              {marketBusy ? "Refreshing…" : "Refresh data"}
            </button>
            {marketMsg ? (
              <span className="text-xs text-mute">{marketMsg}</span>
            ) : (
              market?.updatedAt && (
                <span className="text-xs text-mute">as of {new Date(market.updatedAt).toLocaleDateString()}</span>
              )
            )}
          </div>

          {market?.latest ? (
            <div className="mt-3 flex flex-wrap items-end gap-x-8 gap-y-3">
              <div>
                <div className="text-xs font-semibold text-ink">{market.country}</div>
                <div className="mt-0.5 font-mono text-2xl">{fmtUSD(market.latest.importValue)}</div>
                <div className="text-[11px] text-mute">
                  {market.latest.year}
                  {market.latest.prevYear != null && (
                    <>
                      {" · vs "}
                      {market.latest.prevYear} <Growth pct={market.latest.growthPct} />
                    </>
                  )}
                </div>
              </div>
              {market.series.length > 1 && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-mute">
                  {market.series.map((p) => (
                    <span key={p.period} className="font-mono">
                      {p.period}: {fmtUSD(p.importValue)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ) : !countryCode ? (
            <p className="mt-2 text-[11px] text-mute">
              Select a country above to see its steel-door imports.
            </p>
          ) : (
            <p className="mt-2 text-[11px] text-mute">
              No steel-door import data for {selectedCountry?.name ?? "this country"} yet.
              {selectedCountry?.isoNumeric
                ? " Click “Refresh data” to pull it from UN Comtrade."
                : " (This country has no UN numeric code, so Comtrade data isn’t available.)"}
            </p>
          )}

          <p className="mt-2.5 text-[10px] text-mute">
            Imports of HS&nbsp;730830 (steel doors &amp; frames) for the selected country,
            USD, source UN Comtrade. Trade data typically lags 1–2 years.
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
          <FilterSelect label="Country" value={filters.country} options={filterCountries} onChange={(v) => changeFilter("country", v)} />
          <FilterSelect label="Segment" value={filters.segment} options={filterSegments} onChange={(v) => changeFilter("segment", v)} />
          <FilterSelect label="Category" value={filters.category} options={filterCategories} onChange={(v) => changeFilter("category", v)} />
          <FilterSelect label="Status" value={filters.status} options={["All", ...(config?.statuses ?? [])]} onChange={(v) => changeFilter("status", v)} />
          <FilterSelect label="Website" value={filters.website} options={["All", "Has site", "No site"]} onChange={(v) => changeFilter("website", v)} />
          <div className="min-w-[200px] flex-1">
            <label className={label}>Find in list</label>
            <input value={filters.q} onChange={(e) => changeFind(e.target.value)} placeholder="company or city" className="control w-full" />
          </div>
          <button onClick={showAll} className="btn btn-ghost">Show all</button>
          <a href="/api/export" className="btn btn-ghost">Export all</a>
          <a href={exportFilteredHref} className="btn btn-ghost">Export filtered</a>
        </div>

        {/* Maintenance: prune permanently-closed businesses */}
        <div className="mb-2 flex flex-wrap items-center gap-3">
          <button
            onClick={runCleanup}
            disabled={cleanupBusy}
            className="text-xs text-mute underline-offset-2 hover:text-ember-dk hover:underline disabled:opacity-50"
          >
            {cleanupBusy ? "Checking…" : "Remove permanently-closed"}
          </button>
          {cleanupMsg && <span className="text-xs text-mute">{cleanupMsg}</span>}
        </div>

        {/* Results table */}
        {rows.length === 0 ? (
          <div className="border border-line bg-panel p-10 text-center text-mute">
            {data
              ? "No prospects match. Adjust the filters or run a search."
              : "Pick a country, click “Show all”, or run a search to see prospects."}
          </div>
        ) : (
          <div className="overflow-x-auto border border-line bg-panel">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {["Company", "Segment", "Location", "Contact details", "Status", "Notes"].map((h) => (
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
                    segments={segments}
                    enriching={!!enriching[r.placeId]}
                    onStatus={onStatus}
                    onNotes={onNotes}
                    onFind={enrichOne}
                    onTag={onTag}
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
  segments,
  enriching,
  onStatus,
  onNotes,
  onFind,
  onTag,
}: {
  r: ProspectRow;
  statuses: string[];
  segments: string[];
  enriching: boolean;
  onStatus: (placeId: string, status: string) => void;
  onNotes: (placeId: string, notes: string) => void;
  onFind: (placeId: string) => void;
  onTag: (placeId: string, segmentStr: string) => void;
}) {
  const emails = (r.emails ?? "").split(" | ").filter(Boolean);
  const tags = (r.segment ?? "").split(" | ").filter(Boolean);
  const addable = segments.filter((s) => !tags.includes(s));
  const cell = "border-b border-line p-2.5 align-top";
  return (
    <tr>
      <td className={cell}>
        <div className="font-semibold">{r.company}</div>
        {r.category && <div className="text-xs text-mute">{r.category}</div>}
        <div className="mt-0.5 flex gap-2 text-xs">
          {r.googleMapsUrl && (
            <a href={r.googleMapsUrl} target="_blank" rel="noopener noreferrer" className="text-ember-dk hover:underline">
              map
            </a>
          )}
          {r.website && (
            <a href={r.website} target="_blank" rel="noopener noreferrer" className="text-ember-dk hover:underline">
              site
            </a>
          )}
        </div>
      </td>
      <td className={cell}>
        <div className="flex flex-wrap items-center gap-1">
          {tags.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 border border-line px-1.5 py-0.5 text-[11px] text-steel">
              {t}
              <button
                onClick={() => onTag(r.placeId, tags.filter((x) => x !== t).join(" | "))}
                className="text-mute hover:text-status-nofit"
                aria-label={`Remove ${t}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        {addable.length > 0 && (
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) onTag(r.placeId, [...tags, e.target.value].join(" | "));
            }}
            className="control control-sm mt-1"
            aria-label="Add segment"
          >
            <option value="">+ segment</option>
            {addable.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        )}
      </td>
      <td className={cell}>
        {r.country}
        <div className="text-xs text-mute">{r.city}</div>
      </td>

      {/* Contact details: phone + WhatsApp/site + email in one column */}
      <td className={cell}>
        <div className="font-mono text-xs">{r.phone || <span className="text-mute">—</span>}</div>
        {r.wa && (
          <div className="mt-1 text-xs">
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
