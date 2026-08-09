/**
 * Semantic embedding via node-llama-cpp (LlamaEmbeddingContext).
 * Requires a GGUF embedding model (e.g. nomic-embed-text, all-minilm).
 * User picks the model file in Settings — same workflow as the chat model.
 */

import path from "path";

// node-llama-cpp is ESM-only; bypass TypeScript's require() conversion (same fix as llm.ts)
async function importLlamaCpp(): Promise<typeof import("node-llama-cpp")> {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  return new Function('return import("node-llama-cpp")')();
}

export type EmbeddingStatus = "idle" | "loading" | "ready" | "error";

export interface EmbeddingState {
  status: EmbeddingStatus;
  modelPath: string | null;
  modelName: string | null;
  error: string;
}

const state: EmbeddingState = {
  status: "idle",
  modelPath: null,
  modelName: null,
  error: "",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let llamaEmbInstance: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let embeddingModel: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let embeddingContext: any = null;

export function getEmbeddingStatus(): EmbeddingState {
  return { ...state };
}

/**
 * Load a GGUF embedding model.
 * Separate from the chat model — uses LlamaEmbeddingContext internally.
 */
export async function loadEmbeddingModel(
  modelPath: string
): Promise<{ success: boolean; error?: string }> {
  await unloadEmbeddingModel();

  state.status = "loading";
  state.error = "";

  try {
    const { getLlama } = await importLlamaCpp();
    llamaEmbInstance = await getLlama();
    embeddingModel = await llamaEmbInstance.loadModel({ modelPath });
    embeddingContext = await embeddingModel.createEmbeddingContext();

    state.status = "ready";
    state.modelPath = modelPath;
    state.modelName = path.basename(modelPath);
    state.error = "";

    return { success: true };
  } catch (err) {
    state.status = "error";
    state.error = err instanceof Error ? err.message : String(err);
    llamaEmbInstance = null;
    embeddingModel = null;
    embeddingContext = null;
    return { success: false, error: state.error };
  }
}

/**
 * Unload the embedding model and free resources.
 */
export async function unloadEmbeddingModel(): Promise<void> {
  try {
    if (embeddingContext) {
      await embeddingContext.dispose?.();
      embeddingContext = null;
    }
    if (embeddingModel) {
      await embeddingModel.dispose?.();
      embeddingModel = null;
    }
    if (llamaEmbInstance) {
      llamaEmbInstance = null;
    }
  } catch {
    // ignore disposal errors
  }
  state.status = "idle";
  state.modelPath = null;
  state.modelName = null;
  state.error = "";
}

/**
 * Generate a normalized embedding vector for text.
 * Throws if embedding model is not loaded.
 */
export async function embed(text: string): Promise<Float32Array> {
  if (!embeddingContext) {
    throw new Error(
      "Mô hình embedding chưa được tải. Vui lòng chọn file GGUF embedding trong Cài đặt."
    );
  }
  const result = await embeddingContext.getEmbeddingFor(text);
  // result.vector is readonly number[] — convert to mutable Float32Array
  return Float32Array.from(result.vector);
}

/**
 * Cosine similarity between two embedding vectors.
 * Returns a value in [-1, 1]; higher = more similar.
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
