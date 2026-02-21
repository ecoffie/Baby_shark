/**
 * GET /api/report?format=csv|pdf — Download scored results as CSV or PDF
 * Optional ?category=high|medium|low to filter
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

interface Award {
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
  fit_details: Record<string, unknown> | null;
  brief_category: string;
}

function fmt(n: number | null): string {
  if (n == null) return "";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function escapeCsv(s: string | null): string {
  if (s == null) return "";
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

async function fetchAllScored(category: string | null): Promise<Award[]> {
  const supabase = getSupabase();
  const all: Award[] = [];
  let offset = 0;
  const BATCH = 1000;

  while (true) {
    let query = supabase
      .from("low_competition_awards")
      .select("award_id, title, agency, amount, number_of_offers, psc_code, naics, recipient_name, place_of_performance_country, parent_idv, award_date, usa_spending_url, fit_score, fit_details, brief_category")
      .order("fit_score", { ascending: false })
      .range(offset, offset + BATCH - 1);

    if (category && ["high", "medium", "low"].includes(category)) {
      query = query.eq("brief_category", category);
    }

    const { data, error } = await query;
    if (error || !data || data.length === 0) break;
    all.push(...(data as Award[]));
    if (data.length < BATCH) break;
    offset += BATCH;
  }

  return all;
}

function generateCsv(awards: Award[]): string {
  const headers = [
    "Fit Score", "Category", "Award ID", "Title", "Agency", "Amount",
    "Offers", "Recipient", "Country", "Parent IDV", "PSC", "NAICS",
    "Date", "Suggested Actions", "URL",
  ];

  const rows = awards.map((a) => {
    const details = a.fit_details as Record<string, unknown> | null;
    const actions = (details?.suggested_actions as string[]) ?? [];
    return [
      String(a.fit_score),
      a.brief_category ?? "",
      a.award_id,
      escapeCsv(a.title),
      escapeCsv(a.agency),
      a.amount != null ? String(a.amount) : "",
      a.number_of_offers != null ? String(a.number_of_offers) : "",
      escapeCsv(a.recipient_name),
      a.place_of_performance_country ?? "",
      a.parent_idv ?? "",
      a.psc_code ?? "",
      a.naics ?? "",
      a.award_date ?? "",
      escapeCsv(actions.join("; ")),
      a.usa_spending_url ?? "",
    ].join(",");
  });

  return [headers.join(","), ...rows].join("\n");
}

async function generatePdf(awards: Award[]): Promise<Uint8Array> {
  // Dynamic import for server-side only
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });

  // Cover page
  doc.setFontSize(28);
  doc.text("Baby Shark Intelligence Report", 40, 80);
  doc.setFontSize(14);
  doc.setTextColor(100);
  doc.text("Automated Opportunity Analysis for Micron Ventures", 40, 110);
  doc.setFontSize(10);
  doc.text(`Generated: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`, 40, 140);
  doc.text(`Total Opportunities: ${awards.length}`, 40, 158);

  const high = awards.filter((a) => a.brief_category === "high");
  const medium = awards.filter((a) => a.brief_category === "medium");
  const low = awards.filter((a) => a.brief_category === "low");

  doc.text(`High Priority: ${high.length}  |  Medium: ${medium.length}  |  Low: ${low.length}`, 40, 176);

  // Executive summary
  doc.setTextColor(0);
  doc.setFontSize(12);
  doc.text("Executive Summary", 40, 210);
  doc.setFontSize(9);
  const totalValue = awards.reduce((s, a) => s + (Number(a.amount) || 0), 0);
  doc.text(`Total contract value in pipeline: ${fmt(totalValue)}`, 40, 228);
  doc.text(`High-priority opportunities represent ${fmt(high.reduce((s, a) => s + (Number(a.amount) || 0), 0))} in potential value.`, 40, 242);

  // High-priority detail table
  if (high.length > 0) {
    doc.addPage();
    doc.setFontSize(14);
    doc.text("High Priority Opportunities", 40, 40);

    autoTable(doc, {
      startY: 55,
      head: [["Score", "Title", "Agency", "Amount", "Offers", "Country", "Recipient", "Actions"]],
      body: high.map((a) => {
        const details = a.fit_details as Record<string, unknown> | null;
        const actions = (details?.suggested_actions as string[]) ?? [];
        return [
          String(a.fit_score),
          (a.title ?? "").substring(0, 50),
          (a.agency ?? "").substring(0, 25),
          fmt(a.amount),
          a.number_of_offers ?? "",
          a.place_of_performance_country ?? "",
          (a.recipient_name ?? "").substring(0, 25),
          actions.slice(0, 2).join("; "),
        ];
      }),
      styles: { fontSize: 7, cellPadding: 3 },
      headStyles: { fillColor: [220, 38, 38] },
      margin: { left: 40, right: 40 },
    });
  }

  // Full appendix table
  doc.addPage();
  doc.setFontSize(14);
  doc.text("All Opportunities — Appendix", 40, 40);

  autoTable(doc, {
    startY: 55,
    head: [["Score", "Category", "Title", "Agency", "Amount", "Offers", "Country", "Date"]],
    body: awards.map((a) => [
      String(a.fit_score),
      (a.brief_category ?? "").toUpperCase(),
      (a.title ?? "").substring(0, 45),
      (a.agency ?? "").substring(0, 25),
      fmt(a.amount),
      a.number_of_offers ?? "",
      a.place_of_performance_country ?? "",
      a.award_date ?? "",
    ]),
    styles: { fontSize: 6, cellPadding: 2 },
    headStyles: { fillColor: [31, 41, 55] },
    margin: { left: 40, right: 40 },
  });

  const arrayBuffer = doc.output("arraybuffer");
  return new Uint8Array(arrayBuffer);
}

export async function GET(req: NextRequest) {
  const format = req.nextUrl.searchParams.get("format") ?? "csv";
  const category = req.nextUrl.searchParams.get("category");

  try {
    const awards = await fetchAllScored(category);

    if (format === "pdf") {
      const pdfBytes = await generatePdf(awards);
      return new NextResponse(pdfBytes as unknown as BodyInit, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="baby-shark-report-${new Date().toISOString().slice(0, 10)}.pdf"`,
        },
      });
    }

    // Default: CSV
    const csv = generateCsv(awards);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="baby-shark-report-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
