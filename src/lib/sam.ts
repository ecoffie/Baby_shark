/**
 * SAM.gov Opportunities API client
 * Fetches active solicitations (RFP, RFQ, combined synopsis) and DLA opportunities
 * Requires SAM_GOV_API_KEY in .env.local
 */

const SAM_API_BASE = "https://api.sam.gov/opportunities/v2/search";

export interface SamOpportunity {
  noticeId: string;
  title: string;
  solicitationNumber: string | null;
  fullParentPathName: string | null;
  postedDate: string;
  type: string;
  baseType: string | null;
  archiveDate: string | null;
  typeOfSetAside: string | null;
  typeOfSetAsideDescription: string | null;
  responseDeadLine: string | null;
  naicsCode: string | null;
  classificationCode: string | null;
  active: string;
  award: {
    date: string | null;
    number: string | null;
    amount: number | null;
    awardee: { name: string | null } | null;
  } | null;
  pointOfContact: { type: string; fullName: string; email: string; phone: string }[] | null;
  placeOfPerformance: {
    city: { code: string; name: string } | null;
    state: { code: string; name: string } | null;
    country: { code: string; name: string } | null;
  } | null;
  uiLink: string | null;
  description: string | null; // URL to full description
}

export interface SamSearchResponse {
  totalRecords: number;
  limit: number;
  offset: number;
  opportunitiesData: SamOpportunity[];
}

export interface SamSearchFilters {
  postedFrom: string; // MM/dd/yyyy
  postedTo: string;   // MM/dd/yyyy
  ptype?: string;     // o=Solicitation, k=Combined, r=Sources Sought, etc.
  ncode?: string;     // NAICS code
  ccode?: string;     // PSC/classification code
  organizationName?: string; // e.g. "Defense Logistics Agency"
  title?: string;     // keyword in title
  solnum?: string;    // solicitation number
}

function getApiKey(): string {
  const key = process.env.SAM_GOV_API_KEY;
  if (!key) throw new Error("SAM_GOV_API_KEY is required. Get one at https://sam.gov/profile/details");
  return key;
}

function formatDateForSam(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

/**
 * Search SAM.gov opportunities
 */
export async function searchOpportunities(
  filters: SamSearchFilters,
  limit = 100,
  offset = 0
): Promise<SamSearchResponse> {
  const params = new URLSearchParams({
    api_key: getApiKey(),
    postedFrom: filters.postedFrom,
    postedTo: filters.postedTo,
    limit: String(limit),
    offset: String(offset),
  });

  if (filters.ptype) params.set("ptype", filters.ptype);
  if (filters.ncode) params.set("ncode", filters.ncode);
  if (filters.ccode) params.set("ccode", filters.ccode);
  if (filters.organizationName) params.set("organizationName", filters.organizationName);
  if (filters.title) params.set("title", filters.title);
  if (filters.solnum) params.set("solnum", filters.solnum);

  const res = await fetch(`${SAM_API_BASE}?${params.toString()}`);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`SAM.gov API error ${res.status}: ${body.substring(0, 200)}`);
  }

  return res.json();
}

/**
 * Fetch active solicitations matching Micron's profile
 * Pulls RFPs, RFQs, and combined synopsis/solicitations
 */
export async function fetchMicronOpportunities(
  naicsCodes: string[],
  monthsBack = 6
): Promise<SamOpportunity[]> {
  const now = new Date();
  const from = new Date(now);
  from.setMonth(from.getMonth() - monthsBack);

  const postedFrom = formatDateForSam(from);
  const postedTo = formatDateForSam(now);
  const allOpps: SamOpportunity[] = [];
  const seenIds = new Set<string>();

  // Solicitations + Combined Synopsis (covers RFP, RFQ, IFB)
  const ptypes = "o,k";

  // Search by each NAICS code (continue on individual failures)
  for (const naics of naicsCodes) {
    let offset = 0;
    const MAX_PAGES = 5;

    for (let page = 0; page < MAX_PAGES; page++) {
      try {
        const result = await searchOpportunities(
          { postedFrom, postedTo, ptype: ptypes, ncode: naics },
          100,
          offset
        );

        for (const opp of result.opportunitiesData ?? []) {
          if (!seenIds.has(opp.noticeId)) {
            seenIds.add(opp.noticeId);
            allOpps.push(opp);
          }
        }

        if ((result.opportunitiesData?.length ?? 0) < 100) break;
        offset += 100;
      } catch {
        // Skip this NAICS if SAM.gov errors — continue with others
        break;
      }
    }
  }

  // Broader search to catch related opportunities (multiple pages)
  const MAX_BROAD = 3;
  for (let pg = 0; pg < MAX_BROAD; pg++) {
    try {
      const result = await searchOpportunities(
        { postedFrom, postedTo, ptype: ptypes },
        100,
        pg * 100
      );
      for (const opp of result.opportunitiesData ?? []) {
        if (!seenIds.has(opp.noticeId)) {
          seenIds.add(opp.noticeId);
          allOpps.push(opp);
        }
      }
      if ((result.opportunitiesData?.length ?? 0) < 100) break;
    } catch {
      break;
    }
  }

  return allOpps;
}

/**
 * Fetch DLA-specific opportunities
 * DLA doesn't post everything to SAM.gov, but this captures what they do cross-post
 */
export async function fetchDlaOpportunities(monthsBack = 6): Promise<SamOpportunity[]> {
  const now = new Date();
  const from = new Date(now);
  from.setMonth(from.getMonth() - monthsBack);

  const postedFrom = formatDateForSam(from);
  const postedTo = formatDateForSam(now);
  const allOpps: SamOpportunity[] = [];

  let offset = 0;
  const MAX_PAGES = 5;

  for (let page = 0; page < MAX_PAGES; page++) {
    try {
      const result = await searchOpportunities(
        {
          postedFrom,
          postedTo,
          ptype: "o,k",
          organizationName: "Defense Logistics Agency",
        },
        100,
        offset
      );

      allOpps.push(...(result.opportunitiesData ?? []));
      if ((result.opportunitiesData?.length ?? 0) < 100) break;
      offset += 100;
    } catch {
      break;
    }
  }

  return allOpps;
}
