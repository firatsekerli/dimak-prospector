// On-demand website analysis — server-side only. Reads a company's OWN public
// website and extracts non-personal *business* signals (certifications, what
// kind of business it describes itself as, and company social profiles). It
// deliberately extracts NO personal data (no names, no personal emails) and the
// result is never stored — it is shown live for the session, like the Google
// business fields. This keeps it clear of the mailing-list and privacy issues
// that ruled out email harvesting.

const FETCH_TIMEOUT_MS = 8000;

// Home + a few common "about/products" pages (not contact pages — we're not
// after contact info here).
const PATHS = ["", "/about", "/about-us", "/hakkimizda", "/company", "/products", "/services"];
const MAX_PAGES = 4;

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

// Business-type words a company uses to describe itself (non-personal).
const BUSINESS_TYPES = [
  "manufacturer",
  "factory",
  "distributor",
  "wholesaler",
  "supplier",
  "dealer",
  "importer",
  "exporter",
  "trading",
  "contractor",
  "retailer",
];

// Certifications / standards — specific patterns to limit false positives.
const CERTIFICATIONS: { label: string; re: RegExp }[] = [
  { label: "ISO 9001", re: /ISO\s?9001/i },
  { label: "ISO 14001", re: /ISO\s?14001/i },
  { label: "ISO 45001", re: /ISO\s?45001/i },
  { label: "EN 1634", re: /EN\s?1634/i },
  { label: "EN 13501", re: /EN\s?13501/i },
  { label: "BS 476", re: /BS\s?476/i },
  { label: "CE", re: /\bCE[\s-]?(mark|marking|marked|certified)\b/i },
  { label: "TSE", re: /\bTSE\b/ },
  { label: "SASO", re: /\bSASO\b/i },
  { label: "UKCA", re: /\bUKCA\b/i },
  { label: "UL", re: /\bUL[\s-]?(listed|certified|classified)\b/i },
];

// Company social profiles. LinkedIn is limited to /company/ pages so we never
// capture a personal profile (/in/…), which would be personal data.
const SOCIALS: { label: string; re: RegExp }[] = [
  { label: "LinkedIn", re: /https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/company\/[A-Za-z0-9._%-]+/i },
  { label: "Instagram", re: /https?:\/\/(?:www\.)?instagram\.com\/[A-Za-z0-9._]+/i },
  { label: "Facebook", re: /https?:\/\/(?:www\.)?facebook\.com\/[A-Za-z0-9.\-/]+/i },
  { label: "YouTube", re: /https?:\/\/(?:www\.)?youtube\.com\/(?:@|channel\/|c\/|user\/)[A-Za-z0-9._-]+/i },
  { label: "X / Twitter", re: /https?:\/\/(?:www\.)?(?:twitter|x)\.com\/[A-Za-z0-9._]+/i },
];

export interface WebsiteAnalysis {
  businessTypes: string[];
  certifications: string[];
  socials: { label: string; url: string }[];
}

async function fetchText(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: BROWSER_HEADERS, redirect: "follow", signal: controller.signal });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch a company site (home + a few about/products pages) and pull non-personal
 * business signals. Returns empty arrays if the site can't be read (many sites
 * behind a JS/Cloudflare challenge won't serve a plain fetch).
 */
export async function analyzeWebsite(website: string): Promise<WebsiteAnalysis> {
  const base = website.replace(/\/+$/, "");
  let html = "";
  for (const path of PATHS.slice(0, MAX_PAGES)) {
    const page = await fetchText(base + path);
    if (page) html += "\n" + page;
  }

  const businessTypes: string[] = [];
  if (html) {
    const text = html.toLowerCase();
    for (const t of BUSINESS_TYPES) {
      if (new RegExp(`\\b${t}\\b`).test(text)) businessTypes.push(t[0].toUpperCase() + t.slice(1));
    }
  }

  const certifications: string[] = [];
  for (const c of CERTIFICATIONS) {
    if (c.re.test(html) && !certifications.includes(c.label)) certifications.push(c.label);
  }

  const socials: { label: string; url: string }[] = [];
  const seen = new Set<string>();
  for (const s of SOCIALS) {
    const m = html.match(s.re);
    if (m && !seen.has(s.label)) {
      seen.add(s.label);
      socials.push({ label: s.label, url: m[0] });
    }
  }

  return { businessTypes, certifications, socials };
}
