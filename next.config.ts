import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // exceljs uses dynamic requires; keep it external instead of bundling it.
  serverExternalPackages: ["exceljs"],
};

export default nextConfig;
