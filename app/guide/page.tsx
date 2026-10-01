import Link from "next/link";
import { Brand, SiteFooter } from "@/components/branding";
import { branding } from "@/lib/branding";

export const metadata = { title: `Guide — ${branding.appName}` };

// Small presentational helpers so the guide reads consistently.
function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 border-t border-line pt-6">
      <h2 className="mb-3 text-[15px] font-bold tracking-[0.02em] text-ink">{title}</h2>
      <div className="space-y-3 text-[13px] leading-relaxed text-steel">{children}</div>
    </section>
  );
}
function Term({ children }: { children: React.ReactNode }) {
  return <span className="font-semibold text-ink">{children}</span>;
}

export default function GuidePage() {
  const contents = [
    ["what", "What this tool does"],
    ["find", "Finding companies"],
    ["how-search", "How the search works"],
    ["table", "The results table"],
    ["score", "The lead score"],
    ["keywords", "Good-fit keywords"],
    ["filters", "Filters"],
    ["work", "Working a lead"],
    ["stored", "What's saved vs fetched live"],
    ["cost", "Costs & billing"],
    ["market", "Market import statistics"],
    ["workflow", "A good workflow"],
  ];

  return (
    <>
      <header className="flex items-center gap-3.5 border-b-[3px] border-ember-dk bg-ember px-[22px] py-3.5 text-white">
        <Brand />
        <Link href="/" className="ml-auto text-xs text-white/80 hover:text-white">
          ← Back to console
        </Link>
      </header>

      <main className="mx-auto max-w-[840px] px-[22px] py-7">
        <h1 className="text-[22px] font-bold tracking-[0.02em] text-ink">User guide</h1>
        <p className="mt-1.5 text-[13px] text-mute">
          How {branding.appName} finds companies, scores them, and helps you reach out — and what it
          does and doesn&apos;t store.
        </p>

        {/* Contents */}
        <nav className="mt-5 rounded-sm border border-line bg-panel p-4">
          <div className="mb-2 text-[11px] uppercase tracking-[0.1em] text-mute">Contents</div>
          <ol className="grid gap-x-6 gap-y-1 text-[13px] text-ember-dk sm:grid-cols-2">
            {contents.map(([id, title], i) => (
              <li key={id}>
                <a href={`#${id}`} className="hover:underline">
                  {i + 1}. {title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="mt-6 space-y-6">
          <Section id="what" title="1. What this tool does">
            <p>
              It finds businesses that might buy or specify your product — distributors, contractors,
              manufacturers, hardware and building-materials stores, and so on — directly from
              Google&apos;s live business data, across the cities and countries you choose. You review
              them, score them, track who you&apos;ve contacted, and reach out.
            </p>
            <p>
              The data is <Term>live from Google</Term>, so it&apos;s always current. The tool stores
              only each business&apos;s Google ID plus <Term>your own</Term> data (tags, status,
              notes, emails) — see <a href="#stored" className="text-ember-dk hover:underline">
              section 9</a>.
            </p>
          </Section>

          <Section id="find" title="2. Finding companies">
            <p>In the <Term>Find companies</Term> panel at the top:</p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li><Term>Continent → Country</Term>: pick where to search. The cities list fills in automatically.</li>
              <li><Term>Cities</Term>: all cities are on by default. Click a chip to toggle it; use <Term>all / none</Term> to select or clear them quickly. Searching more cities finds more companies (see next section).</li>
              <li><Term>What to search for</Term>: the keyword, e.g. <em>fire door supplier</em>, <em>building materials</em>, <em>fit-out contractor</em>. There are suggestions as you type.</li>
              <li><Term>Tag new results as</Term>: optionally label everything this search finds with one of your segments (e.g. &quot;fire door&quot;). &quot;Don&apos;t tag&quot; leaves them untagged.</li>
              <li><Term>Search</Term>: runs the search. A progress line shows &quot;Searching Tirana 3/10…&quot;, then the table fills. At the end you&apos;ll see e.g. &quot;Added 65 new, refreshed 3.&quot;</li>
            </ul>
            <p>
              <Term>Your segments</Term> are your own labels (you add/remove them). <Term>Good-fit
              keywords</Term> feed the score — see <a href="#keywords" className="text-ember-dk hover:underline">section 6</a>.
            </p>
          </Section>

          <Section id="how-search" title="3. How the search works">
            <p>
              For each selected city, the tool asks Google for <em>&quot;{`<keyword>`} in {`<city>`} {`<country>`}&quot;</em>
              {" "}— e.g. <em>fire door supplier in Berat Albania</em>. Adding the country is important:
              it makes Google return the relevant businesses from across the country (not just that one
              town, which would return almost nothing).
            </p>
            <p>
              Each city brings back a slightly different set, and the tool <Term>merges and de-duplicates</Term>
              {" "}them by Google ID. That&apos;s why searching all cities finds more than any single search —
              and why the same company found twice is counted once (&quot;refreshed&quot;), never duplicated.
            </p>
            <p>
              Obviously-irrelevant business types (churches, hotels, restaurants, campgrounds…) are
              filtered out automatically so they never become leads.
            </p>
          </Section>

          <Section id="table" title="4. The results table">
            <ul className="list-disc space-y-1.5 pl-5">
              <li><Term>Score</Term>: how good a fit this company is (0–100). Hover it for details. See <a href="#score" className="text-ember-dk hover:underline">section 5</a>.</li>
              <li><Term>Company</Term>: name and Google category, the <Term>real city</Term>, a &quot;found via&quot; line showing which keyword found it, and three actions: <Term>map</Term> (open in Google Maps), <Term>analyze</Term> (read their website), <Term>outreach</Term> (draft a message).</li>
              <li><Term>Segment</Term>: your tags on this lead; add or remove them here.</li>
              <li><Term>Location</Term>: the country you searched and the business&apos;s real city (loaded live).</li>
              <li><Term>Contact details</Term>: a <Term>Show contact</Term> button loads phone + website on demand (WhatsApp and site links appear), plus an <Term>+ add email</Term> box for emails you enter yourself.</li>
              <li><Term>Status</Term>: New / Contacted / Replied / Not a fit — saves on change and recolors.</li>
              <li><Term>Notes</Term>: a timestamped note log per lead (opens in a popup).</li>
            </ul>
          </Section>

          <Section id="score" title="5. The lead score">
            <p>
              The number is the <Term>Fit</Term> score — <em>&quot;is this the right kind of company?&quot;</em>
              {" "}It&apos;s judged only from what Google says the business <em>is</em> (its category and
              name), never from your own tags. Two things raise it:
            </p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Its category/name looks like a relevant <Term>business type</Term> (manufacturer, hardware, building materials, contractor, metal, window…). This is built in — you don&apos;t need to know Google&apos;s labels.</li>
              <li>Your <Term>good-fit keywords</Term> appear in its category/name (extra specificity).</li>
            </ul>
            <p>
              Roughly: <Term>10</Term> = off-target, <Term>55</Term> = one signal, <Term>100</Term> = both.
              Tick <Term>Sort by score</Term> to float your best prospects to the top.
            </p>
            <p>
              Hovering the score also shows <Term>Reach</Term> — how easy they are to contact
              (phone / website / email). Reach is advisory only; it does <Term>not</Term> move the
              headline number, so loading a contact or analyzing never changes the score.
            </p>
            <p>
              The <Term>★ star</Term> under each score lets you <Term>mark a lead as a strong fit</Term>
              {" "}yourself — for companies you&apos;ve checked and know are good, but whose Google
              category is generic or whose website can&apos;t be read automatically. A starred lead&apos;s
              score is forced to the top and, unlike analyze, your mark is <Term>saved permanently</Term>.
            </p>
          </Section>

          <Section id="keywords" title="6. Good-fit keywords">
            <p>
              These are words that mark a good prospect, e.g. <em>fire door, steel door, supplier,
              distributor, contractor</em>. They&apos;re matched against each lead&apos;s Google
              category and name (broken into single words, so &quot;fire door&quot; also matches a
              company called &quot;…Doors&quot;).
            </p>
            <p>
              You don&apos;t need to guess Google&apos;s exact category names — relevant business types
              are already built in. Your keywords simply add product-specific weight. Edit them in the
              <Term> Good-fit keywords</Term> box; they&apos;re remembered on this device.
            </p>
          </Section>

          <Section id="filters" title="7. Filters">
            <p>Above the table, narrow what&apos;s shown (these don&apos;t re-run a search):</p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li><Term>Country</Term> / <Term>City</Term>: by the business&apos;s real location.</li>
              <li><Term>Segment</Term>: by your tags.</li>
              <li><Term>Category</Term>: by Google&apos;s business category.</li>
              <li><Term>Status</Term>: New / Contacted / Replied / Not a fit.</li>
              <li><Term>Found via</Term>: by the search keyword that found the lead.</li>
              <li><Term>Find in list</Term>: free-text search over company name and city.</li>
            </ul>
            <p><Term>Show all</Term> loads every saved lead for the selected country.</p>
          </Section>

          <Section id="work" title="8. Working a lead">
            <ul className="list-disc space-y-1.5 pl-5">
              <li><Term>Show contact</Term>: loads phone + website (a paid Google lookup — on demand). Gives you WhatsApp and website links.</li>
              <li><Term>Analyze</Term>: reads the company&apos;s own website and pulls non-personal signals — business type, certifications (e.g. EN 1634), social profiles. Also loads the contact (needed to find the website).</li>
              <li><Term>Assess</Term>: researches the company with AI (web search) and judges whether it&apos;s a good fit — with a verdict, confidence, and a one-click &quot;mark as good fit ★&quot;. Works even when the company&apos;s own website blocks automated reading. Uses your Anthropic key (defaults to the cheapest model), on demand.</li>
              <li><Term>Outreach</Term>: drafts a personalized first message with AI, in the language you pick. Requires your Anthropic API key to be set. Drafts are kept on this device.</li>
              <li><Term>Status</Term> &amp; <Term>Notes</Term>: track your pipeline. Notes are timestamped and kept per lead.</li>
              <li><Term>+ add email</Term>: record contact emails you find yourself — this is your own data and is saved permanently.</li>
            </ul>
          </Section>

          <Section id="stored" title="9. What's saved vs fetched live">
            <p>
              To respect Google&apos;s terms, the tool stores <Term>only</Term> each business&apos;s
              Google ID plus <Term>your own</Term> data: tags, status, notes, the emails you enter, the
              country/keyword you searched under.
            </p>
            <p>
              Everything else — <Term>name, category, real city, phone, website</Term> — is fetched
              <Term> live from Google</Term> each time and never stored. Consequences:
            </p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Changing filters in the same open tab keeps loaded contacts visible.</li>
              <li><Term>Reloading the page</Term> (or a new tab / device / tomorrow) hides contact info again — you&apos;d re-load it (which re-incurs the Google cost).</li>
              <li>Your <Term>notes and emails always persist</Term>, so capture anything you want to keep there.</li>
            </ul>
          </Section>

          <Section id="cost" title="10. Costs & billing">
            <p>
              Searching and loading names/categories are cheap. The <Term>paid</Term> parts are
              <Term> Show contact</Term> and <Term>Analyze</Term> (both load Google&apos;s contact tier),
              and <Term>Outreach</Term> (uses your AI key). Costs are charged per use.
            </p>
            <p>
              Load contact / analyze only for leads you&apos;ll actually pursue. It&apos;s strongly
              recommended to set a <Term>daily quota</Term> and a <Term>budget alert</Term> on your
              Google API key so usage can&apos;t run away.
            </p>
          </Section>

          <Section id="market" title="11. Market import statistics">
            <p>
              The <Term>Market — import statistics</Term> panel shows a country&apos;s import figures
              for a product (default HS code <em>730830</em>, steel doors), from UN Comtrade — a way to
              judge which markets to prioritize. Change the HS code to research any product; click
              <Term> Refresh data</Term> to pull it. Trade data typically lags 1–2 years.
            </p>
          </Section>

          <Section id="workflow" title="12. A good workflow">
            <ol className="list-decimal space-y-1.5 pl-5">
              <li>Pick a country, keep all cities on, set a keyword, and Search.</li>
              <li>Set your good-fit keywords, tick <Term>Sort by score</Term>, and work from the top.</li>
              <li>For promising leads: <Term>Show contact</Term> / <Term>Analyze</Term>, then <Term>Outreach</Term>.</li>
              <li>Set the <Term>status</Term>, add any <Term>email</Term> and <Term>notes</Term> (these are saved).</li>
              <li>Repeat with other keywords; use <Term>Found via</Term> to review each keyword&apos;s results.</li>
            </ol>
          </Section>
        </div>

        <div className="mt-8">
          <Link href="/" className="btn btn-ghost">← Back to console</Link>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
