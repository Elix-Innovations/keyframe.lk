import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Open the dev server from another device on the LAN (set KEYFRAME_DEV_ORIGINS=192.168.x.x and run `npm run dev:lan`); Next blocks non-localhost origins otherwise.
  allowedDevOrigins: (process.env.KEYFRAME_DEV_ORIGINS ?? '').split(',').map((h) => h.trim()).filter(Boolean),
  // Desktop (Electron) build: self-contained server in .next/standalone.
  // Images are not optimized in the desktop app, so the platform-specific sharp binary is never needed.
  ...(process.env.KEYFRAME_DESKTOP ? { output: 'standalone' as const, images: { unoptimized: true } } : {}),
  // Uploads through the /api rewrite (ProRes caption frames, soundtracks) are far larger than the 10 MB default, and a render can run for minutes.
  experimental: { proxyClientMaxBodySize: '1gb', proxyTimeout: 30 * 60_000 },
  async rewrites() {
    // The desktop servers listen on 127.0.0.1 only; "localhost" can resolve to ::1 first on Windows, which costs a failed
    // connect (or a dropped request) on every proxied call.
    const host = process.env.KEYFRAME_DESKTOP ? '127.0.0.1' : 'localhost';
    return [
      // Python Sinhala/FM service. Must come before the generic /api rule.
      { source: '/api/sinhala/:path*', destination: `http://${host}:8788/api/sinhala/:path*` },
      { source: '/api/:path*', destination: `http://${host}:8787/api/:path*` },
    ];
  },
};

export default nextConfig;
