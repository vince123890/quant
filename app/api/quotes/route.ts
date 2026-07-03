// GET /api/quotes?symbols=SPY,QQQ,AAPL — live quotes (max 30 symbols).

import type { NextRequest } from 'next/server';
import { jsonError, jsonOk } from '@/src/services/apiHelpers';
import { getQuotes } from '@/src/services/quotes';
import { cleanSymbolList } from '@/src/services/util';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('symbols') ?? '';
  const symbols = cleanSymbolList(raw.split(','), 30);
  if (symbols.length === 0) {
    return jsonError('Provide ?symbols=SPY,QQQ (comma-separated tickers)');
  }
  const quotes = await getQuotes(symbols);
  return jsonOk({ quotes }, 30);
}
