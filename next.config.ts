import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native / heavy Node-only modules must not be bundled by webpack.
  serverExternalPackages: ["sharp", "@hyzyla/pdfium", "tesseract.js"],
  experimental: {
    serverActions: {
      // Question paper + answer sheet in one multipart request.
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
