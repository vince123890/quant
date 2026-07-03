// GET /api/signals/SPY?range=6m — deterministic Signal Desk evaluation:
// regime, setup type, decision, component scores, risk/reward plan.

import type { NextRequest } from 'next/server';
import { findPivots } from '@/src/services/analysis';
import { jsonError, jsonOk, parseRange } from '@/src/services/apiHelpers';
import { getChart } from '@/src/services/chart';
import { normalizeSymbol } from '@/src/services/util';
import { evaluateSignal } from '@/src/shared/quant';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { symbol: string } },
) {
  const symbol = normalizeSymbol(params.symbol);
  if (!symbol) return jsonError('Invalid symbol');
  const range = parseRange(req.nextUrl.searchParams.get('range'));
  const chart = await getChart(symbol, range);
  const pivots = findPivots(chart.candles);
  const evaluation = evaluateSignal(symbol, chart.candles, pivots);
  return jsonOk(
    {
      symbol,
      range,
      dataSource: chart.source,
      candleCount: chart.candles.length,
      pivots,
      evaluation,
    },
    300,
  );
}
