// GET /api/earnings?symbols=AAPL,MSFT — upcoming earnings events.

import type { NextRequest } from 'next/server';
import { jsonError, jsonOk } from '@/src/services/apiHelpers';
import { getEarnings } from '@/src/services/earnings';
import { cleanSymbolList } from '@/src/services/util';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('symbols') ?? '';
  const symbols = cleanSymbolList(raw.split(','), 20);
  if (symbols.length === 0) {
    return jsonError('Provide ?symbols=AAPL,MSFT (comma-separated tickers)');
  }
  const events = await getEarnings(symbols);
  return jsonOk({ events }, 3600);
}
