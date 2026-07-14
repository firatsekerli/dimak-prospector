import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { prospects } from "@/db/schema";
import { STATUSES } from "@/lib/config";

export const dynamic = "force-dynamic";

/**
 * POST /api/prospects/update  body { place_id, status?, notes? }
 * Updates only the fields provided (so a status change never wipes notes and
 * vice-versa). Bumps updated_at.
 */
export async function POST(request: Request) {
  let body: { place_id?: string; status?: string; notes?: string };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const placeId = body.place_id;
  if (!placeId) {
    return NextResponse.json({ error: "place_id is required." }, { status: 400 });
  }

  const set: { status?: string; notes?: string; updatedAt?: ReturnType<typeof sql> } = {};

  if (typeof body.status === "string") {
    if (!STATUSES.includes(body.status)) {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    }
    set.status = body.status;
  }
  if (typeof body.notes === "string") {
    set.notes = body.notes;
  }

  if (set.status === undefined && set.notes === undefined) {
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
