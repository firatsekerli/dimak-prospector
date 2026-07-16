import { NextResponse } from "next/server";
import { analyzeWebsite } from "@/lib/website";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // fetches a few pages of the company site

/**
 * POST /api/prospects/analyze  body { website }
 *
 * Reads the company's own public website and returns non-personal business
 * signals (certifications, business-type words, company social profiles).
 * Nothing is stored — this is a live, on-demand read the salesperson triggers,
 * shown only for the session. No personal data is extracted.
 *
 * `website` is passed by the client (it already has it from the live Place
 * Details fetch), so this makes no Google Places call.
 */
export async function POST(request: Request) {
  let body: { website?: string };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const website = (body.website ?? "").trim();
  if (!website || !/^https?:\/\//i.test(website)) {
    return NextResponse.json({ error: "A valid website URL is required." }, { status: 400 });
  }

  const analysis = await analyzeWebsite(website);
  return NextResponse.json({ analysis });
}
