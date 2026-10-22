import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      // Python Sinhala/FM service. Must come before the generic /api rule.
      { source: '/api/sinhala/:path*', destination: 'http://localhost:8788/api/sinhala/:path*' },
      { source: '/api/:path*', destination: 'http://localhost:8787/api/:path*' },
    ];
  },
};

export default nextConfig;
