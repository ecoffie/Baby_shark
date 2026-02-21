# Baby Shark Project

Low-competition federal contract intelligence for international clients. Identifies awards with 1–2 bidders and values over $1M (preferably $5M+), focusing on products and large IDIQs (LOGCAP, WEXMAC).

## Data Sources

- **USA Spending API** — Free, no auth; contract awards with amount, extent_competed, place_of_performance
- **Tango API** (makegov.com) — Opportunities, vehicles (IDIQs), forecasts; 20–60 min refresh
- **SAM.gov** — Contract awards, opportunities (via Tango or direct)

## Tech Stack (Planned)

- Next.js 16, TypeScript, Tailwind, Supabase

## Project Structure

```
Baby Shark Project/
├── PLAN.md          # Full implementation plan
├── README.md        # This file
└── (to be created)
    ├── src/
    │   ├── app/
    │   │   ├── api/
    │   │   │   ├── ingest/
    │   │   │   └── search/
    │   │   └── page.tsx
    │   └── lib/
    │       ├── usaspending.ts
    │       └── tango.ts
    └── supabase/
        └── migrations/
```

## Getting Started

See [PLAN.md](./PLAN.md) for the full implementation plan and data source details.
