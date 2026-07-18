import type { LiveDetails, ContactInfo } from "./types";

// A transparent, rule-based lead score computed live in the browser from data
// already loaded — no black box, and nothing extra is stored. Two axes:
//   Reach — how easily you can contact them (phone / website / email / open).
//           Phone & website come from the paid contact tier, so they only count
//           once you've loaded a lead's contact ("Show contact"); until then
//           Reach reflects email + open status.
//   Fit   — whether they're the right kind of company (category vs your target
//           keywords). Fit needs the user's target keywords to be meaningful.

export type LeadScore = {
  reach: number | null; // 0–100, null until basic details load
  fit: number | null; // 0–100, null if no target keywords set (can't judge fit)
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

  // Reach: phone 40 + website 30 + email 30 (0 if permanently closed). Phone and
  // website only count once contact has been loaded for the lead.
  let reach = 0;
  if (closed) {
    reasons.push("permanently closed");
  } else {
    if (contact?.phone) { reach += 40; reasons.push("phone"); }
    if (contact?.website) { reach += 30; reasons.push("website"); }
    if (emails.length) { reach += 30; reasons.push("email"); }
  }

  // Fit: category matches a target keyword (70) + a loaded website (30, once
  // contact is fetched — a real, reachable business).
  let fit: number | null = null;
  if (targetKeywords.length && !closed) {
    const hay = (detail.category ?? "").toLowerCase();
    const matched = targetKeywords.some((k) => k && hay.includes(k.toLowerCase()));
    fit = (matched ? 70 : 0) + (contact?.website ? 30 : 0);
    if (matched) reasons.push("category match");
  }

  const overall = closed ? 0 : fit == null ? reach : Math.round((fit + reach) / 2);
  return { reach: closed ? 0 : reach, fit, overall, closed, reasons };
}
