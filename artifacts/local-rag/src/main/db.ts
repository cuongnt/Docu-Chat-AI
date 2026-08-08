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

    -- Stores semantic embedding vectors as BLOBs (Float32Array serialized)
    CREATE TABLE IF NOT EXISTS chunk_embeddings (
      chunk_id INTEGER PRIMARY KEY REFERENCES chunks(id) ON DELETE CASCADE,
      vector BLOB NOT NULL
    );

    -- Key-value settings store
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- Chat history
    CREATE TABLE IF NOT EXISTS chat_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('user','assistant')),
      content TEXT NOT NULL,
      sources TEXT,
      search_mode TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id);
  `);
}

// ── Row types ─────────────────────────────────────────────────────────────────

export interface ChatSessionRow {
  id: number;
  title: string;
  created_at: string;
  updated_at: string;
  message_count?: number;
}

export interface ChatMessageRow {
  id: number;
  session_id: number;
  role: "user" | "assistant";
  content: string;
  sources: string | null;
  search_mode: string | null;
  created_at: string;
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

// ── Documents ─────────────────────────────────────────────────────────────────

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

// ── Embeddings ────────────────────────────────────────────────────────────────

/**
 * Upsert a Float32Array embedding for a chunk (stored as raw BLOB).
 */
export function upsertEmbedding(
  db: Database.Database,
  chunkId: number,
  vector: Float32Array
): void {
  const buf = Buffer.from(vector.buffer);
  db.prepare(
    "INSERT INTO chunk_embeddings (chunk_id, vector) VALUES (?, ?) ON CONFLICT(chunk_id) DO UPDATE SET vector = excluded.vector"
  ).run(chunkId, buf);
}

/**
 * Bulk-upsert embeddings inside a transaction for speed.
 */
export function upsertEmbeddingsBulk(
  db: Database.Database,
  rows: Array<{ chunkId: number; vector: Float32Array }>
): void {
  const stmt = db.prepare(
    "INSERT INTO chunk_embeddings (chunk_id, vector) VALUES (?, ?) ON CONFLICT(chunk_id) DO UPDATE SET vector = excluded.vector"
  );
  const tx = db.transaction(
    (rows: Array<{ chunkId: number; vector: Float32Array }>) => {
      for (const { chunkId, vector } of rows) {
        stmt.run(chunkId, Buffer.from(vector.buffer));
      }
    }
  );
  tx(rows);
}

/**
 * Fetch embeddings for the given chunk IDs.
 * Returns only the chunks that have embeddings stored.
 */
export function getEmbeddingsForChunks(
  db: Database.Database,
  chunkIds: number[]
): Array<{ chunkId: number; vector: Float32Array }> {
  if (chunkIds.length === 0) return [];
  const placeholders = chunkIds.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT chunk_id, vector FROM chunk_embeddings WHERE chunk_id IN (${placeholders})`
    )
    .all(...chunkIds) as Array<{ chunk_id: number; vector: Buffer }>;

  return rows.map((r) => {
    const ab = r.vector.buffer.slice(
      r.vector.byteOffset,
      r.vector.byteOffset + r.vector.byteLength
    );
    return { chunkId: r.chunk_id, vector: new Float32Array(ab) };
  });
}

/**
 * Count how many chunks for a doc already have embeddings.
 */
export function countEmbeddingsForDoc(
  db: Database.Database,
  docId: number
): number {
  const result = db
    .prepare(
      `SELECT COUNT(*) as cnt FROM chunk_embeddings ce
       JOIN chunks c ON c.id = ce.chunk_id
       WHERE c.doc_id = ?`
    )
    .get(docId) as { cnt: number };
  return result.cnt;
}

// ── Chat History ─────────────────────────────────────────────────────────────

export function createChatSession(
  db: Database.Database,
  title: string
): number {
  const stmt = db.prepare(
    "INSERT INTO chat_sessions (title) VALUES (?)"
  );
  return stmt.run(title).lastInsertRowid as number;
}

export function updateChatSessionTitle(
  db: Database.Database,
  id: number,
  title: string
): void {
  db.prepare(
    "UPDATE chat_sessions SET title = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(title, id);
}

export function touchChatSession(db: Database.Database, id: number): void {
  db.prepare(
    "UPDATE chat_sessions SET updated_at = datetime('now') WHERE id = ?"
  ).run(id);
}

export function getChatSessions(
  db: Database.Database
): ChatSessionRow[] {
  return db
    .prepare(
      `SELECT s.id, s.title, s.created_at, s.updated_at,
              COUNT(m.id) AS message_count
       FROM chat_sessions s
       LEFT JOIN chat_messages m ON m.session_id = s.id
       GROUP BY s.id
       ORDER BY s.updated_at DESC`
    )
    .all() as ChatSessionRow[];
}

export function getSessionMessages(
  db: Database.Database,
  sessionId: number
): ChatMessageRow[] {
  return db
    .prepare(
      "SELECT * FROM chat_messages WHERE session_id = ? ORDER BY id ASC"
    )
    .all(sessionId) as ChatMessageRow[];
}

export function insertChatMessage(
  db: Database.Database,
  sessionId: number,
  role: "user" | "assistant",
  content: string,
  sources: string | null,
  searchMode: string | null
): number {
  const stmt = db.prepare(
    `INSERT INTO chat_messages (session_id, role, content, sources, search_mode)
     VALUES (?, ?, ?, ?, ?)`
  );
  const id = stmt.run(sessionId, role, content, sources, searchMode)
    .lastInsertRowid as number;
  touchChatSession(db, sessionId);
  return id;
}

export function deleteChatSession(db: Database.Database, id: number): void {
  db.prepare("DELETE FROM chat_sessions WHERE id = ?").run(id);
}

export function deleteAllChatSessions(db: Database.Database): void {
  db.prepare("DELETE FROM chat_sessions").run();
}

// ── Settings ──────────────────────────────────────────────────────────────────

/**
 * Delete all stored embeddings.
 * Call this whenever the embedding model changes so stale vectors
 * are never compared against queries from a different model.
 */
export function clearAllEmbeddings(db: Database.Database): void {
  db.prepare("DELETE FROM chunk_embeddings").run();
}

export function getSetting(
  db: Database.Database,
  key: string,
  defaultValue: string
): string {
  const row = db
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row ? row.value : defaultValue;
}

export function setSetting(
  db: Database.Database,
  key: string,
  value: string
): void {
  db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(key, value);
}
