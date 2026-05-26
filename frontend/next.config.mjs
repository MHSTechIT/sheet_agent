/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@sheet-agent/types'],
  experimental: { typedRoutes: false },
};

export default nextConfig;
