/**
 * POST /api/score — Re-score all data sources against the client profile
 */

import { NextResponse } from "next/server";
import { scoreAllAwards, scoreAllOpportunities, scoreAllExpiringIdiqs } from "@/lib/scoring";

export async function POST() {
  try {
    const [awards, opps, idiqs] = await Promise.all([
      scoreAllAwards(),
      scoreAllOpportunities(),
      scoreAllExpiringIdiqs(),
    ]);

    return NextResponse.json({
      ok: !awards.error && !opps.error && !idiqs.error,
      awards: { scored: awards.scored, error: awards.error },
      opportunities: { scored: opps.scored, error: opps.error },
      expiring_idiqs: { scored: idiqs.scored, error: idiqs.error },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
