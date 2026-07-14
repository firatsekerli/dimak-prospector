// Phase 1 landing page.
// Its only job is to prove the GitHub -> Vercel pipeline works end to end and
// that the design tokens render. The real console (search panel, table, stats)
// arrives in Phase 3.

const PHASES = [
  { n: 1, label: "Scaffold + deploy pipeline", done: true },
  { n: 2, label: "Neon Postgres + Drizzle schema", done: false },
  { n: 3, label: "Config, one-city search, table", done: false },
  { n: 4, label: "Status / notes + filters", done: false },
  { n: 5, label: "On-demand email enrichment", done: false },
  { n: 6, label: "Excel export", done: false },
  { n: 7, label: "Password gate + quota docs", done: false },
];

export default function Home() {
  return (
    <>
      <header className="flex items-baseline gap-3.5 border-b-[3px] border-ember bg-ink px-[22px] py-3.5 text-white">
        <h1 className="text-[17px] font-bold uppercase tracking-[0.14em]">
          Dimak Prospector
        </h1>
        <span className="text-xs tracking-[0.03em] text-[#9aa3af]">
          Gulf fire door lead pipeline
        </span>
      </header>

      <main className="mx-auto w-full max-w-[1220px] px-[22px] pb-16 pt-5">
        <section className="mb-4 rounded-lg border border-line bg-panel px-[18px] py-4">
          <h2 className="mb-3 text-[11px] uppercase tracking-[0.16em] text-mute">
            Phase 1 &mdash; pipeline check
          </h2>
          <p className="max-w-2xl leading-6 text-steel">
            The Next.js + TypeScript + Tailwind app is scaffolded and deploying
            to Vercel from GitHub. If you can read this page at your Vercel URL,
            the GitHub&nbsp;&rarr;&nbsp;Vercel pipeline is proven and we are clear
            to start Phase&nbsp;2 (Neon Postgres).
          </p>
          <p className="mt-3">
            <a
              className="font-mono text-sm text-ember-dk hover:underline"
              href="/api/health"
            >
              GET /api/health
            </a>
            <span className="ml-2 text-xs text-mute">
              &mdash; a serverless function that confirms the API runtime is live.
            </span>
          </p>
        </section>

        <section className="rounded-lg border border-line bg-panel px-[18px] py-4">
          <h2 className="mb-3 text-[11px] uppercase tracking-[0.16em] text-mute">
            Build plan
          </h2>
          <ol className="flex flex-col gap-1.5">
            {PHASES.map((p) => (
              <li key={p.n} className="flex items-center gap-3 text-steel">
                <span
                  aria-hidden
                  className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${
                    p.done ? "bg-status-replied" : "bg-line"
                  }`}
                />
                <span className="font-mono text-xs text-mute">
                  {String(p.n).padStart(2, "0")}
                </span>
                <span className={p.done ? "text-ink" : ""}>{p.label}</span>
                {p.done && (
                  <span className="ml-1 text-xs font-semibold text-status-replied">
                    done
                  </span>
                )}
              </li>
            ))}
          </ol>
        </section>
      </main>
    </>
  );
}
