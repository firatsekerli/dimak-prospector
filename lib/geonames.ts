// GeoNames client — server-side only. Free geographic database; auth is a
// username query param (GEONAMES_USERNAME). We fetch the country list once and
// each country's top cities once, then cache in Postgres.

const BASE = "https://secure.geonames.org";
const TIMEOUT_MS = 15000;

// Continents we support (GeoNames continent codes).
export const SUPPORTED_CONTINENTS: Record<string, string> = {
  AS: "Asia",
  EU: "Europe",
  AF: "Africa",
};

export interface GeoCountry {
  code: string; // ISO2
  name: string;
  continent: string; // AS/EU/AF/...
  continentName: string;
  isoNumeric: number | null; // UN M49
}

export interface GeoCity {
  city: string;
  adminName: string;
  population: number | null;
}

async function getJson(url: string): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal: controller.signal });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`GeoNames ${res.status}: ${text.slice(0, 150)}`);
    }
    const json = (await res.json()) as Record<string, unknown>;
    // GeoNames returns { status: { message, value } } on errors (bad username,
    // web services not enabled, hourly limit, ...).
    const status = json.status as { message?: string } | undefined;
    if (status?.message) throw new Error(`GeoNames: ${status.message}`);
    return json;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchCountries(username: string): Promise<GeoCountry[]> {
  const json = await getJson(`${BASE}/countryInfoJSON?username=${encodeURIComponent(username)}`);
  const list = (json.geonames as Record<string, unknown>[]) ?? [];
  return list
    .map((c) => ({
      code: String(c.countryCode ?? ""),
      name: String(c.countryName ?? ""),
      continent: String(c.continent ?? ""),
      continentName: String(c.continentName ?? ""),
      isoNumeric: c.isoNumeric != null && c.isoNumeric !== "" ? Number(c.isoNumeric) : null,
    }))
    .filter((c) => c.code && c.name);
}

export async function fetchCities(
  username: string,
  countryCode: string,
  max = 10
): Promise<GeoCity[]> {
  const url =
    `${BASE}/searchJSON?country=${encodeURIComponent(countryCode)}` +
    `&featureClass=P&orderby=population&maxRows=${max}&username=${encodeURIComponent(username)}`;
  const json = await getJson(url);
  const list = (json.geonames as Record<string, unknown>[]) ?? [];
  return list
    .map((c) => ({
      city: String(c.name ?? ""),
      adminName: String(c.adminName1 ?? ""),
      population: c.population != null && c.population !== "" ? Number(c.population) : null,
    }))
    .filter((c) => c.city);
}
