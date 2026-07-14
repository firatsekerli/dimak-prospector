import { NextResponse } from "next/server";
import { refreshProspects } from "@/lib/refresh";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/prospects/refresh[?all=1] — manual refresh of the Google fields for
 * stale prospects (older than ~25 days), or all with ?all=1. Billed: one Place
 * Details call per refreshed prospect. Gated by the auth middleware.
 */
export async function POST(request: Request) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GOOGLE_PLACES_API_KEY is not set on the server." },
      { status: 400 }
    );
  }

  const all = new URL(request.url).searchParams.get("all") === "1";
  try {
    const result = await refreshProspects(apiKey, { all });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Refresh failed." },
      { status: 500 }
    );
  }
}
