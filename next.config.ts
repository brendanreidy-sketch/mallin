import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // unpdf (PDF) and mammoth (Word) use dynamic requires + worker/asset files
  // that Next's server bundler mangles — load them from node_modules at runtime.
  serverExternalPackages: ["unpdf", "mammoth"],
  // DIAGNOSTIC (Sub-step C, diagnostic/staging-root-cause only): emit browser
  // source maps so the captured client stack maps to real files/lines. Remove
  // after the / and /sign-in root cause is identified.
  productionBrowserSourceMaps: true,
};

export default nextConfig;
