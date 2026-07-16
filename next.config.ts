import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // unpdf (PDF) and mammoth (Word) use dynamic requires + worker/asset files
  // that Next's server bundler mangles — load them from node_modules at runtime.
  serverExternalPackages: ["unpdf", "mammoth"],
  // Ship the vendored Geist TTFs with the OG-image routes so ImageResponse can
  // read them at render time (Satori can't use woff2 / next/font handles).
  outputFileTracingIncludes: {
    "/opengraph-image": ["./assets/fonts/**"],
    "/twitter-image": ["./assets/fonts/**"],
  },
};

export default nextConfig;
