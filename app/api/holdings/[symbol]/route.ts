// GET /api/holdings/SPY — top holdings of an ETF (live via quoteSummary,
// falls back to the bundled snapshot).

import { jsonError, jsonOk } from '@/src/services/apiHelpers';
import { getHoldings } from '@/src/services/holdings';
import { normalizeSymbol } from '@/src/services/util';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: { symbol: string } },
) {
  const symbol = normalizeSymbol(params.symbol);
  if (!symbol) return jsonError('Invalid symbol');
  const holdings = await getHoldings(symbol);
  return jsonOk(holdings, 21600);
}
