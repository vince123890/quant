// Shared helpers for the Next.js route handlers: param validation and
// JSON responses with CDN cache hints (s-maxage is honored by Vercel's edge).

import { NextResponse } from 'next/server';
import type { ChartRange, MacroOverlayKey } from '../shared/types';

const CHART_RANGES: ChartRange[] = ['1d', '1w', '1m', '6m', '1y', '5y', 'max'];
const MACRO_KEYS: MacroOverlayKey[] = [
  'jobs',
  'unemployment',
  'inflation',
  'treasury10y',
  'oil',
  'vix',
];

export function parseRange(raw: string | null, fallback: ChartRange = '6m'): ChartRange {
  return CHART_RANGES.includes(raw as ChartRange) ? (raw as ChartRange) : fallback;
}

export function parseMacroKey(raw: string): MacroOverlayKey | null {
  return MACRO_KEYS.includes(raw as MacroOverlayKey) ? (raw as MacroOverlayKey) : null;
}

/** JSON 200 with a CDN cache hint (seconds). */
export function jsonOk(data: unknown, sMaxAgeSec: number): NextResponse {
  return NextResponse.json(data, {
    headers: {
      'Cache-Control': `public, s-maxage=${sMaxAgeSec}, stale-while-revalidate=${sMaxAgeSec * 2}`,
    },
  });
}

export function jsonError(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status });
}
