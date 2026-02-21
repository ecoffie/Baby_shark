/**
 * POST /api/ingest — Multi-source ingestion
 * Pulls from: USA Spending, SAM.gov (RFP/RFQ + DLA), Tango (expiring IDIQs)
 * Auto-scores everything after ingestion
 */

import { NextResponse } from "next/server";
import { searchSpendingByAward } from "@/lib/usaspending";
import { supabase } from "@/lib/supabase";
import { fetchMicronOpportunities, fetchDlaOpportunities, SamOpportunity } from "@/lib/sam";
import { fetchExpiringIdvs } from "@/lib/tango";
import { scoreAllAwards, scoreAllOpportunities, scoreAllExpiringIdiqs } from "@/lib/scoring";

const MAX_PAGES = 5;
const PAGE_SIZE = 100;

interface SourceResult {
  source: string;
  records: number;
  error: string | null;
}

/** Ingest USA Spending low-competition awards */
async function ingestUsaSpending(): Promise<SourceResult> {
  const startedAt = new Date().toISOString();
  let totalRecords = 0;
  let pageCount = 0;

  try {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const { results } = await searchSpendingByAward(
        {
          award_amounts: [{ lower_bound: 1_000_000 }],
          extent_competed_type_codes: ["C", "G", "NDO", "E"],
          place_of_performance_scope: "foreign",
          award_type_codes: ["A", "B", "C", "D"],
        },
        page,
        PAGE_SIZE
      );

      const filtered = results.filter((r) => {
        const n = r.number_of_offers_received;
        return n == null || n === 1 || n === 2;
      });

      if (filtered.length === 0) break;

      const rows = filtered.map((r) => ({
        award_id: r.generated_internal_id ?? r["Award ID"],
        title: r.Description ?? null,
        amount: r["Award Amount"] ?? null,
        number_of_offers: r.number_of_offers_received ?? null,
        extent_competed: r.extent_competed ?? null,
        recipient_name: r["Recipient Name"] ?? null,
        place_of_performance_country: r["Place of Performance Country Code"] ?? null,
        parent_idv: r.parent_award_piid ?? null,
        agency: r["Awarding Agency"] ?? null,
        psc_code: r["PSC Code"] ?? null,
        naics: r["NAICS Code"] ?? null,
        award_date: r["Start Date"] ? r["Start Date"].substring(0, 10) : null,
        usa_spending_url: `https://www.usaspending.gov/award/${r.generated_internal_id ?? r["Award ID"]}`,
      }));

      const { error: upsertError } = await supabase
        .from("low_competition_awards")
        .upsert(rows, { onConflict: "award_id" });

      if (upsertError) {
        return { source: "usaspending", records: totalRecords, error: upsertError.message };
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
    });

    return { source: "usaspending", records: totalRecords, error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { source: "usaspending", records: totalRecords, error: msg };
  }
}

/** Ingest SAM.gov opportunities (RFP/RFQ) + DLA */
async function ingestSamGov(): Promise<SourceResult> {
  const startedAt = new Date().toISOString();

  try {
    // Check if SAM API key is configured
    if (!process.env.SAM_GOV_API_KEY) {
      return { source: "sam.gov", records: 0, error: "SAM_GOV_API_KEY not configured — skipped" };
    }

    // Fetch Micron-relevant NAICS opportunities
    const micronNaics = ["423510", "332310", "493", "484"];
    const naicsOpps = await fetchMicronOpportunities(micronNaics, 6);

    // Fetch DLA opportunities
    const dlaOpps = await fetchDlaOpportunities(6);

    // Deduplicate by noticeId
    const seen = new Set<string>();
    const allOpps: (SamOpportunity & { _source: string })[] = [];

    for (const opp of naicsOpps) {
      if (!seen.has(opp.noticeId)) {
        seen.add(opp.noticeId);
        allOpps.push({ ...opp, _source: "sam.gov" });
      }
    }
    for (const opp of dlaOpps) {
      if (!seen.has(opp.noticeId)) {
        seen.add(opp.noticeId);
        allOpps.push({ ...opp, _source: "dla" });
      }
    }

    if (allOpps.length === 0) {
      return { source: "sam.gov", records: 0, error: null };
    }

    // Map to DB rows
    const rows = allOpps.map((opp) => ({
      notice_id: opp.noticeId,
      title: opp.title ?? null,
      solicitation_number: opp.solicitationNumber ?? null,
      agency: opp.fullParentPathName ?? null,
      posted_date: opp.postedDate ?? null,
      response_deadline: opp.responseDeadLine ? opp.responseDeadLine.substring(0, 10) : null,
      type: opp.type ?? null,
      naics_code: opp.naicsCode ?? null,
      classification_code: opp.classificationCode ?? null,
      set_aside: opp.typeOfSetAside ?? null,
      set_aside_description: opp.typeOfSetAsideDescription ?? null,
      place_of_performance_country: opp.placeOfPerformance?.country?.code ?? null,
      place_of_performance_state: opp.placeOfPerformance?.state?.code ?? null,
      place_of_performance_city: opp.placeOfPerformance?.city?.name ?? null,
      sam_url: opp.uiLink ?? null,
      source: opp._source,
      active: opp.active ?? "Yes",
      contact_name: opp.pointOfContact?.[0]?.fullName ?? null,
      contact_email: opp.pointOfContact?.[0]?.email ?? null,
      contact_phone: opp.pointOfContact?.[0]?.phone ?? null,
      award_date: opp.award?.date ? opp.award.date.substring(0, 10) : null,
      award_amount: opp.award?.amount ?? null,
      awardee_name: opp.award?.awardee?.name ?? null,
    }));

    // Upsert in batches of 100
    for (let i = 0; i < rows.length; i += 100) {
      const batch = rows.slice(i, i + 100);
      const { error: upsertError } = await supabase
        .from("opportunities")
        .upsert(batch, { onConflict: "notice_id" });

      if (upsertError) {
        return { source: "sam.gov", records: i, error: upsertError.message };
      }
    }

    await supabase.from("ingestion_log").insert({
      source: "sam.gov",
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      record_count: rows.length,
    });

    return { source: "sam.gov", records: rows.length, error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { source: "sam.gov", records: 0, error: msg };
  }
}

/** Ingest expiring IDIQs from Tango */
async function ingestExpiringIdiqs(): Promise<SourceResult> {
  const startedAt = new Date().toISOString();

  try {
    if (!process.env.TANGO_API_KEY) {
      return { source: "tango", records: 0, error: "TANGO_API_KEY not configured — skipped" };
    }

    const idiqs = await fetchExpiringIdvs(24);

    if (idiqs.length === 0) {
      return { source: "tango", records: 0, error: null };
    }

    const rows = idiqs.map((idiq: Record<string, unknown>) => {
      const pop = idiq.period_of_performance as Record<string, unknown> | undefined;
      return {
        idv_key: idiq.key as string,
        piid: (idiq.piid as string) ?? null,
        last_date_to_order: pop?.last_date_to_order as string,
        agency: (idiq.awarding_office as string) ?? null,
        vehicle_obligations: (idiq.obligated as number) ?? null,
        description: (idiq.description as string) ?? null,
      };
    });

    const { error: upsertError } = await supabase
      .from("expiring_idiqs")
      .upsert(rows, { onConflict: "idv_key" });

    if (upsertError) {
      return { source: "tango", records: 0, error: upsertError.message };
    }

    await supabase.from("ingestion_log").insert({
      source: "tango",
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      record_count: rows.length,
    });

    return { source: "tango", records: rows.length, error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { source: "tango", records: 0, error: msg };
  }
}

export async function POST() {
  try {
    // Run all ingestions
    const [usaResult, samResult, tangoResult] = await Promise.all([
      ingestUsaSpending(),
      ingestSamGov(),
      ingestExpiringIdiqs(),
    ]);

    const sources = [usaResult, samResult, tangoResult];
    const hasErrors = sources.some((s) => s.error);

    // Auto-score everything
    const [awardScores, oppScores, idiqScores] = await Promise.all([
      scoreAllAwards(),
      scoreAllOpportunities(),
      scoreAllExpiringIdiqs(),
    ]);

    return NextResponse.json({
      ok: !hasErrors,
      sources,
      scoring: {
        awards: awardScores.scored,
        opportunities: oppScores.scored,
        expiring_idiqs: idiqScores.scored,
        errors: [awardScores.error, oppScores.error, idiqScores.error].filter(Boolean),
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
