import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Import sends PDFs to a server action as base64 (Gemini reads them
    // directly). The default cap is 1MB; base64 inflates ~33%, so allow room
    // for the client-side ~3MB PDF limit. (Vercel Hobby still caps ~4.5MB.)
    serverActions: { bodySizeLimit: "6mb" },
  },
};

export default nextConfig;
