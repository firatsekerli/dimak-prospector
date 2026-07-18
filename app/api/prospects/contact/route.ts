import { NextResponse } from "next/server";
import { placeContact } from "@/lib/places";
import { waLink } from "@/lib/format";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/prospects/contact  body { placeId }
 *
 * Fetches the contact fields (phone + website) for one place_id from Place
 * Details (New). These are the paid "Enterprise/contact" tier, so this runs
 * ONLY on demand — when the user opens a lead's contact, not for every row.
 * Nothing is stored. Returns { phone, website, wa }.
 */
export async function POST(request: Request) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GOOGLE_PLACES_API_KEY is not set on the server." },
      { status: 400 }
    );
  }

  let body: { placeId?: string };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const placeId = (body.placeId ?? "").trim();
  if (!placeId) {
    return NextResponse.json({ error: "placeId is required." }, { status: 400 });
  }

  const c = await placeContact(placeId, apiKey);
  if (!c) {
    return NextResponse.json({ phone: "", website: "", wa: "" });
  }
  return NextResponse.json({ phone: c.phone, website: c.website, wa: waLink(c.phone) });
}
