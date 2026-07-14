import { NextResponse } from "next/server";
import { and, eq, like, ilike, or, asc } from "drizzle-orm";
import { getDb } from "@/db";
import { prospects } from "@/db/schema";
import { STATUSES } from "@/lib/config";
import { waLink } from "@/lib/format";
import { cleanEmailsField } from "@/lib/email";

export const dynamic = "force-dynamic";

/**
 * GET /api/prospects?country=&segment=&status=&q=
 * Returns { rows, total, counts } where counts is per status over the filtered
 * set. `segment` matches as a substring (a company may carry several tags).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const country = searchParams.get("country");
  const segment = searchParams.get("segment");
  const status = searchParams.get("status");
  const q = searchParams.get("q");

  const conditions = [];
  if (country && country !== "All") conditions.push(eq(prospects.country, country));
  if (segment && segment !== "All") conditions.push(like(prospects.segment, `%${segment}%`));
  if (status && status !== "All") conditions.push(eq(prospects.status, status));
  if (q) {
    conditions.push(
      or(ilike(prospects.company, `%${q}%`), ilike(prospects.city, `%${q}%`))
    );
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(prospects)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(prospects.country), asc(prospects.city), asc(prospects.company));

  const out = rows.map((r) => ({
    ...r,
    emails: cleanEmailsField(r.emails),
    wa: waLink(r.phone),
  }));

  const counts: Record<string, number> = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  for (const r of out) counts[r.status] = (counts[r.status] ?? 0) + 1;

  return NextResponse.json({ rows: out, total: out.length, counts });
}
