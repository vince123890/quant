// GET /api/chart/SPY?range=6m — OHLCV candles (ranges: 1d 1w 1m 6m 1y 5y max).

import type { NextRequest } from 'next/server';
import { jsonError, jsonOk, parseRange } from '@/src/services/apiHelpers';
import { getChart } from '@/src/services/chart';
import { normalizeSymbol } from '@/src/services/util';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { symbol: string } },
) {
  const symbol = normalizeSymbol(params.symbol);
  if (!symbol) return jsonError('Invalid symbol');
  const range = parseRange(req.nextUrl.searchParams.get('range'));
  const chart = await getChart(symbol, range);
  return jsonOk(chart, range === '1d' || range === '1w' ? 60 : 600);
}
