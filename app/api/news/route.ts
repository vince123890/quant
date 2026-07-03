// GET /api/news?symbols=SPY,AAPL&limit=6 — headlines per symbol from
// Yahoo Finance RSS and Google News, deduped and sorted by recency.

import type { NextRequest } from 'next/server';
import { jsonError, jsonOk } from '@/src/services/apiHelpers';
import { getNews } from '@/src/services/news';
import { clampInt, cleanSymbolList } from '@/src/services/util';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('symbols') ?? '';
  const symbols = cleanSymbolList(raw.split(','), 15);
  if (symbols.length === 0) {
    return jsonError('Provide ?symbols=SPY,AAPL (comma-separated tickers)');
  }
  const limit = clampInt(Number(req.nextUrl.searchParams.get('limit')), 1, 20, 6);
  const items = await getNews(symbols, limit);
  return jsonOk({ items }, 300);
}
