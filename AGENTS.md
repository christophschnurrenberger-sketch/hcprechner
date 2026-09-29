<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Projekt: Golf HCP Rechner – WHS 2026

- Berechnungslogik: `src/rules/whs/de/2026/` (Regeln, Konfiguration) und `src/lib/whs/` (Engine). Keine WHS-Logik in React-Komponenten.
- Jede Rundung über `src/rules/whs/de/2026/rounding.ts`; jede Regelzahl nur in `config.ts`.
- Harte Regel: keine erfundenen oder abgeleiteten CR-/Slope-Werte (kein CR₉ = CR₁₈/2). Fehlende Werte bleiben `NULL`.
- Vor dem Commit: `npm test`, `npm run lint`, `npm run typecheck`.
- Doku: `README.md`, `docs/ARCHITEKTUR.md`, `docs/ABSCHLUSS-CHECK.md`, `docs/DATENSTATUS-BAYERN.md`.
