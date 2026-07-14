import { NextResponse } from "next/server";
import { asc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { segments, prospects } from "@/db/schema";

export const dynamic = "force-dynamic";

/**
 * GET /api/segments — the user's segment labels. On an empty table it seeds
 * itself once from whatever tags already exist on prospects (so history isn't
 * lost when switching to user-defined segments).
 */
export async function GET() {
  const db = getDb();
  let rows = await db.select().from(segments).orderBy(asc(segments.name));

  if (rows.length === 0) {
    const existing = await db.selectDistinct({ segment: prospects.segment }).from(prospects);
    const names = new Set<string>();
    for (const r of existing) {
      for (const tag of (r.segment ?? "").split(" | ")) {
        const t = tag.trim();
        if (t) names.add(t);
      }
    }
    if (names.size > 0) {
      await db
        .insert(segments)
        .values([...names].map((name) => ({ name })))
        .onConflictDoNothing();
      rows = await db.select().from(segments).orderBy(asc(segments.name));
    }
  }

  return NextResponse.json({ segments: rows.map((r) => r.name) });
}

/** POST /api/segments  body { name } — add a segment. */
export async function POST(request: Request) {
  let body: { name?: string };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const name = (body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "A name is required." }, { status: 400 });
  if (name.includes("|")) {
    return NextResponse.json({ error: "Segment names can't contain '|'." }, { status: 400 });
  }

  const db = getDb();
  await db.insert(segments).values({ name }).onConflictDoNothing();
  return NextResponse.json({ ok: true });
}

/** DELETE /api/segments  body { name } — remove a segment and untag prospects. */
export async function DELETE(request: Request) {
  let body: { name?: string };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const name = (body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "A name is required." }, { status: 400 });

  const db = getDb();
  await db.delete(segments).where(eq(segments.name, name));

  // Strip the tag from every prospect that carries it.
  await db.execute(sql`
    UPDATE prospects
    SET segment = (
      SELECT COALESCE(string_agg(tag, ' | ' ORDER BY tag), '')
      FROM (
        SELECT DISTINCT trim(t) AS tag
        FROM unnest(string_to_array(COALESCE(segment, ''), ' | ')) AS t
        WHERE trim(t) <> '' AND trim(t) <> ${name}
      ) s
    )
    WHERE position(${name} in COALESCE(segment, '')) > 0
  `);

  return NextResponse.json({ ok: true });
}
