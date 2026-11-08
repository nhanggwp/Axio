import Database from "better-sqlite3";
import { readFileSync, chmodSync } from "node:fs";
export function openDatabase(file: string) {
  const db = new Database(file);
  if (file !== ":memory:") chmodSync(file, 0o600);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  return db;
}
export function migrateWorkspace(db: Database.Database) {
  db.exec(
    readFileSync(
      new URL("./migrations/001_workspace.sql", import.meta.url),
      "utf8",
    ),
  );
}
