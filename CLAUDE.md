## Workflow Orchestration

### 1. Plan Node Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately - don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy
- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One tack per subagent for focused execution

### 3. Self-Improvement Loop
- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project

### 4. Verification Before Done
- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

### 5. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes - don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing
- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests - then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

## Task Management

1. **Plan First**: Write plan to `tasks/todo.md` with checkable items
2. **Verify Plan**: Check in before starting implementation
3. **Track Progress**: Mark items complete as you go
4. **Explain Changes**: High-level summary at each step
5. **Document Results**: Add review section to `tasks/todo.md`
6. **Capture Lessons**: Update `tasks/lessons.md` after corrections

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimize Impact**: Changes should only touch what's necessary. Avoid introducing bugs.

## Project: Baby Shark

### Stack
- Next.js 15 / React 19 / TypeScript / Tailwind CSS
- Supabase (PostgreSQL) — all data lives here
- Vercel — deploy with `npx vercel --yes --prod`
- Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SAM_GOV_API_KEY`

### Deploy Workflow
1. `npx tsc --noEmit` — type check
2. `npm run build` — catch lint/build errors
3. `npx vercel --yes --prod` — ship it
4. Verify live endpoint with curl after deploy

### Key Patterns
- API routes in `src/app/api/` — all server-side, use `getSupabase()`
- Scoring engine (`src/lib/scoring.ts`) — 100-point formula, scores 3 tables
- Multi-source ingest (`/api/ingest`) — USA Spending + SAM.gov + Tango in parallel
- Historical cross-ref (`searchHistoricalAwards`) — checks if an RFP is a recompete, how many bid before
- All monetary filters: **$1M minimum floor** — enforced at API query + client-side

### Don't Touch
- `client_profile` seed data — Micron Ventures' NAICS/PSC/geo/agencies are client-specific
- Applied migrations (001, 002, 003) — add new migrations, never edit existing
- Vercel function timeouts in `vercel.json` — ingest needs 300s for SAM.gov pagination

### Gotchas
- Supabase upsert with partial rows fails on NOT NULL columns — use `.update()` instead
- SAM.gov API takes ~160s for full ingest — Vercel default 10s timeout will kill it
- Folder name has spaces ("Baby Shark Project") — use `--name baby-shark` or quotes in paths
- SAM.gov date format is `MM/dd/yyyy`, not ISO
