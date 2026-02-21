/**
 * Tango API client (makegov.com)
 * Requires TANGO_API_KEY in .env.local
 *
 * Endpoints: /api/vehicles/, /api/idvs/, /api/opportunities/, /api/forecasts/
 * Use for: LOGCAP, WEXMAC, Guam, Diego Garcia vehicles; expiring IDIQs (last_date_to_order)
 */

const TANGO_BASE = "https://tango.makegov.com/api/";

function getHeaders(): HeadersInit {
  const key = process.env.TANGO_API_KEY;
  if (!key) {
    throw new Error("TANGO_API_KEY is required for Tango API calls");
  }
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

export async function fetchVehicles(solicitationIdentifier?: string) {
  const url = new URL("vehicles/", TANGO_BASE);
  if (solicitationIdentifier) {
    url.searchParams.set("search", solicitationIdentifier);
  }
  const res = await fetch(url.toString(), { headers: getHeaders() });
  if (!res.ok) throw new Error(`Tango Vehicles API error: ${res.status}`);
  return res.json();
}

export async function fetchExpiringIdvs(monthsAhead = 24) {
  // Tango IDVs with period_of_performance expansion
  // Filter client-side: last_date_to_order between now and now + monthsAhead
  const url = new URL("idvs/", TANGO_BASE);
  url.searchParams.set("shape", "key,piid,description,period_of_performance(start_date,last_date_to_order),awarding_office,obligated");
  const res = await fetch(url.toString(), { headers: getHeaders() });
  if (!res.ok) throw new Error(`Tango IDVs API error: ${res.status}`);
  const data = (await res.json()) as { results?: Array<{ period_of_performance?: { last_date_to_order?: string } }> };
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() + monthsAhead);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return (data.results ?? []).filter((r) => {
    const ldo = r.period_of_performance?.last_date_to_order;
    return ldo && ldo <= cutoffStr && ldo >= new Date().toISOString().slice(0, 10);
  });
}
