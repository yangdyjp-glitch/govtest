import { DatabaseSync, backup } from "node:sqlite";
import { existsSync } from "node:fs";
import type { PoolClient } from "pg";

const tables = [
  "users",
  "settings",
  "invitations",
  "banks",
  "attempts",
  "events",
  "credentials",
  "sessions",
  "login_attempts",
] as const;
export async function importSqlite(client: PoolClient, filename: string) {
  if (!existsSync(filename))
    throw new Error("SQLite migration source is missing");
  for (const table of tables) {
    if ((await client.query(`SELECT 1 FROM "${table}" LIMIT 1`)).rowCount)
      throw new Error("Migration requires empty destination tables");
  }
  const source = new DatabaseSync(filename, { readOnly: true });
  const counts: Record<string, number> = {};
  try {
    const backupPath = filename + ".before-supabase";
    if (!existsSync(backupPath)) await backup(source, backupPath);
    source.exec("BEGIN");
    for (const table of tables) {
      const rows = source
        .prepare(`SELECT * FROM "${table}" ORDER BY 1`)
        .all() as Record<string, unknown>[];
      counts[table] = rows.length;
      for (const row of rows) {
        const columns = Object.keys(row);
        await client.query(
          `INSERT INTO "${table}" (${columns.map((c) => '"' + c + '"').join(",")}) VALUES (${columns.map((_, i) => "$" + (i + 1)).join(",")})`,
          Object.values(row),
        );
      }
      const copied = (await client.query(`SELECT * FROM "${table}" ORDER BY 1`))
        .rows;
      if (copied.length !== rows.length)
        throw new Error("Migration row count mismatch: " + table);
      for (let i = 0; i < rows.length; i++)
        for (const [key, value] of Object.entries(rows[i])) {
          const other =
            typeof value === "number" ? Number(copied[i][key]) : copied[i][key];
          if (other !== value)
            throw new Error("Migration content mismatch: " + table + "." + key);
        }
    }
    if (
      !(await client.query("SELECT value FROM settings WHERE key='owner'"))
        .rowCount
    )
      throw new Error("Source administrator missing");
    await client.query(
      "INSERT INTO settings (key,value) VALUES ('sqlite_migration',$1)",
      [JSON.stringify({ at: new Date().toISOString(), counts })],
    );
    source.exec("COMMIT");
    console.log("SQLite migration verified:", counts);
  } finally {
    source.close();
  }
  return counts;
}
