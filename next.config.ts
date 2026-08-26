import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native / heavy Node-only modules must not be bundled by webpack.
  serverExternalPackages: ["sharp", "@hyzyla/pdfium", "tesseract.js"],
};

export default nextConfig;
