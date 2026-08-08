import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
} from "electron";
import path from "path";
import { getDb, insertDocument, insertChunks, getDocuments, deleteDocument } from "./db";
import { extractText, chunkText } from "./doc-parser";
import { loadModel, unloadModel, getModelInfo } from "./llm";
import { queryRag, summarizeDocument } from "./rag";
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

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

app.whenReady().then(() => {
  // Initialize DB
  getDb();

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ── Model IPC ────────────────────────────────────────────────────────────────

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

// ── Chat IPC (streaming) ──────────────────────────────────────────────────────

ipcMain.on(
  "chat:query",
  async (event, { question, docIds }: { question: string; docIds: number[] }) => {
    // Cancel any ongoing query
    if (currentQueryController) {
      currentQueryController.cancel();
      currentQueryController = null;
    }

    currentQueryController = await queryRag(
      question,
      docIds,
      (chunk) => event.sender.send("chat:chunk", chunk),
      (sources) => {
        event.sender.send("chat:done", sources);
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
