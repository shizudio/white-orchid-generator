/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {},
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'twwjklctbyjadqypqzyo.supabase.co' },
    ],
  },
};

export default nextConfig;
