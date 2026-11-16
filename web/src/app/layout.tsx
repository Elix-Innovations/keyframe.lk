import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:5180'),
  title: 'Keyframe.lk — Sinhala Captions',
  description: 'Keyframe.lk: Sinhala caption video editor with auto captions, live FM fonts, background music and on-device export.',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '48x48' },
      { url: '/icons/favicon-32x32.png', type: 'image/png', sizes: '32x32' },
      { url: '/icons/favicon-16x16.png', type: 'image/png', sizes: '16x16' },
      { url: '/icons/icon-192.png', type: 'image/png', sizes: '192x192' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
  openGraph: {
    type: 'website',
    title: 'Keyframe.lk — Sinhala Captions',
    description: 'Sinhala auto captions, live FM fonts, background music and on-device 4K export, right in your browser.',
    images: ['/icons/icon-512.png'],
  },
  twitter: { card: 'summary' },
};

export const viewport: Viewport = { themeColor: '#0b0b0f' };

// Apply the saved (or system) theme before first paint to avoid a flash. Mirrors src/lib/theme.ts.
const themeScript = `(function () {
  var t = null;
  try { t = localStorage.getItem("keyframe-theme"); } catch (e) {}
  if (t !== "light") t = "dark";
  if (t === "dark") document.documentElement.classList.add("dark");
})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Sinhala:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
