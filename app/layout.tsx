import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Quant API',
  description:
    'Market data API — quotes, charts, deterministic signals, macro series, and news from public sources.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#0b1017', color: '#dbe4f0' }}>{children}</body>
    </html>
  );
}
