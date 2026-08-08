/**
 * BM25 retrieval — 100% offline, no model download needed.
 * k1 = 1.5, b = 0.75 (classic defaults)
 */

const K1 = 1.5;
const B = 0.75;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

function termFrequencies(tokens: string[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const t of tokens) freq.set(t, (freq.get(t) ?? 0) + 1);
  return freq;
}

export interface BM25Corpus {
  chunks: Array<{ id: number; docId: number; content: string }>;
  df: Map<string, number>; // document frequency per term
  avgLen: number;
}

export function buildCorpus(
  chunks: Array<{ id: number; doc_id: number; content: string }>
): BM25Corpus {
  const df = new Map<string, number>();
  let totalLen = 0;

  const processed = chunks.map((c) => {
    const tokens = tokenize(c.content);
    totalLen += tokens.length;
    const tf = termFrequencies(tokens);
    for (const term of tf.keys()) {
      df.set(term, (df.get(term) ?? 0) + 1);
    }
    return { id: c.id, docId: c.doc_id, content: c.content, tokens, tf };
  });

  return {
    chunks: processed.map((p) => ({
      id: p.id,
      docId: p.docId,
      content: p.content,
    })),
    df,
    avgLen: chunks.length > 0 ? totalLen / chunks.length : 0,
  };
}

export function search(
  query: string,
  corpus: BM25Corpus,
  topK = 5
): Array<{ id: number; docId: number; content: string; score: number }> {
  const queryTerms = tokenize(query);
  const N = corpus.chunks.length;

  if (N === 0 || queryTerms.length === 0) return [];

  // Re-tokenize chunks for scoring (lightweight — done at query time)
  const results = corpus.chunks.map((chunk) => {
    const tokens = tokenize(chunk.content);
    const tf = termFrequencies(tokens);
    const docLen = tokens.length;

    let score = 0;
    for (const term of queryTerms) {
      const tfVal = tf.get(term) ?? 0;
      const dfVal = corpus.df.get(term) ?? 0;
      if (dfVal === 0) continue;

      const idf = Math.log((N - dfVal + 0.5) / (dfVal + 0.5) + 1);
      const tfNorm =
        (tfVal * (K1 + 1)) /
        (tfVal + K1 * (1 - B + B * (docLen / corpus.avgLen)));
      score += idf * tfNorm;
    }

    return { ...chunk, score };
  });

  return results
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
