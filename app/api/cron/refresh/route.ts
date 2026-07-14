import { NextResponse } from "next/server";
import { refreshProspects } from "@/lib/refresh";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/refresh — weekly self-maintenance so the Google-sourced cache
 * never exceeds ~30 days. Exempt from the login gate (see middleware) but
 * protected by CRON_SECRET: Vercel Cron sends `Authorization: Bearer <secret>`.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GOOGLE_PLACES_API_KEY is not set." }, { status: 400 });
  }

  try {
    const result = await refreshProspects(apiKey, { staleDays: 25 });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Refresh failed." },
      { status: 500 }
    );
  }
}
