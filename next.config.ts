import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // `jsdom` and `@mozilla/readability` are Node-only and must not be bundled
  // into the server chunk; Next loads them at runtime instead.
  serverExternalPackages: ['jsdom', '@mozilla/readability'],
};

export default nextConfig;
