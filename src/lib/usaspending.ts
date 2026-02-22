/**
 * USA Spending API client for Baby Shark
 * Free, no auth required.
 * Endpoint: POST https://api.usaspending.gov/api/v2/search/spending_by_award/
 *
 * Filters: amount >= $1M, extent_competed (low-competition), industrial-supply PSC,
 * place_of_performance_scope: foreign for international.
 */

const USA_SPENDING_API = "https://api.usaspending.gov/api/v2/search/spending_by_award/";

const FIELDS = [
  "Award ID",
  "Description",
  "Award Amount",
  "Recipient Name",
  "Awarding Agency",
  "Place of Performance Country Code",
  "Start Date",
  "number_of_offers_received",
  "parent_award_piid",
  "extent_competed",
  "NAICS Code",
  "PSC Code",
];

export interface USAspendingFilters {
  award_amounts?: { lower_bound?: number; upper_bound?: number }[];
  extent_competed_type_codes?: string[];
  place_of_performance_scope?: "domestic" | "foreign";
  award_type_codes?: string[];
  psc_codes?: { require?: [string, string][] };
}

export interface USAspendingAward {
  "Award ID": string;
  "Award Amount": number;
  Description: string;
  "Recipient Name": string;
  "Awarding Agency": string;
  "Place of Performance Country Code": string | null;
  "Start Date": string | null;
  number_of_offers_received: number | null;
  parent_award_piid: string | null;
  extent_competed: string | null;
  "NAICS Code": string | null;
  "PSC Code": string | null;
  generated_internal_id: string;
}

export async function searchSpendingByAward(
  filters: USAspendingFilters,
  page = 1,
  limit = 100
): Promise<{ results: USAspendingAward[]; page_metadata: { total: number } }> {
  const response = await fetch(USA_SPENDING_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filters: {
        award_amounts: filters.award_amounts ?? [{ lower_bound: 1_000_000 }],
        extent_competed_type_codes: filters.extent_competed_type_codes ?? ["C", "G", "NDO", "E"],
        place_of_performance_scope: filters.place_of_performance_scope ?? "foreign",
        award_type_codes: filters.award_type_codes ?? ["A", "B", "C", "D"],
        ...(filters.psc_codes && { psc_codes: filters.psc_codes }),
      },
      fields: FIELDS,
      page,
      limit,
      order: "desc",
      sort: "Award Amount",
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`USA Spending API error: ${response.status} — ${body.slice(0, 200)}`);
  }

  const data = (await response.json()) as {
    results: USAspendingAward[];
    page_metadata: { total: number };
  };
  return data;
}

/**
 * Search USA Spending for historical awards matching a solicitation.
 * Used to determine: was this ever solicited before? How many bidders?
 * Searches by keyword (title), NAICS, and agency to find prior awards.
 */
export async function searchHistoricalAwards(opts: {
  keywords?: string;
  naics?: string;
  agency?: string;
  solicitationNumber?: string;
}): Promise<USAspendingAward[]> {
  const allResults: USAspendingAward[] = [];
  const seen = new Set<string>();

  // Strategy 1: Search by keyword from the title (most reliable cross-reference)
  if (opts.keywords && opts.keywords.length > 5) {
    // Extract key terms — take first 3 meaningful words (skip generic ones)
    const skipWords = new Set(["the", "of", "for", "and", "to", "in", "a", "an", "services", "support", "contract", "task", "order"]);
    const terms = opts.keywords
      .replace(/[^a-zA-Z0-9\s]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !skipWords.has(w.toLowerCase()))
      .slice(0, 4)
      .join(" ");

    if (terms.length > 3) {
      try {
        const response = await fetch("https://api.usaspending.gov/api/v2/search/spending_by_award/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filters: {
              award_type_codes: ["A", "B", "C", "D"],
              award_amounts: [{ lower_bound: 1_000_000 }],
              keywords: [terms],
              ...(opts.naics ? { naics_codes: { require: [opts.naics] } } : {}),
            },
            fields: [...FIELDS, "generated_internal_id"],
            page: 1,
            limit: 25,
            order: "desc",
            sort: "Award Amount",
          }),
        });

        if (response.ok) {
          const data = (await response.json()) as { results: USAspendingAward[] };
          for (const r of data.results ?? []) {
            const id = r.generated_internal_id ?? r["Award ID"];
            if (!seen.has(id)) {
              seen.add(id);
              allResults.push(r);
            }
          }
        }
      } catch {
        // Non-fatal — continue with other strategies
      }
    }
  }

  // Strategy 2: Search by NAICS + agency combo (catches related work)
  if (opts.naics && opts.agency) {
    try {
      // Extract first meaningful word from agency
      const agencyKeyword = opts.agency.split(/[>\-\/]/).pop()?.trim().split(/\s+/).slice(0, 2).join(" ");

      const response = await fetch("https://api.usaspending.gov/api/v2/search/spending_by_award/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filters: {
            award_type_codes: ["A", "B", "C", "D"],
            award_amounts: [{ lower_bound: 1_000_000 }],
            naics_codes: { require: [opts.naics] },
            ...(agencyKeyword ? { keywords: [agencyKeyword] } : {}),
          },
          fields: [...FIELDS, "generated_internal_id"],
          page: 1,
          limit: 15,
          order: "desc",
          sort: "Award Amount",
        }),
      });

      if (response.ok) {
        const data = (await response.json()) as { results: USAspendingAward[] };
        for (const r of data.results ?? []) {
          const id = r.generated_internal_id ?? r["Award ID"];
          if (!seen.has(id)) {
            seen.add(id);
            allResults.push(r);
          }
        }
      }
    } catch {
      // Non-fatal
    }
  }

  // Final filter: ensure nothing under $1M slips through
  return allResults.filter((r) => (r["Award Amount"] ?? 0) >= 1_000_000);
}
