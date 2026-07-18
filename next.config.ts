import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // unpdf (PDF) and mammoth (Word) use dynamic requires + worker/asset files
  // that Next's server bundler mangles — load them from node_modules at runtime.
  serverExternalPackages: ["unpdf", "mammoth"],
};

export default nextConfig;
