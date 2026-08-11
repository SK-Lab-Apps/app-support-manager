import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import '@appsupportkit/design-tokens/tokens.css';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Support',
  description: 'Customer support for mobile apps',
};

/**
 * `viewportFit: 'cover'` is what makes env(safe-area-inset-*) resolve to real
 * values on notched iPhones — the drawer, header, and composer all pad from it.
 * Zoom is deliberately left unrestricted.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0A0A0B' },
    { media: '(prefers-color-scheme: light)', color: '#FAFAFA' },
  ],
};

// Runs before paint: persisted choice wins; prefers-color-scheme only on
// first visit. Dark is the product default.
const themeScript = `
(function () {
  try {
    var stored = localStorage.getItem('theme');
    var theme = stored === 'light' || stored === 'dark'
      ? stored
      : (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={`${inter.variable} font-sans`}>{children}</body>
    </html>
  );
}
