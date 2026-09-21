# Naija Ledger

**Know Where Your Money Goes.**

Naija Ledger is a simple, Nigeria-focused spending tracker. It helps people quickly record everyday expenses — food, transport, airtime, data, electricity, health, education and more — then understand daily and monthly spending through summaries, category breakdowns and flexible budgets.

## The problem it solves

Many people in Nigeria track spending in their head, on paper, or not at all. That makes it hard to answer basic questions:

- How much did I spend today / this month?
- Which categories consume the most money?
- Am I staying within my monthly or category budgets?
- Where can I cut back to save for rent, school fees, business capital or emergencies?

Naija Ledger makes recording money easy and understanding money clear, without shaming the user.

## Target users

- **Personal** — individuals tracking daily life spending
- **Student** — school fees, books, food, transport, data
- **Family** — household, children, family support
- **Business** — stock, supplies, staff, business utilities
- **Personal + Business** — keep both separate in one place

Users can change their profile type later in Profile settings.

## Main features (MVP)

This initial version implements the PRD MVP scope:

- **Onboarding:** welcome → profile type → category selection → optional budget → start tracking
- **Dashboard:** today's total + transaction count, monthly total + budget remaining + % used, category summary, recent transactions, prominent Quick Add
- **Quick Expense:** amount + category (+ description) for fast entry
- **Detailed Expense:** amount, category, description, date, time, payment method (Cash / Bank transfer / Debit card / POS / Mobile payment / Other), location, notes
- **Nigerian default categories:** Food & Drinks, Transportation, Communication, Home & Utilities, Personal, Health, Education, Family, Financial, Business, Other
- **Custom categories:** create, rename, remove
- **Transaction history:** view all, search, filter by category / date / amount / payment method, view details, edit, delete
- **Budgets:** overall monthly budget + per-category limits + combined use, progress bars, 80% warning and 100% exceeded alerts, or track with no budget
- **Summaries:** daily spending summary, monthly spending summary, basic spending breakdown
- **Reports (basic):** today vs yesterday, this month vs last month, top categories, last-7-days pattern, category breakdown
- **Profile / settings:** name, profile type, currency (default ₦), category management, JSON/CSV export, reset data

Data is stored locally in the browser via `localStorage` under the key `naijaLedger.v1`. No backend or account needed.

Deferred to Phase 2 per PRD: savings goals, advanced insights, calendar view, recurring expenses, notifications, receipt attachments, advanced reports.

## How to run the project

No build step required. Static HTML/CSS/JS.

Option 1 — open directly:
1. Open the project folder `naija ledger`
2. Double-click `index.html` to open in Chrome / Edge / Firefox

Option 2 — serve locally (recommended, avoids file:// quirks):
```powershell
# from the project folder
npx serve .
# or with Python, if installed:
python -m http.server 8000
```
Then visit `http://localhost:8000` (or the port shown).

Files:
- `index.html` — app structure and screens
- `styles.css` — styling
- `app.js` — all MVP logic
- `Naija_Ledger_PRD.docx` — product requirements (source of truth, do not delete)
- `README.md` — this file

## Example journey

1. Open Naija Ledger, select `Personal`
2. Set monthly budget `₦250,000`
3. Dashboard shows today's and monthly spending + remaining budget
4. Tap `+ Add Expense` → Quick Expense → `₦2,500` → Food
5. Dashboard updates; review top categories and budget usage at month-end

Core cycle: **Record → Understand → Budget → Save → Improve**
