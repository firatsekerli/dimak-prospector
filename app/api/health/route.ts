import { NextResponse } from "next/server";

// A tiny serverless function to prove the API runtime is live in production.
// Phase 2 replaces/extends this with a real DB connectivity check.
export function GET() {
  return NextResponse.json({
    ok: true,
    app: "dimak-prospector",
    phase: 1,
  });
}
