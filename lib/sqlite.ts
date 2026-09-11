import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import type { Statement } from "./database-types";

export class Prepared {
  constructor(
    private connection: DatabaseSync,
    private sql: string,
    private values: SQLInputValue[] = [],
  ) {}
  bind(...values: unknown[]) {
    return new Prepared(
      this.connection,
      this.sql,
      values.map((value) => {
        if (
          value === null ||
          typeof value === "string" ||
          typeof value === "number" ||
          typeof value === "bigint" ||
          value instanceof Uint8Array
        )
          return value;
        throw new TypeError("Invalid SQL parameter");
      }),
    );
  }
  async first<T = Record<string, any>>(): Promise<T | null> {
    return (
      (this.connection.prepare(this.sql).get(...this.values) as
        T | undefined) ?? null
    );
  }
  async all<T = Record<string, any>>() {
    return {
      results: this.connection.prepare(this.sql).all(...this.values) as T[],
      success: true,
    };
  }
  runSync() {
    const result = this.connection.prepare(this.sql).run(...this.values);
    return {
      success: true,
      meta: {
        changes: Number(result.changes),
        last_row_id: Number(result.lastInsertRowid),
      },
    };
  }
  async run() {
    return this.runSync();
  }
}

export class SqliteDatabase {
  connection: DatabaseSync;
  constructor(filename: string, migrations = resolve("drizzle")) {
    this.connection = new DatabaseSync(filename);
    this.connection.exec(
      "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;",
    );
    this.connection.exec(
      "CREATE TABLE IF NOT EXISTS _govtest_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)",
    );
    const journal = JSON.parse(
      readFileSync(join(migrations, "meta/_journal.json"), "utf8"),
    );
    for (const entry of journal.entries) {
      if (
        this.connection
          .prepare("SELECT name FROM _govtest_migrations WHERE name=?")
          .get(entry.tag)
      )
        continue;
      this.connection.exec("BEGIN IMMEDIATE");
      try {
        this.connection.exec(
          readFileSync(join(migrations, entry.tag + ".sql"), "utf8"),
        );
        this.connection
          .prepare(
            "INSERT INTO _govtest_migrations (name,applied_at) VALUES (?,?)",
          )
          .run(entry.tag, new Date().toISOString());
        this.connection.exec("COMMIT");
      } catch (error) {
        this.connection.exec("ROLLBACK");
        throw error;
      }
    }
  }
  prepare(sql: string) {
    return new Prepared(this.connection, sql);
  }
  async batch(statements: Statement[]) {
    this.connection.exec("BEGIN IMMEDIATE");
    try {
      const results = statements.map((statement) => {
        if (!(statement instanceof Prepared))
          throw new Error("Database statement mismatch");
        return statement.runSync();
      });
      this.connection.exec("COMMIT");
      return results;
    } catch (error) {
      this.connection.exec("ROLLBACK");
      throw error;
    }
  }
}
const state = globalThis as typeof globalThis & {
  govtestSqliteDatabase?: SqliteDatabase;
};
export function sqliteDatabase() {
  if (state.govtestSqliteDatabase) return state.govtestSqliteDatabase;
  const directory =
    process.env.DATA_DIR ||
    process.env.RAILWAY_VOLUME_MOUNT_PATH ||
    resolve(".data");
  if (
    process.env.RAILWAY_ENVIRONMENT_ID &&
    !process.env.RAILWAY_VOLUME_MOUNT_PATH
  )
    throw new Error(
      "A persistent Railway volume must be mounted before starting.",
    );
  mkdirSync(directory, { recursive: true });
  const d = new SqliteDatabase(join(directory, "govtest.sqlite"));
  if (
    !d.connection.prepare("SELECT value FROM settings WHERE key='owner'").get()
  ) {
    const hash = process.env.INITIAL_ADMIN_PASSWORD_HASH;
    if (!hash || !/^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(hash)) {
      d.connection.close();
      throw new Error(
        "Configure INITIAL_ADMIN_PASSWORD_HASH to initialize the administrator.",
      );
    }
    const username = (process.env.INITIAL_ADMIN_USERNAME || "admin")
      .trim()
      .toLowerCase();
    const id = crypto.randomUUID();
    d.connection.exec("BEGIN IMMEDIATE");
    try {
      d.connection
        .prepare(
          "INSERT INTO users (id,email,name,role,created_at) VALUES (?,?,?,?,?)",
        )
        .run(id, username, "管理员", "admin", new Date().toISOString());
      d.connection
        .prepare(
          "INSERT INTO credentials (user_id,username,password_hash) VALUES (?,?,?)",
        )
        .run(id, username, hash);
      d.connection
        .prepare("INSERT INTO settings (key,value) VALUES ('owner',?)")
        .run(id);
      d.connection.exec("COMMIT");
    } catch (error) {
      d.connection.exec("ROLLBACK");
      d.connection.close();
      throw error;
    }
  }
  state.govtestSqliteDatabase = d;
  return d;
}
