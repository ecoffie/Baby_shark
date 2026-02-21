/**
 * GET /api/brief/[awardId] — Full intelligence brief for a single opportunity
 * 5 sections: Essentials, Client Fit, Incumbent, Recompete Signals, Next Steps
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

interface RouteContext {
  params: Promise<{ awardId: string }>;
}

export async function GET(_req: NextRequest, context: RouteContext) {
  const { awardId } = await context.params;
  const supabase = getSupabase();

  try {
    // Fetch the award
    const { data: award, error } = await supabase
      .from("low_competition_awards")
      .select("*")
      .eq("award_id", awardId)
      .single();

    if (error || !award) {
      return NextResponse.json(
        { ok: false, error: error?.message ?? "Award not found" },
        { status: 404 }
      );
    }

    // Fetch incumbent's other awards
    const { data: incumbentAwards } = award.recipient_name
      ? await supabase
          .from("low_competition_awards")
          .select("award_id, title, amount, award_date, agency")
          .eq("recipient_name", award.recipient_name)
          .neq("award_id", awardId)
          .order("amount", { ascending: false })
          .limit(10)
      : { data: [] };

    // Recompete analysis
    const awardDate = award.award_date ? new Date(award.award_date) : null;
    const ageYears = awardDate
      ? (Date.now() - awardDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
      : null;

    let recompeteSignal: "strong" | "moderate" | "weak" | "unknown" = "unknown";
    let estimatedRecompete: string | null = null;

    if (ageYears != null) {
      if (ageYears >= 4) {
        recompeteSignal = "strong";
        estimatedRecompete = "Within 12 months";
      } else if (ageYears >= 3) {
        recompeteSignal = "moderate";
        estimatedRecompete = "12-24 months";
      } else if (ageYears >= 1) {
        recompeteSignal = "weak";
        estimatedRecompete = "2-4 years";
      }
    }

    const fitDetails = award.fit_details ?? {};

    const brief = {
      essentials: {
        title: award.title,
        agency: award.agency,
        amount: award.amount,
        number_of_offers: award.number_of_offers,
        psc_code: award.psc_code,
        naics: award.naics,
        place_of_performance_country: award.place_of_performance_country,
        award_date: award.award_date,
        parent_idv: award.parent_idv,
        recipient_name: award.recipient_name,
        usa_spending_url: award.usa_spending_url,
      },
      client_fit: {
        fit_score: award.fit_score ?? 0,
        brief_category: award.brief_category ?? "low",
        naics: { score: fitDetails.naics_score, reason: fitDetails.naics_reason },
        psc: { score: fitDetails.psc_score, reason: fitDetails.psc_reason },
        geographic: { score: fitDetails.geo_score, reason: fitDetails.geo_reason },
        agency: { score: fitDetails.agency_score, reason: fitDetails.agency_reason },
        competition: { score: fitDetails.competition_score, reason: fitDetails.competition_reason },
        amount: { score: fitDetails.amount_score, reason: fitDetails.amount_reason },
      },
      incumbent: {
        name: award.recipient_name,
        other_awards_count: incumbentAwards?.length ?? 0,
        other_awards: incumbentAwards ?? [],
        total_other_value: (incumbentAwards ?? []).reduce(
          (sum: number, a: { amount?: number }) => sum + (Number(a.amount) || 0),
          0
        ),
      },
      recompete_signals: {
        award_date: award.award_date,
        age_years: ageYears ? Math.round(ageYears * 10) / 10 : null,
        signal_strength: recompeteSignal,
        estimated_recompete: estimatedRecompete,
      },
      next_steps: fitDetails.suggested_actions ?? ["Track for future reference"],
    };

    return NextResponse.json({ ok: true, brief });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
