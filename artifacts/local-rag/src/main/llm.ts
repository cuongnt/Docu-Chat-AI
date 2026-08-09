import path from "path";

// node-llama-cpp is ESM-only. TypeScript with module:CommonJS converts
// `await import(...)` to `require()` which fails for ESM packages.
// Using new Function bypasses TypeScript's static transformation so the
// compiled output keeps a real dynamic import() call at runtime.
async function importLlamaCpp(): Promise<typeof import("node-llama-cpp")> {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  return new Function('return import("node-llama-cpp")')();
}

// node-llama-cpp v3 — loaded lazily to avoid startup cost
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let llamaInstance: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let loadedModel: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let modelContext: any = null;
let loadedModelPath: string | null = null;

export interface StreamController {
  cancel: () => void;
}

export async function loadModel(
  modelPath: string
): Promise<{ success: boolean; name?: string; error?: string }> {
  try {
    await unloadModel();

    const { getLlama } = await importLlamaCpp();
    llamaInstance = await getLlama();
    loadedModel = await llamaInstance.loadModel({ modelPath });
    modelContext = await loadedModel.createContext({ contextSize: 4096 });
    loadedModelPath = modelPath;

    return { success: true, name: path.basename(modelPath) };
  } catch (err) {
    llamaInstance = null;
    loadedModel = null;
    modelContext = null;
    loadedModelPath = null;
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}

export async function unloadModel(): Promise<void> {
  try {
    if (modelContext) {
      await modelContext.dispose?.();
      modelContext = null;
    }
    if (loadedModel) {
      await loadedModel.dispose?.();
      loadedModel = null;
    }
    loadedModelPath = null;
  } catch {
    // ignore disposal errors
  }
}

export function getModelInfo(): {
  loaded: boolean;
  path?: string;
  name?: string;
} {
  if (!loadedModel || !loadedModelPath) return { loaded: false };
  return {
    loaded: true,
    path: loadedModelPath,
    name: path.basename(loadedModelPath),
  };
}

export function isModelLoaded(): boolean {
  return !!loadedModel && !!modelContext;
}

/**
 * Streaming inference using node-llama-cpp v3.
 * Uses onTextChunk callback for streaming — v3 API.
 */
export async function streamInference(
  prompt: string,
  systemPrompt: string,
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (err: string) => void
): Promise<StreamController> {
  if (!loadedModel || !modelContext) {
    onError("Chưa tải mô hình AI. Vui lòng chọn file GGUF.");
    onDone();
    return { cancel: () => {} };
  }

  let cancelled = false;

  // Run async but return controller immediately
  (async () => {
    try {
      const { LlamaChatSession } = await importLlamaCpp();
      const sequence = modelContext.getSequence();
      const session = new LlamaChatSession({
        contextSequence: sequence,
        systemPrompt,
      });

      await session.prompt(prompt, {
        temperature: 0.7,
        maxTokens: 2048,
        onTextChunk: (chunk: string) => {
          if (!cancelled) onChunk(chunk);
        },
      });

      if (!cancelled) onDone();
    } catch (err) {
      if (!cancelled) {
        onError(err instanceof Error ? err.message : String(err));
        onDone();
      }
    }
  })();

  return {
    cancel: () => {
      cancelled = true;
    },
  };
}

/**
 * Non-streaming inference for summarization (node-llama-cpp v3).
 */
export async function generateText(
  prompt: string,
  systemPrompt: string,
  maxTokens = 1024
): Promise<string> {
  if (!loadedModel || !modelContext) {
    throw new Error("Mô hình chưa được tải");
  }

  const { LlamaChatSession } = await importLlamaCpp();
  const sequence = modelContext.getSequence();
  const session = new LlamaChatSession({
    contextSequence: sequence,
    systemPrompt,
  });

  const result = await session.prompt(prompt, {
    temperature: 0.3,
    maxTokens,
  });

  return result.trim();
}
