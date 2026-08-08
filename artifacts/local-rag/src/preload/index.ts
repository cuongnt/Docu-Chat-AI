import { contextBridge, ipcRenderer } from "electron";
import type { ElectronAPI, SourceChunk } from "../shared/types";

const api: ElectronAPI = {
  // Model
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

  // Chat - streaming via events
  sendQuery: (question, docIds) => {
    ipcRenderer.send("chat:query", { question, docIds });
  },
  onChatChunk: (callback) => {
    const handler = (_: Electron.IpcRendererEvent, chunk: string) =>
      callback(chunk);
    ipcRenderer.on("chat:chunk", handler);
    return () => ipcRenderer.removeListener("chat:chunk", handler);
  },
  onChatDone: (callback) => {
    const handler = (_: Electron.IpcRendererEvent, sources: SourceChunk[]) =>
      callback(sources);
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
};

contextBridge.exposeInMainWorld("electronAPI", api);
