import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Open the dev server from another device on the LAN (e.g. http://192.168.1.4:5180); Next blocks non-localhost origins otherwise.
  allowedDevOrigins: ['192.168.1.4'],
  // Desktop (Electron) build: self-contained server in .next/standalone.
  // Images are not optimized in the desktop app, so the platform-specific sharp binary is never needed.
  ...(process.env.KEYFRAME_DESKTOP ? { output: 'standalone' as const, images: { unoptimized: true } } : {}),
  // Uploads through the /api rewrite (ProRes caption frames, soundtracks) are far larger than the 10 MB default, and a render can run for minutes.
  experimental: { proxyClientMaxBodySize: '1gb', proxyTimeout: 30 * 60_000 },
  async rewrites() {
    return [
      // Python Sinhala/FM service. Must come before the generic /api rule.
      { source: '/api/sinhala/:path*', destination: 'http://localhost:8788/api/sinhala/:path*' },
      { source: '/api/:path*', destination: 'http://localhost:8787/api/:path*' },
    ];
  },
};

export default nextConfig;
