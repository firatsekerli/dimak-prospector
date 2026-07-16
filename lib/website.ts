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

// Generic/utility path segments that are NOT a company profile (share widgets,
// login, locale roots like facebook.com/tr, etc.). Any social link whose first
// path segment is one of these — or a bare 2-letter locale code — is ignored.
const GENERIC_SEG = new Set([
  "sharer", "sharer.php", "share.php", "share", "dialog", "plugins", "login", "signup",
  "home", "help", "about", "privacy", "policy", "policies", "terms", "cookie", "cookies",
  "intent", "i", "search", "hashtag", "explore", "p", "accounts", "l.php", "permalink.php",
  "watch", "events", "groups", "profile.php", "tr.php", "reel", "story.php",
]);

function firstSeg(path: string): string {
  return path.replace(/^\/+/, "").split(/[/?#]/)[0].toLowerCase();
}
function isRealHandle(seg: string): boolean {
  if (!seg || seg.length < 2) return false;
  if (GENERIC_SEG.has(seg)) return false;
  if (/^[a-z]{2}$/.test(seg)) return false; // bare locale code, e.g. facebook.com/tr
  return true;
}

// Pull at most one real profile per platform. LinkedIn is limited to /company/
// pages so we never capture a personal profile (/in/…), which is personal data.
function extractSocials(html: string): { label: string; url: string }[] {
  const out: { label: string; url: string }[] = [];
  const add = (label: string, url: string) => {
    if (!out.some((o) => o.label === label)) out.push({ label, url });
  };

  for (const m of html.matchAll(/https?:\/\/(?:[a-z.]+\.)?linkedin\.com\/company\/([A-Za-z0-9._%-]+)/gi)) {
    add("LinkedIn", `https://www.linkedin.com/company/${m[1]}`);
    break;
  }
  for (const m of html.matchAll(/https?:\/\/(?:www\.)?instagram\.com\/([A-Za-z0-9._]+)/gi)) {
    if (isRealHandle(m[1].toLowerCase())) { add("Instagram", `https://instagram.com/${m[1]}`); break; }
  }
  for (const m of html.matchAll(/https?:\/\/(?:[a-z-]+\.)?facebook\.com\/([A-Za-z0-9._%\-/]+)/gi)) {
    if (isRealHandle(firstSeg(m[1]))) { add("Facebook", `https://facebook.com/${m[1].split(/[?#]/)[0]}`); break; }
  }
  for (const m of html.matchAll(/https?:\/\/(?:www\.)?youtube\.com\/((?:@|channel\/|c\/|user\/)[A-Za-z0-9._-]+)/gi)) {
    add("YouTube", `https://youtube.com/${m[1]}`);
    break;
  }
  for (const m of html.matchAll(/https?:\/\/(?:www\.)?(?:twitter|x)\.com\/([A-Za-z0-9._]+)/gi)) {
    if (isRealHandle(m[1].toLowerCase())) { add("X / Twitter", `https://x.com/${m[1]}`); break; }
  }
  return out;
}

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

  const socials = extractSocials(html);

  return { businessTypes, certifications, socials };
}
