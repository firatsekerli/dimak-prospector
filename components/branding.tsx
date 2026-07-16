import { branding } from "@/lib/branding";

// Ensure a link is absolute: if the env URL has no scheme (e.g. "acme.com"),
// an <a href> would resolve it relative to the app. Prepend https:// so the
// footer link always points at the real external site, verbatim otherwise.
const externalUrl = (u: string): string =>
  !u ? "" : /^https?:\/\//i.test(u) ? u : `https://${u}`;

/** Logo + app name + tagline, used in both the console and login headers.
 *  The name renders exactly as NEXT_PUBLIC_APP_NAME is set (no forced case). */
export function Brand() {
  return (
    <div className="flex items-center gap-3">
      {branding.logoUrl && (
        // A logo can be any URL, so use a plain <img> rather than next/image
        // (which would need per-domain remotePatterns config).
        // eslint-disable-next-line @next/next/no-img-element
        <img src={branding.logoUrl} alt={branding.appName} className="h-7 w-auto max-w-[160px] object-contain" />
      )}
      <h1 className="text-[17px] font-bold tracking-[0.02em]">{branding.appName}</h1>
      {branding.tagline && (
        <span className="text-xs tracking-[0.03em] text-white/75">{branding.tagline}</span>
      )}
    </div>
  );
}

/** Thin, centered footer with the operator's (or white-label customer's) info. */
export function SiteFooter() {
  const { companyName, companyUrl, footerNote } = branding;
  if (!companyName && !footerNote) return null;
  const year = new Date().getFullYear();
  const href = externalUrl(companyUrl);
  return (
    <footer className="mt-8 border-t border-line px-[22px] py-3 text-[11px] text-mute">
      <div className="mx-auto flex max-w-[1220px] flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center">
        {companyName &&
          (href ? (
            <a href={href} target="_blank" rel="noopener noreferrer" className="hover:text-ember-dk">
              © {year} {companyName}
            </a>
          ) : (
            <span>© {year} {companyName}</span>
          ))}
        {footerNote && <span>{footerNote}</span>}
      </div>
    </footer>
  );
}

/**
 * Ad slot for the ad-supported tier. Renders nothing unless NEXT_PUBLIC_SHOW_ADS
 * is "1". Drop your ad network's snippet in here (kept as a labeled placeholder
 * so the layout reserves the space without pulling in a network yet).
 */
export function AdSlot() {
  if (!branding.showAds) return null;
  return (
    <div className="mx-auto mt-4 flex max-w-[1220px] items-center justify-center border border-dashed border-line bg-panel px-4 py-5 text-[11px] uppercase tracking-[0.1em] text-mute">
      Advertisement
    </div>
  );
}
