import type { EmbeddingProvider } from "@/lib/ai/provider";
import type { DegradationKind } from "@/lib/types/assessment";

/**
 * Semantic similarity between an answer and the questions it might belong to.
 *
 * Two implementations behind one function: real embeddings when the provider
 * offers them, and a local TF-IDF cosine otherwise. The lexical path is not a
 * stub — it is deterministic, needs no network, and is what keeps mapping
 * working when the app runs with no API key at all.
 */

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "if", "of", "to", "in", "on", "for",
  "with", "is", "are", "was", "were", "be", "been", "being", "it", "its",
  "this", "that", "these", "those", "as", "at", "by", "from", "into", "than",
  "then", "there", "here", "which", "who", "whom", "what", "when", "where",
  "why", "how", "all", "any", "both", "each", "some", "such", "no", "not",
  "only", "own", "same", "so", "too", "very", "can", "will", "just", "do",
  "does", "did", "has", "have", "had", "we", "you", "your", "their", "they",
  // Exam-paper boilerplate carries no discriminating signal.
  "explain", "describe", "define", "state", "write", "give", "list", "discuss",
  "following", "briefly", "short", "note", "answer", "question", "marks",
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/* -------------------------------------------------------------------------- */
/*                            Lexical (TF-IDF) path                           */
/* -------------------------------------------------------------------------- */

export type LexicalIndex = {
  vocabulary: Map<string, number>;
  idf: Float64Array;
};

export function buildLexicalIndex(documents: string[]): LexicalIndex {
  const vocabulary = new Map<string, number>();
  const documentFrequency: number[] = [];

  for (const document of documents) {
    const seen = new Set(tokenize(document));
    for (const token of seen) {
      let id = vocabulary.get(token);
      if (id === undefined) {
        id = vocabulary.size;
        vocabulary.set(token, id);
        documentFrequency.push(0);
      }
      documentFrequency[id] += 1;
    }
  }

  const total = Math.max(1, documents.length);
  const idf = new Float64Array(documentFrequency.length);
  for (let i = 0; i < documentFrequency.length; i += 1) {
    idf[i] = Math.log((total + 1) / (documentFrequency[i] + 1)) + 1;
  }

  return { vocabulary, idf };
}

export function lexicalVector(text: string, index: LexicalIndex): number[] {
  const vector = new Array<number>(index.vocabulary.size).fill(0);
  const tokens = tokenize(text);
  if (tokens.length === 0) return vector;

  for (const token of tokens) {
    const id = index.vocabulary.get(token);
    if (id !== undefined) vector[id] += 1;
  }
  for (let i = 0; i < vector.length; i += 1) {
    if (vector[i] > 0) vector[i] = (vector[i] / tokens.length) * index.idf[i];
  }
  return vector;
}

/* -------------------------------------------------------------------------- */
/*                                  Public API                                */
/* -------------------------------------------------------------------------- */

export type SimilarityMatrix = {
  /** similarity[answerIndex][questionIndex], 0..1. */
  scores: number[][];
  method: "embedding" | "lexical";
  /** Set when embeddings were available in principle but could not be used. */
  degradedBecause?: DegradationKind;
};

export async function buildSimilarityMatrix(
  answerTexts: string[],
  questionTexts: string[],
  embeddings: EmbeddingProvider | null,
): Promise<SimilarityMatrix> {
  if (answerTexts.length === 0 || questionTexts.length === 0) {
    return { scores: [], method: "lexical" };
  }

  let degradedBecause: DegradationKind | undefined;

  if (embeddings) {
    const result = await embeddings.embed([...questionTexts, ...answerTexts]);
    if (
      result.ok &&
      result.value.length === questionTexts.length + answerTexts.length
    ) {
      const questionVectors = result.value.slice(0, questionTexts.length);
      const answerVectors = result.value.slice(questionTexts.length);
      const scores = answerVectors.map((answerVector) =>
        questionVectors.map((questionVector) =>
          // Embedding cosine sits in -1..1; rescale so 0 means "unrelated".
          Math.max(0, cosine(answerVector, questionVector)),
        ),
      );
      return { scores, method: "embedding" };
    }
    // Falling back to lexical still produces a real answer, so the run
    // continues — but the reason is carried up so the UI can say why.
    degradedBecause = result.ok ? "unusable_response" : result.kind;
  }

  const index = buildLexicalIndex([...questionTexts, ...answerTexts]);
  const questionVectors = questionTexts.map((text) => lexicalVector(text, index));
  const answerVectors = answerTexts.map((text) => lexicalVector(text, index));
  const scores = answerVectors.map((answerVector) =>
    questionVectors.map((questionVector) => cosine(answerVector, questionVector)),
  );

  return { scores, method: "lexical", degradedBecause };
}
