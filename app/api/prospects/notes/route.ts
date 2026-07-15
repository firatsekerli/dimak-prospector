import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { prospects, prospectNotes } from "@/db/schema";

export const dynamic = "force-dynamic";

/**
 * POST /api/prospects/notes  body { place_id, body }
 * Appends a timestamped note to a prospect's log. Returns the created note.
 */
export async function POST(request: Request) {
  let body: { place_id?: string; body?: string };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const placeId = (body.place_id ?? "").trim();
  const text = (body.body ?? "").trim();
  if (!placeId) return NextResponse.json({ error: "place_id is required." }, { status: 400 });
  if (!text) return NextResponse.json({ error: "Note text is required." }, { status: 400 });

  const db = getDb();
  const [exists] = await db
    .select({ placeId: prospects.placeId })
    .from(prospects)
    .where(eq(prospects.placeId, placeId))
    .limit(1);
  if (!exists) return NextResponse.json({ error: "Prospect not found." }, { status: 404 });

  const [note] = await db
    .insert(prospectNotes)
    .values({ placeId, body: text })
    .returning({ id: prospectNotes.id, body: prospectNotes.body, createdAt: prospectNotes.createdAt });

  // Bump the prospect's updated_at so recent activity is reflected.
  await db.update(prospects).set({ updatedAt: sql`now()` }).where(eq(prospects.placeId, placeId));

  return NextResponse.json({ note });
}

/**
 * DELETE /api/prospects/notes  body { id }
 * Removes a single note from the log (for fixing mistakes).
 */
export async function DELETE(request: Request) {
  let body: { id?: number };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const id = Number(body.id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "A numeric note id is required." }, { status: 400 });
  }

  const db = getDb();
  const deleted = await db
    .delete(prospectNotes)
    .where(eq(prospectNotes.id, id))
    .returning({ id: prospectNotes.id });

  if (deleted.length === 0) {
    return NextResponse.json({ error: "Note not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
