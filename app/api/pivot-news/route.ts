// POST /api/pivot-news — body { symbol, pivots: PivotPoint[] }.
// For each pivot, dated headlines within ±5 days from Google News + Yahoo RSS.

import type { NextRequest } from 'next/server';
import { jsonError, jsonOk } from '@/src/services/apiHelpers';
import { getPivotNews } from '@/src/services/pivotNews';
import { normalizeSymbol } from '@/src/services/util';
import type { PivotPoint } from '@/src/shared/types';

export const dynamic = 'force-dynamic';

const MAX_PIVOTS = 24;

function isPivot(value: unknown): value is PivotPoint {
  if (!value || typeof value !== 'object') return false;
  const p = value as Partial<PivotPoint>;
  return (
    typeof p.time === 'number' &&
    Number.isFinite(p.time) &&
    typeof p.price === 'number' &&
    Number.isFinite(p.price) &&
    (p.kind === 'high' || p.kind === 'low')
  );
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('Invalid JSON body');
  }
  const { symbol: rawSymbol, pivots: rawPivots } = (body ?? {}) as {
    symbol?: unknown;
    pivots?: unknown;
  };
  const symbol = typeof rawSymbol === 'string' ? normalizeSymbol(rawSymbol) : null;
  if (!symbol) return jsonError('Invalid symbol');
  const pivots = Array.isArray(rawPivots) ? rawPivots.filter(isPivot).slice(0, MAX_PIVOTS) : [];
  const results = await getPivotNews(symbol, pivots);
  return jsonOk({ results }, 600);
}
