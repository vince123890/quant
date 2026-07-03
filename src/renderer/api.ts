// Web implementation of the QuantApi bridge. The desktop app exposes this
// interface from the Electron main process via preload IPC; here the same
// surface is backed by the Next.js API routes, localStorage (watchlist,
// LLM settings, insight history), and direct browser calls for the optional
// local LLM. Renderer components are unchanged — they only import `api`.

import type {
  AddWatchlistResult,
  ChartData,
  ChartRange,
  EarningsEvent,
  HoldingsResult,
  InstrumentType,
  LlmSettings,
  MacroOverlayKey,
  MacroOverlaySeries,
  NewsItem,
  PivotNewsResult,
  PivotPoint,
  QuantApi,
  QuantInsightRecord,
  QuantInsightRequest,
  QuantInsightResponse,
  Quote,
  SymbolSuggestion,
  ValuationSnapshot,
  WatchlistItem,
} from '../shared/types';

const SYMBOL_RE = /^[A-Z0-9.^-]{1,12}$/i;

function normalizeSymbol(raw: string): string | null {
  const sym = raw.trim().toUpperCase();
  return sym.length > 0 && SYMBOL_RE.test(sym) ? sym : null;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Watchlist (localStorage)
// ---------------------------------------------------------------------------

const WATCHLIST_KEY = 'quant.watchlist.v1';

const SEED: Array<{ symbol: string; name: string; type: InstrumentType }> = [
  { symbol: 'SPY', name: 'SPDR S&P 500 ETF Trust', type: 'etf' },
  { symbol: 'QQQ', name: 'Invesco QQQ Trust', type: 'etf' },
  { symbol: 'SMH', name: 'VanEck Semiconductor ETF', type: 'etf' },
  { symbol: 'AAPL', name: 'Apple Inc.', type: 'stock' },
  { symbol: 'NVDA', name: 'NVIDIA Corporation', type: 'stock' },
  { symbol: 'TSLA', name: 'Tesla, Inc.', type: 'stock' },
];

function isValidItem(value: unknown): value is WatchlistItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<WatchlistItem>;
  return (
    typeof item.symbol === 'string' &&
    normalizeSymbol(item.symbol) !== null &&
    typeof item.name === 'string' &&
    item.name.length > 0 &&
    (item.type === 'etf' || item.type === 'stock') &&
    typeof item.addedAt === 'string'
  );
}

function saveWatchlist(list: WatchlistItem[]): void {
  try {
    window.localStorage.setItem(WATCHLIST_KEY, JSON.stringify(list));
  } catch {
    /* storage full/blocked — keep in-memory state */
  }
}

function loadWatchlist(): WatchlistItem[] {
  try {
    const raw = window.localStorage.getItem(WATCHLIST_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        const valid = parsed
          .filter(isValidItem)
          .map((item) => ({ ...item, symbol: item.symbol.toUpperCase() }));
        if (valid.length > 0 || parsed.length === 0) return valid;
      }
    }
  } catch {
    /* reseed below */
  }
  const addedAt = new Date().toISOString();
  const seeded = SEED.map((s) => ({ ...s, addedAt }));
  saveWatchlist(seeded);
  return seeded;
}

// ---------------------------------------------------------------------------
// LLM settings + insight history (localStorage)
// ---------------------------------------------------------------------------

const LLM_KEY = 'quant.llm-settings.v1';
const INSIGHTS_KEY = 'quant.insights.v1';
const MAX_RECORDS = 200;

function normalizeLlmSettings(raw: Partial<LlmSettings> | null): LlmSettings {
  return {
    enabled: raw?.enabled === true,
    baseUrl:
      typeof raw?.baseUrl === 'string' && raw.baseUrl.trim()
        ? raw.baseUrl.trim().replace(/\/+$/, '')
        : 'http://127.0.0.1:8080',
    model:
      typeof raw?.model === 'string' && raw.model.trim() ? raw.model.trim() : 'gemma-4-e4b',
  };
}

function loadLlmSettings(): LlmSettings {
  try {
    const raw = window.localStorage.getItem(LLM_KEY);
    return normalizeLlmSettings(raw ? (JSON.parse(raw) as Partial<LlmSettings>) : null);
  } catch {
    return normalizeLlmSettings(null);
  }
}

function loadInsights(): QuantInsightRecord[] {
  try {
    const raw = window.localStorage.getItem(INSIGHTS_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? (parsed as QuantInsightRecord[]) : [];
  } catch {
    return [];
  }
}

function saveInsight(request: QuantInsightRequest, response: QuantInsightResponse): void {
  const record: QuantInsightRecord = {
    ...response,
    id: `${request.symbol}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    symbol: request.symbol,
    range: request.range,
    question: request.question,
    decision: request.evaluation.decision,
    setupType: request.evaluation.setupType,
    confidence: request.evaluation.confidence,
  };
  try {
    window.localStorage.setItem(
      INSIGHTS_KEY,
      JSON.stringify([record, ...loadInsights()].slice(0, MAX_RECORDS)),
    );
  } catch {
    /* best effort */
  }
}

// ---------------------------------------------------------------------------
// Quant AI (browser → user's local OpenAI-compatible server, with the same
// deterministic fallback the desktop app uses)
// ---------------------------------------------------------------------------

function deterministicFallback(req: QuantInsightRequest, error?: string): QuantInsightResponse {
  const e = req.evaluation;
  const lines = [
    `### Quant memo: ${e.decision.replaceAll('-', ' ')}`,
    ``,
    `- **Setup:** ${e.setupType.replaceAll('-', ' ')}`,
    `- **Regime:** ${e.regime.replaceAll('-', ' ')}`,
    `- **Confidence:** ${e.confidence}/100`,
    `- **Risk plan:** entry \`${e.risk.entry}\`, stop \`${e.risk.stop}\`, target 1 \`${e.risk.target1}\`, target 2 \`${e.risk.target2}\``,
    `- **Position:** ${e.risk.positionSize} units, max loss \`${e.risk.maxDollarLoss}\`, target 1 reward \`${e.risk.rewardRisk1}R\``,
  ];
  if (e.noTradeReasons.length) {
    lines.push(`- **Primary blocker:** ${e.noTradeReasons[0]}`);
  } else {
    lines.push(`- **Action:** ${e.reason}`);
  }
  const strongest = [...e.components].sort((a, b) => b.score - a.score)[0];
  const weakest = [...e.components].sort((a, b) => a.score - b.score)[0];
  if (strongest) lines.push(`- **Best evidence:** ${strongest.name} - ${strongest.explanation}`);
  if (weakest && weakest.score < 0)
    lines.push(`- **Risk evidence:** ${weakest.name} - ${weakest.explanation}`);
  if (error) lines.push(`\n_Local LLM note: ${error}_`);
  return {
    ok: false,
    source: 'deterministic-fallback',
    answer: lines.join('\n'),
    generatedAt: new Date().toISOString(),
    error,
  };
}

function compactRequest(req: QuantInsightRequest): string {
  const e = req.evaluation;
  const news = req.news
    .slice(0, 8)
    .map(
      (item) => `- [${item.relatedSymbol}] ${item.title} (${item.sourceName}, ${item.publishedAt})`,
    )
    .join('\n');
  const components = e.components
    .map((c) => `- ${c.name}: ${c.status}, ${c.score >= 0 ? '+' : ''}${c.score}. ${c.explanation}`)
    .join('\n');
  return `
Symbol: ${req.symbol}
Range: ${req.range}
Question: ${req.question ?? 'Analyze the current setup and explain the best decision.'}

Signal:
- Decision: ${e.decision}
- Setup: ${e.setupType}
- Regime: ${e.regime}
- Confidence: ${e.confidence}/100
- Reason: ${e.reason}
- No-trade reasons: ${e.noTradeReasons.join('; ') || 'none'}

Risk plan:
- Direction: ${e.risk.direction}
- Entry: ${e.risk.entry}
- Stop: ${e.risk.stop}
- Target 1: ${e.risk.target1}
- Target 2: ${e.risk.target2}
- R/R target 1: ${e.risk.rewardRisk1}
- Position size: ${e.risk.positionSize}
- Max loss: ${e.risk.maxDollarLoss}

Components:
${components}

Recent scraped news:
${news || '- none'}
`.trim();
}

async function analyzeQuantWeb(req: QuantInsightRequest): Promise<QuantInsightResponse> {
  const settings = loadLlmSettings();
  if (!settings.enabled) {
    return deterministicFallback(
      req,
      'Local LLM is disabled. Enable it in onboarding to use an OpenAI-compatible local server (must allow CORS).',
    );
  }
  try {
    const res = await fetch(`${settings.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(28_000),
      body: JSON.stringify({
        model: settings.model,
        temperature: 0.2,
        max_tokens: 700,
        messages: [
          {
            role: 'system',
            content:
              'You are QuantDesk, a strict personal quant trading assistant for the Quant app. Think like a senior quant trader and risk manager. Explain signals in disciplined trading language. Separate setup, evidence, invalidation, risk, and action. Do not give certainty, do not hype, do not recommend oversized trades, and do not ignore no-trade blockers. Return concise GitHub-flavored Markdown with headings, bullets, bold labels, and inline code for exact prices.',
          },
          {
            role: 'user',
            content: req.thinkingMode
              ? `Use thinking mode internally, then provide only the concise final decision memo.\n\n${compactRequest(req)}`
              : compactRequest(req),
          },
        ],
      }),
    });
    if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const answer = json.choices?.[0]?.message?.content?.trim();
    if (!answer) throw new Error('LLM returned an empty answer');
    return {
      ok: true,
      source: 'local-llm',
      model: settings.model,
      answer,
      generatedAt: new Date().toISOString(),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Local LLM request failed.';
    return deterministicFallback(req, message);
  }
}

// ---------------------------------------------------------------------------
// The bridge
// ---------------------------------------------------------------------------

export const api: QuantApi = {
  async getWatchlist(): Promise<WatchlistItem[]> {
    return loadWatchlist();
  },

  async addToWatchlist(rawSymbol: string): Promise<AddWatchlistResult> {
    const symbol = normalizeSymbol(rawSymbol);
    if (!symbol) return { ok: false, error: 'Invalid symbol' };
    const list = loadWatchlist();
    if (list.some((item) => item.symbol === symbol)) {
      return { ok: false, error: 'Already in watchlist' };
    }
    let resolved: { name: string; type: InstrumentType } | null = null;
    try {
      const { suggestions } = await getJson<{ suggestions: SymbolSuggestion[] }>(
        `/api/search?q=${encodeURIComponent(symbol)}`,
      );
      const exact = suggestions.find((s) => s.symbol.toUpperCase() === symbol);
      if (exact) resolved = { name: exact.name, type: exact.type };
    } catch {
      /* fall through */
    }
    if (!resolved) return { ok: false, error: 'Symbol not found' };
    const item: WatchlistItem = {
      symbol,
      name: resolved.name,
      type: resolved.type,
      addedAt: new Date().toISOString(),
    };
    const next = [...list, item];
    saveWatchlist(next);
    return { ok: true, item, watchlist: next };
  },

  async removeFromWatchlist(symbol: string): Promise<WatchlistItem[]> {
    const sym = symbol.toUpperCase();
    const next = loadWatchlist().filter((item) => item.symbol !== sym);
    saveWatchlist(next);
    return next;
  },

  async searchSymbols(query: string): Promise<SymbolSuggestion[]> {
    const { suggestions } = await getJson<{ suggestions: SymbolSuggestion[] }>(
      `/api/search?q=${encodeURIComponent(query)}`,
    );
    return suggestions;
  },

  async getQuotes(symbols: string[]): Promise<Quote[]> {
    if (symbols.length === 0) return [];
    const { quotes } = await getJson<{ quotes: Quote[] }>(
      `/api/quotes?symbols=${encodeURIComponent(symbols.join(','))}`,
    );
    return quotes;
  },

  async getHoldings(etfSymbol: string): Promise<HoldingsResult> {
    return getJson<HoldingsResult>(`/api/holdings/${encodeURIComponent(etfSymbol)}`);
  },

  async getNews(symbols: string[], limitPerSymbol = 6): Promise<NewsItem[]> {
    if (symbols.length === 0) return [];
    const { items } = await getJson<{ items: NewsItem[] }>(
      `/api/news?symbols=${encodeURIComponent(symbols.join(','))}&limit=${limitPerSymbol}`,
    );
    return items;
  },

  async getEarnings(symbols: string[]): Promise<EarningsEvent[]> {
    if (symbols.length === 0) return [];
    const { events } = await getJson<{ events: EarningsEvent[] }>(
      `/api/earnings?symbols=${encodeURIComponent(symbols.join(','))}`,
    );
    return events;
  },

  async getChart(symbol: string, range: ChartRange): Promise<ChartData> {
    return getJson<ChartData>(
      `/api/chart/${encodeURIComponent(symbol)}?range=${encodeURIComponent(range)}`,
    );
  },

  async getPivotNews(symbol: string, pivots: PivotPoint[]): Promise<PivotNewsResult[]> {
    const res = await fetch('/api/pivot-news', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol, pivots }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} from /api/pivot-news`);
    const json = (await res.json()) as { results: PivotNewsResult[] };
    return json.results;
  },

  async getMacroOverlay(key: MacroOverlayKey, range: ChartRange): Promise<MacroOverlaySeries> {
    return getJson<MacroOverlaySeries>(
      `/api/macro/${encodeURIComponent(key)}?range=${encodeURIComponent(range)}`,
    );
  },

  async captureChartSnapshot(): Promise<{ dataUrl: string; capturedAt: string } | null> {
    // Desktop-only (Electron webContents capture); the web build skips it.
    return null;
  },

  async analyzeQuant(request: QuantInsightRequest): Promise<QuantInsightResponse> {
    const response = await analyzeQuantWeb(request);
    saveInsight(request, response);
    return response;
  },

  async getQuantInsights(symbol: string, range?: ChartRange): Promise<QuantInsightRecord[]> {
    return loadInsights().filter(
      (r) => r.symbol === symbol.toUpperCase() && (range === undefined || r.range === range),
    );
  },

  async getLlmSettings(): Promise<LlmSettings> {
    return loadLlmSettings();
  },

  async saveLlmSettings(settings: LlmSettings): Promise<LlmSettings> {
    const normalized = normalizeLlmSettings(settings);
    try {
      window.localStorage.setItem(LLM_KEY, JSON.stringify(normalized));
    } catch {
      /* best effort */
    }
    return normalized;
  },

  async getValuation(symbol: string): Promise<ValuationSnapshot> {
    return getJson<ValuationSnapshot>(`/api/valuation/${encodeURIComponent(symbol)}`);
  },

  async openExternal(url: string): Promise<void> {
    window.open(url, '_blank', 'noopener,noreferrer');
  },
};
