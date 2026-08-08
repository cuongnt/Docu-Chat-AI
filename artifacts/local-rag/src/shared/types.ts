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

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: SourceChunk[];
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

export interface ElectronAPI {
  // Model
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
  sendQuery(question: string, docIds: number[]): void;
  onChatChunk(callback: (chunk: string) => void): () => void;
  onChatDone(callback: (sources: SourceChunk[]) => void): () => void;
  onChatError(callback: (error: string) => void): () => void;
  cancelQuery(): void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
