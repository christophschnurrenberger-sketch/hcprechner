/**
 * Datenbankzugriff.
 *
 * - DATABASE_URL gesetzt  → PostgreSQL (z. B. Supabase) über node-postgres
 * - sonst                 → eingebettetes PostgreSQL (PGlite) in `.data/pglite`
 *
 * Beide Varianten verwenden dasselbe Schema und dieselben SQL-Migrationen.
 */
import path from "node:path";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

interface DbHandle {
  db: Db;
  kind: "postgres" | "pglite";
  close: () => Promise<void>;
}

const globalForDb = globalThis as unknown as { __hcpDb?: Promise<DbHandle> };

export function migrationsFolder(): string {
  return process.env.MIGRATIONS_DIR ?? path.join(process.cwd(), "drizzle");
}

async function connect(): Promise<DbHandle> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const [{ Pool }, { drizzle }, { migrate }] = await Promise.all([
      import("pg"),
      import("drizzle-orm/node-postgres"),
      import("drizzle-orm/node-postgres/migrator"),
    ]);
    const pool = new Pool({
      connectionString: url,
      max: Number(process.env.DATABASE_POOL_MAX ?? 5),
      ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
    });
    const db = drizzle({ client: pool, schema });
    if (process.env.SKIP_MIGRATIONS !== "true") {
      await migrate(db, { migrationsFolder: migrationsFolder() });
    }
    return { db: db as unknown as Db, kind: "postgres", close: () => pool.end() };
  }

  const [{ PGlite }, { drizzle }, { migrate }] = await Promise.all([
    import("@electric-sql/pglite"),
    import("drizzle-orm/pglite"),
    import("drizzle-orm/pglite/migrator"),
  ]);
  const dataDir = process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite");
  if (dataDir !== "memory://") {
    const { mkdirSync } = await import("node:fs");
    mkdirSync(dataDir, { recursive: true });
  }
  const client = dataDir === "memory://" ? new PGlite() : new PGlite(dataDir);
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder: migrationsFolder() });
  return { db: db as unknown as Db, kind: "pglite", close: () => client.close() };
}

export async function getDbHandle(): Promise<DbHandle> {
  if (!globalForDb.__hcpDb) {
    globalForDb.__hcpDb = connect().catch((error) => {
      globalForDb.__hcpDb = undefined;
      throw error;
    });
  }
  return globalForDb.__hcpDb;
}

export async function getDb(): Promise<Db> {
  return (await getDbHandle()).db;
}

export async function closeDb(): Promise<void> {
  const handle = globalForDb.__hcpDb;
  globalForDb.__hcpDb = undefined;
  if (handle) await (await handle).close();
}

export { schema };
