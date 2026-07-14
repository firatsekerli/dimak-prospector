import { NextResponse } from "next/server";
import { CITIES, SEGMENTS, TERM_SUGGESTIONS, STATUSES } from "@/lib/config";

// Static config lists for the search UI (cities, segments, term suggestions,
// statuses). No DB or secrets involved.
export function GET() {
  return NextResponse.json({
    cities: CITIES,
    segments: SEGMENTS,
    terms: TERM_SUGGESTIONS,
    statuses: STATUSES,
  });
}
