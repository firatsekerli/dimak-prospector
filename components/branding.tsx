import { branding } from "@/lib/branding";

/** Logo + app name + tagline, used in both the console and login headers. */
export function Brand() {
  return (
    <div className="flex items-center gap-3">
      {branding.logoUrl && (
        // A logo can be any URL, so use a plain <img> rather than next/image
        // (which would need per-domain remotePatterns config).
        // eslint-disable-next-line @next/next/no-img-element
        <img src={branding.logoUrl} alt={branding.appName} className="h-7 w-auto max-w-[160px] object-contain" />
      )}
      <h1 className="text-[17px] font-bold uppercase tracking-[0.14em]">{branding.appName}</h1>
      {branding.tagline && (
        <span className="text-xs tracking-[0.03em] text-[#9aa3af]">{branding.tagline}</span>
      )}
    </div>
  );
}

/** Thin footer with the operator's (or white-label customer's) business info. */
export function SiteFooter() {
  const { companyName, companyUrl, footerNote } = branding;
  if (!companyName && !footerNote) return null;
  const year = new Date().getFullYear();
  return (
    <footer className="mt-8 border-t border-line px-[22px] py-3 text-[11px] text-mute">
      <div className="mx-auto flex max-w-[1220px] flex-wrap items-center gap-x-3 gap-y-1">
        {companyName &&
          (companyUrl ? (
            <a href={companyUrl} target="_blank" rel="noopener noreferrer" className="hover:text-ember-dk">
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
