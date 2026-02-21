"use client";

import { useState, useCallback } from "react";

interface Award {
  award_id: string;
  title: string | null;
  agency: string | null;
  amount: number | null;
  number_of_offers: number | null;
  extent_competed: string | null;
  psc_code: string | null;
  naics: string | null;
  recipient_name: string | null;
  place_of_performance_country: string | null;
  parent_idv: string | null;
  award_date: string | null;
  usa_spending_url: string | null;
}

interface SearchResponse {
  results: Award[];
  total: number;
  page: number;
  limit: number;
}

const AMOUNT_PRESETS = [
  { label: "$1M+", value: 1_000_000 },
  { label: "$5M+", value: 5_000_000 },
  { label: "$10M+", value: 10_000_000 },
  { label: "$25M+", value: 25_000_000 },
];

type SortField = "amount" | "award_date" | "number_of_offers" | "agency" | "recipient_name";

function formatCurrency(n: number | null): string {
  if (n == null) return "\u2014";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function formatDate(d: string | null): string {
  if (!d) return "\u2014";
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export default function Home() {
  // Filters
  const [minAmount, setMinAmount] = useState(1_000_000);
  const [maxAmount, setMaxAmount] = useState("");
  const [maxOffers, setMaxOffers] = useState("2");
  const [agency, setAgency] = useState("");
  const [naics, setNaics] = useState("");
  const [psc, setPsc] = useState("");
  const [place, setPlace] = useState("");
  const [parentIdv, setParentIdv] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [q, setQ] = useState("");

  // Results
  const [results, setResults] = useState<Award[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  // Sorting
  const [sortField, setSortField] = useState<SortField>("amount");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Filters panel toggle (mobile)
  const [filtersOpen, setFiltersOpen] = useState(true);

  // Ingest
  const [ingesting, setIngesting] = useState(false);

  const search = useCallback(
    async (pg = 1) => {
      setLoading(true);
      setError(null);
      setPage(pg);
      setHasSearched(true);

      const params = new URLSearchParams();
      params.set("min_amount", String(minAmount));
      if (maxAmount) params.set("max_amount", maxAmount);
      if (maxOffers) params.set("max_offers", maxOffers);
      if (agency) params.set("agency", agency);
      if (naics) params.set("naics", naics);
      if (psc) params.set("psc", psc);
      if (place) params.set("place", place);
      if (parentIdv) params.set("parent_idv", parentIdv);
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
      if (q) params.set("q", q);
      params.set("page", String(pg));
      params.set("limit", String(limit));
      params.set("sort", sortField);
      params.set("dir", sortDir);

      try {
        const res = await fetch(`/api/search?${params.toString()}`);
        if (!res.ok) throw new Error(`Search failed: ${res.status}`);
        const data: SearchResponse = await res.json();
        setResults(data.results);
        setTotal(data.total);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Search failed");
        setResults([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    },
    [minAmount, maxAmount, maxOffers, agency, naics, psc, place, parentIdv, dateFrom, dateTo, q, limit, sortField, sortDir]
  );

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const handleIngest = async () => {
    setIngesting(true);
    try {
      const res = await fetch("/api/ingest", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        alert(`Ingested ${data.record_count} records from ${data.page_count} pages.`);
        search(1);
      } else {
        alert(data.error ?? "Ingest failed");
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "Ingest failed");
    } finally {
      setIngesting(false);
    }
  };

  const totalPages = Math.ceil(total / limit);

  const exportCSV = () => {
    if (results.length === 0) return;
    const headers = ["Award ID", "Title", "Agency", "Amount", "Offers", "Recipient", "Country", "Parent IDV", "PSC", "NAICS", "Date", "URL"];
    const rows = results.map((r) => [
      r.award_id,
      `"${(r.title ?? "").replace(/"/g, '""')}"`,
      r.agency ?? "",
      r.amount ?? "",
      r.number_of_offers ?? "",
      `"${(r.recipient_name ?? "").replace(/"/g, '""')}"`,
      r.place_of_performance_country ?? "",
      r.parent_idv ?? "",
      r.psc_code ?? "",
      r.naics ?? "",
      r.award_date ?? "",
      r.usa_spending_url ?? "",
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `baby-shark-results-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <span className="text-gray-400 ml-1">{"\u2195"}</span>;
    return <span className="ml-1">{sortDir === "asc" ? "\u25B2" : "\u25BC"}</span>;
  };

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Baby Shark</h1>
            <p className="text-sm text-gray-500">Low-competition federal contract intelligence</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleIngest}
              disabled={ingesting}
              className="px-3 py-1.5 text-sm bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:opacity-50"
            >
              {ingesting ? "Ingesting\u2026" : "Ingest from USA Spending"}
            </button>
            <button
              onClick={exportCSV}
              disabled={results.length === 0}
              className="px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Export CSV
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Filters */}
        <div className="bg-white rounded-lg border border-gray-200 mb-6">
          <button
            onClick={() => setFiltersOpen(!filtersOpen)}
            className="w-full px-4 py-3 flex items-center justify-between text-left font-medium text-gray-700 md:cursor-default"
          >
            <span>Filters</span>
            <span className="md:hidden text-gray-400">{filtersOpen ? "\u25B2" : "\u25BC"}</span>
          </button>

          <div className={`${filtersOpen ? "block" : "hidden"} md:block px-4 pb-4`}>
            {/* Row 1: keyword + amount */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1">Keyword Search</label>
                <input
                  type="text"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search award titles..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Min Amount</label>
                <div className="flex gap-1">
                  {AMOUNT_PRESETS.map((p) => (
                    <button
                      key={p.value}
                      onClick={() => setMinAmount(p.value)}
                      className={`flex-1 px-2 py-2 text-xs rounded-md border ${
                        minAmount === p.value
                          ? "bg-blue-600 text-white border-blue-600"
                          : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Max Amount</label>
                <input
                  type="number"
                  value={maxAmount}
                  onChange={(e) => setMaxAmount(e.target.value)}
                  placeholder="No limit"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            {/* Row 2: offers, agency, place, parent vehicle */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Max Offers</label>
                <select
                  value={maxOffers}
                  onChange={(e) => setMaxOffers(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="1">1 (sole source)</option>
                  <option value="2">1-2 bidders</option>
                  <option value="">Any</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Agency</label>
                <input
                  type="text"
                  value={agency}
                  onChange={(e) => setAgency(e.target.value)}
                  placeholder="e.g. USACE, NAVFAC"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Country</label>
                <input
                  type="text"
                  value={place}
                  onChange={(e) => setPlace(e.target.value)}
                  placeholder="e.g. GUM, EGY, ARE"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Parent Vehicle (IDV)</label>
                <input
                  type="text"
                  value={parentIdv}
                  onChange={(e) => setParentIdv(e.target.value)}
                  placeholder="e.g. LOGCAP, WEXMAC"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            {/* Row 3: NAICS, PSC, date range */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">NAICS Code</label>
                <input
                  type="text"
                  value={naics}
                  onChange={(e) => setNaics(e.target.value)}
                  placeholder="e.g. 423510"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">PSC Code</label>
                <input
                  type="text"
                  value={psc}
                  onChange={(e) => setPsc(e.target.value)}
                  placeholder="e.g. 5610, 2310"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Date From</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Date To</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            {/* Search button */}
            <button
              onClick={() => search(1)}
              disabled={loading}
              className="w-full md:w-auto px-6 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "Searching\u2026" : "Search Awards"}
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md mb-6 text-sm">
            {error}
          </div>
        )}

        {/* Results summary */}
        {hasSearched && !loading && (
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-600">
              {total === 0 ? "No awards found" : `${total.toLocaleString()} award${total === 1 ? "" : "s"} found`}
              {total > 0 && ` \u2014 showing ${(page - 1) * limit + 1}\u2013${Math.min(page * limit, total)}`}
            </p>
            {total > 0 && (
              <button
                onClick={exportCSV}
                className="text-sm text-blue-600 hover:text-blue-800 underline"
              >
                Export CSV
              </button>
            )}
          </div>
        )}

        {/* Results table */}
        {results.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-600 whitespace-nowrap">Title</th>
                    <th
                      className="px-4 py-3 text-left font-medium text-gray-600 whitespace-nowrap cursor-pointer hover:text-gray-900"
                      onClick={() => handleSort("amount")}
                    >
                      Amount <SortIcon field="amount" />
                    </th>
                    <th
                      className="px-4 py-3 text-left font-medium text-gray-600 whitespace-nowrap cursor-pointer hover:text-gray-900"
                      onClick={() => handleSort("number_of_offers")}
                    >
                      Offers <SortIcon field="number_of_offers" />
                    </th>
                    <th
                      className="px-4 py-3 text-left font-medium text-gray-600 whitespace-nowrap cursor-pointer hover:text-gray-900"
                      onClick={() => handleSort("agency")}
                    >
                      Agency <SortIcon field="agency" />
                    </th>
                    <th
                      className="px-4 py-3 text-left font-medium text-gray-600 whitespace-nowrap cursor-pointer hover:text-gray-900"
                      onClick={() => handleSort("recipient_name")}
                    >
                      Recipient <SortIcon field="recipient_name" />
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600 whitespace-nowrap">Country</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600 whitespace-nowrap">Parent IDV</th>
                    <th
                      className="px-4 py-3 text-left font-medium text-gray-600 whitespace-nowrap cursor-pointer hover:text-gray-900"
                      onClick={() => handleSort("award_date")}
                    >
                      Date <SortIcon field="award_date" />
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600 whitespace-nowrap">Link</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {results.map((r) => (
                    <tr key={r.award_id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 max-w-xs truncate" title={r.title ?? ""}>
                        {r.title ?? "\u2014"}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap font-mono text-right">
                        {formatCurrency(r.amount)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                            r.number_of_offers === 1
                              ? "bg-green-100 text-green-800"
                              : r.number_of_offers === 2
                              ? "bg-yellow-100 text-yellow-800"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {r.number_of_offers ?? "\u2014"}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">{r.agency ?? "\u2014"}</td>
                      <td className="px-4 py-3 max-w-[200px] truncate" title={r.recipient_name ?? ""}>
                        {r.recipient_name ?? "\u2014"}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">{r.place_of_performance_country ?? "\u2014"}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500 max-w-[120px] truncate" title={r.parent_idv ?? ""}>
                        {r.parent_idv ?? "\u2014"}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">{formatDate(r.award_date)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {r.usa_spending_url ? (
                          <a
                            href={r.usa_spending_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800 underline text-xs"
                          >
                            View
                          </a>
                        ) : (
                          "\u2014"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
                <button
                  onClick={() => search(page - 1)}
                  disabled={page <= 1 || loading}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <span className="text-sm text-gray-600">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => search(page + 1)}
                  disabled={page >= totalPages || loading}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        )}

        {/* Empty state */}
        {hasSearched && !loading && results.length === 0 && !error && (
          <div className="bg-white rounded-lg border border-gray-200 px-6 py-16 text-center">
            <p className="text-gray-500 text-lg mb-2">No awards found</p>
            <p className="text-gray-400 text-sm">
              Try adjusting your filters, or click &quot;Ingest from USA Spending&quot; to load data first.
            </p>
          </div>
        )}

        {/* Initial state */}
        {!hasSearched && (
          <div className="bg-white rounded-lg border border-gray-200 px-6 py-16 text-center">
            <h2 className="text-xl font-semibold text-gray-700 mb-2">Find Low-Competition Contracts</h2>
            <p className="text-gray-400 text-sm max-w-lg mx-auto">
              Search federal contract awards with 1-2 bidders and values over $1M.
              Set your filters above and click &quot;Search Awards&quot; to find opportunities.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
