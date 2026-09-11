import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["word-extractor", "mammoth", "xlsx"],
};

export default nextConfig;
