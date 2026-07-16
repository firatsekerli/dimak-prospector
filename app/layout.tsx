import type { Metadata } from "next";
import "./globals.css";
import { branding } from "@/lib/branding";

export const metadata: Metadata = {
  // Browser tab shows the brand name with the tagline beside it.
  title: branding.tagline ? `${branding.appName} — ${branding.tagline}` : branding.appName,
  description: branding.tagline
    ? `${branding.appName} — ${branding.tagline}`
    : branding.appName,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // White-label accent override: the design tokens are runtime CSS variables, so
  // setting --ember / --ember-dk here re-skins every accent (buttons, focus,
  // header rule, links) without a rebuild of the CSS.
  const accentVars = [
    branding.accent && `--ember:${branding.accent}`,
    (branding.accentDark || branding.accent) && `--ember-dk:${branding.accentDark || branding.accent}`,
  ]
    .filter(Boolean)
    .join(";");

  return (
    <html lang="en" className="h-full antialiased">
      {accentVars && (
        <head>
          <style dangerouslySetInnerHTML={{ __html: `:root{${accentVars}}` }} />
        </head>
      )}
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
