import type { PoolConfig } from "pg";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
export function postgresConfig(url = process.env.DATABASE_URL): PoolConfig {
  if (!url) throw new Error("DATABASE_URL is required");
  const parsed = new URL(url);
  if (!["postgres:", "postgresql:"].includes(parsed.protocol))
    throw new Error("Expected a PostgreSQL URL");
  // SSL settings in a URL can override pg's certificate checks; configure TLS explicitly.
  for (const key of ["sslmode", "sslrootcert", "sslcert", "sslkey", "ssl"])
    parsed.searchParams.delete(key);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
  const ca =
    process.env.DATABASE_CA_CERT ||
    (parsed.hostname.endsWith(".supabase.co") ||
    parsed.hostname.endsWith(".supabase.com")
      ? readFileSync(resolve("db/certs/supabase-prod-ca-2021.crt"), "utf8")
      : undefined);
  return {
    connectionString: parsed.toString(),
    ssl: local ? false : { rejectUnauthorized: true, ...(ca ? { ca } : {}) },
    max: 5,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    statement_timeout: 30000,
    application_name: "govtest",
  };
}
