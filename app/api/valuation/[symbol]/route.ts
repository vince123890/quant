// GET /api/valuation/AAPL — valuation snapshot (P/E, EV, margins, growth).
// Depends on Yahoo quoteSummary which needs a cookie+crumb; degrades to
// a partial snapshot when that fails.

import { jsonError, jsonOk } from '@/src/services/apiHelpers';
import { normalizeSymbol } from '@/src/services/util';
import { getValuation } from '@/src/services/valuation';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: { symbol: string } },
) {
  const symbol = normalizeSymbol(params.symbol);
  if (!symbol) return jsonError('Invalid symbol');
  const valuation = await getValuation(symbol);
  return jsonOk(valuation, 1800);
}
