// GET /api/search?q=apple — symbol search (offline directory + Yahoo search).

import type { NextRequest } from 'next/server';
import { jsonError, jsonOk } from '@/src/services/apiHelpers';
import { searchSymbols } from '@/src/services/symbols';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim();
  if (!q) return jsonError('Provide ?q=<query>');
  const suggestions = await searchSymbols(q);
  return jsonOk({ suggestions }, 600);
}
