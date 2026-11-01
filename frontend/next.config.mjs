/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  distDir: process.env.NEXT_DIST_DIR || ".next",
  webpack(config) {
    config.resolve.alias.canvas = false; // pdfjs-dist optionally requires node-canvas
    return config;
  },
};

export default nextConfig;
