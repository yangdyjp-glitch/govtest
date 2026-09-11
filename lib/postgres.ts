import { Pool, type PoolClient, type PoolConfig, type QueryResult } from "pg";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import type { Database, Statement } from "./database-types";
import { importSqlite } from "./sqlite-import";

import { postgresConfig } from "./postgres-config";
export function postgresSql(sql: string) {
  let index = 0;
  // Preserve quoted SQL literals/identifiers while translating bound placeholders.
  return sql.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"|\?/g, (token) =>
    token === "?" ? "$" + ++index : token,
  );
}
function runResult(result: QueryResult) {
  return {
    success: true,
    meta: { changes: result.rowCount ?? 0, last_row_id: 0 },
  };
}
class PostgresStatement implements Statement {
  constructor(
    readonly database: PostgresDatabase,
    readonly sql: string,
    readonly values: unknown[] = [],
  ) {}
  bind(...values: unknown[]) {
    return new PostgresStatement(this.database, this.sql, values);
  }
  async first<T = Record<string, any>>() {
    return (
      ((await this.database.query(this.sql, this.values)).rows[0] as
        T | undefined) ?? null
    );
  }
  async all<T = Record<string, any>>() {
    return {
      results: (await this.database.query(this.sql, this.values)).rows as T[],
      success: true,
    };
  }
  async run() {
    return runResult(await this.database.query(this.sql, this.values));
  }
}
export class PostgresDatabase implements Database {
  readonly pool: Pool;
  readonly schema: string;
  private initialization?: Promise<void>;
  constructor(
    config: PoolConfig = postgresConfig(),
    schema = process.env.DATABASE_SCHEMA || "govtest",
  ) {
    if (
      !/^[a-z][a-z0-9_]{0,62}$/.test(schema) ||
      ["public", "auth", "storage", "realtime"].includes(schema)
    )
      throw new Error("Use a dedicated application schema");
    this.schema = schema;
    this.pool = new Pool({
      ...config,
      options: `-c search_path=${schema} -c lock_timeout=10000`,
    });
    this.pool.on("error", () =>
      console.error("PostgreSQL idle connection closed"),
    );
  }
  prepare(sql: string) {
    return new PostgresStatement(this, sql);
  }
  async ready() {
    if (!this.initialization)
      this.initialization = this.initialize().catch((error) => {
        this.initialization = undefined;
        throw error;
      });
    await this.initialization;
  }
  private async initialize() {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        "govtest-migrate-" + this.schema,
      ]);
      await client.query(`CREATE SCHEMA IF NOT EXISTS "${this.schema}"`);
      await client.query(`REVOKE ALL ON SCHEMA "${this.schema}" FROM PUBLIC`);
      await client.query(
        "CREATE TABLE IF NOT EXISTS _govtest_migrations (name text PRIMARY KEY,applied_at text NOT NULL)",
      );
      const migrations = resolve("db/postgres");
      for (const file of readdirSync(migrations)
        .filter((x) => /^\d+.*\.sql$/.test(x))
        .sort()) {
        if (
          (
            await client.query(
              "SELECT name FROM _govtest_migrations WHERE name=$1",
              [file],
            )
          ).rowCount
        )
          continue;
        await client.query(readFileSync(join(migrations, file), "utf8"));
        await client.query("INSERT INTO _govtest_migrations VALUES ($1,$2)", [
          file,
          new Date().toISOString(),
        ]);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    // Existing administrator credentials are copied during cutover; never replace them.
    const bootstrap = await this.pool.connect();
    try {
      await bootstrap.query("BEGIN");
      await bootstrap.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        "govtest-bootstrap-" + this.schema,
      ]);
      if (
        process.env.MIGRATE_SQLITE_PATH &&
        !(await bootstrap.query("SELECT value FROM settings WHERE key='owner'"))
          .rowCount
      ) {
        await importSqlite(bootstrap, process.env.MIGRATE_SQLITE_PATH);
      }
      if (
        !(await bootstrap.query("SELECT value FROM settings WHERE key='owner'"))
          .rowCount
      ) {
        const hash = process.env.INITIAL_ADMIN_PASSWORD_HASH;
        if (!hash || !/^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(hash))
          throw new Error(
            "Initial administrator must be migrated or configured",
          );
        const username = (process.env.INITIAL_ADMIN_USERNAME || "admin")
            .trim()
            .toLowerCase(),
          id = crypto.randomUUID();
        await bootstrap.query(
          "INSERT INTO users (id,email,name,role,created_at) VALUES ($1,$2,$3,$4,$5)",
          [id, username, "管理员", "admin", new Date().toISOString()],
        );
        await bootstrap.query("INSERT INTO credentials VALUES ($1,$2,$3)", [
          id,
          username,
          hash,
        ]);
        await bootstrap.query("INSERT INTO settings VALUES ('owner',$1)", [id]);
      }
      await bootstrap.query("COMMIT");
    } catch (error) {
      await bootstrap.query("ROLLBACK");
      throw error;
    } finally {
      bootstrap.release();
    }
  }
  async query(sql: string, values: unknown[]) {
    await this.ready();
    return this.pool.query(postgresSql(sql), values);
  }
  async batch(statements: Statement[]) {
    await this.ready();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const results = [];
      for (const statement of statements) {
        if (
          !(statement instanceof PostgresStatement) ||
          statement.database !== this
        )
          throw new Error("Database statement mismatch");
        results.push(
          runResult(
            await client.query(postgresSql(statement.sql), statement.values),
          ),
        );
      }
      await client.query("COMMIT");
      return results;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
