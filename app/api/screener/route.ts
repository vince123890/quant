// GET /api/screener?symbols=SPY,QQQ,...&range=6m&top=8
// Scans a symbol universe with the deterministic signal engine, ranks by
// tradeability + confidence, and enriches the top candidates with news
// sentiment and a combined position verdict ("add / add-small / hold /
// avoid" with a conviction score). Without ?symbols= it scans a default
// universe: the seed watchlist ETFs/stocks plus their top bundled holdings.

import type { NextRequest } from 'next/server';
import { findPivots } from '@/src/services/analysis';
import { jsonError, jsonOk, parseRange } from '@/src/services/apiHelpers';
import { getChart } from '@/src/services/chart';
import { getEtfBundle } from '@/src/services/dataFiles';
import { fetchSymbolFeed } from '@/src/services/news';
import {
  analyzeNewsSentiment,
  positionVerdict,
  type NewsSentiment,
  type PositionVerdict,
} from '@/src/services/sentiment';
import { clampInt, cleanSymbolList, pLimit } from '@/src/services/util';
import { evaluateSignal, type SignalEvaluation } from '@/src/shared/quant';
import type { ChartRange, DataSource } from '@/src/shared/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_SYMBOLS = 40;
const DEFAULT_TOP = 8;
const MAX_TOP = 12;
const SEED_ETFS = ['SPY', 'QQQ', 'SMH'];
const SEED_STOCKS = ['AAPL', 'NVDA', 'TSLA'];

interface ScreenerRow {
  symbol: string;
  decision: SignalEvaluation['decision'];
  setupType: SignalEvaluation['setupType'];
  regime: SignalEvaluation['regime'];
  confidence: number;
  lastClose: number;
  changePercent: number;
  entry: number;
  stop: number;
  target1: number;
  rewardRisk1: number;
  direction: SignalEvaluation['risk']['direction'];
  noTradeReasons: string[];
  dataSource: DataSource;
  sentiment?: NewsSentiment;
  verdict?: PositionVerdict;
}

function defaultUniverse(): string[] {
  const out: string[] = [...SEED_ETFS, ...SEED_STOCKS];
  const bundle = getEtfBundle();
  for (const etf of SEED_ETFS) {
    const entry = bundle.etfs[etf];
    if (!entry) continue;
    for (const holding of entry.holdings.slice(0, 15)) {
      if (!out.includes(holding.symbol)) out.push(holding.symbol);
      if (out.length >= MAX_SYMBOLS) return out;
    }
  }
  return out;
}

const DECISION_ORDER: Record<string, number> = {
  'buy-candidate': 0,
  'short-candidate': 0,
  wait: 1,
  'no-trade': 2,
  invalidated: 3,
};

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const rawSymbols = params.get('symbols');
  const symbols = rawSymbols
    ? cleanSymbolList(rawSymbols.split(','), MAX_SYMBOLS)
    : defaultUniverse();
  if (symbols.length === 0) return jsonError('No valid symbols to scan');
  const range = parseRange(params.get('range'));
  const top = clampInt(Number(params.get('top')), 1, MAX_TOP, DEFAULT_TOP);

  // Phase 1: signal scan (chart fetches are TTL-cached and host-limited).
  const limit = pLimit(6);
  const rows = await Promise.all(
    symbols.map((symbol) =>
      limit(async (): Promise<ScreenerRow | null> => {
        try {
          const chart = await getChart(symbol, range);
          const pivots = findPivots(chart.candles);
          const e = evaluateSignal(symbol, chart.candles, pivots);
          return {
            symbol,
            decision: e.decision,
            setupType: e.setupType,
            regime: e.regime,
            confidence: e.confidence,
            lastClose: e.analytics.lastClose,
            changePercent: e.analytics.changePercent,
            entry: e.risk.entry,
            stop: e.risk.stop,
            target1: e.risk.target1,
            rewardRisk1: e.risk.rewardRisk1,
            direction: e.risk.direction,
            noTradeReasons: e.noTradeReasons,
            dataSource: chart.source,
            _evaluation: e,
          } as ScreenerRow & { _evaluation: SignalEvaluation };
        } catch {
          return null;
        }
      }),
    ),
  );

  const scanned = rows.filter((r): r is ScreenerRow & { _evaluation: SignalEvaluation } => r !== null);
  scanned.sort((a, b) => {
    const byDecision = (DECISION_ORDER[a.decision] ?? 9) - (DECISION_ORDER[b.decision] ?? 9);
    if (byDecision !== 0) return byDecision;
    return b.confidence - a.confidence;
  });

  // Phase 2: news sentiment + verdict for the top candidates only.
  const newsLimit = pLimit(4);
  await Promise.all(
    scanned.slice(0, top).map((row) =>
      newsLimit(async () => {
        let sentiment: NewsSentiment | null = null;
        try {
          const items = await fetchSymbolFeed(row.symbol);
          sentiment = analyzeNewsSentiment(row.symbol, items.slice(0, 10));
        } catch {
          /* verdict handles missing sentiment */
        }
        if (sentiment) row.sentiment = sentiment;
        row.verdict = positionVerdict(row._evaluation, sentiment);
      }),
    ),
  );

  const results = scanned.map(({ _evaluation, ...row }) => row);
  return jsonOk(
    {
      scannedAt: new Date().toISOString(),
      range,
      universe: symbols,
      tradeCandidates: results.filter(
        (r) => r.decision === 'buy-candidate' || r.decision === 'short-candidate',
      ).length,
      results,
    },
    120,
  );
}
