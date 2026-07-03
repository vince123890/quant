import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '@/src/renderer/styles/tokens.css';
import '@/src/renderer/styles/app.css';
import '@/src/renderer/styles/topbar.css';
import '@/src/renderer/styles/watchlist.css';
import '@/src/renderer/styles/news.css';
import '@/src/renderer/styles/earnings.css';
import '@/src/renderer/styles/chart-modal.css';

export const metadata: Metadata = {
  title: 'Quant',
  description:
    'ETF & equity terminal — watchlist, holdings-driven news, earnings, annotated charts, macro overlays, and deterministic signals. API docs at /docs.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
