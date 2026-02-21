/**
 * GET /api/dashboard — Multi-source dashboard with scored results
 * Supports ?category=high|medium|low, ?source=awards|opportunities|expiring, and pagination
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const supabase = getSupabase();
  const params = req.nextUrl.searchParams;

  const category = params.get("category");
  const source = params.get("source"); // awards | opportunities | expiring
  const page = Math.max(1, parseInt(params.get("page") ?? "1"));
  const limit = Math.min(100, Math.max(1, parseInt(params.get("limit") ?? "50")));
  const offset = (page - 1) * limit;

  try {
    // Summary stats for awards
    const { data: awardStats } = await supabase
      .from("low_competition_awards")
      .select("brief_category, amount, fit_score");

    const awardSummary = { high: { count: 0, total_value: 0 }, medium: { count: 0, total_value: 0 }, low: { count: 0, total_value: 0 } };
    for (const a of awardStats ?? []) {
      const cat = (a.brief_category ?? "low") as keyof typeof awardSummary;
      if (awardSummary[cat]) {
        awardSummary[cat].count++;
        awardSummary[cat].total_value += Number(a.amount) || 0;
      }
    }

    // Summary stats for opportunities
    const { data: oppStats } = await supabase
      .from("opportunities")
      .select("brief_category, award_amount, fit_score, response_deadline");

    const oppSummary = { high: { count: 0, total_value: 0 }, medium: { count: 0, total_value: 0 }, low: { count: 0, total_value: 0 } };
    for (const o of oppStats ?? []) {
      const cat = (o.brief_category ?? "low") as keyof typeof oppSummary;
      if (oppSummary[cat]) {
        oppSummary[cat].count++;
        oppSummary[cat].total_value += Number(o.award_amount) || 0;
      }
    }

    // Expiring IDIQs stats
    const { data: idiqStats } = await supabase
      .from("expiring_idiqs")
      .select("brief_category, vehicle_obligations, last_date_to_order, fit_score");

    const idiqSummary = { total: idiqStats?.length ?? 0, total_value: 0, expiring_6mo: 0, expiring_12mo: 0 };
    const now = Date.now();
    for (const i of idiqStats ?? []) {
      idiqSummary.total_value += Number(i.vehicle_obligations) || 0;
      const daysLeft = (new Date(i.last_date_to_order).getTime() - now) / (24 * 60 * 60 * 1000);
      if (daysLeft <= 180) idiqSummary.expiring_6mo++;
      if (daysLeft <= 365) idiqSummary.expiring_12mo++;
    }

    // Last ingest time
    const { data: lastIngest } = await supabase
      .from("ingestion_log")
      .select("completed_at, source")
      .order("started_at", { ascending: false })
      .limit(5);

    // Fetch results based on source filter
    let results: unknown[] = [];
    let total = 0;

    if (!source || source === "awards") {
      let query = supabase
        .from("low_competition_awards")
        .select("*, source_type:id", { count: "exact" })
        .order("fit_score", { ascending: false })
        .range(offset, offset + limit - 1);

      if (category && ["high", "medium", "low"].includes(category)) {
        query = query.eq("brief_category", category);
      }

      const { data, count, error } = await query;
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

      results = (data ?? []).map((r) => ({ ...r, _source: "awards" }));
      total = count ?? 0;
    }

    if (source === "opportunities") {
      let query = supabase
        .from("opportunities")
        .select("*", { count: "exact" })
        .order("fit_score", { ascending: false })
        .range(offset, offset + limit - 1);

      if (category && ["high", "medium", "low"].includes(category)) {
        query = query.eq("brief_category", category);
      }

      const { data, count, error } = await query;
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

      results = (data ?? []).map((r) => ({ ...r, _source: "opportunities" }));
      total = count ?? 0;
    }

    if (source === "expiring") {
      const { data, error } = await supabase
        .from("expiring_idiqs")
        .select("*")
        .order("last_date_to_order", { ascending: true });

      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

      results = (data ?? []).map((r) => ({ ...r, _source: "expiring" }));
      total = results.length;
    }

    return NextResponse.json({
      ok: true,
      summary: {
        awards: awardSummary,
        opportunities: oppSummary,
        expiring_idiqs: idiqSummary,
      },
      last_ingest: lastIngest ?? [],
      results,
      total,
      page,
      limit,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
