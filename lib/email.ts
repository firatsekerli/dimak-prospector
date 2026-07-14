// Public contact-email extraction — server-side only (browsers can't fetch
// arbitrary sites). Preserves reference/app.py behavior exactly.

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const EMAIL_BLOCKLIST = ["example.com", "sentry.io", "wixpress.com", "@2x", ".png", ".jpg"];

// Common contact paths, tried in order until one yields addresses.
const PATHS = ["", "/contact", "/contact-us", "/iletisim", "/about"];
const FETCH_TIMEOUT_MS = 8000;

// A realistic browser User-Agent + headers so sites that reject unknown clients
// (many use basic bot filtering) still serve their HTML. Sites behind a full
// JS/Cloudflare challenge still can't be read without a real browser.
const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

export function extractEmails(html: string): string[] {
  if (!html) return [];
  const out: string[] = [];
  for (const match of html.match(EMAIL_RE) ?? []) {
    const e = match
      .toLowerCase()
      .replace(/^(?:%[0-9a-f]{2})+/, "") // strip leading URL-encoded bytes (e.g. %20)
      .replace(/\.+$/, ""); // strip trailing dots
    if (!e || EMAIL_BLOCKLIST.some((bad) => e.includes(bad))) continue;
    if (!out.includes(e)) out.push(e);
  }
  return out;
}

async function fetchText(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: BROWSER_HEADERS,
      redirect: "follow",
      signal: controller.signal,
    });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Visit a company site (home + common contact paths) and pull up to 3 emails.
 * Stops at the first path that yields any addresses. Returns them joined by " | ".
 */
export async function enrichEmail(website: string): Promise<string> {
  if (!website) return "";
  const base = website.replace(/\/+$/, "");
  const emails: string[] = [];

  for (const path of PATHS) {
    const html = await fetchText(base + path);
    if (html) {
      for (const e of extractEmails(html)) {
        if (!emails.includes(e)) emails.push(e);
      }
    }
    if (emails.length) break; // got something on the first productive page
  }

  return emails.slice(0, 3).join(" | ");
}
