'use client';

// The Quant terminal is a fully client-side app (lightweight-charts touches
// the DOM), so it is loaded with SSR disabled.

import dynamic from 'next/dynamic';

const App = dynamic(() => import('@/src/renderer/App').then((m) => m.App), {
  ssr: false,
  loading: () => (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#8ba0bd',
        fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
      }}
    >
      Loading Quant…
    </div>
  ),
});

export default function Page() {
  return <App />;
}
