/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {},
  // Isolated build output for the resident tester (scripts/resident-tester): when
  // WO_DIST_DIR is set, the production build + start use that dir instead of .next,
  // so the tester never collides with a running `next dev` (they otherwise fight
  // over .next and corrupt each other's chunks). No effect on normal dev/build.
  ...(process.env.WO_DIST_DIR ? { distDir: process.env.WO_DIST_DIR } : {}),
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'twwjklctbyjadqypqzyo.supabase.co' },
    ],
  },
};

export default nextConfig;
