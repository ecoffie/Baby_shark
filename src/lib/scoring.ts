/**
 * Baby Shark — Opportunity Scoring Engine
 * 100-point weighted formula to rank opportunities by fit for Micron Ventures
 */

import { getSupabase } from "@/lib/supabase";

export interface ClientProfile {
  naics_codes: string[];
  psc_codes: string[];
  geographic_focus: string[];
  preferred_agencies: string[];
}

export interface Award {
  id: string;
  award_id: string;
  title: string | null;
  agency: string | null;
  amount: number | null;
  number_of_offers: number | null;
  psc_code: string | null;
  naics: string | null;
  place_of_performance_country: string | null;
  recipient_name: string | null;
  parent_idv: string | null;
  award_date: string | null;
  usa_spending_url: string | null;
}

export interface FitDetails {
  naics_score: number;
  naics_reason: string;
  psc_score: number;
  psc_reason: string;
  geo_score: number;
  geo_reason: string;
  agency_score: number;
  agency_reason: string;
  competition_score: number;
  competition_reason: string;
  amount_score: number;
  amount_reason: string;
  suggested_actions: string[];
}

export type BriefCategory = "high" | "medium" | "low";

// Region mapping for partial geo match
const REGION_MAP: Record<string, string> = {
  GU: "pacific", DG: "indian-ocean",
  EG: "middle-east", AE: "middle-east", LB: "middle-east",
  IQ: "middle-east", KW: "middle-east", SA: "middle-east", QA: "middle-east", BH: "middle-east",
  JO: "middle-east", OM: "middle-east", SY: "middle-east", YE: "middle-east",
  BR: "south-america", AR: "south-america", CL: "south-america",
  CO: "south-america", PE: "south-america", EC: "south-america",
  VE: "south-america", UY: "south-america", PY: "south-america",
  BO: "south-america", GY: "south-america", SR: "south-america",
};

function scoreNaics(awardNaics: string | null, clientNaics: string[]): { score: number; reason: string } {
  if (!awardNaics) return { score: 0, reason: "No NAICS code on award" };
  if (clientNaics.includes(awardNaics)) return { score: 25, reason: `Exact NAICS match: ${awardNaics}` };
  const prefixMatch = clientNaics.find((c) => awardNaics.startsWith(c) || c.startsWith(awardNaics));
  if (prefixMatch) return { score: 15, reason: `NAICS prefix match: ${awardNaics} ~ ${prefixMatch}` };
  return { score: 0, reason: `No NAICS match (${awardNaics})` };
}

function scorePsc(awardPsc: string | null, clientPscPrefixes: string[]): { score: number; reason: string } {
  if (!awardPsc) return { score: 0, reason: "No PSC code on award" };
  const match = clientPscPrefixes.find((prefix) => awardPsc.startsWith(prefix));
  if (match) return { score: 25, reason: `PSC prefix match: ${awardPsc} starts with ${match}` };
  return { score: 0, reason: `No PSC match (${awardPsc})` };
}

function scoreGeo(country: string | null, clientGeoFocus: string[]): { score: number; reason: string } {
  if (!country) return { score: 0, reason: "No country specified" };
  if (clientGeoFocus.includes(country)) return { score: 20, reason: `Country in focus: ${country}` };
  const awardRegion = REGION_MAP[country];
  const clientRegions = new Set(clientGeoFocus.map((c) => REGION_MAP[c]).filter(Boolean));
  if (awardRegion && clientRegions.has(awardRegion)) return { score: 10, reason: `Same region: ${country} (${awardRegion})` };
  return { score: 0, reason: `Outside focus area (${country})` };
}

function scoreAgency(agency: string | null, preferred: string[]): { score: number; reason: string } {
  if (!agency) return { score: 0, reason: "No agency specified" };
  const match = preferred.find((p) => agency.toUpperCase().includes(p.toUpperCase()));
  if (match) return { score: 15, reason: `Preferred agency: ${agency}` };
  return { score: 0, reason: `Non-preferred agency (${agency})` };
}

function scoreCompetition(offers: number | null): { score: number; reason: string } {
  if (offers === 1) return { score: 10, reason: "Sole source (1 offer)" };
  if (offers === 2) return { score: 7, reason: "Low competition (2 offers)" };
  if (offers == null) return { score: 3, reason: "Unknown competition level" };
  return { score: 0, reason: `Higher competition (${offers} offers)` };
}

function scoreAmount(amount: number | null): { score: number; reason: string } {
  if (amount == null) return { score: 0, reason: "No amount specified" };
  if (amount >= 25_000_000) return { score: 5, reason: `Large contract: $${(amount / 1e6).toFixed(1)}M` };
  if (amount >= 10_000_000) return { score: 4, reason: `Mid-large contract: $${(amount / 1e6).toFixed(1)}M` };
  if (amount >= 5_000_000) return { score: 3, reason: `Mid contract: $${(amount / 1e6).toFixed(1)}M` };
  if (amount >= 1_000_000) return { score: 2, reason: `Base contract: $${(amount / 1e6).toFixed(1)}M` };
  return { score: 1, reason: `Small contract: $${(amount / 1e3).toFixed(0)}K` };
}

function suggestActions(total: number, offers: number | null, awardDate: string | null): string[] {
  const actions: string[] = [];
  if (total >= 70) actions.push("Prepare bid package");
  if (total >= 50) actions.push("Research incumbent capabilities");
  if (offers === 1) actions.push("Contact prime for teaming");
  if (awardDate) {
    const age = (Date.now() - new Date(awardDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    if (age >= 3) actions.push("Monitor for recompete — contract aging");
    if (age >= 4) actions.push("Prepare recompete response");
  }
  if (total >= 40 && total < 70) actions.push("Monitor opportunity");
  if (actions.length === 0) actions.push("Track for future reference");
  return actions;
}

export function scoreOpportunity(award: Award, profile: ClientProfile): { score: number; category: BriefCategory; details: FitDetails } {
  const naics = scoreNaics(award.naics, profile.naics_codes);
  const psc = scorePsc(award.psc_code, profile.psc_codes);
  const geo = scoreGeo(award.place_of_performance_country, profile.geographic_focus);
  const agency = scoreAgency(award.agency, profile.preferred_agencies);
  const competition = scoreCompetition(award.number_of_offers);
  const amount = scoreAmount(award.amount);

  const total = naics.score + psc.score + geo.score + agency.score + competition.score + amount.score;
  const category: BriefCategory = total >= 70 ? "high" : total >= 40 ? "medium" : "low";

  return {
    score: total,
    category,
    details: {
      naics_score: naics.score,
      naics_reason: naics.reason,
      psc_score: psc.score,
      psc_reason: psc.reason,
      geo_score: geo.score,
      geo_reason: geo.reason,
      agency_score: agency.score,
      agency_reason: agency.reason,
      competition_score: competition.score,
      competition_reason: competition.reason,
      amount_score: amount.score,
      amount_reason: amount.reason,
      suggested_actions: suggestActions(total, award.number_of_offers, award.award_date),
    },
  };
}

/** Score all awards in the database against the client profile */
export async function scoreAllAwards(): Promise<{ scored: number; error: string | null }> {
  const supabase = getSupabase();

  // Fetch client profile
  const { data: profiles, error: profileError } = await supabase
    .from("client_profile")
    .select("naics_codes, psc_codes, geographic_focus, preferred_agencies")
    .limit(1);

  if (profileError || !profiles?.length) {
    return { scored: 0, error: profileError?.message ?? "No client profile found" };
  }

  const profile: ClientProfile = profiles[0];

  // Fetch all awards in batches
  const BATCH = 500;
  let offset = 0;
  let totalScored = 0;

  while (true) {
    const { data: awards, error: fetchError } = await supabase
      .from("low_competition_awards")
      .select("id, award_id, title, agency, amount, number_of_offers, psc_code, naics, place_of_performance_country, recipient_name, parent_idv, award_date, usa_spending_url")
      .range(offset, offset + BATCH - 1);

    if (fetchError) return { scored: totalScored, error: fetchError.message };
    if (!awards || awards.length === 0) break;

    // Score each award
    const updates = awards.map((award) => {
      const { score, category, details } = scoreOpportunity(award as Award, profile);
      return {
        id: award.id,
        fit_score: score,
        fit_details: details,
        brief_category: category,
      };
    });

    // Update scores one by one (can't upsert partial rows)
    for (const u of updates) {
      const { error: updateError } = await supabase
        .from("low_competition_awards")
        .update({ fit_score: u.fit_score, fit_details: u.fit_details, brief_category: u.brief_category })
        .eq("id", u.id);
      if (updateError) return { scored: totalScored, error: updateError.message };
    }

    totalScored += updates.length;
    if (awards.length < BATCH) break;
    offset += BATCH;
  }

  return { scored: totalScored, error: null };
}

/* ── Opportunity scoring (SAM.gov / DLA) ── */

export interface Opportunity {
  id: string;
  notice_id: string;
  title: string | null;
  agency: string | null;
  naics_code: string | null;
  classification_code: string | null;
  place_of_performance_country: string | null;
  response_deadline: string | null;
  award_amount: number | null;
  source: string | null;
}

function suggestOppActions(total: number, deadline: string | null, source: string | null): string[] {
  const actions: string[] = [];
  if (deadline) {
    const daysLeft = (new Date(deadline).getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    if (daysLeft <= 0) {
      actions.push("Deadline passed — monitor for re-solicitation");
    } else if (daysLeft <= 14) {
      actions.push(`URGENT: ${Math.ceil(daysLeft)} days to respond`);
    } else if (daysLeft <= 30) {
      actions.push(`Respond soon — ${Math.ceil(daysLeft)} days left`);
    } else {
      actions.push(`${Math.ceil(daysLeft)} days until deadline`);
    }
  }
  if (total >= 70) actions.push("Prepare proposal");
  if (total >= 50) actions.push("Request solicitation documents");
  if (source === "dla") actions.push("Check DIBBS for full RFQ details");
  if (total >= 40 && total < 70) actions.push("Monitor and evaluate");
  if (actions.length === 0) actions.push("Track for awareness");
  return actions;
}

export function scoreOpp(opp: Opportunity, profile: ClientProfile): { score: number; category: BriefCategory; details: FitDetails } {
  const naics = scoreNaics(opp.naics_code, profile.naics_codes);
  const psc = scorePsc(opp.classification_code, profile.psc_codes);
  const geo = scoreGeo(opp.place_of_performance_country, profile.geographic_focus);
  const agency = scoreAgency(opp.agency, profile.preferred_agencies);
  // Active solicitations get a competition bonus (open opportunity)
  const competition = { score: 8, reason: "Active solicitation — open to bid" };
  const amount = scoreAmount(opp.award_amount);

  const total = naics.score + psc.score + geo.score + agency.score + competition.score + amount.score;
  const category: BriefCategory = total >= 70 ? "high" : total >= 40 ? "medium" : "low";

  return {
    score: total,
    category,
    details: {
      naics_score: naics.score,
      naics_reason: naics.reason,
      psc_score: psc.score,
      psc_reason: psc.reason,
      geo_score: geo.score,
      geo_reason: geo.reason,
      agency_score: agency.score,
      agency_reason: agency.reason,
      competition_score: competition.score,
      competition_reason: competition.reason,
      amount_score: amount.score,
      amount_reason: amount.reason,
      suggested_actions: suggestOppActions(total, opp.response_deadline, opp.source),
    },
  };
}

/** Score all SAM.gov opportunities */
export async function scoreAllOpportunities(): Promise<{ scored: number; error: string | null }> {
  const supabase = getSupabase();

  const { data: profiles, error: profileError } = await supabase
    .from("client_profile")
    .select("naics_codes, psc_codes, geographic_focus, preferred_agencies")
    .limit(1);

  if (profileError || !profiles?.length) {
    return { scored: 0, error: profileError?.message ?? "No client profile found" };
  }

  const profile: ClientProfile = profiles[0];
  const BATCH = 500;
  let offset = 0;
  let totalScored = 0;

  while (true) {
    const { data: opps, error: fetchError } = await supabase
      .from("opportunities")
      .select("id, notice_id, title, agency, naics_code, classification_code, place_of_performance_country, response_deadline, award_amount, source")
      .range(offset, offset + BATCH - 1);

    if (fetchError) return { scored: totalScored, error: fetchError.message };
    if (!opps || opps.length === 0) break;

    for (const opp of opps) {
      const { score, category, details } = scoreOpp(opp as Opportunity, profile);
      const { error: updateError } = await supabase
        .from("opportunities")
        .update({ fit_score: score, fit_details: details, brief_category: category })
        .eq("id", opp.id);
      if (updateError) return { scored: totalScored, error: updateError.message };
      totalScored++;
    }

    if (opps.length < BATCH) break;
    offset += BATCH;
  }

  return { scored: totalScored, error: null };
}

/* ── Expiring IDIQ scoring ── */

export interface ExpiringIdiq {
  id: string;
  idv_key: string;
  description: string | null;
  agency: string | null;
  last_date_to_order: string;
  vehicle_obligations: number | null;
  place_of_performance: string | null;
}

export function scoreExpiringIdiq(idiq: ExpiringIdiq, profile: ClientProfile): { score: number; category: BriefCategory; details: FitDetails } {
  const agency = scoreAgency(idiq.agency, profile.preferred_agencies);
  const amount = scoreAmount(idiq.vehicle_obligations ? Number(idiq.vehicle_obligations) : null);

  // Urgency scoring based on expiration timeline
  const daysUntilExpiry = (new Date(idiq.last_date_to_order).getTime() - Date.now()) / (24 * 60 * 60 * 1000);
  let urgency = { score: 0, reason: "Not expiring soon" };
  if (daysUntilExpiry <= 180) urgency = { score: 20, reason: `Expires in ${Math.ceil(daysUntilExpiry)} days — imminent recompete` };
  else if (daysUntilExpiry <= 365) urgency = { score: 15, reason: `Expires in ${Math.ceil(daysUntilExpiry / 30)} months` };
  else if (daysUntilExpiry <= 730) urgency = { score: 8, reason: `Expires in ${Math.round(daysUntilExpiry / 365 * 10) / 10} years` };

  const total = agency.score + amount.score + urgency.score;
  const category: BriefCategory = total >= 30 ? "high" : total >= 15 ? "medium" : "low";

  const actions: string[] = [];
  if (daysUntilExpiry <= 180) actions.push("Position for recompete NOW");
  if (daysUntilExpiry <= 365) actions.push("Research recompete requirements");
  if (agency.score > 0) actions.push("Engage agency program office");
  actions.push(`Expires: ${idiq.last_date_to_order}`);

  return {
    score: total,
    category,
    details: {
      naics_score: 0, naics_reason: "N/A for IDIQ",
      psc_score: 0, psc_reason: "N/A for IDIQ",
      geo_score: urgency.score, geo_reason: urgency.reason, // reusing geo slot for urgency
      agency_score: agency.score, agency_reason: agency.reason,
      competition_score: 0, competition_reason: "Recompete opportunity",
      amount_score: amount.score, amount_reason: amount.reason,
      suggested_actions: actions,
    },
  };
}

/** Score all expiring IDIQs */
export async function scoreAllExpiringIdiqs(): Promise<{ scored: number; error: string | null }> {
  const supabase = getSupabase();

  const { data: profiles, error: profileError } = await supabase
    .from("client_profile")
    .select("naics_codes, psc_codes, geographic_focus, preferred_agencies")
    .limit(1);

  if (profileError || !profiles?.length) {
    return { scored: 0, error: profileError?.message ?? "No client profile found" };
  }

  const profile: ClientProfile = profiles[0];

  const { data: idiqs, error: fetchError } = await supabase
    .from("expiring_idiqs")
    .select("id, idv_key, description, agency, last_date_to_order, vehicle_obligations, place_of_performance");

  if (fetchError) return { scored: 0, error: fetchError.message };
  if (!idiqs || idiqs.length === 0) return { scored: 0, error: null };

  let scored = 0;
  for (const idiq of idiqs) {
    const { score, category, details } = scoreExpiringIdiq(idiq as ExpiringIdiq, profile);
    const { error: updateError } = await supabase
      .from("expiring_idiqs")
      .update({ fit_score: score, fit_details: details, brief_category: category })
      .eq("id", idiq.id);
    if (updateError) return { scored, error: updateError.message };
    scored++;
  }

  return { scored, error: null };
}
