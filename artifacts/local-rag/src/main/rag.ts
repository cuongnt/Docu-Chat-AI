import {
  getDb,
  getAllChunksForDocs,
  getChunks,
  getEmbeddingsForChunks,
} from "./db";
import { buildCorpus, search as bm25Search } from "./bm25";
import { embed, cosineSimilarity, getEmbeddingStatus } from "./embedding";
import { generateText, streamInference } from "./llm";
import type { StreamController } from "./llm";
import type { SourceChunk } from "../shared/types";

export type SearchMode = "bm25" | "hybrid";

const RAG_SYSTEM_PROMPT = `Bạn là trợ lý AI thông minh, chuyên phân tích và trả lời câu hỏi dựa trên tài liệu được cung cấp.

Quy tắc:
- Chỉ trả lời dựa trên thông tin trong phần "TÀI LIỆU THAM KHẢO"
- Nếu không tìm thấy thông tin trong tài liệu, hãy nói rõ điều đó
- Trả lời bằng tiếng Việt trừ khi được yêu cầu khác
- Trích dẫn cụ thể từ tài liệu khi có thể
- Không bịa đặt thông tin ngoài tài liệu`;

const SUMMARY_SYSTEM_PROMPT = `Bạn là chuyên gia tóm tắt tài liệu. 
Nhiệm vụ của bạn là tổng hợp nội dung tài liệu một cách rõ ràng, súc tích và đầy đủ.
Trả lời bằng tiếng Việt.`;

// ── Reciprocal Rank Fusion ─────────────────────────────────────────────────────

const RRF_K = 60;

interface ScoredChunk {
  id: number;
  docId: number;
  content: string;
  score: number;
}

/**
 * Merge BM25 and semantic results with Reciprocal Rank Fusion.
 * Score = Σ 1 / (k + rank_i) across both lists.
 */
function rrfMerge(
  bm25Results: ScoredChunk[],
  semanticResults: ScoredChunk[],
  topK: number
): ScoredChunk[] {
  const scoreMap = new Map<number, { chunk: ScoredChunk; rrf: number }>();

  const addRank = (results: ScoredChunk[]) => {
    results.forEach((chunk, rank) => {
      const contribution = 1 / (RRF_K + rank + 1);
      const existing = scoreMap.get(chunk.id);
      if (existing) {
        existing.rrf += contribution;
      } else {
        scoreMap.set(chunk.id, { chunk, rrf: contribution });
      }
    });
  };

  addRank(bm25Results);
  addRank(semanticResults);

  return Array.from(scoreMap.values())
    .sort((a, b) => b.rrf - a.rrf)
    .slice(0, topK)
    .map((entry) => ({ ...entry.chunk, score: entry.rrf }));
}

// ── Semantic search ────────────────────────────────────────────────────────────

/**
 * Retrieve top-K chunks by cosine similarity using stored embeddings.
 * Returns an empty array (not an error) if no embeddings are stored yet —
 * the caller decides whether to fall back or surface an info message.
 */
async function semanticSearch(
  query: string,
  chunks: Array<{ id: number; doc_id: number; content: string }>,
  topK: number
): Promise<ScoredChunk[]> {
  const chunkIds = chunks.map((c) => c.id);
  const db = getDb();
  const storedEmbeddings = getEmbeddingsForChunks(db, chunkIds);

  if (storedEmbeddings.length === 0) return [];

  const embMap = new Map<number, Float32Array>();
  for (const { chunkId, vector } of storedEmbeddings) {
    embMap.set(chunkId, vector);
  }

  const queryVec = await embed(query);

  const scored: ScoredChunk[] = [];
  for (const chunk of chunks) {
    const vec = embMap.get(chunk.id);
    if (!vec) continue;
    scored.push({
      id: chunk.id,
      docId: chunk.doc_id,
      content: chunk.content,
      score: cosineSimilarity(queryVec, vec),
    });
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, topK);
}

// ── Main RAG pipeline ──────────────────────────────────────────────────────────

export async function queryRag(
  question: string,
  docIds: number[],
  useSemanticSearch: boolean,
  onChunk: (chunk: string) => void,
  onDone: (sources: SourceChunk[], searchMode: SearchMode) => void,
  onError: (err: string) => void
): Promise<StreamController> {
  const db = getDb();
  const allChunks = getAllChunksForDocs(db, docIds);

  if (allChunks.length === 0) {
    onError("Không tìm thấy nội dung liên quan trong tài liệu đã chọn.");
    onDone([], "bm25");
    return { cancel: () => {} };
  }

  // ── BM25 retrieval (always run) ────────────────────────────────────────────
  const corpus = buildCorpus(
    allChunks.map((c) => ({ id: c.id, doc_id: c.doc_id, content: c.content }))
  );
  const bm25Results = bm25Search(question, corpus, 10).map((r) => ({
    id: r.id,
    docId: r.docId,
    content: r.content,
    score: r.score,
  }));

  let relevant: ScoredChunk[];
  let searchMode: SearchMode = "bm25";

  // ── Hybrid retrieval (only when model is ready) ────────────────────────────
  if (useSemanticSearch && getEmbeddingStatus().status === "ready") {
    const semResults = await semanticSearch(question, allChunks, 10);

    if (semResults.length > 0) {
      // At least some embeddings exist — merge with RRF
      relevant = rrfMerge(bm25Results, semResults, 6);
      searchMode = "hybrid";
    } else {
      // No embeddings stored for these chunks — fall back purely to BM25
      // (embeddings may not have been generated yet; user can use "Re-embed" button)
      relevant = bm25Results.slice(0, 6);
      searchMode = "bm25";
    }
  } else {
    relevant = bm25Results.slice(0, 6);
    searchMode = "bm25";
  }

  if (relevant.length === 0) {
    onError("Không tìm thấy nội dung liên quan trong tài liệu đã chọn.");
    onDone([], searchMode);
    return { cancel: () => {} };
  }

  // ── Build prompt ───────────────────────────────────────────────────────────
  const contextText = relevant
    .map((r, i) => `[Đoạn ${i + 1}]\n${r.content}`)
    .join("\n\n---\n\n");

  const prompt = `TÀI LIỆU THAM KHẢO:
${contextText}

---

CÂU HỎI: ${question}

Hãy trả lời câu hỏi dựa trên tài liệu tham khảo trên:`;

  const sources: SourceChunk[] = relevant.map((r, i) => ({
    id: r.id,
    docId: r.docId,
    content: r.content,
    label: `Đoạn ${i + 1}`,
  }));

  const ctrl = await streamInference(
    prompt,
    RAG_SYSTEM_PROMPT,
    onChunk,
    () => onDone(sources, searchMode),
    onError
  );

  return ctrl;
}

// ── Summarization ──────────────────────────────────────────────────────────────

export async function summarizeDocument(docId: number): Promise<string> {
  const db = getDb();
  const chunks = getChunks(db, docId);

  if (chunks.length === 0) {
    throw new Error("Tài liệu không có nội dung");
  }

  if (chunks.length <= 3) {
    const fullText = chunks.map((c) => c.content).join("\n\n");
    return generateText(
      `Hãy tóm tắt tài liệu sau một cách đầy đủ và súc tích:\n\n${fullText}`,
      SUMMARY_SYSTEM_PROMPT,
      1024
    );
  }

  const chunkSummaries: string[] = [];
  const batchSize = 3;
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const batchText = batch.map((c) => c.content).join("\n\n");
    const summary = await generateText(
      `Tóm tắt ngắn gọn phần sau (3-5 câu):\n\n${batchText}`,
      SUMMARY_SYSTEM_PROMPT,
      512
    );
    chunkSummaries.push(summary);
  }

  const combinedSummaries = chunkSummaries.join("\n\n");
  return generateText(
    `Dưới đây là tóm tắt của từng phần trong tài liệu. Hãy tổng hợp thành một bản tóm tắt tổng quan hoàn chỉnh, mạch lạc:\n\n${combinedSummaries}`,
    SUMMARY_SYSTEM_PROMPT,
    1024
  );
}
