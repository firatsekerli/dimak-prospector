# Per-customer setup checklist

How to stand up a new, isolated instance for a customer. Same repo, separate
deployment + database + branding. Budget ~15 minutes once you've done it once.
The customer only ever receives a **URL + password**.

---

## 0. Before you start — collect from the customer

- [ ] Their **brand**: name, logo (a URL or image file), accent color (hex),
      company name + website + a contact line for the footer.
- [ ] Their **Google Places API key** (recommended — keeps API billing and
      Google's terms with them). If they can't, you can use your own key with a
      strict daily quota and re-bill; see step 4.
- [ ] The **domain/subdomain** they want (or use the free `*.vercel.app` URL).

---

## 1. Database (Neon)

- [ ] In Neon, create a **new database** (or a new project) for this customer.
- [ ] Open the **SQL editor** and paste the entire contents of
      [`db/setup.sql`](./db/setup.sql). Run it. That creates every table.
- [ ] Copy the connection string (**`DATABASE_URL`**) — the pooled/`?sslmode=require`
      one Neon shows for app use.

## 2. Google Cloud (the customer's key, ideally)

- [ ] Enable **Places API (New)** on the project that owns the key.
- [ ] Restrict the key: **APIs & Services → Credentials → the key → API
      restrictions → Places API (New)** only.
- [ ] Set a **daily quota** on `SearchText` and `GetPlace`
      (**APIs & Services → Places API (New) → Quotas**) — e.g. 1,000/day.
- [ ] Set a **budget alert** (**Billing → Budgets & alerts**) — e.g. €10–20/mo,
      alerts at 50/90/100%.

## 3. Vercel (new project from this repo)

- [ ] **Add New… → Project**, import this GitHub repo (all customers share it).
- [ ] Add the environment variables below, then **Deploy**.
- [ ] (Optional) **Settings → Domains** — add their subdomain.

### Environment variables to set

**Required (secrets — Production scope):**

| Variable                | Value                                                        |
| ----------------------- | ------------------------------------------------------------ |
| `DATABASE_URL`          | from step 1                                                  |
| `GOOGLE_PLACES_API_KEY` | the customer's key from step 2                               |
| `APP_PASSWORD`          | a strong password you choose (you give this to the customer) |
| `AUTH_SECRET`           | a long random string — `openssl rand -base64 32`             |

**Branding (all optional — set the ones they want):**

| Variable                   | Example                              |
| -------------------------- | ------------------------------------ |
| `NEXT_PUBLIC_APP_NAME`     | `Acme Prospector`                    |
| `NEXT_PUBLIC_APP_TAGLINE`  | `B2B lead intelligence`              |
| `NEXT_PUBLIC_LOGO_URL`     | `https://acme.com/logo.svg`          |
| `NEXT_PUBLIC_ACCENT`       | `#2563eb`                            |
| `NEXT_PUBLIC_ACCENT_DARK`  | `#1e4fc0`                            |
| `NEXT_PUBLIC_COMPANY_NAME` | `Acme Ltd`                           |
| `NEXT_PUBLIC_COMPANY_URL`  | `https://acme.com`                   |
| `NEXT_PUBLIC_FOOTER_NOTE`  | `support@acme.com`                   |
| `NEXT_PUBLIC_SHOW_ADS`     | `1` only for your ad-supported tier  |

**Optional features:**

| Variable             | Purpose                                                    |
| -------------------- | ---------------------------------------------------------- |
| `COMTRADE_API_KEY`   | UN Comtrade key for the market-stats panel (free)          |
| `GEONAMES_USERNAME`  | GeoNames username for the continent→country→cities cascade |

> `NEXT_PUBLIC_*` values are baked in at **build time** — after changing any of
> them, **redeploy** (Vercel → Deployments → ⋯ → Redeploy) for it to show.

## 4. Verify

- [ ] Open the URL → you should see **their** branding on the login page.
- [ ] Log in with `APP_PASSWORD`.
- [ ] `/(app)` loads; visit `/api/health` → `db: "connected"`, tables `ready`.
- [ ] Run one small search (pick a country + city) → results appear with live
      names/phones. Add a note → it persists.

## 5. Hand over

- [ ] Send the customer the **URL** and the **password** (over a secure channel).
- [ ] Tell them: log in from any device; the password stops strangers from
      running up API calls; details are fetched live from Google and not stored.

---

## Notes on hosting models

- **You host (recommended for "easy"):** everything above lives in your Vercel +
  Neon accounts; the customer supplies their Google key. You bill setup + monthly
  service. Fastest for them, fully controlled by you.
- **Customer owns the accounts:** repeat the steps inside *their* Vercel/Neon/
  Google. More setup friction, but the whole stack (and its bills) is theirs.

## Making it even faster

- Keep a filled-in `.env` template per customer so you can bulk-paste vars
  (or use the Vercel CLI: `vercel env add`).
- Duplicating an existing customer's Vercel project copies its settings; then you
  only swap `DATABASE_URL`, `GOOGLE_PLACES_API_KEY`, `APP_PASSWORD`, and branding.
