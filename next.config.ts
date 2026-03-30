import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@opentelemetry/winston-transport",
    "@opentelemetry/instrumentation-winston",
    "inngest",
  ],
};

export default nextConfig;
