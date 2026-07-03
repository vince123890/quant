// GET /api/macro/vix?range=1y — macro series
// (keys: jobs unemployment inflation treasury10y oil vix).

import type { NextRequest } from 'next/server';
import { jsonError, jsonOk, parseMacroKey, parseRange } from '@/src/services/apiHelpers';
import { getMacroOverlay } from '@/src/services/macro';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { key: string } },
) {
  const key = parseMacroKey(params.key);
  if (!key) {
    return jsonError('Invalid key. Use: jobs, unemployment, inflation, treasury10y, oil, vix');
  }
  const range = parseRange(req.nextUrl.searchParams.get('range'), '1y');
  const series = await getMacroOverlay(key, range);
  return jsonOk(series, key === 'vix' || key === 'oil' ? 120 : 3600);
}
