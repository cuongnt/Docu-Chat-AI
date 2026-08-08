import Database from "better-sqlite3";
import path from "path";
import { app } from "electron";
import fs from "fs";

let db: Database.Database;

export function getDb(): Database.Database {
  if (db) return db;

  const userDataPath = app.getPath("userData");
  const dbPath = path.join(userDataPath, "localrag.db");

  // Ensure directory exists
  fs.mkdirSync(userDataPath, { recursive: true });

  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  initSchema(db);
  return db;
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_type TEXT NOT NULL,
      chunk_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      doc_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      position INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_chunks_doc_id ON chunks(doc_id);
  `);
}

export interface DocRow {
  id: number;
  name: string;
  file_path: string;
  file_type: string;
  chunk_count: number;
  created_at: string;
}

export interface ChunkRow {
  id: number;
  doc_id: number;
  content: string;
  position: number;
}

export function insertDocument(
  db: Database.Database,
  name: string,
  filePath: string,
  fileType: string
): number {
  const stmt = db.prepare(
    "INSERT INTO documents (name, file_path, file_type) VALUES (?, ?, ?)"
  );
  const info = stmt.run(name, filePath, fileType);
  return info.lastInsertRowid as number;
}

export function insertChunks(
  db: Database.Database,
  docId: number,
  chunks: string[]
): void {
  const stmt = db.prepare(
    "INSERT INTO chunks (doc_id, content, position) VALUES (?, ?, ?)"
  );
  const insertMany = db.transaction((chunks: string[]) => {
    chunks.forEach((content, i) => stmt.run(docId, content, i));
  });
  insertMany(chunks);

  db.prepare("UPDATE documents SET chunk_count = ? WHERE id = ?").run(
    chunks.length,
    docId
  );
}

export function getDocuments(db: Database.Database): DocRow[] {
  return db
    .prepare(
      "SELECT id, name, file_path, file_type, chunk_count, created_at FROM documents ORDER BY created_at DESC"
    )
    .all() as DocRow[];
}

export function getChunks(
  db: Database.Database,
  docId: number
): ChunkRow[] {
  return db
    .prepare(
      "SELECT id, doc_id, content, position FROM chunks WHERE doc_id = ? ORDER BY position"
    )
    .all(docId) as ChunkRow[];
}

export function getAllChunksForDocs(
  db: Database.Database,
  docIds: number[]
): ChunkRow[] {
  if (docIds.length === 0) return [];
  const placeholders = docIds.map(() => "?").join(",");
  return db
    .prepare(
      `SELECT id, doc_id, content, position FROM chunks WHERE doc_id IN (${placeholders}) ORDER BY doc_id, position`
    )
    .all(...docIds) as ChunkRow[];
}

export function deleteDocument(db: Database.Database, id: number): void {
  db.prepare("DELETE FROM documents WHERE id = ?").run(id);
}
