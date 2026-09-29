import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Datenbanktreiber nicht bündeln (PGlite nutzt WASM-Dateien aus node_modules)
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  poweredByHeader: false,
  experimental: {
    // CSV-Import im Admin-Bereich (Datei + Vorschau) kann größer als 1 MB sein
    serverActions: { bodySizeLimit: "12mb" },
  },
  outputFileTracingIncludes: {
    "/**": ["./drizzle/**/*"],
  },
};

export default nextConfig;
