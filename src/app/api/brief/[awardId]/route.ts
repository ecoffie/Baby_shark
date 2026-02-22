/**
 * GET /api/brief/[awardId]?source=awards|opportunities
 * Full intelligence brief with historical cross-reference
 *
 * For opportunities (SAM.gov): searches USA Spending to find if this was
 * previously solicited and how many people bid last time.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { searchHistoricalAwards } from "@/lib/usaspending";

interface RouteContext {
  params: Promise<{ awardId: string }>;
}

export async function GET(req: NextRequest, context: RouteContext) {
  const { awardId } = await context.params;
  const source = req.nextUrl.searchParams.get("source") ?? "awards";
  const supabase = getSupabase();

  try {
    if (source === "opportunities") {
      return await buildOpportunityBrief(supabase, awardId);
    }
    return await buildAwardBrief(supabase, awardId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

/** Brief for a past award (low_competition_awards) */
async function buildAwardBrief(supabase: ReturnType<typeof getSupabase>, awardId: string) {
  const { data: award, error } = await supabase
    .from("low_competition_awards")
    .select("*")
    .eq("award_id", awardId)
    .single();

  if (error || !award) {
    return NextResponse.json({ ok: false, error: error?.message ?? "Award not found" }, { status: 404 });
  }

  // Incumbent's other awards
  const { data: incumbentAwards } = award.recipient_name
    ? await supabase
        .from("low_competition_awards")
        .select("award_id, title, amount, award_date, agency, number_of_offers")
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
    if (ageYears >= 4) { recompeteSignal = "strong"; estimatedRecompete = "Within 12 months"; }
    else if (ageYears >= 3) { recompeteSignal = "moderate"; estimatedRecompete = "12-24 months"; }
    else if (ageYears >= 1) { recompeteSignal = "weak"; estimatedRecompete = "2-4 years"; }
  }

  const fitDetails = award.fit_details ?? {};

  // Historical cross-reference: find related prior awards
  const priorAwards = await searchHistoricalAwards({
    keywords: award.title ?? undefined,
    naics: award.naics ?? undefined,
    agency: award.agency ?? undefined,
  });

  // Filter out the current award itself
  const history = priorAwards
    .filter((h) => (h.generated_internal_id ?? h["Award ID"]) !== awardId)
    .map((h) => ({
      award_id: h.generated_internal_id ?? h["Award ID"],
      title: h.Description,
      amount: h["Award Amount"],
      date: h["Start Date"],
      agency: h["Awarding Agency"],
      recipient: h["Recipient Name"],
      offers: h.number_of_offers_received,
    }));

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
        (sum: number, a: { amount?: number }) => sum + (Number(a.amount) || 0), 0
      ),
    },
    recompete_signals: {
      award_date: award.award_date,
      age_years: ageYears ? Math.round(ageYears * 10) / 10 : null,
      signal_strength: recompeteSignal,
      estimated_recompete: estimatedRecompete,
    },
    history: buildHistorySummary(history),
    next_steps: fitDetails.suggested_actions ?? ["Track for future reference"],
  };

  return NextResponse.json({ ok: true, brief });
}

/** Brief for an active opportunity (SAM.gov / DLA) */
async function buildOpportunityBrief(supabase: ReturnType<typeof getSupabase>, noticeId: string) {
  const { data: opp, error } = await supabase
    .from("opportunities")
    .select("*")
    .eq("notice_id", noticeId)
    .single();

  if (error || !opp) {
    return NextResponse.json({ ok: false, error: error?.message ?? "Opportunity not found" }, { status: 404 });
  }

  const fitDetails = opp.fit_details ?? {};

  // Cross-reference against USA Spending — the core feature
  // This tells us: has this been solicited before? Who won? How many bid?
  const priorAwards = await searchHistoricalAwards({
    keywords: opp.title ?? undefined,
    naics: opp.naics_code ?? undefined,
    agency: opp.agency ?? undefined,
    solicitationNumber: opp.solicitation_number ?? undefined,
  });

  const history = priorAwards.map((h) => ({
    award_id: h.generated_internal_id ?? h["Award ID"],
    title: h.Description,
    amount: h["Award Amount"],
    date: h["Start Date"],
    agency: h["Awarding Agency"],
    recipient: h["Recipient Name"],
    offers: h.number_of_offers_received,
    url: `https://www.usaspending.gov/award/${h.generated_internal_id ?? h["Award ID"]}`,
  }));

  // Also check our own DB for matching awards
  const { data: dbMatches } = await supabase
    .from("low_competition_awards")
    .select("award_id, title, amount, award_date, agency, recipient_name, number_of_offers, naics, psc_code")
    .gte("amount", 1_000_000)
    .or(`naics.eq.${opp.naics_code},agency.ilike.%${(opp.agency ?? "").split(">").pop()?.trim().split(" ").slice(0, 2).join(" ") ?? "NOMATCH"}%`)
    .order("amount", { ascending: false })
    .limit(15);

  const dbHistory = (dbMatches ?? []).map((a) => ({
    award_id: a.award_id,
    title: a.title,
    amount: a.amount,
    date: a.award_date,
    agency: a.agency,
    recipient: a.recipient_name,
    offers: a.number_of_offers,
    source: "database" as const,
  }));

  // Merge and deduplicate
  const seenIds = new Set(history.map((h) => h.award_id));
  const allHistory = [...history];
  for (const h of dbHistory) {
    if (!seenIds.has(h.award_id)) {
      seenIds.add(h.award_id);
      allHistory.push({ ...h, url: `https://www.usaspending.gov/award/${h.award_id}` });
    }
  }

  const historySummary = buildHistorySummary(allHistory);

  // Deadline analysis
  const deadline = opp.response_deadline ? new Date(opp.response_deadline) : null;
  const daysLeft = deadline ? Math.ceil((deadline.getTime() - Date.now()) / (24 * 60 * 60 * 1000)) : null;

  const brief = {
    essentials: {
      title: opp.title,
      agency: opp.agency,
      solicitation_number: opp.solicitation_number,
      type: opp.type,
      posted_date: opp.posted_date,
      response_deadline: opp.response_deadline,
      days_remaining: daysLeft,
      naics_code: opp.naics_code,
      classification_code: opp.classification_code,
      set_aside: opp.set_aside_description,
      place_of_performance_country: opp.place_of_performance_country,
      place_of_performance_state: opp.place_of_performance_state,
      sam_url: opp.sam_url,
      source: opp.source,
    },
    client_fit: {
      fit_score: opp.fit_score ?? 0,
      brief_category: opp.brief_category ?? "low",
      naics: { score: fitDetails.naics_score, reason: fitDetails.naics_reason },
      psc: { score: fitDetails.psc_score, reason: fitDetails.psc_reason },
      geographic: { score: fitDetails.geo_score, reason: fitDetails.geo_reason },
      agency: { score: fitDetails.agency_score, reason: fitDetails.agency_reason },
      competition: { score: fitDetails.competition_score, reason: fitDetails.competition_reason },
      amount: { score: fitDetails.amount_score, reason: fitDetails.amount_reason },
    },
    contact: {
      name: opp.contact_name,
      email: opp.contact_email,
      phone: opp.contact_phone,
    },
    history: historySummary,
    next_steps: fitDetails.suggested_actions ?? ["Track for awareness"],
  };

  return NextResponse.json({ ok: true, brief });
}

/** Build summary from historical matches */
function buildHistorySummary(history: { award_id: string; title: string; amount: number; date: string | null; agency: string; recipient: string; offers: number | null; url?: string }[]) {
  if (history.length === 0) {
    return {
      previously_solicited: false,
      is_recompete: false,
      prior_awards_count: 0,
      prior_awards: [],
      competition_history: null,
      incumbent_analysis: null,
      summary: "No prior awards found — this appears to be a new requirement.",
    };
  }

  // Competition analysis
  const withOffers = history.filter((h) => h.offers != null);
  const avgOffers = withOffers.length > 0
    ? Math.round((withOffers.reduce((s, h) => s + (h.offers ?? 0), 0) / withOffers.length) * 10) / 10
    : null;
  const minOffers = withOffers.length > 0 ? Math.min(...withOffers.map((h) => h.offers!)) : null;
  const maxOffers = withOffers.length > 0 ? Math.max(...withOffers.map((h) => h.offers!)) : null;

  // Incumbent analysis — who wins this work most?
  const recipientCounts: Record<string, { count: number; totalValue: number; lastDate: string | null }> = {};
  for (const h of history) {
    if (!h.recipient) continue;
    if (!recipientCounts[h.recipient]) {
      recipientCounts[h.recipient] = { count: 0, totalValue: 0, lastDate: null };
    }
    recipientCounts[h.recipient].count++;
    recipientCounts[h.recipient].totalValue += h.amount || 0;
    if (!recipientCounts[h.recipient].lastDate || (h.date && h.date > recipientCounts[h.recipient].lastDate!)) {
      recipientCounts[h.recipient].lastDate = h.date;
    }
  }

  const topIncumbents = Object.entries(recipientCounts)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5)
    .map(([name, data]) => ({ name, wins: data.count, total_value: data.totalValue, last_award: data.lastDate }));

  const likelyIncumbent = topIncumbents[0] ?? null;

  // Build summary text
  let summary = `Found ${history.length} prior award${history.length !== 1 ? "s" : ""} — this is likely a RECOMPETE.`;
  if (likelyIncumbent) {
    summary += ` ${likelyIncumbent.name} is the likely incumbent with ${likelyIncumbent.wins} prior win${likelyIncumbent.wins !== 1 ? "s" : ""}.`;
  }
  if (avgOffers != null) {
    summary += ` Historical competition: avg ${avgOffers} bidder${avgOffers !== 1 ? "s" : ""}`;
    if (minOffers != null && maxOffers != null && minOffers !== maxOffers) {
      summary += ` (range: ${minOffers}-${maxOffers})`;
    }
    summary += ".";
  }

  return {
    previously_solicited: true,
    is_recompete: true,
    prior_awards_count: history.length,
    prior_awards: history.slice(0, 10),
    competition_history: {
      average_bidders: avgOffers,
      min_bidders: minOffers,
      max_bidders: maxOffers,
      data_points: withOffers.length,
    },
    incumbent_analysis: {
      likely_incumbent: likelyIncumbent,
      all_incumbents: topIncumbents,
    },
    summary,
  };
}
