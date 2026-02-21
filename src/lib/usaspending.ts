/**
 * USA Spending API client for Baby Shark
 * Free, no auth required.
 * Endpoint: POST https://api.usaspending.gov/api/v2/search/spending_by_award/
 *
 * Filters: amount >= $1M, extent_competed (low-competition), industrial-supply PSC,
 * place_of_performance_scope: foreign for international.
 */

const USA_SPENDING_API = "https://api.usaspending.gov/api/v2/search/spending_by_award/";

export interface USAspendingFilters {
  award_amounts?: { lower_bound?: number; upper_bound?: number };
  extent_competed_type_codes?: string[];
  place_of_performance_scope?: "domestic" | "foreign";
  award_type_codes?: string[];
  psc_codes?: { require?: [string, string][] };
}

export interface USAspendingAward {
  id: string;
  award_amount: number;
  description: string;
  recipient_name: string;
  number_of_offers_received?: number;
  extent_competed?: string;
  period_of_performance?: { start_date: string; end_date: string };
  place_of_performance?: { country_code?: string };
  awarding_agency?: { toptier_agency?: { name: string } };
  parent_award_id?: string;
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
        award_amounts: filters.award_amounts ?? { lower_bound: 1_000_000 },
        extent_competed_type_codes: filters.extent_competed_type_codes ?? ["C", "G", "NDO", "E"],
        place_of_performance_scope: filters.place_of_performance_scope ?? "foreign",
        award_type_codes: filters.award_type_codes ?? ["A", "B", "C", "D"],
        ...(filters.psc_codes && { psc_codes: filters.psc_codes }),
      },
      page,
      limit,
      order: "desc",
      sort: "award_amount",
    }),
  });

  if (!response.ok) {
    throw new Error(`USA Spending API error: ${response.status}`);
  }

  const data = (await response.json()) as {
    results: USAspendingAward[];
    page_metadata: { total: number };
  };
  return data;
}
