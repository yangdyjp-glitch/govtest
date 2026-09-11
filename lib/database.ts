import type { Database } from "./database-types";
import { PostgresDatabase } from "./postgres";
import { sqliteDatabase } from "./sqlite";
const state = globalThis as typeof globalThis & {
  govtestPostgres?: PostgresDatabase;
};
export function database(): Database {
  if (!process.env.DATABASE_URL) return sqliteDatabase();
  return (state.govtestPostgres ??= new PostgresDatabase());
}
