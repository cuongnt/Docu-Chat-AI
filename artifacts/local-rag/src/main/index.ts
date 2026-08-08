import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
} from "electron";
import path from "path";
import {
  getDb,
  insertDocument,
  insertChunks,
  getDocuments,
  deleteDocument,
  getAllChunksForDocs,
  getChunks,
  upsertEmbeddingsBulk,
  clearAllEmbeddings,
  getSetting,
  setSetting,
  countEmbeddingsForDoc,
  getChatSessions,
  getSessionMessages,
  createChatSession,
  insertChatMessage,
  deleteChatSession,
  deleteAllChatSessions,
} from "./db";
import fs from "fs";
import { extractText, chunkText } from "./doc-parser";
import { loadModel, unloadModel, getModelInfo } from "./llm";
import { queryRag, summarizeDocument } from "./rag";
import {
  loadEmbeddingModel,
  unloadEmbeddingModel,
  getEmbeddingStatus,
  embed,
} from "./embedding";
import type { StreamController } from "./llm";

const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;

let mainWindow: BrowserWindow | null = null;
let currentQueryController: StreamController | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: "DocChat AI",
    backgroundColor: "#1a1b1e",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

app.whenReady().then(async () => {
  // Initialize DB
  getDb();

  // Auto-reload embedding model if one was previously selected
  const db = getDb();
  const savedEmbPath = getSetting(db, "embeddingModelPath", "");
  if (savedEmbPath) {
    loadEmbeddingModel(savedEmbPath).catch(() => {
      // Model file may have moved — clear the saved path silently
      setSetting(db, "embeddingModelPath", "");
    });
  }

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ── Model IPC (chat) ──────────────────────────────────────────────────────────

ipcMain.handle("model:pick", async () => {
  const result = await dialog.showOpenDialog({
    title: "Chọn file mô hình GGUF",
    filters: [{ name: "GGUF Models", extensions: ["gguf"] }],
    properties: ["openFile"],
  });
  return {
    canceled: result.canceled,
    filePath: result.filePaths[0],
  };
});

ipcMain.handle("model:load", async (_, filePath: string) => {
  return loadModel(filePath);
});

ipcMain.handle("model:info", () => {
  return getModelInfo();
});

ipcMain.handle("model:unload", async () => {
  await unloadModel();
});

// ── Document IPC ─────────────────────────────────────────────────────────────

ipcMain.handle("doc:pick", async () => {
  const result = await dialog.showOpenDialog({
    title: "Chọn tài liệu để import",
    filters: [
      {
        name: "Tài liệu",
        extensions: ["pdf", "docx", "doc", "txt", "md", "xlsx", "xls", "csv"],
      },
    ],
    properties: ["openFile", "multiSelections"],
  });
  return {
    canceled: result.canceled,
    filePaths: result.filePaths,
  };
});

ipcMain.handle("doc:import", async (_, filePath: string) => {
  try {
    const name = path.basename(filePath);
    const ext = path.extname(filePath).toLowerCase().replace(".", "");

    const text = await extractText(filePath);
    if (!text || text.trim().length < 10) {
      return { success: false, error: "File không có nội dung văn bản" };
    }

    const chunks = chunkText(text);
    const db = getDb();
    const docId = insertDocument(db, name, filePath, ext);
    insertChunks(db, docId, chunks);

    // Fire-and-forget: generate embeddings if embedding model is ready
    generateEmbeddingsForDoc(docId).catch(() => {
      // BM25 still works without embeddings
    });

    return { success: true, docId, name, chunkCount: chunks.length };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
});

ipcMain.handle("doc:list", () => {
  const db = getDb();
  const rows = getDocuments(db);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    filePath: r.file_path,
    fileType: r.file_type,
    chunkCount: r.chunk_count,
    createdAt: r.created_at,
  }));
});

ipcMain.handle("doc:delete", (_, id: number) => {
  const db = getDb();
  deleteDocument(db, id);
  return { success: true };
});

ipcMain.handle("doc:summarize", async (_, id: number) => {
  try {
    const summary = await summarizeDocument(id);
    return { success: true, summary };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
});

// ── Settings IPC ──────────────────────────────────────────────────────────────

ipcMain.handle("settings:get", () => {
  const db = getDb();
  return {
    semanticSearch: getSetting(db, "semanticSearch", "false") === "true",
  };
});

ipcMain.handle("settings:set", async (_, key: string, value: string) => {
  const db = getDb();
  setSetting(db, key, value);
  return { success: true };
});

// ── Embedding IPC ─────────────────────────────────────────────────────────────

ipcMain.handle("embedding:pick", async () => {
  const result = await dialog.showOpenDialog({
    title: "Chọn file mô hình GGUF embedding",
    filters: [{ name: "GGUF Embedding Models", extensions: ["gguf"] }],
    properties: ["openFile"],
  });
  return {
    canceled: result.canceled,
    filePath: result.filePaths[0],
  };
});

ipcMain.handle("embedding:load", async (_, filePath: string) => {
  const db = getDb();

  // Always clear stored vectors before switching models.
  // Vectors are model-specific (dimension/representation differs between models);
  // keeping old vectors would yield incorrect similarity rankings.
  clearAllEmbeddings(db);

  const result = await loadEmbeddingModel(filePath);
  if (result.success) {
    setSetting(db, "embeddingModelPath", filePath);
  } else {
    // Load failed — remove path so we don't try to auto-reload a broken model
    setSetting(db, "embeddingModelPath", "");
  }
  return result;
});

ipcMain.handle("embedding:unload", async () => {
  await unloadEmbeddingModel();
  const db = getDb();
  // Clear vectors: without the model loaded we can't add new ones, and
  // re-loading a different model later must start with a clean slate.
  clearAllEmbeddings(db);
  setSetting(db, "embeddingModelPath", "");
});

ipcMain.handle("embedding:status", () => {
  return getEmbeddingStatus();
});

/**
 * Re-embed all chunks across all documents.
 * Sends embedding:progress events to renderer during the process.
 */
ipcMain.handle("embedding:reembed-all", async (event) => {
  const { status } = getEmbeddingStatus();
  if (status !== "ready") {
    return { success: false, error: "Mô hình embedding chưa sẵn sàng" };
  }

  const db = getDb();
  const docs = getDocuments(db);
  let total = 0;
  let done = 0;

  // Count total chunks first
  for (const doc of docs) {
    total += getChunks(db, doc.id).length;
  }

  for (const doc of docs) {
    const chunks = getChunks(db, doc.id);
    const rows: Array<{ chunkId: number; vector: Float32Array }> = [];
    for (const chunk of chunks) {
      try {
        const vec = await embed(chunk.content);
        rows.push({ chunkId: chunk.id, vector: vec });
        done++;
        event.sender.send("embedding:progress", {
          done,
          total,
          pct: Math.round((done / Math.max(total, 1)) * 100),
        });
      } catch {
        done++;
      }
    }
    if (rows.length > 0) {
      upsertEmbeddingsBulk(db, rows);
    }
  }

  return { success: true, done, total };
});

// ── Chat IPC (streaming) ──────────────────────────────────────────────────────

ipcMain.on(
  "chat:query",
  async (
    event,
    {
      question,
      docIds,
      useSemanticSearch,
    }: { question: string; docIds: number[]; useSemanticSearch: boolean }
  ) => {
    if (currentQueryController) {
      currentQueryController.cancel();
      currentQueryController = null;
    }

    currentQueryController = await queryRag(
      question,
      docIds,
      useSemanticSearch,
      (chunk) => event.sender.send("chat:chunk", chunk),
      (sources, searchMode) => {
        event.sender.send("chat:done", {
          sources: JSON.parse(JSON.stringify(sources)),
          searchMode,
        });
        currentQueryController = null;
      },
      (err) => {
        event.sender.send("chat:error", err);
        currentQueryController = null;
      }
    );
  }
);

ipcMain.on("chat:cancel", () => {
  if (currentQueryController) {
    currentQueryController.cancel();
    currentQueryController = null;
  }
});

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Generate and store embeddings for all chunks of a document.
 * Called fire-and-forget after import when embedding model is ready.
 */
async function generateEmbeddingsForDoc(docId: number): Promise<void> {
  const { status } = getEmbeddingStatus();
  if (status !== "ready") return;

  const db = getDb();
  const alreadyDone = countEmbeddingsForDoc(db, docId);
  const chunks = getChunks(db, docId);

  if (alreadyDone >= chunks.length) return;

  const rows: Array<{ chunkId: number; vector: Float32Array }> = [];
  for (const chunk of chunks) {
    const vec = await embed(chunk.content);
    rows.push({ chunkId: chunk.id, vector: vec });
  }
  if (rows.length > 0) {
    upsertEmbeddingsBulk(db, rows);
  }
}

// ── Chat History IPC ──────────────────────────────────────────────────────────

ipcMain.handle("history:list-sessions", () => {
  const db = getDb();
  return getChatSessions(db).map((s) => ({
    id: s.id,
    title: s.title,
    createdAt: s.created_at,
    updatedAt: s.updated_at,
    messageCount: s.message_count ?? 0,
  }));
});

ipcMain.handle("history:get-messages", (_, sessionId: number) => {
  const db = getDb();
  return getSessionMessages(db, sessionId).map((m) => ({
    id: m.id,
    sessionId: m.session_id,
    role: m.role,
    content: m.content,
    sources: m.sources ? JSON.parse(m.sources) : null,
    searchMode: m.search_mode ?? null,
    createdAt: m.created_at,
  }));
});

ipcMain.handle("history:create-session", (_, title: string) => {
  const db = getDb();
  const id = createChatSession(db, title || "Phiên mới");
  return { id };
});

ipcMain.handle(
  "history:save-message",
  (
    _,
    {
      sessionId,
      role,
      content,
      sources,
      searchMode,
    }: {
      sessionId: number;
      role: "user" | "assistant";
      content: string;
      sources: unknown[] | null;
      searchMode: string | null;
    }
  ) => {
    const db = getDb();
    const id = insertChatMessage(
      db,
      sessionId,
      role,
      content,
      sources ? JSON.stringify(sources) : null,
      searchMode
    );
    return { id };
  }
);

ipcMain.handle("history:delete-session", (_, sessionId: number) => {
  const db = getDb();
  deleteChatSession(db, sessionId);
  return { success: true };
});

ipcMain.handle("history:delete-all-sessions", () => {
  const db = getDb();
  deleteAllChatSessions(db);
  return { success: true };
});

ipcMain.handle(
  "history:export-session",
  async (
    _,
    { sessionId, format }: { sessionId: number; format: "md" | "txt" }
  ) => {
    try {
      const db = getDb();
      const sessions = getChatSessions(db);
      const session = sessions.find((s) => s.id === sessionId);
      if (!session) return { success: false, error: "Không tìm thấy phiên" };

      const messages = getSessionMessages(db, sessionId);

      let content = "";
      if (format === "md") {
        content += `# ${session.title}\n\n`;
        content += `_${new Date(session.created_at).toLocaleString("vi-VN")}_\n\n---\n\n`;
        for (const m of messages) {
          const prefix = m.role === "user" ? "**Bạn**" : "**AI**";
          content += `${prefix}\n\n${m.content}\n\n`;
          if (m.sources) {
            try {
              const srcs = JSON.parse(m.sources) as Array<{
                label: string;
                content: string;
              }>;
              if (srcs.length > 0) {
                content += `<details><summary>Nguồn (${srcs.length})</summary>\n\n`;
                srcs.forEach((s) => {
                  content += `**${s.label}**: ${s.content.slice(0, 200)}…\n\n`;
                });
                content += `</details>\n\n`;
              }
            } catch {
              // skip malformed sources
            }
          }
          content += "---\n\n";
        }
      } else {
        content += `${session.title}\n`;
        content += `${new Date(session.created_at).toLocaleString("vi-VN")}\n`;
        content += "=".repeat(40) + "\n\n";
        for (const m of messages) {
          const prefix = m.role === "user" ? "[Bạn]" : "[AI]";
          content += `${prefix}\n${m.content}\n\n`;
        }
      }

      const result = await dialog.showSaveDialog({
        title: "Xuất lịch sử hội thoại",
        defaultPath: `${session.title.replace(/[^a-z0-9\u00C0-\u024F\s]/gi, "_")}.${format}`,
        filters: [
          format === "md"
            ? { name: "Markdown", extensions: ["md"] }
            : { name: "Text", extensions: ["txt"] },
        ],
      });

      if (result.canceled || !result.filePath) {
        return { success: false, error: "Đã hủy" };
      }

      fs.writeFileSync(result.filePath, content, "utf-8");
      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
);

// Re-export getAllChunksForDocs for completeness (used internally)
export { getAllChunksForDocs };
