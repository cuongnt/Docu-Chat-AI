import { contextBridge, ipcRenderer } from "electron";
import type {
  ElectronAPI,
  ChatDonePayload,
  EmbeddingProgress,
} from "../shared/types";

const api: ElectronAPI = {
  // Model (chat)
  pickModel: () => ipcRenderer.invoke("model:pick"),
  loadModel: (filePath) => ipcRenderer.invoke("model:load", filePath),
  getModelInfo: () => ipcRenderer.invoke("model:info"),
  unloadModel: () => ipcRenderer.invoke("model:unload"),

  // Documents
  pickFiles: () => ipcRenderer.invoke("doc:pick"),
  importFile: (filePath) => ipcRenderer.invoke("doc:import", filePath),
  listDocuments: () => ipcRenderer.invoke("doc:list"),
  deleteDocument: (id) => ipcRenderer.invoke("doc:delete", id),
  summarizeDocument: (id) => ipcRenderer.invoke("doc:summarize", id),

  // Chat — streaming via events
  sendQuery: (question, docIds, useSemanticSearch) => {
    ipcRenderer.send("chat:query", { question, docIds, useSemanticSearch });
  },
  onChatChunk: (callback) => {
    const handler = (_: Electron.IpcRendererEvent, chunk: string) =>
      callback(chunk);
    ipcRenderer.on("chat:chunk", handler);
    return () => ipcRenderer.removeListener("chat:chunk", handler);
  },
  onChatDone: (callback) => {
    const handler = (
      _: Electron.IpcRendererEvent,
      payload: ChatDonePayload
    ) => callback(payload);
    ipcRenderer.on("chat:done", handler);
    return () => ipcRenderer.removeListener("chat:done", handler);
  },
  onChatError: (callback) => {
    const handler = (_: Electron.IpcRendererEvent, error: string) =>
      callback(error);
    ipcRenderer.on("chat:error", handler);
    return () => ipcRenderer.removeListener("chat:error", handler);
  },
  cancelQuery: () => ipcRenderer.send("chat:cancel"),

  // Settings
  getSettings: () => ipcRenderer.invoke("settings:get"),
  setSetting: (key, value) => ipcRenderer.invoke("settings:set", key, value),

  // Embedding model
  pickEmbeddingModel: () => ipcRenderer.invoke("embedding:pick"),
  loadEmbeddingModel: (filePath) =>
    ipcRenderer.invoke("embedding:load", filePath),
  unloadEmbeddingModel: () => ipcRenderer.invoke("embedding:unload"),
  getEmbeddingStatus: () => ipcRenderer.invoke("embedding:status"),
  reembedAll: () => ipcRenderer.invoke("embedding:reembed-all"),
  onEmbeddingProgress: (callback) => {
    const handler = (
      _: Electron.IpcRendererEvent,
      progress: EmbeddingProgress
    ) => callback(progress);
    ipcRenderer.on("embedding:progress", handler);
    return () => ipcRenderer.removeListener("embedding:progress", handler);
  },
};

contextBridge.exposeInMainWorld("electronAPI", api);
