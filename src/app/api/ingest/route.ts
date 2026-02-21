/**
 * USA Spending ETL — ingest low-competition awards into Supabase
 * POST /api/ingest — triggers ingestion (manual or cron)
 */

import { NextResponse } from "next/server";
import { searchSpendingByAward } from "@/lib/usaspending";
import { supabase } from "@/lib/supabase";

const MAX_PAGES = 5; // Limit for initial runs; increase for full sync
const PAGE_SIZE = 100;

export async function POST() {
  const startedAt = new Date().toISOString();
  let totalRecords = 0;
  let pageCount = 0;
  let error: string | null = null;

  try {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const { results, page_metadata } = await searchSpendingByAward(
        {
          award_amounts: { lower_bound: 1_000_000 },
          extent_competed_type_codes: ["C", "G", "NDO", "E"],
          place_of_performance_scope: "foreign",
          award_type_codes: ["A", "B", "C", "D"],
        },
        page,
        PAGE_SIZE
      );

      // Client-side filter: number_of_offers_received in {1, 2} (or null)
      const filtered = results.filter((r) => {
        const n = r.number_of_offers_received;
        return n == null || n === 1 || n === 2;
      });

      if (filtered.length === 0) break;

      const rows = filtered.map((r) => ({
        award_id: r.id,
        title: r.description,
        amount: r.award_amount,
        number_of_offers: r.number_of_offers_received ?? null,
        extent_competed: r.extent_competed ?? null,
        recipient_name: r.recipient_name ?? null,
        place_of_performance_country: r.place_of_performance?.country_code ?? null,
        parent_idv: r.parent_award_id ?? null,
        agency: r.awarding_agency?.toptier_agency?.name ?? null,
        award_date: r.period_of_performance?.start_date
          ? r.period_of_performance.start_date.substring(0, 10)
          : null,
        usa_spending_url: `https://usaspending.gov/award/${r.id}`,
      }));

      const { error: upsertError } = await supabase
        .from("low_competition_awards")
        .upsert(rows, { onConflict: "award_id" });

      if (upsertError) {
        error = upsertError.message;
        break;
      }

      totalRecords += rows.length;
      pageCount = page;

      if (results.length < PAGE_SIZE) break;
    }

    await supabase.from("ingestion_log").insert({
      source: "usaspending",
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      page_count: pageCount,
      record_count: totalRecords,
      error,
    });

    return NextResponse.json({
      ok: !error,
      page_count: pageCount,
      record_count: totalRecords,
      error,
    });
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    await supabase.from("ingestion_log").insert({
      source: "usaspending",
      started_at: startedAt,
      error: errMsg,
    });
    return NextResponse.json({ ok: false, error: errMsg }, { status: 500 });
  }
}
