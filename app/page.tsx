const ENDPOINTS: Array<{ method: string; path: string; example: string; desc: string }> = [
  {
    method: 'GET',
    path: '/api/quotes?symbols=SPY,QQQ,AAPL',
    example: '/api/quotes?symbols=SPY,QQQ',
    desc: 'Live quotes: price, change, previous close (max 30 symbols).',
  },
  {
    method: 'GET',
    path: '/api/chart/{symbol}?range=6m',
    example: '/api/chart/SPY?range=6m',
    desc: 'OHLCV candles. Ranges: 1d, 1w, 1m, 6m, 1y, 5y, max.',
  },
  {
    method: 'GET',
    path: '/api/signals/{symbol}?range=6m',
    example: '/api/signals/SPY?range=6m',
    desc: 'Deterministic Signal Desk: regime, setup, decision, component scores, risk/reward plan, pivots.',
  },
  {
    method: 'GET',
    path: '/api/macro/{key}?range=1y',
    example: '/api/macro/vix?range=1y',
    desc: 'Macro series. Keys: jobs, unemployment, inflation, treasury10y, oil, vix.',
  },
  {
    method: 'GET',
    path: '/api/news?symbols=SPY,AAPL&limit=6',
    example: '/api/news?symbols=AAPL',
    desc: 'Headlines per symbol from Yahoo Finance RSS + Google News, deduped.',
  },
  {
    method: 'GET',
    path: '/api/search?q=apple',
    example: '/api/search?q=apple',
    desc: 'Symbol search (offline directory + Yahoo search).',
  },
  {
    method: 'GET',
    path: '/api/valuation/{symbol}',
    example: '/api/valuation/AAPL',
    desc: 'Valuation snapshot: P/E, EV, margins, growth. May be partial when Yahoo auth fails.',
  },
  {
    method: 'GET',
    path: '/api/earnings?symbols=AAPL,MSFT',
    example: '/api/earnings?symbols=AAPL,MSFT',
    desc: 'Upcoming earnings events.',
  },
  {
    method: 'GET',
    path: '/api/holdings/{symbol}',
    example: '/api/holdings/SPY',
    desc: 'Top ETF holdings (live, with bundled fallback snapshot).',
  },
];

export default function Home() {
  return (
    <main
      style={{
        maxWidth: 860,
        margin: '0 auto',
        padding: '48px 24px',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        lineHeight: 1.6,
      }}
    >
      <h1 style={{ fontSize: 28, marginBottom: 4 }}>Quant API</h1>
      <p style={{ color: '#8ba0bd', marginTop: 0 }}>
        Market data from public sources — no API key required. Ported from the{' '}
        <a href="https://github.com/eisenjimmy/Quant" style={{ color: '#6d95ff' }}>
          Quant desktop terminal
        </a>
        . Quotes fall back to deterministic sample data when a source is unavailable (check the{' '}
        <code>source</code> field: <code>live</code> vs <code>sample</code>).
      </p>
      <div style={{ marginTop: 32 }}>
        {ENDPOINTS.map((e) => (
          <div
            key={e.path}
            style={{
              border: '1px solid #1e2a3c',
              borderRadius: 8,
              padding: '14px 18px',
              marginBottom: 12,
              background: '#0f1622',
            }}
          >
            <div>
              <span style={{ color: '#1fbf75', fontWeight: 700 }}>{e.method}</span>{' '}
              <a href={e.example} style={{ color: '#dbe4f0', textDecoration: 'none' }}>
                <code>{e.path}</code>
              </a>
            </div>
            <div style={{ color: '#8ba0bd', fontSize: 13, marginTop: 4 }}>{e.desc}</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>
              <a href={e.example} style={{ color: '#6d95ff' }}>
                try: {e.example}
              </a>
            </div>
          </div>
        ))}
      </div>
      <p style={{ color: '#5c6f8a', fontSize: 12, marginTop: 32 }}>
        Data is sourced from unofficial public endpoints (Yahoo Finance, FRED CSV, Google News
        RSS) and is for research/educational use only. Not investment advice.
      </p>
    </main>
  );
}
