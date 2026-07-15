// Minimal shared-password auth. Edge-safe (Web Crypto only, no Node built-ins)
// so it works in both middleware and route handlers.

export const AUTH_COOKIE = "prospector_auth";
export const AUTH_MAX_AGE = 60 * 60 * 24 * 30; // 30 days, in seconds

const encoder = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  let hex = "";
  for (const b of new Uint8Array(buf)) hex += b.toString(16).padStart(2, "0");
  return hex;
}

// Constant-time string compare (avoids leaking length/prefix via timing).
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmac(data: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return toHex(sig);
}

/** Signed token of the form `<expiryMs>.<hmac(expiryMs)>`. */
export async function createToken(secret: string, ttlSeconds = AUTH_MAX_AGE): Promise<string> {
  const exp = String(Date.now() + ttlSeconds * 1000);
  return `${exp}.${await hmac(exp, secret)}`;
}

export async function verifyToken(token: string | undefined, secret: string): Promise<boolean> {
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot < 0) return false;
  const exp = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expMs = Number(exp);
  if (!Number.isFinite(expMs) || expMs < Date.now()) return false;
  return safeEqual(sig, await hmac(exp, secret));
}

export function verifyPassword(input: string, expected: string | undefined): boolean {
  if (!expected) return false;
  return safeEqual(input, expected);
}
