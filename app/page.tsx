"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Brand, SiteFooter, AdSlot } from "@/components/branding";
import { scoreLead, type LeadScore } from "@/lib/score";
import type {
  Config,
  ProspectRow,
  ProspectNote,
  ProspectsResponse,
  MarketResponse,
  GeoResponse,
  CitiesResponse,
  CityRow,
  LiveDetails,
  DetailsResponse,
  WebsiteAnalysis,
  AnalyzeResponse,
} from "@/lib/types";

const isEmail = (s?: string | null) => !!s && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

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

// Server-side filters (backed by stored columns) vs. client-side filters
// (evaluated over the live Place Details data, which is never stored).
type Filters = { country: string; segment: string; category: string; status: string; website: string; q: string };
const DEFAULT_FILTERS: Filters = { country: "All", segment: "All", category: "All", status: "All", website: "All", q: "" };
const SERVER_KEYS = new Set<keyof Filters>(["country", "segment", "status"]);
const DETAILS_CHUNK = 60;

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

  const [searching, setSearching] = useState(false);
  const [searchMsg, setSearchMsg] = useState("");

  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [data, setData] = useState<ProspectsResponse | null>(null);

  // Live business content, keyed by place_id — fetched on view, never stored.
  const [details, setDetails] = useState<Record<string, LiveDetails>>({});
  const detailsRef = useRef<Record<string, LiveDetails>>({});
  const inFlightRef = useRef<Set<string>>(new Set());
  const [detailsBusy, setDetailsBusy] = useState(false);

  const [analyzeFor, setAnalyzeFor] = useState<string | null>(null); // placeId of the open analysis popup
  const [fitKeywords, setFitKeywords] = useState<string[]>([]); // target categories for the Fit score
  const [fitInput, setFitInput] = useState("");
  const [sortByScore, setSortByScore] = useState(false);
  const [marketBusy, setMarketBusy] = useState(false);
  const [marketMsg, setMarketMsg] = useState("");
  const [market, setMarket] = useState<MarketResponse | null>(null);
  const [hsCode, setHsCode] = useState("730830");
  const [cleanupBusy, setCleanupBusy] = useState(false);
  const [cleanupMsg, setCleanupMsg] = useState("");
  const [notesFor, setNotesFor] = useState<string | null>(null); // placeId of the open notes popup

  // Fetch live Place Details for any place_ids we don't already have (and aren't
  // already fetching), chunked to bound each request. Merges into the cache.
  const fetchDetails = useCallback(async (ids: string[]) => {
    const missing = [...new Set(ids)].filter(
      (id) => id && !(id in detailsRef.current) && !inFlightRef.current.has(id)
    );
    if (missing.length === 0) return;
    missing.forEach((id) => inFlightRef.current.add(id));
    setDetailsBusy(true);
    try {
      for (let i = 0; i < missing.length; i += DETAILS_CHUNK) {
        const chunk = missing.slice(i, i + DETAILS_CHUNK);
        const res = await fetch("/api/prospects/details", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ placeIds: chunk }),
        });
        const d: DetailsResponse = await res.json();
        detailsRef.current = { ...detailsRef.current, ...(d.details ?? {}) };
        setDetails(detailsRef.current);
      }
    } finally {
      missing.forEach((id) => inFlightRef.current.delete(id));
      setDetailsBusy(inFlightRef.current.size > 0);
    }
  }, []);

  const reload = useCallback(
    async (f: Filters): Promise<ProspectsResponse> => {
      const params = new URLSearchParams({ country: f.country, segment: f.segment, status: f.status });
      const res: ProspectsResponse = await (await fetch("/api/prospects?" + params)).json();
      setData(res);
      void fetchDetails(res.rows.map((r) => r.placeId)); // stream in live content
      return res;
    },
    [fetchDetails]
  );

  const loadMarket = useCallback(async (code: string, hs: string) => {
    if (!code) return;
    const m: MarketResponse = await (await fetch(`/api/market?country=${code}&hsCode=${hs}`)).json();
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
      // Restore the saved good-fit keywords (localStorage is client-only, so
      // read it here — after an await — not during SSR/initial render).
      const saved = localStorage.getItem("fitKeywords") ?? "";
      setFitInput(saved);
      setFitKeywords(saved.split(",").map((s) => s.trim()).filter(Boolean));
    })();
  }, []);

  const saveFitKeywords = (v: string) => {
    setFitInput(v);
    localStorage.setItem("fitKeywords", v);
    setFitKeywords(v.split(",").map((s) => s.trim()).filter(Boolean));
  };

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
  // Categories come from the live details we've loaded, not the DB.
  const filterCategories = useMemo(() => {
    const set = new Set<string>();
    for (const r of data?.rows ?? []) {
      const cat = details[r.placeId]?.category;
      if (cat) set.add(cat);
    }
    return ["All", ...[...set].sort()];
  }, [data, details]);

  // Client-side view: apply the filters that depend on live content.
  const displayedRows = useMemo(() => {
    const rows = data?.rows ?? [];
    const { category, website, q } = filters;
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      const d = details[r.placeId];
      if (category !== "All" && (!d || d.category !== category)) return false;
      if (website === "Has site" && (!d || !d.website)) return false;
      if (website === "No site" && (!d || !!d.website)) return false;
      if (needle) {
        const hay = `${d?.company ?? ""} ${r.city ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [data, details, filters]);

  const counts = useMemo(() => {
    const c: Record<string, number> = Object.fromEntries((config?.statuses ?? []).map((s) => [s, 0]));
    for (const r of displayedRows) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [displayedRows, config]);

  // Score each displayed row live (from loaded details + manual emails + the
  // user's target keywords), optionally sorting best-first.
  const scoredRows = useMemo(() => {
    const list = displayedRows.map((r) => ({
      r,
      score: scoreLead({
        detail: details[r.placeId],
        emails: (r.contactEmail ?? "").split(" | ").filter(Boolean),
        targetKeywords: fitKeywords,
      }),
    }));
    if (sortByScore) list.sort((a, b) => (b.score.overall ?? -1) - (a.score.overall ?? -1));
    return list;
  }, [displayedRows, details, fitKeywords, sortByScore]);

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
  const applyHs = () => {
    const hs = hsCode.trim();
    if (countryCode && /^\d{2,6}$/.test(hs)) loadMarket(countryCode, hs);
  };

  const onCountry = (code: string) => {
    setCountryCode(code);
    if (code) {
      loadCities(code);
      loadMarket(code, hsCode.trim());
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

  // Re-pull live business content from Google for the current list (a "hard
  // refresh" — clears the in-memory cache and fetches fresh).
  const refreshLive = () => {
    detailsRef.current = {};
    inFlightRef.current = new Set();
    setDetails({});
    void fetchDetails((data?.rows ?? []).map((r) => r.placeId));
  };

  // Check every saved place_id against Google and delete the permanently-closed
  // ones. Compliant: we only store place_ids, and this fetches status live.
  async function runCleanup() {
    if (
      !window.confirm(
        "Check every saved business against Google and remove the permanently-closed ones?\n\nThis makes one Places lookup per saved business."
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
      setCleanupMsg(`Removed ${d.removed} permanently-closed (of ${d.checked} checked).`);
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
    if (SERVER_KEYS.has(key)) reload(next); // client-only filters just re-render
  };
  const changeFind = (value: string) => setFilters((f) => ({ ...f, q: value }));

  async function save(placeId: string, fields: { status?: string; segment?: string; contactEmail?: string }) {
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
  // Manually-entered contact email (the user typed it themselves). Patch locally
  // so the row doesn't reorder, then persist.
  const onContactEmail = (placeId: string, contactEmail: string) => {
    setData((prev) =>
      prev
        ? { ...prev, rows: prev.rows.map((r) => (r.placeId === placeId ? { ...r, contactEmail } : r)) }
        : prev
    );
    save(placeId, { contactEmail });
  };
  // Note edits update just the affected row in place — no full reload, so the
  // list never re-sorts or jumps under the user while they're writing.
  const patchNotes = (placeId: string, fn: (notes: ProspectNote[]) => ProspectNote[]) =>
    setData((prev) =>
      prev
        ? { ...prev, rows: prev.rows.map((r) => (r.placeId === placeId ? { ...r, notes: fn(r.notes) } : r)) }
        : prev
    );

  const addNote = async (placeId: string, body: string) => {
    const res = await fetch("/api/prospects/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ place_id: placeId, body }),
    });
    const d = await res.json();
    if (d.note) patchNotes(placeId, (notes) => [d.note as ProspectNote, ...notes]);
  };
  const deleteNote = async (placeId: string, id: number) => {
    await fetch("/api/prospects/notes", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    patchNotes(placeId, (notes) => notes.filter((n) => n.id !== id));
  };


  async function refreshMarket() {
    if (!selectedCountry?.isoNumeric) {
      setMarketMsg("This country has no UN numeric code, so Comtrade data isn't available.");
      return;
    }
    const hs = hsCode.trim();
    if (!/^\d{2,6}$/.test(hs)) {
      setMarketMsg("Product code must be a 2–6 digit HS code.");
      return;
    }
    setMarketBusy(true);
    setMarketMsg(`Fetching ${selectedCountry.name} imports (HS ${hs})…`);
    try {
      const res = await fetch("/api/market/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reporterCode: selectedCountry.isoNumeric, country: selectedCountry.name, hsCode: hs }),
      });
      const d = await res.json();
      if (!res.ok) return setMarketMsg(d.error || "Refresh failed.");
      if (!d.upserted) return setMarketMsg(d.note || "No data returned.");
      const yrs = d.years ?? [];
      setMarketMsg(
        `Updated ${d.upserted} year(s) for ${d.country}` +
          (yrs.length ? ` (${yrs[0]}–${yrs[yrs.length - 1]}).` : ".")
      );
      await loadMarket(countryCode, hs);
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
        await reload(filters);
      }

      setSearchMsg(`Added ${added} new, refreshed ${updated}.`);
    } catch {
      setSearchMsg("Could not reach the server. Please try again.");
    } finally {
      setSearching(false);
    }
  }

  const label = "mb-1 block text-[11px] tracking-[0.05em] text-steel";

  return (
    <>
      <header className="flex items-center gap-3.5 border-b-[3px] border-ember-dk bg-ember px-[22px] py-3.5 text-white">
        <Brand />
        <button
          onClick={async () => {
            await fetch("/api/auth/logout", { method: "POST" });
            window.location.href = "/login";
          }}
          className="ml-auto text-xs text-white/80 hover:text-white"
        >
          Log out
        </button>
      </header>

      <AdSlot />

      <main className="mx-auto w-full max-w-[1220px] px-[22px] pb-16 pt-5">
        {/* Search panel */}
        <section className="mb-4 border border-line bg-panel px-[18px] py-4">
          <h2 className="mb-3 text-[11px] uppercase tracking-[0.16em] text-mute">Find companies</h2>

          <div className="flex flex-wrap items-end gap-2.5">
            <div>
              <label htmlFor="continent" className={label}>Continent</label>
              <select id="continent" value={continentCode} onChange={(e) => onContinent(e.target.value)} className="control min-w-[140px]">
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
                className="control min-w-[180px] disabled:opacity-50"
              >
                <option value="">{continentCode ? "Select country" : "—"}</option>
                {continentCountries.map((c) => (
                  <option key={c.code} value={c.code}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="min-w-[200px] flex-1">
              <label htmlFor="keyword" className={label}>What to search for</label>
              <input
                id="keyword"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runSearch()}
                placeholder="e.g. distributor, contractor, supplier…"
                className="control w-full"
              />
            </div>
            <div>
              <label htmlFor="segment" className={label}>Tag new results as</label>
              <select id="segment" value={segment} onChange={(e) => setSegment(e.target.value)} className="control min-w-[160px]">
                <option value="">Don&apos;t tag</option>
                {segments.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>
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

          {/* Good-fit keywords — drive the Fit half of the lead score */}
          <div className="mt-3 border-t border-line pt-3">
            <label htmlFor="fitkw" className="mb-1.5 block text-[11px] tracking-[0.05em] text-steel">
              Good-fit keywords <span className="text-mute">— categories worth selling to (for the Fit score)</span>
            </label>
            <input
              id="fitkw"
              value={fitInput}
              onChange={(e) => saveFitKeywords(e.target.value)}
              placeholder="e.g. distributor, contractor, building materials, hardware"
              className="control w-full text-xs"
            />
          </div>

          {searchMsg && <div className="mt-2.5 text-xs text-mute">{searchMsg}</div>}
        </section>

        {/* Market intelligence (v2) */}
        <section className="mb-4 border border-line bg-panel px-[18px] py-4">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-[11px] uppercase tracking-[0.16em] text-mute">
              Market — import statistics
            </h2>
            <label className="clickable flex items-center gap-1.5 text-xs text-steel" title="UN HS product code (2–6 digits). 730830 = steel doors & frames.">
              Product code (HS)
              <input
                value={hsCode}
                onChange={(e) => setHsCode(e.target.value)}
                onBlur={applyHs}
                onKeyDown={(e) => e.key === "Enter" && applyHs()}
                placeholder="730830"
                className="control control-sm w-[90px]"
              />
            </label>
            <button
              onClick={refreshMarket}
              disabled={marketBusy || !countryCode || !selectedCountry?.isoNumeric || !/^\d{2,6}$/.test(hsCode.trim())}
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
              No import data for {selectedCountry?.name ?? "this country"} (HS {hsCode}) yet.
              {selectedCountry?.isoNumeric
                ? " Click “Refresh data” to pull it from UN Comtrade."
                : " (This country has no UN numeric code, so Comtrade data isn’t available.)"}
            </p>
          )}

          <p className="mt-2.5 text-[10px] text-mute">
            Import statistics from UN Comtrade for the selected country and product code
            (HS). Change the code to research any product (e.g. 730830 = steel doors).
            Trade data typically lags 1–2 years.
          </p>
        </section>

        {/* Stats strip + actions (buttons aligned to the bottom) */}
        <div className="mb-3.5 flex flex-wrap items-end gap-2">
          <Stat label="SHOWING" value={displayedRows.length} />
          {config?.statuses.map((s) => (
            <Stat key={s} label={s.toUpperCase()} value={counts[s] ?? 0} />
          ))}
          <div className="ml-auto flex flex-wrap gap-2">
            <button onClick={showAll} className="btn btn-ghost">Show all</button>
          </div>
        </div>

        {/* Filters (one row) */}
        <div className="mb-3 flex flex-wrap items-end gap-2.5">
          <FilterSelect label="Country" value={filters.country} options={filterCountries} onChange={(v) => changeFilter("country", v)} width="min-w-[150px]" />
          <FilterSelect label="Segment" value={filters.segment} options={filterSegments} onChange={(v) => changeFilter("segment", v)} width="min-w-[140px]" />
          <FilterSelect label="Category" value={filters.category} options={filterCategories} onChange={(v) => changeFilter("category", v)} width="min-w-[150px]" />
          <FilterSelect label="Status" value={filters.status} options={["All", ...(config?.statuses ?? [])]} onChange={(v) => changeFilter("status", v)} width="w-[120px] min-w-[120px]" />
          <FilterSelect label="Website" value={filters.website} options={["All", "Has site", "No site"]} onChange={(v) => changeFilter("website", v)} width="w-[120px] min-w-[120px]" />
          <div className="min-w-[150px] flex-1">
            <label className={label}>Find in list</label>
            <input value={filters.q} onChange={(e) => changeFind(e.target.value)} placeholder="company or city" className="control w-full" />
          </div>
        </div>

        {/* Utility row: live-data controls */}
        <div className="mb-2 flex flex-wrap items-center gap-4">
          <button
            onClick={refreshLive}
            disabled={detailsBusy || (data?.rows.length ?? 0) === 0}
            className="text-xs text-mute underline-offset-2 hover:text-ember-dk hover:underline disabled:opacity-50"
          >
            {detailsBusy ? "Loading live data…" : "Refresh live data"}
          </button>
          <button
            onClick={runCleanup}
            disabled={cleanupBusy}
            className="text-xs text-mute underline-offset-2 hover:text-ember-dk hover:underline disabled:opacity-50"
          >
            {cleanupBusy ? "Checking…" : "Remove permanently-closed"}
          </button>
          <label className="clickable ml-auto flex items-center gap-1.5 text-xs text-steel" title="Sort the list by lead score, best first">
            <input type="checkbox" checked={sortByScore} onChange={(e) => setSortByScore(e.target.checked)} />
            Sort by score
          </label>
          {cleanupMsg && <span className="text-xs text-mute">{cleanupMsg}</span>}
        </div>

        {/* Results table */}
        {displayedRows.length === 0 ? (
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
                  {["Score", "Company", "Segment", "Location", "Contact details", "Status", "Notes"].map((h) => (
                    <th key={h} className="border-b border-line bg-[#f6f8fa] p-2.5 text-left text-[10px] uppercase tracking-[0.1em] text-mute">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {scoredRows.map(({ r, score }) => (
                  <Row
                    key={r.placeId}
                    r={r}
                    d={details[r.placeId]}
                    score={score}
                    statuses={config?.statuses ?? []}
                    segments={segments}
                    onStatus={onStatus}
                    onOpenNotes={() => setNotesFor(r.placeId)}
                    onAnalyze={() => setAnalyzeFor(r.placeId)}
                    onContactEmail={onContactEmail}
                    onTag={onTag}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {displayedRows.length > 0 && (
          <p className="mt-2.5 text-[11px] text-mute">
            Business names, phones, websites and addresses are fetched live from Google
            when a row is shown — they are not stored. The WhatsApp link is generated
            from the phone number and may not be registered on WhatsApp.
          </p>
        )}
      </main>

      <SiteFooter />

      {notesFor && (
        <NotesModal
          title={details[notesFor]?.company || notesFor}
          subtitle={(() => {
            const r = data?.rows.find((x) => x.placeId === notesFor);
            return r ? [r.city, r.country].filter(Boolean).join(", ") : "";
          })()}
          notes={data?.rows.find((x) => x.placeId === notesFor)?.notes ?? []}
          onAdd={(body) => addNote(notesFor, body)}
          onDelete={(id) => deleteNote(notesFor, id)}
          onClose={() => setNotesFor(null)}
        />
      )}

      {analyzeFor && (
        <SiteAnalysisModal
          title={details[analyzeFor]?.company || analyzeFor}
          website={details[analyzeFor]?.website || ""}
          onClose={() => setAnalyzeFor(null)}
        />
      )}
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
  width = "min-w-[150px]",
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  width?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] tracking-[0.05em] text-steel">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={`control ${width}`}>
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </div>
  );
}

function ScoreBadge({ score }: { score: LeadScore }) {
  if (score.overall == null) return <span className="text-xs text-mute">…</span>;
  const v = score.overall;
  const bg = v >= 67 ? "bg-status-replied" : v >= 34 ? "bg-status-contacted" : "bg-status-new";
  const parts = [
    `Overall ${v}`,
    score.fit != null ? `Fit ${score.fit}` : "Fit — (set good-fit keywords)",
    `Reach ${score.reach}`,
  ];
  if (score.reasons.length) parts.push(score.reasons.join(", "));
  return (
    <span
      title={parts.join(" · ")}
      className={`inline-block min-w-[30px] px-1.5 py-0.5 text-center text-xs font-semibold text-white ${bg}`}
    >
      {v}
    </span>
  );
}

function Row({
  r,
  d,
  score,
  statuses,
  segments,
  onStatus,
  onOpenNotes,
  onAnalyze,
  onContactEmail,
  onTag,
}: {
  r: ProspectRow;
  d: LiveDetails | undefined;
  score: LeadScore;
  statuses: string[];
  segments: string[];
  onStatus: (placeId: string, status: string) => void;
  onOpenNotes: () => void;
  onAnalyze: () => void;
  onContactEmail: (placeId: string, contactEmail: string) => void;
  onTag: (placeId: string, segmentStr: string) => void;
}) {
  const tags = (r.segment ?? "").split(" | ").filter(Boolean);
  const addable = segments.filter((s) => !tags.includes(s));
  const cell = "border-b border-line p-2.5 align-top";
  const closed = d?.businessStatus === "CLOSED_PERMANENTLY";
  const loading = !d;

  // Manually-entered contact emails, stored as a " | "-joined list.
  const emails = (r.contactEmail ?? "").split(" | ").map((s) => s.trim()).filter(Boolean);
  const addEmail = (el: HTMLInputElement) => {
    const v = el.value.trim();
    if (!v || !isEmail(v)) return; // ignore empty / not-an-email (leave text to fix)
    if (!emails.includes(v)) onContactEmail(r.placeId, [...emails, v].join(" | "));
    el.value = "";
  };

  return (
    <tr>
      <td className={cell}>
        <ScoreBadge score={score} />
      </td>
      <td className={cell}>
        {/* Cap the company column so long names wrap instead of squeezing the
            rest of the row (keeps the phone on one line). */}
        <div className="max-w-[320px] break-words">
          {loading ? (
            <div className="font-semibold text-mute">Loading…</div>
          ) : (
            <div className="font-semibold">{d.company || <span className="text-mute">—</span>}</div>
          )}
          {d?.category && <div className="text-xs text-mute">{d.category}</div>}
          {closed && <div className="text-xs font-semibold text-status-nofit">Permanently closed</div>}
          <div className="mt-0.5 flex gap-2 text-xs">
            {d?.googleMapsUrl && (
              <a href={d.googleMapsUrl} target="_blank" rel="noopener noreferrer" className="text-ember-dk hover:underline">
                map
              </a>
            )}
            {d?.website && (
              <a href={d.website} target="_blank" rel="noopener noreferrer" className="text-ember-dk hover:underline">
                site
              </a>
            )}
            {d?.website && (
              <button onClick={onAnalyze} className="text-ember-dk hover:underline" title="Read business signals from the company website">
                analyze
              </button>
            )}
          </div>
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

      {/* Contact details: phone + WhatsApp (live from Google Places) */}
      <td className={cell}>
        <div className="whitespace-nowrap font-mono text-xs">
          {loading ? <span className="text-mute">…</span> : d.phone || <span className="text-mute">—</span>}
        </div>
        {d?.wa && (
          <div className="mt-1 text-xs">
            <a
              href={d.wa}
              target="_blank"
              rel="noopener noreferrer"
              title="WhatsApp link generated from the phone number (via Google Places). The number may not be registered on WhatsApp."
              aria-label="Open WhatsApp for this phone number (may not be registered on WhatsApp)"
              className="text-ember-dk hover:underline"
            >
              WhatsApp
            </a>
          </div>
        )}
        {/* Manually-entered contact emails (the user typed them — their own data). */}
        <div className="mt-1.5 space-y-1">
          {emails.map((e) => (
            <div key={e} className="flex items-center gap-1">
              <a href={`mailto:${e}`} className="break-all font-mono text-xs text-ember-dk hover:underline">
                {e}
              </a>
              <button
                onClick={() => onContactEmail(r.placeId, emails.filter((x) => x !== e).join(" | "))}
                className="text-[11px] text-mute hover:text-status-nofit"
                aria-label={`Remove ${e}`}
              >
                ×
              </button>
            </div>
          ))}
          <input
            key={`${r.placeId}:email:${emails.length}`}
            onKeyDown={(ev) => {
              if (ev.key === "Enter") {
                ev.preventDefault();
                addEmail(ev.currentTarget);
              }
            }}
            onBlur={(ev) => addEmail(ev.currentTarget)}
            placeholder="+ add email"
            aria-label="Add contact email"
            className="control control-sm w-full font-mono text-[11px]"
          />
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
      <td className={cell} style={{ minWidth: 140 }}>
        {(() => {
          const latest = r.notes[0];
          return (
            <button
              onClick={onOpenNotes}
              className="w-full border border-line px-2 py-1 text-left text-xs hover:border-ember hover:text-ember-dk"
              title={latest ? latest.body : "Add a note"}
            >
              <span className="font-semibold">
                {r.notes.length > 0 ? `Notes · ${r.notes.length}` : "+ Add note"}
              </span>
              {latest && (
                <span className="mt-0.5 block truncate text-[11px] text-mute">{latest.body}</span>
              )}
            </button>
          );
        })()}
      </td>
    </tr>
  );
}

const noteDateFmt = new Intl.DateTimeFormat(undefined, {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const fmtNoteDate = (iso: string) => noteDateFmt.format(new Date(iso));

function NotesModal({
  title,
  subtitle,
  notes,
  onAdd,
  onDelete,
  onClose,
}: {
  title: string;
  subtitle: string;
  notes: ProspectNote[];
  onAdd: (body: string) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = async () => {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      await onAdd(body);
      setText("");
      inputRef.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center"
      onMouseDown={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Notes for ${title}`}
    >
      <div
        className="w-full max-w-[520px] border border-line bg-panel shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-line bg-ink px-4 py-3 text-white">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{title}</div>
            {subtitle && <div className="truncate text-xs text-[#9aa3af]">{subtitle}</div>}
          </div>
          <button onClick={onClose} className="text-[#9aa3af] hover:text-white" aria-label="Close notes">
            ✕
          </button>
        </div>

        {/* Add box */}
        <div className="border-b border-line p-4">
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                submit();
              }
            }}
            rows={3}
            placeholder="Add a note…"
            className="control w-full text-sm"
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[10px] text-mute">⌘/Ctrl+Enter to save</span>
            <button onClick={submit} disabled={busy || !text.trim()} className="btn btn-primary btn-sm">
              {busy ? "Adding…" : "Add note"}
            </button>
          </div>
        </div>

        {/* Log (newest first), scrollable so the popup never grows without bound */}
        <div className="max-h-[46vh] overflow-y-auto p-4">
          {notes.length === 0 ? (
            <p className="text-center text-xs text-mute">No notes yet.</p>
          ) : (
            <ul className="space-y-2">
              {notes.map((n) => (
                <li key={n.id} className="border border-line bg-[#f6f8fa] px-3 py-2">
                  <div className="whitespace-pre-wrap break-words text-sm text-ink">{n.body}</div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <time dateTime={n.createdAt} className="font-mono text-[10px] text-mute">
                      {fmtNoteDate(n.createdAt)}
                    </time>
                    <button
                      onClick={() => onDelete(n.id)}
                      className="text-[10px] text-mute hover:text-status-nofit"
                      aria-label="Delete note"
                    >
                      delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * On-demand website analysis popup. Reads the company's own site live and shows
 * non-personal business signals (certifications, business type, company
 * socials). Nothing is stored; each open re-reads the site.
 */
function SiteAnalysisModal({
  title,
  website,
  onClose,
}: {
  title: string;
  website: string;
  onClose: () => void;
}) {
  const [state, setState] = useState<"loading" | "error" | "done">("loading");
  const [analysis, setAnalysis] = useState<WebsiteAnalysis | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/prospects/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ website }),
        });
        const d: AnalyzeResponse & { error?: string } = await res.json();
        if (cancelled) return;
        if (!res.ok || !d.analysis) setState("error");
        else {
          setAnalysis(d.analysis);
          setState("done");
        }
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
      window.removeEventListener("keydown", onKey);
    };
  }, [website, onClose]);

  const empty =
    analysis &&
    analysis.businessTypes.length === 0 &&
    analysis.certifications.length === 0 &&
    analysis.socials.length === 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center"
      onMouseDown={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Website analysis for ${title}`}
    >
      <div className="w-full max-w-[520px] border border-line bg-panel shadow-xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-line bg-ink px-4 py-3 text-white">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{title}</div>
            <div className="truncate text-xs text-[#9aa3af]">Website signals · live, not stored</div>
          </div>
          <button onClick={onClose} className="text-[#9aa3af] hover:text-white" aria-label="Close analysis">
            ✕
          </button>
        </div>

        <div className="p-4">
          {state === "loading" && <p className="text-center text-xs text-mute">Reading the company website…</p>}
          {state === "error" && (
            <p className="text-center text-xs text-mute">
              Couldn&apos;t read this website (it may block automated visits). Try the “site” link directly.
            </p>
          )}
          {state === "done" && analysis && (
            <div className="space-y-3 text-sm">
              <AnalysisGroup label="Business type" items={analysis.businessTypes} />
              <AnalysisGroup label="Certifications / standards" items={analysis.certifications} />
              <div>
                <div className="mb-1 text-[11px] uppercase tracking-[0.1em] text-mute">Company social profiles</div>
                {analysis.socials.length === 0 ? (
                  <span className="text-xs text-mute">—</span>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {analysis.socials.map((s) => (
                      <a
                        key={s.label}
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="border border-line px-2 py-1 text-xs text-ember-dk hover:border-ember"
                      >
                        {s.label}
                      </a>
                    ))}
                  </div>
                )}
              </div>
              {empty && (
                <p className="text-center text-xs text-mute">No signals detected on the site.</p>
              )}
              <p className="border-t border-line pt-2 text-[10px] text-mute">
                Read live from the company&apos;s own website. Non-personal business signals only — nothing is stored.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AnalysisGroup({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <div className="mb-1 text-[11px] uppercase tracking-[0.1em] text-mute">{label}</div>
      {items.length === 0 ? (
        <span className="text-xs text-mute">—</span>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {items.map((it) => (
            <span key={it} className="border border-line bg-[#f6f8fa] px-2 py-0.5 text-xs text-steel">
              {it}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
