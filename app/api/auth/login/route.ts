import { NextResponse } from "next/server";
import { AUTH_COOKIE, AUTH_MAX_AGE, createToken, verifyPassword } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** POST /api/auth/login  body { password } — sets a signed http-only cookie. */
export async function POST(request: Request) {
  const appPassword = process.env.APP_PASSWORD;
  const secret = process.env.AUTH_SECRET;
  if (!appPassword || !secret) {
    return NextResponse.json(
      { error: "Auth is not configured (set APP_PASSWORD and AUTH_SECRET)." },
      { status: 500 }
    );
  }

  let body: { password?: string };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  if (!verifyPassword(typeof body.password === "string" ? body.password : "", appPassword)) {
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, await createToken(secret), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: AUTH_MAX_AGE,
  });
  return res;
}
