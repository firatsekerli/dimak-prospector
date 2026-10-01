import type { LiveDetails, ContactInfo } from "./types";

// A transparent, rule-based lead score computed live in the browser from data
// already loaded — no black box, and nothing extra is stored. Two axes:
//   Reach — how easily you can contact them (phone / website / email / open).
//           Phone & website come from the paid contact tier, so they only count
//           once you've loaded a lead's contact ("Show contact"); until then
//           Reach reflects email + open status.
//   Fit   — whether they're the right kind of company, judged from what GOOGLE
//           says the business is (its category + name), never the user's own tag.

// Business-type words that signal a plausible fire-door buyer or reseller. A
// normal user thinks in PRODUCTS ("fire door"), but Google labels BUSINESS TYPES
// ("Manufacturer", "Hardware store"). So we bake in the domain knowledge here —
// the user never has to learn Google's category labels. Matched as substrings
// against the category + name. Editable in one place to tune per industry.
export const RELEVANT_CATEGORY_HINTS = [
  "door", "manufacturer", "hardware", "building material", "building supply",
  "construction", "contractor", "supplier", "wholesal", "distribut", "metal",
  "steel", "iron", "alumin", "glass", "window", "joinery", "carpentry", "timber",
  "lumber", "interior", "fit out", "fitout", "architect", "industrial", "trading",
  "home improvement", "home goods", "furniture", "fire",
];
const STOPWORDS = new Set(["and", "the", "for", "with", "shpk"]);

export type LeadScore = {
  reach: number | null; // 0–100, null until basic details load
  fit: number | null; // 0–100, null until basic details load
  overall: number | null;
  closed: boolean;
  reasons: string[]; // short human-readable factors, for the tooltip
};

export function scoreLead(opts: {
  detail?: LiveDetails;
  contact?: ContactInfo;
  emails: string[];
  targetKeywords: string[];
}): LeadScore {
  const { detail, contact, emails, targetKeywords } = opts;
  if (!detail) return { reach: null, fit: null, overall: null, closed: false, reasons: [] };

  const closed = detail.businessStatus === "CLOSED_PERMANENTLY";
  const reasons: string[] = [];

  // Reach: phone 40 + website 30 + email 30. Phone/website are only known once
  // contact is loaded, so before that (and with no email) reachability is
  // UNKNOWN (null), not zero — otherwise a good lead looks bad before you pay
  // to load its contact.
  let reach: number | null;
  if (closed) {
    reach = 0;
    reasons.push("permanently closed");
  } else if (!contact && emails.length === 0) {
    reach = null; // unknown until you load contact or add an email
  } else {
    reach = 0;
    if (contact?.phone) { reach += 40; reasons.push("phone"); }
    if (contact?.website) { reach += 30; reasons.push("website"); }
    if (emails.length) { reach += 30; reasons.push("email"); }
  }

  // Fit: judged from Google's category + name (never the user's tag). Two signals:
  //   - typeHit: the category/name looks like a relevant business type (built-in
  //     list above) — so a hardware store or manufacturer scores well even if the
  //     user's keywords don't mention those words.
  //   - userHit: the user's product keywords (tokenized, so "fire door" → fire,
  //     door) appear in the category/name — extra specificity.
  // 10 base + 45 per signal → 10 (off-target) / 55 (one) / 100 (both). Website is
  // deliberately NOT counted here (it belongs to Reach), so Fit stays stable when
  // you load a lead's contact.
  let fit: number | null = null;
  if (!closed) {
    const hay = `${detail.category ?? ""} ${detail.company ?? ""}`.toLowerCase();
    const typeHit = RELEVANT_CATEGORY_HINTS.some((h) => hay.includes(h));
    const userTokens = targetKeywords
      .flatMap((k) => k.toLowerCase().split(/[^a-z0-9]+/))
      .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
    const userHit = userTokens.some((t) => hay.includes(t));
    fit = 10 + (typeHit ? 45 : 0) + (userHit ? 45 : 0);
    reasons.push(typeHit || userHit ? "relevant type" : "off-target");
  }

  // Overall favors Fit (are they the right company?) over Reach (can I contact
  // them?). When reachability is still unknown, score on Fit alone.
  let overall: number | null;
  if (closed) overall = 0;
  else if (fit == null && reach == null) overall = null;
  else if (fit == null) overall = reach;
  else if (reach == null) overall = fit;
  else overall = Math.round(0.6 * fit + 0.4 * reach);

  return { reach, fit, overall, closed, reasons };
}
