// White-label branding — configured entirely through NEXT_PUBLIC_* env vars so
// the same build can be re-skinned per customer without touching code. Every
// value has a neutral default, so with nothing set the app carries no specific
// company's branding. Set these in Vercel (and .env.local for local dev).
//
//   NEXT_PUBLIC_APP_NAME       header/title name        (default "Prospector")
//   NEXT_PUBLIC_APP_TAGLINE    small subtitle           (default "B2B lead pipeline")
//   NEXT_PUBLIC_LOGO_URL       logo image URL           (default none → text only)
//   NEXT_PUBLIC_ACCENT         accent color, hex        (default #ff6b00)
//   NEXT_PUBLIC_ACCENT_DARK    accent hover/link, hex   (default derived/#c2560a)
//   NEXT_PUBLIC_COMPANY_NAME   footer business name     (default none → no footer)
//   NEXT_PUBLIC_COMPANY_URL    footer business link     (default none)
//   NEXT_PUBLIC_FOOTER_NOTE    extra footer line        (default none)
//   NEXT_PUBLIC_SHOW_ADS       "1" to show the ad slot  (default off)

const hex = (v: string | undefined): string =>
  v && /^#[0-9a-fA-F]{3,8}$/.test(v) ? v : "";

export const branding = {
  appName: process.env.NEXT_PUBLIC_APP_NAME || "Prospector",
  tagline: process.env.NEXT_PUBLIC_APP_TAGLINE ?? "B2B lead pipeline",
  logoUrl: process.env.NEXT_PUBLIC_LOGO_URL || "",
  accent: hex(process.env.NEXT_PUBLIC_ACCENT),
  accentDark: hex(process.env.NEXT_PUBLIC_ACCENT_DARK),
  companyName: process.env.NEXT_PUBLIC_COMPANY_NAME || "",
  companyUrl: process.env.NEXT_PUBLIC_COMPANY_URL || "",
  footerNote: process.env.NEXT_PUBLIC_FOOTER_NOTE || "",
  showAds: process.env.NEXT_PUBLIC_SHOW_ADS === "1",
};
