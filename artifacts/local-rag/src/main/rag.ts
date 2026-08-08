import { getDb, getAllChunksForDocs, getChunks } from "./db";
import { buildCorpus, search } from "./bm25";
import { generateText, streamInference } from "./llm";
import type { StreamController } from "./llm";
import type { SourceChunk } from "../shared/types";

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

export async function queryRag(
  question: string,
  docIds: number[],
  onChunk: (chunk: string) => void,
  onDone: (sources: SourceChunk[]) => void,
  onError: (err: string) => void
): Promise<StreamController> {
  const db = getDb();

  // Retrieve relevant chunks using BM25
  const allChunks = getAllChunksForDocs(db, docIds);
  const corpus = buildCorpus(
    allChunks.map((c) => ({ id: c.id, doc_id: c.doc_id, content: c.content }))
  );
  const relevant = search(question, corpus, 6);

  if (relevant.length === 0) {
    onError("Không tìm thấy nội dung liên quan trong tài liệu đã chọn.");
    onDone([]);
    return { cancel: () => {} };
  }

  // Build context from top chunks
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
    () => onDone(sources),
    onError
  );

  return ctrl;
}

export async function summarizeDocument(docId: number): Promise<string> {
  const db = getDb();
  const chunks = getChunks(db, docId);

  if (chunks.length === 0) {
    throw new Error("Tài liệu không có nội dung");
  }

  // For short documents, summarize directly
  if (chunks.length <= 3) {
    const fullText = chunks.map((c) => c.content).join("\n\n");
    return generateText(
      `Hãy tóm tắt tài liệu sau một cách đầy đủ và súc tích:\n\n${fullText}`,
      SUMMARY_SYSTEM_PROMPT,
      1024
    );
  }

  // Map-reduce for longer documents
  const chunkSummaries: string[] = [];

  // Summarize each chunk (batch into groups of 3 for efficiency)
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

  // Combine summaries
  const combinedSummaries = chunkSummaries.join("\n\n");
  const finalSummary = await generateText(
    `Dưới đây là tóm tắt của từng phần trong tài liệu. Hãy tổng hợp thành một bản tóm tắt tổng quan hoàn chỉnh, mạch lạc:\n\n${combinedSummaries}`,
    SUMMARY_SYSTEM_PROMPT,
    1024
  );

  return finalSummary;
}
