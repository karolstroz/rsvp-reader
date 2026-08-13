import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Blitzbee — speed reading with ORP',
  description:
    'Read pasted text, articles, EPUB and PDF at 100–1000 WPM using Rapid Serial Visual Presentation with Optimal Recognition Point highlighting.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Blitzbee', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = {
  themeColor: '#0b0d10',
  width: 'device-width',
  initialScale: 1,
  // The reader is a fixed app surface: double-tap zoom would fight the gestures.
  maximumScale: 1,
  viewportFit: 'cover',
};

/**
 * Applies the saved theme before first paint.
 *
 * Themes live in the persisted store, which only rehydrates after React mounts.
 * Without this the app would paint the default dark palette and then flash to
 * the reader's chosen theme.
 */
const themeBootstrap = `
(function () {
  try {
    var raw = localStorage.getItem('blitzbee-settings');
    var theme = raw ? (JSON.parse(raw).state || {}).settings?.theme : null;
    document.documentElement.dataset.theme = theme || 'dark';
  } catch (e) {
    document.documentElement.dataset.theme = 'dark';
  }
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body className="font-reader-sans antialiased">{children}</body>
    </html>
  );
}
