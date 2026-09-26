# Naija Ledger — Implementation Plan

Product: Naija Ledger — "Know Where Your Money Goes."
Source of truth: `Naija_Ledger_PRD.docx` (28 sections). Do not delete.
Repo: https://github.com/cocolbk/naija-ledger (public, branch `main`)
Current code: `index.html`, `app.js` (506 lines, vanilla JS + localStorage `naijaLedger.v1`), `styles.css`, `README.md`

## 0. Where we are

- MVP (PRD Sec-23) implemented: onboarding, dashboard (daily/monthly), Quick + Detailed Expense,
  Nigerian default categories + custom CRUD, history with search/filters, monthly + category budgets
  with progress/alerts, daily/monthly summaries, basic breakdown, edit/delete, settings (₦ default, JSON/CSV export).
- Gaps: single global `state` (`app.js:46`), full re-render `refreshAll()` (`app.js:497`), float money math
  (`app.js:26`), UTC date bug (`app.js:23`, `app.js:405`), `alert`/`prompt` usage (`app.js:183,444`),
  unescaped HTML in `txnHtml` (`app.js:280`), filters grid breaks on mobile (`styles.css:91`),
  no modules/tests/backend/PWA. Phase 2/3 (PRD Sec-24/25) not started.

## Phase 0 — Repo hygiene & baseline (0.5 week)

- Add `LICENSE`, `CONTRIBUTING.md`, issue/PR templates.
- Keep `.gitignore` excluding Word lock files (`~$*.docx`), add `*.log`, `.vscode/`.
- GitHub: branch protection on `main`, Actions CI (`node --check app.js`, HTML validation, link check).
- Acceptance: clean `git status`, CI green.

## Phase 1 — Design system (1–2 weeks)

Goal: PRD Sec-22 — Simple, Nigerian-focused, Clear, Flexible, Non-judgmental, Useful.

1. Tokens (`styles.css:1`): formalize `--bg, --card, --ink, --muted, --green, --amber, --red, --line`
   + spacing scale 4/8/12/16/24, radii 8/12/20, shadows, dark-mode variants.
2. Typography: keep system stack; define H1/H2/body/muted/big-number (`.big`, `styles.css:66`),
   tabular numerals for ₦ amounts.
3. Components: buttons (`styles.css:70`), cards, tabs (`index.html:29`), progress + `warn`/`over`
   (`styles.css:93`), txn rows (`index.html:71`), modal/overlay (`index.html:169`), chips (onboarding),
   filters (fix `styles.css:91` to 1-col + sticky bar on mobile), forms with error slots, empty states.
4. Mobile-first: bottom tab bar + floating Add button (replace top `global-add-btn`, `index.html:26`
   on small screens), 44px targets, keep `max-width:960px` (`styles.css:54`) for desktop.
5. A11y: focus trap + ESC in expense modal, ARIA for tabs/progress/alerts, contrast check, keyboard-only onboarding.
6. Acceptance: gallery page, Lighthouse a11y ≥ 90, no break at 360px.

## Phase 2 — Architecture decisions (LOCKED by owner, Sep 2026)

- Database: **local PostgreSQL on this device. No Supabase** (subscription avoided).
- Auth: **Better Auth** (self-hosted, no Supabase Auth).
- Storage: **Cloudflare R2** (S3-compatible; only object keys stored in Postgres).
- Hosting: **local device only. No Vercel, no Supabase hosting.** LAN + localhost first.

| Decision | Locked choice | Notes |
|---|---|---|
| Frontend (v1.1) | Stay vanilla (`index.html` + `app.js`) | No framework churn while hardening |
| Frontend (v2) | Vite + TypeScript SPA (React or Preact) + Node API | API serves SPA + Better Auth + R2 presigned URLs |
| API | Node + **Hono** (`@hono/node-server`) — Express acceptable alternative | Hono: light, self-host friendly; Better Auth has Hono/Node adapters |
| Database | **PostgreSQL 16/17 installed locally on Windows** (EDB installer) | Nothing installed yet (verified: no `psql`, `pg_ctl`, or `docker` on PATH; Node v24 present) |
| DB access | **Drizzle ORM + drizzle-kit** over `postgres`/`pg` driver | Best Better Auth fit (official Drizzle adapter), lighter than Prisma, SQL-like migrations |
| Auth | **Better Auth** with Drizzle adapter, email+password (+ optional phone/OTP later) | Session table in local Postgres; secrets in local `.env`, never committed |
| Storage | **Cloudflare R2** via AWS SDK v3 S3 client, presigned PUT/GET | Private bucket; Postgres stores `receipts {key, mime, size}` only |
| Hosting | **This Windows machine**: API on `localhost:3000`, static SPA served by API or Caddy; phone testing via LAN IP; persistence via PM2/NSSM; optional Caddy reverse-proxy + Tailscale later | No inbound internet exposure by default |
| Testing | Vitest + Playwright | Unit: money/budget math; E2E: onboard → add → budget → report |
| Money | integer kobo + `Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN'})` | Replace float `Number` (`app.js:26`) |

Target layout:
```
/assets/icons/  /css/tokens.css components.css
/js/store.js db.js ui/(dashboard, transactions, budget, reports, settings)
/tests/
```

## Phase 3 — Core hardening (1–2 weeks)

- Split `app.js` → `store.js, expenses.js, budgets.js, categories.js, reports.js, onboarding.js`.
- Schema v2: `expenses {id, amountKobo, categoryId, owner: personal|business, date, time, paymentMethod, location, notes, receiptIds[], recurringId?}`, `budgets {monthlyKobo, categories{}}`, stub `savings{}, recurring{}`.
- Fix WAT date bug: replace `toISOString()` (`app.js:23,405`) with local-date helpers.
- Validation: central `validateExpense()` (amount > 0, category exists, sane date); remove `alert`/`prompt`.
- Escape HTML in `txnHtml` (`app.js:280`) — XSS via description/location.
- Debounce category-budget inputs (`app.js:383` re-renders per keystroke).
- JSON versioned export + CSV import round-trip (export exists `app.js:471`).
- Acceptance: Vitest green, zero `alert`/`prompt`, migration v1→v2 tested.

## Phase 4 — MVP polish (PRD Sec 4–7,10,15,18,20–21)

- Onboarding (`app.js:72`): progress indicator, skip path clears monthly, draft survives reload.
- Dashboard: month switcher, correct `null` vs `0` budget handling (`app.js:244`).
- Transactions: virtualize >500 rows, saved filters, sort, bulk delete, receipt badge slot.
- Budgets: keep 80%/100% copy non-judgmental; combined monthly + category mode.
- Reports: month picker, prev-month deltas, top-category % bars.
- Acceptance (PRD Sec-26 E2E < 60s): Personal → ₦250,000 budget → +₦2,500 Food → dashboard updates.

## Phase 5 — Phase 2 features (PRD Sec 8,9,11,12,14,16 + Sec-24)

1. Savings goals — CRUD, contributions, progress, target-date projection.
2. Insights — descriptive, non-judgmental ("Food is 38% this week, up ₦4k").
3. Calendar view — month grid, daily totals, tap-to-day list (Sec-11).
4. Recurring — rent/electricity/internet/school fees/subscriptions/loan/family support + frequency + due reminders (Sec-12).
5. Notifications — daily/budget/recurring/savings toggles (Sec-16); Web Notifications + in-app center.
6. Receipts — attach on Detailed Expense (`index.html:183`); local thumbs → **Cloudflare R2** upload via presigned URL, keys in local Postgres (Sec-14).
7. Advanced reports — weekly/monthly/custom, budget performance, savings progress (Sec-15).
8. Personal/Business separation — owner toggle + filtered dashboards (Sec-19).
- Acceptance: each behind feature flag; upgrade migration tested.

## Phase 6 — Phase 3 explorations (PRD Sec-25)

Household/shared expenses, exportable PDF reports, multiple wallets/accounts, advanced planning.
Requires local API + Better Auth multi-session + R2. Stays on this machine until you choose otherwise.

## Phase 7 — Cross-cutting & release

- Security/privacy: no PII in logs, sanitize CSV/XSS, backup reminder.
- Performance: <100KB vanilla bundle, image compression, lazy reports.
- i18n: `en-NG` strings file; later Pidgin / Yoruba / Hausa / Igbo category aliases.
- Release: semver, changelog, GitHub Releases, demo deploy (Pages/Netlify), update `README.md:48` run docs.

Order: 0 → 1 → 2 → 3 → 4 → 5 (savings → calendar → recurring → receipts → insights) → 6.
Core cycle throughout: Record → Understand → Budget → Save → Improve.
