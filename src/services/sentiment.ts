// Deterministic news sentiment: lexicon scoring of headlines plus a combined
// position verdict that fuses the Signal Desk evaluation with news tone.
// Fully explainable — no LLM involved — so results are reproducible.

import type { NewsItem } from '../shared/types';
import type { SignalEvaluation } from '../shared/quant';

// Weighted keyword lexicon. Multi-word phrases are checked as substrings of
// the lowercased headline; single words are matched on word boundaries.
const POSITIVE: Array<[string, number]> = [
  ['beats', 3], ['beat estimates', 3], ['tops estimates', 3], ['record high', 3],
  ['all-time high', 3], ['surges', 3], ['soars', 3], ['skyrockets', 3],
  ['upgrade', 2], ['upgraded', 2], ['outperform', 2], ['raises guidance', 3],
  ['raised guidance', 3], ['guidance raised', 3], ['buyback', 2], ['dividend increase', 2],
  ['strong demand', 2], ['blowout', 3], ['rallies', 2], ['rally', 1], ['jumps', 2],
  ['gains', 1], ['climbs', 1], ['rises', 1], ['bullish', 2], ['buy rating', 2],
  ['price target raised', 2], ['expands', 1], ['partnership', 1], ['approval', 2],
  ['approved', 2], ['wins', 2], ['breakthrough', 2], ['accelerates', 1],
  ['better-than-expected', 3], ['profit rises', 2], ['revenue growth', 2],
];

const NEGATIVE: Array<[string, number]> = [
  ['misses', 3], ['missed estimates', 3], ['falls short', 3], ['plunges', 3],
  ['plummets', 3], ['crashes', 3], ['tumbles', 2], ['sinks', 2], ['slides', 2],
  ['slumps', 2], ['downgrade', 2], ['downgraded', 2], ['underperform', 2],
  ['cuts guidance', 3], ['guidance cut', 3], ['lowered guidance', 3], ['layoffs', 2],
  ['lawsuit', 2], ['investigation', 2], ['probe', 2], ['recall', 2], ['bearish', 2],
  ['sell rating', 2], ['price target cut', 2], ['warning', 2], ['warns', 2],
  ['drops', 1], ['declines', 1], ['weak demand', 2], ['slowdown', 2], ['bankruptcy', 3],
  ['default', 2], ['fraud', 3], ['worse-than-expected', 3], ['profit falls', 2],
  ['revenue miss', 3], ['valuation worries', 2], ['sell-off', 2], ['selloff', 2],
];

function matches(haystack: string, needle: string): boolean {
  if (needle.includes(' ') || needle.includes('-')) return haystack.includes(needle);
  return new RegExp(`\\b${needle}\\b`).test(haystack);
}

/** Score one headline in roughly [-4, +4]. */
export function scoreHeadline(title: string): number {
  const t = title.toLowerCase();
  let score = 0;
  for (const [word, w] of POSITIVE) if (matches(t, word)) score += w;
  for (const [word, w] of NEGATIVE) if (matches(t, word)) score -= w;
  return Math.max(-4, Math.min(4, score));
}

export type SentimentLabel = 'bullish' | 'lean-bullish' | 'neutral' | 'lean-bearish' | 'bearish';

export interface NewsSentiment {
  symbol: string;
  itemCount: number;
  scoredCount: number;
  /** Aggregate tone in [-100, 100]. */
  score: number;
  label: SentimentLabel;
  topPositive: Array<{ title: string; score: number }>;
  topNegative: Array<{ title: string; score: number }>;
}

export function analyzeNewsSentiment(symbol: string, items: NewsItem[]): NewsSentiment {
  const scored = items.map((item) => ({ title: item.title, score: scoreHeadline(item.title) }));
  const nonZero = scored.filter((s) => s.score !== 0);
  // Average of scoring headlines, damped when few headlines carry signal.
  const avg = nonZero.length
    ? nonZero.reduce((sum, s) => sum + s.score, 0) / nonZero.length
    : 0;
  const coverage = Math.min(1, nonZero.length / 4);
  const score = Math.round((avg / 4) * 100 * coverage);
  const label: SentimentLabel =
    score >= 35 ? 'bullish'
    : score >= 12 ? 'lean-bullish'
    : score <= -35 ? 'bearish'
    : score <= -12 ? 'lean-bearish'
    : 'neutral';
  return {
    symbol,
    itemCount: items.length,
    scoredCount: nonZero.length,
    score,
    label,
    topPositive: nonZero.filter((s) => s.score > 0).sort((a, b) => b.score - a.score).slice(0, 3),
    topNegative: nonZero.filter((s) => s.score < 0).sort((a, b) => a.score - b.score).slice(0, 3),
  };
}

// ---------------------------------------------------------------------------
// Combined position verdict
// ---------------------------------------------------------------------------

export type VerdictAction = 'add' | 'add-small' | 'hold' | 'avoid';

export interface PositionVerdict {
  action: VerdictAction;
  /** Suggested position size in R multiples of the base risk unit (0, 0.5, 1). */
  sizeR: number;
  /** Combined conviction 0–100: signal confidence fused with news tone. */
  conviction: number;
  reasons: string[];
}

/**
 * Fuse the deterministic signal with news tone. News aligned with the trade
 * direction raises conviction; news against it caps the size or blocks it.
 */
export function positionVerdict(
  evaluation: SignalEvaluation,
  sentiment: NewsSentiment | null,
): PositionVerdict {
  const { decision, confidence } = evaluation;
  const reasons: string[] = [];
  const tone = sentiment?.score ?? 0;

  if (decision === 'no-trade' || decision === 'invalidated') {
    reasons.push(
      decision === 'invalidated'
        ? 'Setup invalidated by the signal engine.'
        : `Signal blockers: ${evaluation.noTradeReasons.slice(0, 2).join('; ') || 'none listed'}.`,
    );
    return { action: 'avoid', sizeR: 0, conviction: Math.min(confidence, 35), reasons };
  }

  const direction = evaluation.risk.direction;
  // Tone aligned with the direction is positive support; against it, negative.
  const alignedTone = direction === 'short' ? -tone : tone;

  // 70% signal, 30% news; news only helps when it actually scored headlines.
  const newsComponent = sentiment && sentiment.scoredCount > 0 ? alignedTone : 0;
  const conviction = Math.round(
    Math.max(0, Math.min(100, confidence * 0.7 + ((newsComponent + 100) / 2) * 0.3)),
  );

  if (decision === 'wait') {
    reasons.push('Signal engine says wait — setup not confirmed yet.');
    if (newsComponent >= 25)
      reasons.push(`News tone is supportive (${tone >= 0 ? '+' : ''}${tone}), watch for a trigger.`);
    return { action: 'hold', sizeR: 0, conviction: Math.min(conviction, 55), reasons };
  }

  // buy-candidate / short-candidate from here.
  reasons.push(
    `Signal: ${decision.replace('-', ' ')} (${evaluation.setupType.replaceAll('-', ' ')}, confidence ${confidence}/100).`,
  );

  if (!sentiment || sentiment.scoredCount === 0) {
    reasons.push('News tone unclear (no scoring headlines) — start with a half position.');
    return { action: 'add-small', sizeR: 0.5, conviction, reasons };
  }

  if (newsComponent >= 20) {
    reasons.push(
      `News supports the ${direction} side (tone ${tone >= 0 ? '+' : ''}${tone}, ${sentiment.scoredCount} scoring headlines).`,
    );
    return { action: 'add', sizeR: 1, conviction, reasons };
  }
  if (newsComponent <= -20) {
    reasons.push(
      `News conflicts with the ${direction} side (tone ${tone >= 0 ? '+' : ''}${tone}) — skip adding until headlines settle.`,
    );
    return { action: 'hold', sizeR: 0, conviction: Math.min(conviction, 50), reasons };
  }
  reasons.push(`News tone is mixed/neutral (${tone >= 0 ? '+' : ''}${tone}) — half position only.`);
  return { action: 'add-small', sizeR: 0.5, conviction, reasons };
}
