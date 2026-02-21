"use client";

import { useState, useEffect, useCallback } from "react";

/* ── Types ── */
interface FitDetails {
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

interface AwardRecord {
  _source: "awards";
  award_id: string;
  title: string | null;
  agency: string | null;
  amount: number | null;
  number_of_offers: number | null;
  psc_code: string | null;
  naics: string | null;
  recipient_name: string | null;
  place_of_performance_country: string | null;
  parent_idv: string | null;
  award_date: string | null;
  usa_spending_url: string | null;
  fit_score: number;
  fit_details: FitDetails | null;
  brief_category: string;
}

interface OpportunityRecord {
  _source: "opportunities";
  notice_id: string;
  title: string | null;
  agency: string | null;
  naics_code: string | null;
  classification_code: string | null;
  solicitation_number: string | null;
  type: string | null;
  posted_date: string | null;
  response_deadline: string | null;
  set_aside_description: string | null;
  place_of_performance_country: string | null;
  place_of_performance_state: string | null;
  sam_url: string | null;
  source: string | null;
  contact_name: string | null;
  contact_email: string | null;
  award_amount: number | null;
  awardee_name: string | null;
  fit_score: number;
  fit_details: FitDetails | null;
  brief_category: string;
}

interface ExpiringRecord {
  _source: "expiring";
  idv_key: string;
  piid: string | null;
  description: string | null;
  agency: string | null;
  last_date_to_order: string;
  vehicle_obligations: number | null;
  place_of_performance: string | null;
  fit_score: number;
  fit_details: FitDetails | null;
  brief_category: string;
}

type Record = AwardRecord | OpportunityRecord | ExpiringRecord;

interface CategorySummary { count: number; total_value: number }
interface IdiqSummary { total: number; total_value: number; expiring_6mo: number; expiring_12mo: number }

interface DashboardResponse {
  ok: boolean;
  summary: {
    awards: { high: CategorySummary; medium: CategorySummary; low: CategorySummary };
    opportunities: { high: CategorySummary; medium: CategorySummary; low: CategorySummary };
    expiring_idiqs: IdiqSummary;
  };
  last_ingest: { completed_at: string; source: string }[];
  results: Record[];
  total: number;
  page: number;
  limit: number;
  error?: string;
}

interface HistoricalAward {
  award_id: string;
  title: string;
  amount: number;
  date: string | null;
  agency: string;
  recipient: string;
  offers: number | null;
  url?: string;
}

interface HistorySummary {
  previously_solicited: boolean;
  is_recompete: boolean;
  prior_awards_count: number;
  prior_awards: HistoricalAward[];
  competition_history: { average_bidders: number | null; min_bidders: number | null; max_bidders: number | null; data_points: number } | null;
  incumbent_analysis: { likely_incumbent: { name: string; wins: number; total_value: number; last_award: string | null } | null; all_incumbents: { name: string; wins: number; total_value: number }[] } | null;
  summary: string;
}

interface Brief {
  essentials: globalThis.Record<string, unknown>;
  client_fit: globalThis.Record<string, unknown>;
  incumbent?: { name: string | null; other_awards_count: number; other_awards: { title: string; amount: number; agency: string }[]; total_other_value: number };
  recompete_signals?: { age_years: number | null; signal_strength: string; estimated_recompete: string | null };
  contact?: { name: string | null; email: string | null; phone: string | null };
  history?: HistorySummary;
  next_steps: string[];
}

/* ── Helpers ── */
function fmt(n: number | null | undefined): string {
  if (n == null) return "\u2014";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function fmtDate(d: string | null): string {
  if (!d) return "\u2014";
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function fmtCompact(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n}`;
}

function daysUntil(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

const CAT_COLORS = {
  high: { bg: "bg-red-50", border: "border-red-200", badge: "bg-red-100 text-red-800", bar: "bg-red-500", ring: "ring-red-500" },
  medium: { bg: "bg-amber-50", border: "border-amber-200", badge: "bg-amber-100 text-amber-800", bar: "bg-amber-500", ring: "ring-amber-500" },
  low: { bg: "bg-blue-50", border: "border-blue-200", badge: "bg-blue-100 text-blue-700", bar: "bg-blue-400", ring: "ring-blue-400" },
};

type Category = "all" | "high" | "medium" | "low";
type Source = "awards" | "opportunities" | "expiring";

/* ── Unique key for a record ── */
function recordKey(r: Record): string {
  if (r._source === "awards") return `a-${r.award_id}`;
  if (r._source === "opportunities") return `o-${r.notice_id}`;
  return `e-${r.idv_key}`;
}

/* ── Component ── */
export default function Dashboard() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<Category>("all");
  const [source, setSource] = useState<Source>("awards");
  const [page, setPage] = useState(1);
  const [expandedBrief, setExpandedBrief] = useState<string | null>(null);
  const [briefData, setBriefData] = useState<globalThis.Record<string, Brief>>({});
  const [briefLoading, setBriefLoading] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const LIMIT = 50;

  const fetchDashboard = useCallback(async (src: Source, cat: Category, pg: number) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ source: src, page: String(pg), limit: String(LIMIT) });
      if (cat !== "all") params.set("category", cat);
      const res = await fetch(`/api/dashboard?${params}`);
      if (!res.ok) throw new Error(`Dashboard fetch failed: ${res.status}`);
      const json: DashboardResponse = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Unknown error");
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard(source, category, page);
  }, [source, category, page, fetchDashboard]);

  const handleSourceChange = (src: Source) => {
    setSource(src);
    setPage(1);
    setCategory("all");
    setExpandedBrief(null);
  };

  const handleCategoryChange = (cat: Category) => {
    setCategory(cat);
    setPage(1);
    setExpandedBrief(null);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/ingest", { method: "POST" });
      const json = await res.json();
      if (!json.ok && json.error) throw new Error(json.error);
      await fetchDashboard(source, category, 1);
      setPage(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  };

  const loadBrief = async (awardId: string, briefSource: "awards" | "opportunities" = "awards") => {
    if (expandedBrief === awardId) { setExpandedBrief(null); return; }
    setExpandedBrief(awardId);
    if (briefData[awardId]) return;
    setBriefLoading(awardId);
    try {
      const params = briefSource === "opportunities" ? "?source=opportunities" : "";
      const res = await fetch(`/api/brief/${encodeURIComponent(awardId)}${params}`);
      const json = await res.json();
      if (json.ok) setBriefData((prev) => ({ ...prev, [awardId]: json.brief }));
    } catch { /* user can retry */ } finally { setBriefLoading(null); }
  };

  const downloadReport = (format: "csv" | "pdf") => {
    const params = new URLSearchParams({ format });
    if (category !== "all") params.set("category", category);
    window.open(`/api/report?${params}`, "_blank");
  };

  const summary = data?.summary;
  const totalPages = data ? Math.ceil(data.total / LIMIT) : 0;

  // Get active source summary for category cards
  const activeSummary = source === "awards" ? summary?.awards : source === "opportunities" ? summary?.opportunities : null;

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Baby Shark</h1>
            <p className="text-sm text-gray-500">
              Automated Intelligence Report System
              {data?.last_ingest && data.last_ingest.length > 0 && (
                <span className="ml-2 text-gray-400">
                  Last sync: {fmtDate(data.last_ingest[0].completed_at?.substring(0, 10))}
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={handleRefresh} disabled={refreshing}
              className="px-3 py-1.5 text-sm bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:opacity-50">
              {refreshing ? "Syncing all sources\u2026" : "Refresh All Sources"}
            </button>
            <button onClick={() => downloadReport("csv")}
              className="px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-md hover:bg-gray-50">
              CSV
            </button>
            <button onClick={() => downloadReport("pdf")}
              className="px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-md hover:bg-gray-50">
              PDF
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md mb-6 text-sm">
            {error}
            <button onClick={() => setError(null)} className="ml-2 underline">Dismiss</button>
          </div>
        )}

        {/* Source Tabs */}
        <div className="flex items-center gap-1 mb-6 bg-white rounded-lg border border-gray-200 p-1 w-fit">
          {([
            { key: "awards" as Source, label: "Past Awards", count: summary ? summary.awards.high.count + summary.awards.medium.count + summary.awards.low.count : 0 },
            { key: "opportunities" as Source, label: "RFP / RFQ", count: summary ? summary.opportunities.high.count + summary.opportunities.medium.count + summary.opportunities.low.count : 0 },
            { key: "expiring" as Source, label: "Expiring IDIQs", count: summary?.expiring_idiqs.total ?? 0 },
          ]).map((tab) => (
            <button key={tab.key} onClick={() => handleSourceChange(tab.key)}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                source === tab.key ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"
              }`}>
              {tab.label}
              <span className="ml-1.5 text-xs opacity-70">({tab.count})</span>
            </button>
          ))}
        </div>

        {/* Summary Cards — different per source */}
        {summary && source !== "expiring" && activeSummary && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            {(["high", "medium", "low"] as const).map((cat) => {
              const colors = CAT_COLORS[cat];
              const s = activeSummary[cat];
              return (
                <button key={cat} onClick={() => handleCategoryChange(category === cat ? "all" : cat)}
                  className={`${colors.bg} ${colors.border} border rounded-lg p-4 text-left transition-all ${
                    category === cat ? `ring-2 ${colors.ring}` : "hover:shadow-md"
                  }`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-xs font-semibold uppercase tracking-wide ${colors.badge} px-2 py-0.5 rounded-full`}>
                      {cat} priority
                    </span>
                    <span className="text-2xl font-bold text-gray-900">{s.count}</span>
                  </div>
                  <p className="text-sm text-gray-600">{fmtCompact(s.total_value)} total value</p>
                </button>
              );
            })}
          </div>
        )}

        {/* Expiring IDIQs summary */}
        {summary && source === "expiring" && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold uppercase tracking-wide bg-red-100 text-red-800 px-2 py-0.5 rounded-full">
                  Expiring &lt; 6 months
                </span>
                <span className="text-2xl font-bold text-gray-900">{summary.expiring_idiqs.expiring_6mo}</span>
              </div>
              <p className="text-sm text-gray-600">Imminent recompete opportunities</p>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold uppercase tracking-wide bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                  Expiring &lt; 12 months
                </span>
                <span className="text-2xl font-bold text-gray-900">{summary.expiring_idiqs.expiring_12mo}</span>
              </div>
              <p className="text-sm text-gray-600">Start positioning now</p>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold uppercase tracking-wide bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                  Total tracked
                </span>
                <span className="text-2xl font-bold text-gray-900">{summary.expiring_idiqs.total}</span>
              </div>
              <p className="text-sm text-gray-600">{fmtCompact(summary.expiring_idiqs.total_value)} in obligations</p>
            </div>
          </div>
        )}

        {/* Category filter tabs (for awards + opportunities) */}
        {source !== "expiring" && (
          <div className="flex items-center gap-1 mb-6 bg-white rounded-lg border border-gray-200 p-1 w-fit">
            {(["all", "high", "medium", "low"] as const).map((cat) => (
              <button key={cat} onClick={() => handleCategoryChange(cat)}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                  category === cat ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"
                }`}>
                {cat === "all" ? "All" : cat.charAt(0).toUpperCase() + cat.slice(1)}
              </button>
            ))}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="bg-white rounded-lg border border-gray-200 px-6 py-16 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-gray-300 border-t-blue-600 mb-4" />
            <p className="text-gray-500">Loading...</p>
          </div>
        )}

        {/* Results */}
        {!loading && data && data.results.length > 0 && (
          <>
            <p className="text-sm text-gray-500 mb-4">
              {data.total} result{data.total === 1 ? "" : "s"}
              {data.total > LIMIT && ` \u2014 page ${page} of ${totalPages}`}
            </p>

            <div className="space-y-4">
              {data.results.map((record) => {
                const key = recordKey(record);

                /* ── Award card ── */
                if (record._source === "awards") {
                  const award = record as AwardRecord;
                  const colors = CAT_COLORS[(award.brief_category as keyof typeof CAT_COLORS) ?? "low"];
                  const details = award.fit_details;
                  const isExpanded = expandedBrief === award.award_id;
                  const brief = briefData[award.award_id];

                  return (
                    <div key={key} className={`bg-white rounded-lg border ${colors.border} overflow-hidden`}>
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${colors.badge}`}>
                                {award.brief_category?.toUpperCase()}
                              </span>
                              <span className="text-xs font-mono text-gray-500">Score: {award.fit_score}/100</span>
                              {award.number_of_offers != null && (
                                <span className={`text-xs px-2 py-0.5 rounded-full ${
                                  award.number_of_offers === 1 ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"
                                }`}>{award.number_of_offers} offer{award.number_of_offers !== 1 ? "s" : ""}</span>
                              )}
                              <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Past Award</span>
                            </div>
                            <h3 className="font-semibold text-gray-900 truncate">{award.title ?? "Untitled"}</h3>
                            <p className="text-sm text-gray-500 mt-0.5">
                              {award.agency ?? "Unknown"} &middot; {award.place_of_performance_country ?? "?"} &middot; {fmtDate(award.award_date)}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-lg font-bold text-gray-900">{fmt(award.amount)}</p>
                            <p className="text-xs text-gray-500 truncate max-w-[180px]">{award.recipient_name ?? "Unknown"}</p>
                          </div>
                        </div>

                        {details && (
                          <div className="mt-3 flex items-center gap-1">
                            {[
                              { label: "NAICS", score: details.naics_score, max: 25 },
                              { label: "PSC", score: details.psc_score, max: 25 },
                              { label: "Geo", score: details.geo_score, max: 20 },
                              { label: "Agency", score: details.agency_score, max: 15 },
                              { label: "Comp", score: details.competition_score, max: 10 },
                              { label: "Amt", score: details.amount_score, max: 5 },
                            ].map((f) => (
                              <div key={f.label} className="flex-1" title={`${f.label}: ${f.score}/${f.max}`}>
                                <div className="text-[10px] text-gray-400 text-center mb-0.5">{f.label}</div>
                                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full ${f.score > 0 ? colors.bar : ""}`} style={{ width: `${(f.score / f.max) * 100}%` }} />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {details?.suggested_actions && details.suggested_actions.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {details.suggested_actions.map((a, i) => (
                              <span key={i} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{a}</span>
                            ))}
                          </div>
                        )}

                        <div className="mt-3 flex items-center gap-3">
                          <button onClick={() => loadBrief(award.award_id)}
                            className="text-sm text-blue-600 hover:text-blue-800 font-medium">
                            {isExpanded ? "Hide Brief" : "View Full Brief"}
                          </button>
                          {award.usa_spending_url && (
                            <a href={award.usa_spending_url} target="_blank" rel="noopener noreferrer"
                              className="text-sm text-gray-500 hover:text-gray-700 underline">USAspending</a>
                          )}
                        </div>
                      </div>

                      {isExpanded && brief && (
                        <div className="border-t border-gray-200 bg-gray-50 p-4">
                          <BriefPanel brief={brief} details={details} />
                        </div>
                      )}
                      {isExpanded && briefLoading === award.award_id && (
                        <div className="border-t border-gray-200 bg-gray-50 p-4 text-center">
                          <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-gray-300 border-t-blue-600" />
                        </div>
                      )}
                    </div>
                  );
                }

                /* ── Opportunity card (RFP/RFQ/DLA) ── */
                if (record._source === "opportunities") {
                  const opp = record as OpportunityRecord;
                  const colors = CAT_COLORS[(opp.brief_category as keyof typeof CAT_COLORS) ?? "low"];
                  const details = opp.fit_details;
                  const deadline = opp.response_deadline;
                  const days = deadline ? daysUntil(deadline) : null;

                  return (
                    <div key={key} className={`bg-white rounded-lg border ${colors.border} overflow-hidden`}>
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${colors.badge}`}>
                                {opp.brief_category?.toUpperCase()}
                              </span>
                              <span className="text-xs font-mono text-gray-500">Score: {opp.fit_score}/100</span>
                              <span className="text-xs bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full">
                                {opp.source === "dla" ? "DLA" : opp.type ?? "Solicitation"}
                              </span>
                              {days != null && (
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                  days <= 0 ? "bg-gray-200 text-gray-600"
                                  : days <= 14 ? "bg-red-100 text-red-800"
                                  : days <= 30 ? "bg-amber-100 text-amber-800"
                                  : "bg-green-100 text-green-800"
                                }`}>
                                  {days <= 0 ? "Closed" : `${days}d left`}
                                </span>
                              )}
                            </div>
                            <h3 className="font-semibold text-gray-900 truncate">{opp.title ?? "Untitled"}</h3>
                            <p className="text-sm text-gray-500 mt-0.5">
                              {opp.agency ?? "Unknown"} &middot; {opp.place_of_performance_state || opp.place_of_performance_country || "?"} &middot; Posted {fmtDate(opp.posted_date)}
                            </p>
                            {opp.solicitation_number && (
                              <p className="text-xs text-gray-400 mt-0.5">Sol#: {opp.solicitation_number}</p>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            {deadline && (
                              <p className="text-sm font-medium text-gray-900">Due: {fmtDate(deadline)}</p>
                            )}
                            {opp.set_aside_description && (
                              <p className="text-xs text-indigo-600 mt-0.5">{opp.set_aside_description}</p>
                            )}
                            {opp.naics_code && (
                              <p className="text-xs text-gray-400 mt-0.5">NAICS: {opp.naics_code}</p>
                            )}
                          </div>
                        </div>

                        {details?.suggested_actions && details.suggested_actions.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {details.suggested_actions.map((a, i) => (
                              <span key={i} className={`text-xs px-2 py-0.5 rounded ${
                                a.startsWith("URGENT") ? "bg-red-100 text-red-700 font-medium" : "bg-gray-100 text-gray-600"
                              }`}>{a}</span>
                            ))}
                          </div>
                        )}

                        <div className="mt-3 flex items-center gap-3">
                          <button onClick={() => loadBrief(opp.notice_id, "opportunities")}
                            className="text-sm text-blue-600 hover:text-blue-800 font-medium">
                            {expandedBrief === opp.notice_id ? "Hide Brief" : "View Brief + History"}
                          </button>
                          {opp.sam_url && (
                            <a href={opp.sam_url} target="_blank" rel="noopener noreferrer"
                              className="text-sm text-gray-500 hover:text-gray-700 underline">SAM.gov</a>
                          )}
                          {opp.contact_email && (
                            <a href={`mailto:${opp.contact_email}`}
                              className="text-sm text-gray-500 hover:text-gray-700 underline">
                              {opp.contact_name || opp.contact_email}
                            </a>
                          )}
                        </div>
                      </div>

                      {/* Expanded Brief with History */}
                      {expandedBrief === opp.notice_id && briefData[opp.notice_id] && (
                        <div className="border-t border-gray-200 bg-gray-50 p-4">
                          <BriefPanel brief={briefData[opp.notice_id]} details={details} />
                        </div>
                      )}
                      {expandedBrief === opp.notice_id && briefLoading === opp.notice_id && (
                        <div className="border-t border-gray-200 bg-gray-50 p-4 text-center">
                          <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-gray-300 border-t-blue-600" />
                          <p className="text-xs text-gray-500 mt-1">Searching historical records...</p>
                        </div>
                      )}
                    </div>
                  );
                }

                /* ── Expiring IDIQ card ── */
                if (record._source === "expiring") {
                  const idiq = record as ExpiringRecord;
                  const days = daysUntil(idiq.last_date_to_order);
                  const urgency = days <= 180 ? "red" : days <= 365 ? "amber" : "blue";
                  const colors = { red: CAT_COLORS.high, amber: CAT_COLORS.medium, blue: CAT_COLORS.low }[urgency];
                  const details = idiq.fit_details;

                  return (
                    <div key={key} className={`bg-white rounded-lg border ${colors.border} overflow-hidden`}>
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                                urgency === "red" ? "bg-red-100 text-red-800"
                                : urgency === "amber" ? "bg-amber-100 text-amber-800"
                                : "bg-blue-100 text-blue-700"
                              }`}>
                                {days <= 0 ? "EXPIRED" : days <= 180 ? "EXPIRING SOON" : days <= 365 ? "EXPIRING < 1YR" : "TRACKED"}
                              </span>
                              <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">IDIQ</span>
                              <span className="text-xs font-mono text-gray-500">
                                {days <= 0 ? "Expired" : `${days} days remaining`}
                              </span>
                            </div>
                            <h3 className="font-semibold text-gray-900 truncate">{idiq.description ?? idiq.piid ?? "Untitled IDIQ"}</h3>
                            <p className="text-sm text-gray-500 mt-0.5">
                              {idiq.agency ?? "Unknown"} &middot; Expires: {fmtDate(idiq.last_date_to_order)}
                              {idiq.place_of_performance && ` \u00b7 ${idiq.place_of_performance}`}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-lg font-bold text-gray-900">{fmt(idiq.vehicle_obligations)}</p>
                            <p className="text-xs text-gray-500">obligations</p>
                          </div>
                        </div>

                        {/* Expiration timeline bar */}
                        <div className="mt-3">
                          <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                            <span>Today</span>
                            <span>Expiry: {idiq.last_date_to_order}</span>
                          </div>
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${
                              urgency === "red" ? "bg-red-500" : urgency === "amber" ? "bg-amber-500" : "bg-blue-400"
                            }`} style={{ width: `${Math.max(5, Math.min(100, 100 - (days / 730) * 100))}%` }} />
                          </div>
                        </div>

                        {details?.suggested_actions && details.suggested_actions.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {details.suggested_actions.map((a, i) => (
                              <span key={i} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{a}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }

                return null;
              })}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-6">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
                  className="px-4 py-2 text-sm border border-gray-300 rounded-md bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
                  Previous
                </button>
                <span className="text-sm text-gray-600">Page {page} of {totalPages}</span>
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                  className="px-4 py-2 text-sm border border-gray-300 rounded-md bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
                  Next
                </button>
              </div>
            )}
          </>
        )}

        {/* Empty state */}
        {!loading && data && data.results.length === 0 && (
          <div className="bg-white rounded-lg border border-gray-200 px-6 py-16 text-center">
            <p className="text-gray-500 text-lg mb-2">
              {source === "opportunities" ? "No RFP/RFQ opportunities found" :
               source === "expiring" ? "No expiring IDIQs tracked" :
               "No scored awards found"}
            </p>
            <p className="text-gray-400 text-sm mb-4">
              Click &quot;Refresh All Sources&quot; to pull from USA Spending, SAM.gov, and Tango.
            </p>
            <button onClick={handleRefresh} disabled={refreshing}
              className="px-4 py-2 bg-emerald-600 text-white text-sm rounded-md hover:bg-emerald-700 disabled:opacity-50">
              {refreshing ? "Syncing\u2026" : "Refresh All Sources"}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

/* ── Brief expansion panel ── */
function BriefPanel({ brief, details }: { brief: Brief; details: FitDetails | null }) {
  const history = brief.history;

  return (
    <div className="space-y-4">
      {/* Historical Cross-Reference — the key intelligence */}
      {history && (
        <div className={`rounded-md border p-4 ${
          history.is_recompete ? "bg-amber-50 border-amber-300" : "bg-green-50 border-green-200"
        }`}>
          <div className="flex items-center gap-2 mb-2">
            <span className={`text-xs font-bold px-2 py-1 rounded-full ${
              history.is_recompete ? "bg-amber-200 text-amber-900" : "bg-green-200 text-green-900"
            }`}>
              {history.is_recompete ? "RECOMPETE" : "NEW REQUIREMENT"}
            </span>
            {history.competition_history && history.competition_history.average_bidders != null && (
              <span className="text-xs font-medium bg-white px-2 py-1 rounded-full border border-gray-200">
                Avg {history.competition_history.average_bidders} bidder{history.competition_history.average_bidders !== 1 ? "s" : ""} historically
                {history.competition_history.min_bidders != null && history.competition_history.max_bidders != null &&
                  history.competition_history.min_bidders !== history.competition_history.max_bidders &&
                  ` (range: ${history.competition_history.min_bidders}-${history.competition_history.max_bidders})`}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-700 mb-3">{history.summary}</p>

          {/* Incumbent analysis */}
          {history.incumbent_analysis?.likely_incumbent && (
            <div className="mb-3">
              <p className="text-xs font-semibold text-gray-700 mb-1">Likely Incumbent</p>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-900">{history.incumbent_analysis.likely_incumbent.name}</span>
                <span className="text-xs bg-white px-2 py-0.5 rounded border border-gray-200">
                  {history.incumbent_analysis.likely_incumbent.wins} win{history.incumbent_analysis.likely_incumbent.wins !== 1 ? "s" : ""} &middot; {fmtCompact(history.incumbent_analysis.likely_incumbent.total_value)}
                </span>
              </div>
              {history.incumbent_analysis.all_incumbents.length > 1 && (
                <div className="mt-1 text-xs text-gray-500">
                  Other winners: {history.incumbent_analysis.all_incumbents.slice(1, 4).map((inc) => inc.name).join(", ")}
                </div>
              )}
            </div>
          )}

          {/* Prior awards table */}
          {history.prior_awards.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-700 mb-1">Prior Awards ({history.prior_awards_count})</p>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {history.prior_awards.slice(0, 8).map((award, i) => (
                  <div key={i} className="flex items-center justify-between text-xs bg-white rounded px-2 py-1.5 border border-gray-100">
                    <div className="flex-1 min-w-0">
                      <span className="text-gray-900 truncate block">{award.title}</span>
                      <span className="text-gray-500">{award.recipient} &middot; {fmtDate(award.date)}</span>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <span className="font-medium text-gray-900">{fmt(award.amount)}</span>
                      {award.offers != null && (
                        <span className={`ml-2 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                          award.offers === 1 ? "bg-green-100 text-green-800" :
                          award.offers <= 3 ? "bg-yellow-100 text-yellow-800" : "bg-gray-100 text-gray-600"
                        }`}>{award.offers} bid{award.offers !== 1 ? "s" : ""}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Client Fit */}
        <div className="bg-white rounded-md border border-gray-200 p-3">
          <h4 className="font-semibold text-sm text-gray-800 mb-2">Client Fit Analysis</h4>
          <div className="space-y-1 text-xs">
            {details && [
              { label: "NAICS", reason: details.naics_reason, score: details.naics_score },
              { label: "PSC", reason: details.psc_reason, score: details.psc_score },
              { label: "Geographic", reason: details.geo_reason, score: details.geo_score },
              { label: "Agency", reason: details.agency_reason, score: details.agency_score },
              { label: "Competition", reason: details.competition_reason, score: details.competition_score },
              { label: "Amount", reason: details.amount_reason, score: details.amount_score },
            ].map((item) => (
              <div key={item.label} className="flex justify-between">
                <span className="text-gray-600">{item.label}: {item.reason}</span>
                <span className={`font-mono ${item.score > 0 ? "text-green-700" : "text-gray-400"}`}>+{item.score}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Incumbent (for awards) */}
        {brief.incumbent && (
          <div className="bg-white rounded-md border border-gray-200 p-3">
            <h4 className="font-semibold text-sm text-gray-800 mb-2">Incumbent Analysis</h4>
            <p className="text-xs text-gray-600 mb-1"><span className="font-medium">{brief.incumbent.name ?? "Unknown"}</span></p>
            <p className="text-xs text-gray-500 mb-2">
              {brief.incumbent.other_awards_count} other award{brief.incumbent.other_awards_count !== 1 ? "s" : ""} ({fmtCompact(brief.incumbent.total_other_value)})
            </p>
            {brief.incumbent.other_awards.slice(0, 3).map((a, i) => (
              <div key={i} className="text-xs text-gray-500 truncate">{fmt(a.amount)} &middot; {a.agency} &middot; {a.title}</div>
            ))}
          </div>
        )}

        {/* Contact (for opportunities) */}
        {brief.contact && (brief.contact.name || brief.contact.email) && (
          <div className="bg-white rounded-md border border-gray-200 p-3">
            <h4 className="font-semibold text-sm text-gray-800 mb-2">Contracting Officer</h4>
            {brief.contact.name && <p className="text-xs text-gray-900 font-medium">{brief.contact.name}</p>}
            {brief.contact.email && (
              <a href={`mailto:${brief.contact.email}`} className="text-xs text-blue-600 hover:underline block">{brief.contact.email}</a>
            )}
            {brief.contact.phone && <p className="text-xs text-gray-500">{brief.contact.phone}</p>}
          </div>
        )}

        {/* Recompete Signals (for awards) */}
        {brief.recompete_signals && (
          <div className="bg-white rounded-md border border-gray-200 p-3">
            <h4 className="font-semibold text-sm text-gray-800 mb-2">Recompete Signals</h4>
            <p className="text-xs text-gray-600">Age: {brief.recompete_signals.age_years ?? "?"} years</p>
            <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${
              brief.recompete_signals.signal_strength === "strong" ? "bg-red-100 text-red-800"
              : brief.recompete_signals.signal_strength === "moderate" ? "bg-amber-100 text-amber-800"
              : "bg-gray-100 text-gray-600"
            }`}>{brief.recompete_signals.signal_strength} signal</span>
            {brief.recompete_signals.estimated_recompete && (
              <p className="text-xs text-gray-600 mt-1">Est: {brief.recompete_signals.estimated_recompete}</p>
            )}
          </div>
        )}

        {/* Next Steps */}
        <div className="bg-white rounded-md border border-gray-200 p-3">
          <h4 className="font-semibold text-sm text-gray-800 mb-2">Recommended Next Steps</h4>
          <ul className="space-y-1">
            {brief.next_steps.map((step, i) => (
              <li key={i} className="text-xs text-gray-600 flex items-start gap-1.5">
                <span className="text-blue-500 mt-0.5 shrink-0">&rarr;</span>{step}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
