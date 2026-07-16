import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { prospects } from "@/db/schema";
import { STATUSES } from "@/lib/config";

export const dynamic = "force-dynamic";

/**
 * POST /api/prospects/update  body { place_id, status?, segment?, contactEmail? }
 * Updates only the fields provided (so one edit never wipes another).
 * `segment` is the full " | "-joined tag string for the prospect. `contactEmail`
 * is a value the user typed in themselves (their own CRM data). Bumps updated_at.
 * Notes are managed separately via /api/prospects/notes (a timestamped log).
 */
export async function POST(request: Request) {
  let body: { place_id?: string; status?: string; segment?: string; contactEmail?: string };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const placeId = body.place_id;
  if (!placeId) {
    return NextResponse.json({ error: "place_id is required." }, { status: 400 });
  }

  const set: {
    status?: string;
    segment?: string;
    contactEmail?: string | null;
    updatedAt?: ReturnType<typeof sql>;
  } = {};

  if (typeof body.status === "string") {
    if (!STATUSES.includes(body.status)) {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    }
    set.status = body.status;
  }
  if (typeof body.segment === "string") {
    set.segment = body.segment;
  }
  if (typeof body.contactEmail === "string") {
    set.contactEmail = body.contactEmail.trim() || null;
  }

  if (set.status === undefined && set.segment === undefined && set.contactEmail === undefined) {
    return NextResponse.json({ ok: true }); // nothing to change
  }

  set.updatedAt = sql`now()`;

  const db = getDb();
  const updated = await db
    .update(prospects)
    .set(set)
    .where(eq(prospects.placeId, placeId))
    .returning({ placeId: prospects.placeId });

  if (updated.length === 0) {
    return NextResponse.json({ error: "Prospect not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
