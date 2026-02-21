/**
 * Search low-competition awards
 * GET /api/search?min_amount=1000000&max_offers=2&agency=USACE&page=1&limit=50
 */

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const minAmount = sp.get("min_amount") ? Number(sp.get("min_amount")) : 1_000_000;
  const maxAmount = sp.get("max_amount") ? Number(sp.get("max_amount")) : null;
  const maxOffers = sp.get("max_offers") ? Number(sp.get("max_offers")) : null;
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const limit = Math.min(100, Math.max(1, Number(sp.get("limit")) || 50));
  const offset = (page - 1) * limit;
  const place = sp.get("place") || null;
  const parentIdv = sp.get("parent_idv") || null;
  const agency = sp.get("agency") || null;
  const naics = sp.get("naics") || null;
  const psc = sp.get("psc") || null;
  const dateFrom = sp.get("date_from") || null;
  const dateTo = sp.get("date_to") || null;
  const q = sp.get("q") || null;
  const sortField = sp.get("sort") || "amount";
  const sortDir = sp.get("dir") === "asc" ? true : false;

  let query = supabase
    .from("low_competition_awards")
    .select(
      "award_id, title, agency, amount, number_of_offers, extent_competed, psc_code, naics, recipient_name, place_of_performance_country, parent_idv, award_date, usa_spending_url",
      { count: "exact" }
    )
    .gte("amount", minAmount)
    .order(sortField, { ascending: sortDir })
    .range(offset, offset + limit - 1);

  if (maxAmount) query = query.lte("amount", maxAmount);
  if (maxOffers) query = query.lte("number_of_offers", maxOffers);
  if (place) query = query.eq("place_of_performance_country", place);
  if (parentIdv) query = query.ilike("parent_idv", `%${parentIdv}%`);
  if (agency) query = query.ilike("agency", `%${agency}%`);
  if (naics) query = query.ilike("naics", `%${naics}%`);
  if (psc) query = query.ilike("psc_code", `%${psc}%`);
  if (dateFrom) query = query.gte("award_date", dateFrom);
  if (dateTo) query = query.lte("award_date", dateTo);
  if (q) query = query.ilike("title", `%${q}%`);

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    results: data,
    total: count ?? 0,
    page,
    limit,
  });
}
