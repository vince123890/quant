'use client';

// Signal Scanner: scans the user's watchlist universe (watched symbols plus
// top ETF holdings) with the deterministic signal engine, ranks tradeable
// candidates by confidence, and shows the news-fused position verdict.

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/src/renderer/api';
import type { ChartRange } from '@/src/shared/types';

type Row = {
  symbol: string;
  decision: string;
  setupType: string;
  regime: string;
  confidence: number;
  lastClose: number;
  changePercent: number;
  entry: number;
  stop: number;
  target1: number;
  rewardRisk1: number;
  direction: string;
  dataSource: string;
  sentiment?: { score: number; label: string; scoredCount: number; itemCount: number };
  verdict?: { action: string; sizeR: number; conviction: number; reasons: string[] };
};

type ScreenerResponse = {
  scannedAt: string;
  range: ChartRange;
  universe: string[];
  tradeCandidates: number;
  results: Row[];
};

const RANGES: ChartRange[] = ['1m', '6m', '1y'];

const DECISION_BADGE: Record<string, { cls: string; label: string }> = {
  'buy-candidate': { cls: 'buy', label: 'BUY CANDIDATE' },
  'short-candidate': { cls: 'short', label: 'SHORT CANDIDATE' },
  wait: { cls: 'wait', label: 'WAIT' },
  'no-trade': { cls: 'no', label: 'NO TRADE' },
  invalidated: { cls: 'no', label: 'INVALIDATED' },
};

const ACTION_LABEL: Record<string, string> = {
  add: 'ADD POSITION (1R)',
  'add-small': 'ADD SMALL (0.5R)',
  hold: 'HOLD — DON’T ADD',
  avoid: 'AVOID',
};

async function buildUniverse(): Promise<string[]> {
  const watchlist = await api.getWatchlist();
  const symbols: string[] = [];
  const push = (s: string) => {
    if (!symbols.includes(s) && symbols.length < 40) symbols.push(s);
  };
  for (const item of watchlist) push(item.symbol);
  for (const item of watchlist) {
    if (item.type !== 'etf') continue;
    try {
      const h = await api.getHoldings(item.symbol);
      for (const holding of h.holdings.slice(0, 15)) push(holding.symbol);
    } catch {
      /* skip this ETF's holdings */
    }
  }
  return symbols;
}

export default function ScannerPage() {
  const [range, setRange] = useState<ChartRange>('6m');
  const [data, setData] = useState<ScreenerResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scan = useCallback(async (r: ChartRange) => {
    setLoading(true);
    setError(null);
    try {
      const universe = await buildUniverse();
      const qs = universe.length ? `symbols=${encodeURIComponent(universe.join(','))}&` : '';
      const res = await fetch(`/api/screener?${qs}range=${r}&top=10`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData((await res.json()) as ScreenerResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scan failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void scan(range);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="scanner-page">
      <div className="scanner-head">
        <h1>SIGNAL SCANNER</h1>
        <Link href="/" className="scanner-back">
          ← back to terminal
        </Link>
      </div>
      <p className="scanner-sub">
        Scans your watchlist plus top ETF holdings with the deterministic signal engine, ranks
        high-confidence trade candidates first, and fuses news tone into a position verdict.
        Deterministic and reproducible — not investment advice.
      </p>

      <div className="scanner-controls">
        {RANGES.map((r) => (
          <button
            key={r}
            disabled={loading}
            onClick={() => {
              setRange(r);
              void scan(r);
            }}
            style={r === range ? { borderColor: '#4d7ef7', color: '#9db8ff' } : undefined}
          >
            {r}
          </button>
        ))}
        <button disabled={loading} onClick={() => void scan(range)}>
          {loading ? 'Scanning…' : 'Rescan'}
        </button>
        {data && (
          <span className="scanner-meta">
            {data.universe.length} symbols scanned · {data.tradeCandidates} trade candidates ·{' '}
            {new Date(data.scannedAt).toLocaleTimeString()}
          </span>
        )}
      </div>

      {error && <div className="scanner-loading">Scan failed: {error}</div>}
      {loading && !data && <div className="scanner-loading">Scanning universe…</div>}

      {data && (
        <div className="scanner-table-wrap">
          <table className="scanner-table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Decision</th>
                <th>Setup / Regime</th>
                <th>Confidence</th>
                <th>Last / Chg</th>
                <th>Entry → Target (R/R)</th>
                <th>News tone</th>
                <th>Position verdict</th>
              </tr>
            </thead>
            <tbody>
              {data.results.map((row) => {
                const badge = DECISION_BADGE[row.decision] ?? { cls: 'no', label: row.decision };
                const tone = row.sentiment?.score ?? null;
                return (
                  <tr key={row.symbol}>
                    <td className="scanner-sym">
                      {row.symbol}
                      {row.dataSource === 'sample' && (
                        <span className="scanner-meta"> (sample)</span>
                      )}
                    </td>
                    <td>
                      <span className={`scanner-badge ${badge.cls}`}>{badge.label}</span>
                    </td>
                    <td>
                      {row.setupType.replaceAll('-', ' ')}
                      <div className="scanner-meta">{row.regime.replaceAll('-', ' ')}</div>
                    </td>
                    <td>
                      <div className="scanner-conf">
                        <div className="scanner-conf-bar">
                          <div
                            className="scanner-conf-fill"
                            style={{ width: `${row.confidence}%` }}
                          />
                        </div>
                        <span className="scanner-num">{row.confidence}</span>
                      </div>
                    </td>
                    <td className="scanner-num">
                      {row.lastClose.toFixed(2)}
                      <div className={row.changePercent >= 0 ? 'scanner-tone pos' : 'scanner-tone neg'}>
                        {row.changePercent >= 0 ? '+' : ''}
                        {row.changePercent.toFixed(2)}%
                      </div>
                    </td>
                    <td className="scanner-num">
                      {row.direction === 'none'
                        ? '—'
                        : `${row.entry.toFixed(2)} → ${row.target1.toFixed(2)} (${row.rewardRisk1.toFixed(1)}R)`}
                      {row.direction !== 'none' && (
                        <div className="scanner-meta">stop {row.stop.toFixed(2)}</div>
                      )}
                    </td>
                    <td>
                      {tone === null ? (
                        <span className="scanner-tone mid">not scored</span>
                      ) : (
                        <span
                          className={`scanner-tone ${tone >= 12 ? 'pos' : tone <= -12 ? 'neg' : 'mid'}`}
                        >
                          {tone >= 0 ? '+' : ''}
                          {tone} {row.sentiment?.label}
                          <div className="scanner-meta">
                            {row.sentiment?.scoredCount}/{row.sentiment?.itemCount} headlines
                          </div>
                        </span>
                      )}
                    </td>
                    <td className="scanner-verdict">
                      {row.verdict ? (
                        <>
                          <div className={`v-action ${row.verdict.action}`}>
                            {ACTION_LABEL[row.verdict.action] ?? row.verdict.action} ·{' '}
                            {row.verdict.conviction}% conviction
                          </div>
                          <div className="v-reasons">{row.verdict.reasons.join(' ')}</div>
                        </>
                      ) : (
                        <span className="scanner-meta">below top cut — rescan to include</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="scanner-note">
        Confidence is the signal engine&apos;s 0–100 score; a decision only becomes a{' '}
        <strong>candidate</strong> at ≥55 with no blockers. Conviction fuses that score (70%) with
        news tone (30%). News tone is a deterministic keyword score over recent headlines — only
        the top-ranked rows are enriched with news to keep scans fast.
      </p>
    </div>
  );
}
