# Contributing to Naija Ledger

Thanks for helping build Naija Ledger — *Know Where Your Money Goes.*

## Ground rules

- Product source of truth: `Naija_Ledger_PRD.docx` (never delete it).
- Locked stack: local PostgreSQL, Better Auth, Cloudflare R2, local-device hosting. No Supabase, no Vercel.
- UX: simple, Nigerian-focused (₦), clear, flexible, non-judgmental. See `IMPLEMENTATION_PLAN.md` Phase 1.
- Secrets (`.env`, R2 keys, DB passwords) are never committed.

## Workflow

1. Work in small phases per `IMPLEMENTATION_PLAN.md` — one phase at a time.
2. Branch from `main`: `phase-N-short-name` (e.g. `phase-1-design-tokens`).
3. Keep PRs small and focused; link the plan phase/section.
4. CI must be green (`node --check app.js`, required files present, no Word lock files tracked).

## Running locally

No build step for the static MVP — open `index.html`, or serve the folder:

```powershell
npx serve .
```

View the design system at `design-system.html`.

## Commit messages

Short, imperative: `Add category color tokens`, `Fix WAT date bug in reports`.
