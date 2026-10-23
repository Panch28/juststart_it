/**
 * TF-IDF cosine similarity used to surface potentially similar research
 * titles/abstracts for human review.
 *
 * IMPORTANT: this is a screening aid only. A similarity score is NOT evidence
 * of plagiarism or of a lack of patent novelty — it simply helps reviewers
 * prioritise which records to look at.
 */

export interface SimilarDocument {
  id: number;
  code: string;
  title: string;
  description?: string | null;
  status?: string | null;
  similarity: number;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t));
}

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'are', 'was', 'were', 'has', 'have',
  'had', 'not', 'but', 'its', 'his', 'her', 'their', 'our', 'using', 'based', 'into', 'over',
  'via', 'than', 'then', 'they', 'them', 'been', 'will', 'which', 'such', 'also', 'can', 'may',
]);

export function buildTfidf(docs: string[][]): { vectors: Map<string, number>[]; idf: Map<string, number> } {
  const df = new Map<string, number>();
  for (const tokens of docs) {
    for (const term of new Set(tokens)) df.set(term, (df.get(term) ?? 0) + 1);
  }
  const n = docs.length || 1;
  const idf = new Map<string, number>();
  for (const [term, count] of df) idf.set(term, Math.log((n + 1) / (count + 1)) + 1);

  const vectors = docs.map((tokens) => {
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    const vec = new Map<string, number>();
    let norm = 0;
    for (const [term, count] of tf) {
      const w = (1 + Math.log(count)) * (idf.get(term) ?? 1);
      vec.set(term, w);
      norm += w * w;
    }
    norm = Math.sqrt(norm) || 1;
    for (const [term, w] of vec) vec.set(term, w / norm);
    return vec;
  });

  return { vectors, idf };
}

export function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [term, weight] of small) {
    const other = large.get(term);
    if (other) dot += weight * other;
  }
  return dot;
}

/** Returns candidates ranked by similarity to the query document. */
export function findSimilar(
  query: { id: number; code: string; title: string; description?: string | null; status?: string | null },
  candidates: SimilarDocument[],
  threshold = 0.12,
  limit = 5,
): SimilarDocument[] {
  if (!candidates.length) return [];
  const all = [query, ...candidates];
  const tokenized = all.map((d) => tokenize(`${d.title} ${d.description ?? ''}`));
  const { vectors } = buildTfidf(tokenized);
  const qVec = vectors[0];

  const scored = candidates.map((c, i) => ({
    ...c,
    similarity: Number(cosineSimilarity(qVec, vectors[i + 1]).toFixed(3)),
  }));

  return scored
    .filter((s) => s.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}
