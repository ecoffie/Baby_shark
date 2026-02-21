# Baby Shark Project — Low-Competition Federal Contract Intelligence

## Objective

Create a search engine/database that finds federal contract awards with **1-2 bidders maximum** and **values over $1M** (preferably $5M+), **products-focused**, to help an **international client** identify and bid on low-competition opportunities. The system will reverse-engineer historical patterns so when similar opportunities appear on SAM.gov and other bid platforms, the client can identify and pursue them.

**Target vehicles:** Large IDIQs with international scope (LOGCAP, WEXMAC, etc.) where task orders often have 1–2 bidders among IDV holders.

---

## Client Company Intelligence — Micron Ventures

**Business model:** Industrial supply chain (supplier, not prime contractor). Direct supply to government + subcontractor to primes.

| Profile Field | Value |
|---------------|-------|
| **Core business** | Supply chain services, building supply, logistics |
| **Verticals** | Construction, MRO, industrial equipment, vehicle supplies, maritime supplies (NOT IT/electronics) |
| **Capabilities** | Steel, firestop, flooring, industrial consumables, vehicle/maritime parts |
| **Scale** | 90M+ supply orders, 28M+ shipping—financial capacity for large orders |
| **Past wins** | USACE Middle East (Egypt), NAVFAC Diego Garcia, US Embassy Abu Dhabi |
| **Geographic focus** | Guam, Pacific, Diego Garcia, Middle East (Egypt, UAE, Beirut), South America |
| **Agencies** | USACE, NAVFAC, State Dept |

**PSC/NAICS:** Construction materials, MRO, industrial equipment, vehicle/maritime supplies (e.g., 423510, 332310, 493, 484).

*Store in `client_profile` and use to:*
- Pre-filter by NAICS/PSC and geographic focus
- Score opportunities by fit (supplier opportunity, materials-heavy scope)
- Prioritize LOGCAP, WEXMAC, Guam/Pacific IDIQs

---

## Data Source Research Summary

### Tango API (makegov.com) — High-Value Addition

**Tango API** consolidates FPDS, USAspending, SAM.gov, Grants.gov, and agency feeds into a unified, developer-friendly platform. It fills gaps where public APIs are rate-limited or incomplete.

- **Base URL:** `https://tango.makegov.com/api/` — [Docs](https://tango.makegov.com/docs/)
- **Auth:** API key or OAuth2 (required)
- **Key endpoints for Baby Shark:**

| Endpoint | Purpose | Why It Matters |
|----------|---------|----------------|
| `/api/opportunities/` | SAM.gov contract opportunities | 20–60 min refresh; `place_of_performance` (country, city, state); avoids SAM.gov 10 req/day limit |
| `/api/vehicles/` | IDIQ vehicle groupings (LOGCAP, WEXMAC, etc.) | `awardee_count`, `order_count`, `vehicle_obligations`, `competition_details` (incl. `number_of_offers_received`) |
| `/api/forecasts/` | Upcoming procurements (HHS, DHS, etc.) | Opportunities **before** they hit SAM.gov |
| `/api/contracts/`, `/api/idvs/` | Definitive contracts and IDVs | FPDS/USAspending data with normalized schemas |
| **Webhooks** | Near-real-time notifications | New awards, opportunities, entities, forecasts — no polling |

- **Vehicles API** is ideal for large IDIQs: search by `solicitation_identifier` (e.g. LOGCAP V, WEXMAC TITUS), expand `competition_details` for `number_of_offers_received`, get task-order counts and obligations.

### USA Spending API (Primary — Free, No Auth)

- **Endpoint:** `POST https://api.usaspending.gov/api/v2/search/spending_by_award/`
- **Relevant filters:**
  - `award_amounts`: `{ lower_bound: 1000000 }` or `5000000`
  - `extent_competed_type_codes`: `C`, `G`, `NDO`, `E` (low-competition proxies)
  - `psc_codes`: Industrial supplies—construction (10, 56xx), MRO, vehicle (23xx), maritime (19xx), industrial equipment (43xx)
  - `place_of_performance_scope`: `"foreign"` for **international**; include Guam, Pacific territories, Diego Garcia (BIOT), Middle East
  - `award_type_codes`: `["A","B","C","D"]` for contracts
- **Number of Offers Received:** Returned as field, not filterable; many nulls. Client-side filter where ∈ {1, 2}.

### SAM.gov / FPDS (Public)

- **Contract Awards API:** [GSA Open Technology](https://open.gsa.gov/api/contract-awards/)
- **Get Opportunities API:** `https://api.sam.gov/opportunities/v2/search` — 10 req/day public, 1,000/day entity-registered
- **Bulk options:** USA Spending bulk download or PostgreSQL dump at [files.usaspending.gov](https://files.usaspending.gov/database_download/)

### Large IDIQ Vehicles — International Focus

| Vehicle | Ceiling | Scope | Relevance |
|---------|---------|-------|------------|
| **LOGCAP V** | $82B | Army; global (NORTHCOM, SOUTHCOM, EUCOM, AFRICOM, CENTCOM, PACOM) | Logistics, base ops, sustainment — inherently international |
| **WEXMAC TITUS 2.2** | $55B | NAVSUP; expeditionary ops, humanitarian, contingency | Supplies, lodging, logistics, medical — domestic + OCONUS |
| **Guam DBMACC** | $15B | NAVFAC Pacific; military construction primarily Guam | Subcontract opportunities for steel, firestop, materials |
| **Pacific Deterrence Initiative (PDI) IDIQ** | $15B | NAVFAC Pacific; Indo-Pacific design-build | Guam, Philippines, etc.—prime contractors need materials |
| **IMACC** (Indo-Pacific MACC) | $990M | NAVFAC Pacific | Guam, Caroline Islands, N Mariana Islands, Philippines, Australia—facilities, warehouses, runways |
| **Diego Garcia MACC** | $1.5B | NAVFAC; British Indian Ocean Territory | Micron already won here—strong fit |
| **Guam SB-DBMACC** | $600M | NAVFAC Pacific; small business Guam construction | 30% small biz subcontracting goal—supplier opportunities |

- Task orders under these IDIQs often have **1–2 bidders** (competition among IDV holders).
- Tango **Vehicles API** can query by vehicle, return `awardee_count`, `order_count`, `competition_details.number_of_offers_received`.
- USA Spending: filter child awards under parent IDV by `award_amounts` and `place_of_performance_scope: "foreign"`.

### International Client Considerations

- **place_of_performance_scope**: `"foreign"` in USA Spending; `place_of_performance.country` in Tango Opportunities
- **place_of_manufacture** codes: G, H, I, J, K, L allow foreign/TAA-eligible products
- **recipient_scope**: `domestic` vs `foreign` — some contracts restrict to US firms
- **TAA/BAA:** Client must verify eligibility per solicitation; document restrictions in UI

---

## Architecture

- **Data flow:** USA Spending (free) + Tango (opportunities, vehicles, forecasts) → ETL → Supabase. Tango webhooks can push new data for near-real-time monitoring.

---

## Implementation Plan

### Phase 1: Project Setup and Data Ingestion

1. **Tech stack:** Next.js 16, TypeScript, Tailwind, Supabase (PostgreSQL).
2. **Database schema:**
   - `low_competition_awards` — award_id, title, agency, amount, number_of_offers, extent_competed, psc_code, naics, award_date, usa_spending_url, recipient_name, place_of_performance_country, parent_idv (for task orders), etc.
   - `idiq_vehicles` — vehicle_uuid, solicitation_identifier, awardee_count, order_count, vehicle_obligations (LOGCAP, WEXMAC, Guam, Diego Garcia, etc.)
   - `expiring_idiqs` — idv_key, piid, solicitation_identifier, last_date_to_order, agency, vehicle_obligations, order_count, place_of_performance (from Tango IDVs)
   - `client_profile` — business_model, NAICS, PSC, geographic_focus, preferred_agencies, prior_wins (populated from Micron profile)
   - `ingestion_log` — track last sync, page counts, errors.
3. **ETL — USA Spending** (free, no auth)
4. **ETL — Tango API** (requires API key)
5. **Admin trigger:** Manual button; later Vercel cron + optional Tango webhooks.

### Phase 2: Search Engine UI

1. **Search page:** Filters for amount range ($1M–$5M, $5M+), NAICS, PSC, agency, date range, number of offers (1 vs 2), place of performance (domestic/foreign), parent vehicle (LOGCAP, WEXMAC, etc.).
2. **Results table:** Sortable columns, links to USA Spending award pages, Tango opportunity URLs.
3. **Export:** CSV export of filtered results.
4. **Pattern summary:** Aggregate by agency, NAICS, PSC, vehicle to show "sweet spots."
5. **Client fit score:** When `client_profile` is populated, score opportunities by NAICS/PSC/geographic match.

### Phase 3: Bid Platform Monitoring (Tango-First)

1. **Tango Opportunities API** — 20–60 min refresh; no 10 req/day limit with Tango key
2. **Tango Forecasts:** Upcoming HHS, DHS procurements before they hit SAM.gov.
3. **Tango Webhooks:** Subscribe to new opportunities, awards, forecasts for near-real-time alerts.
4. **Matching logic:** Historical patterns → query Tango for matching opportunities.
5. **Alert/store:** Save matching opportunities, optional email digest.

### Phase 4: Reverse-Engineering and Recompete Detection

1. **Recompete signals:** Awards with end dates in next 12–24 months → likely recompetes.
2. **Expiring IDIQs:** Tango IDVs API exposes `period_of_performance.last_date_to_order`. Filter IDVs where last_date_to_order is in next 12–24 months; store in `expiring_idiqs` table. Surface in UI for task-order rush + recompete solicitation tracking.
3. **Pattern library:** Store "winning patterns" (agency, NAICS, PSC, extent_competed) for client to prioritize.
4. **Bid readiness checklist:** Per opportunity, show historical award details (incumbent, amount, competition level) to inform bid strategy.

---

## Key Files to Create

| File | Purpose |
|------|---------|
| `package.json` | Next.js 16, Supabase, Tailwind |
| `src/app/api/ingest/route.ts` | USA Spending + Tango ETL |
| `src/app/api/ingest/expiring/route.ts` | Tango IDVs expiring IDIQs (last_date_to_order) |
| `src/app/api/search/route.ts` | Query low_competition_awards + idiq_vehicles + expiring_idiqs |
| `src/app/page.tsx` | Search UI (incl. international, vehicle, expiring filters) |
| `supabase/migrations/001_schema.sql` | Awards, vehicles, expiring_idiqs, client_profile, ingestion_log |
| `src/lib/usaspending.ts` | USA Spending client |
| `src/lib/tango.ts` | Tango API client (opportunities, vehicles, IDVs, forecasts) |

---

## Reuse from Market Assassin

- **USA Spending patterns:** `government-contracts/search/route.ts` — filter structure, field names, pagination
- **PSC/NAICS helpers:** `usaspending-helpers.ts` — naicsExpansion, setAsideMap
- **Government contracts lib:** `government-contracts.ts` — types, enhanceOfficeName

---

## Recommended First Steps

1. **Project setup:** Next.js 16, TypeScript, Tailwind, Supabase; create schema (awards, vehicles, expiring_idiqs, client_profile, ingestion_log).
2. **USA Spending ingestion:** Amount ≥ $1M, extent_competed C/G/NDO/E, industrial-supply PSC (construction, MRO, vehicle, maritime), `place_of_performance_scope: "foreign"` for international.
3. **Client-side filter:** `Number of Offers Received` ∈ {1, 2}.
4. **Tango API:** Obtain key; integrate Vehicles API (LOGCAP, WEXMAC, Guam, Diego Garcia) and IDVs API for expiring IDIQs (`last_date_to_order`).
5. **Search UI:** Minimal filters + CSV export (place of performance, parent vehicle).
6. **Client profile:** Populate from Micron; add fit scoring for supplier opportunities.
7. **Expiring IDIQs pipeline:** ETL for IDVs with `last_date_to_order` in 12–24 months; surface in UI.
