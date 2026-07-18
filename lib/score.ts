import type { LiveDetails } from "./types";

// A transparent, rule-based lead score computed live in the browser from data
// already loaded — no black box, and nothing extra is stored. Two axes:
//   Reach — how easily you can contact them (phone / website / email / open)
//   Fit   — whether they're the right kind of company (category vs your target
//           keywords). Fit needs the user's target keywords to be meaningful.

export type LeadScore = {
  reach: number | null; // 0–100, null until live details load
  fit: number | null; // 0–100, null if no target keywords set (can't judge fit)
  overall: number | null;
  closed: boolean;
  reasons: string[]; // short human-readable factors, for the tooltip
};

export function scoreLead(opts: {
  detail?: LiveDetails;
  emails: string[];
  targetKeywords: string[];
}): LeadScore {
  const { detail, emails, targetKeywords } = opts;
  if (!detail) return { reach: null, fit: null, overall: null, closed: false, reasons: [] };

  const closed = detail.businessStatus === "CLOSED_PERMANENTLY";
  const reasons: string[] = [];

  // Reach: phone 40 + website 30 + email 30 (0 if permanently closed).
  let reach = 0;
  if (closed) {
    reasons.push("permanently closed");
  } else {
    if (detail.phone) { reach += 40; reasons.push("phone"); }
    if (detail.website) { reach += 30; reasons.push("website"); }
    if (emails.length) { reach += 30; reasons.push("email"); }
  }

  // Fit: category matches a target keyword (65) + has a real website (35).
  let fit: number | null = null;
  if (targetKeywords.length && !closed) {
    const hay = (detail.category ?? "").toLowerCase();
    const matched = targetKeywords.some((k) => k && hay.includes(k.toLowerCase()));
    fit = (matched ? 65 : 0) + (detail.website ? 35 : 0);
    if (matched) reasons.push("category match");
  }

  const overall = closed ? 0 : fit == null ? reach : Math.round((fit + reach) / 2);
  return { reach: closed ? 0 : reach, fit, overall, closed, reasons };
}
