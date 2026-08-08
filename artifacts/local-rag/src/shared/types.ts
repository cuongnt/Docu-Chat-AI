export interface Document {
  id: number;
  name: string;
  filePath: string;
  fileType: string;
  chunkCount: number;
  createdAt: string;
}

export interface SourceChunk {
  id: number;
  docId: number;
  content: string;
  label: string; // e.g. "Đoạn 1"
}

export type SearchMode = "bm25" | "hybrid";

export interface ChatDonePayload {
  sources: SourceChunk[];
  searchMode: SearchMode;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: SourceChunk[];
  searchMode?: SearchMode;
  isStreaming?: boolean;
}

export interface ModelInfo {
  loaded: boolean;
  path?: string;
  name?: string;
}

export interface ImportResult {
  success: boolean;
  docId?: number;
  name?: string;
  chunkCount?: number;
  error?: string;
}

export interface SummaryResult {
  success: boolean;
  summary?: string;
  error?: string;
}

export interface AppSettings {
  semanticSearch: boolean;
}

// ── Chat History ──────────────────────────────────────────────────────────────

export interface ChatSession {
  id: number;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export interface ChatHistoryMessage {
  id: number;
  sessionId: number;
  role: "user" | "assistant";
  content: string;
  sources: SourceChunk[] | null;
  searchMode: SearchMode | null;
  createdAt: string;
}

export type EmbeddingStatus = "idle" | "loading" | "ready" | "error";

export interface EmbeddingStatusInfo {
  status: EmbeddingStatus;
  modelPath: string | null;
  modelName: string | null;
  error: string;
}

export interface EmbeddingProgress {
  done: number;
  total: number;
  pct: number;
}

export interface ElectronAPI {
  // Model (chat)
  pickModel(): Promise<{ canceled: boolean; filePath?: string }>;
  loadModel(filePath: string): Promise<{ success: boolean; name?: string; error?: string }>;
  getModelInfo(): Promise<ModelInfo>;
  unloadModel(): Promise<void>;

  // Documents
  pickFiles(): Promise<{ canceled: boolean; filePaths?: string[] }>;
  importFile(filePath: string): Promise<ImportResult>;
  listDocuments(): Promise<Document[]>;
  deleteDocument(id: number): Promise<{ success: boolean }>;
  summarizeDocument(id: number): Promise<SummaryResult>;

  // Chat
  sendQuery(question: string, docIds: number[], useSemanticSearch: boolean): void;
  onChatChunk(callback: (chunk: string) => void): () => void;
  onChatDone(callback: (payload: ChatDonePayload) => void): () => void;
  onChatError(callback: (error: string) => void): () => void;
  cancelQuery(): void;

  // Settings
  getSettings(): Promise<AppSettings>;
  setSetting(key: string, value: string): Promise<{ success: boolean }>;

  // Embedding model
  pickEmbeddingModel(): Promise<{ canceled: boolean; filePath?: string }>;
  loadEmbeddingModel(filePath: string): Promise<{ success: boolean; error?: string }>;
  unloadEmbeddingModel(): Promise<void>;
  getEmbeddingStatus(): Promise<EmbeddingStatusInfo>;
  reembedAll(): Promise<{ success: boolean; done?: number; total?: number; error?: string }>;
  onEmbeddingProgress(callback: (progress: EmbeddingProgress) => void): () => void;

  // Chat history
  listSessions(): Promise<ChatSession[]>;
  getSessionMessages(sessionId: number): Promise<ChatHistoryMessage[]>;
  createSession(title: string): Promise<{ id: number }>;
  saveMessage(sessionId: number, role: "user" | "assistant", content: string, sources: SourceChunk[] | null, searchMode: SearchMode | null): Promise<{ id: number }>;
  deleteSession(sessionId: number): Promise<{ success: boolean }>;
  deleteAllSessions(): Promise<{ success: boolean }>;
  exportSession(sessionId: number, format: "md" | "txt"): Promise<{ success: boolean; error?: string }>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
