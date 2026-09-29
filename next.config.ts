import type { NextConfig } from "next";

/**
 * Zwei Build-Varianten:
 *
 * - Node (Standard, `npm run build`): Next.js-Server mit PostgreSQL/PGlite, Server Actions und
 *   serverseitig gerenderten SEO-Seiten. Nur-Server-Dateien heißen *.server.tsx / *.server.ts.
 * - Webspace (`npm run build:webspace`): statischer Export für klassischen PHP-Webspace.
 *   Seiten mit *.static.tsx ersetzen dort die Server-Varianten; Golfplatzdaten, Admin und
 *   Synchronisation laufen über kleine PHP-Skripte (webspace/php). Der Basispfad ist ein
 *   Platzhalter, den install.php durch den tatsächlichen Installationsordner ersetzt.
 */
const WEBSPACE = process.env.BUILD_TARGET === "webspace";

/** Muss mit PLACEHOLDER in webspace/php/install.php übereinstimmen. */
const WEBSPACE_BASE_PLACEHOLDER = "/__HCP_BASE__";

const nodeConfig: NextConfig = {
  output: "standalone",
  pageExtensions: ["tsx", "ts", "server.tsx", "server.ts"],
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

const webspaceConfig: NextConfig = {
  output: "export",
  pageExtensions: ["tsx", "ts", "static.tsx", "static.ts"],
  basePath: WEBSPACE_BASE_PLACEHOLDER,
  // /runden/ → runden/index.html: funktioniert auf jedem Apache ohne Rewrite-Regeln
  trailingSlash: true,
  images: { unoptimized: true },
  env: {
    NEXT_PUBLIC_BUILD_TARGET: "webspace",
    NEXT_PUBLIC_BASE_PATH: WEBSPACE_BASE_PLACEHOLDER,
  },
};

export default WEBSPACE ? webspaceConfig : nodeConfig;
