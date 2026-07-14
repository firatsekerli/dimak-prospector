// Public contact-email extraction — server-side only (browsers can't fetch
// arbitrary sites). Preserves reference/app.py behavior exactly.

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const EMAIL_BLOCKLIST = ["example.com", "sentry.io", "wixpress.com", "@2x", ".png", ".jpg"];

// Common contact paths, tried in order until one yields addresses.
const PATHS = ["", "/contact", "/contact-us", "/iletisim", "/about"];
const USER_AGENT = "Mozilla/5.0 (compatible; DimakProspector/1.0)";
const FETCH_TIMEOUT_MS = 8000;

export function extractEmails(html: string): string[] {
  if (!html) return [];
  const out: string[] = [];
  for (const match of html.match(EMAIL_RE) ?? []) {
    const e = match.toLowerCase().replace(/\.+$/, ""); // lowercase, strip trailing dots
    if (EMAIL_BLOCKLIST.some((bad) => e.includes(bad))) continue;
    if (!out.includes(e)) out.push(e);
  }
  return out;
}

async function fetchText(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
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
