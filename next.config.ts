import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Datenbanktreiber nicht bündeln (PGlite nutzt WASM-Dateien aus node_modules)
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  poweredByHeader: false,
  outputFileTracingIncludes: {
    "/**": ["./drizzle/**/*"],
  },
};

export default nextConfig;
