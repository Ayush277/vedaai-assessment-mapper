/**
 * Language models wrap JSON in prose, fences, or trailing commentary no matter
 * how firmly the prompt asks otherwise. These helpers recover the payload
 * instead of failing the whole run on a stray backtick.
 */

function stripFences(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : text).trim();
}

/** Extract the first balanced JSON object or array from arbitrary text. */
export function extractJson(text: string): unknown | null {
  const cleaned = stripFences(text);
  if (!cleaned) return null;

  try {
    return JSON.parse(cleaned);
  } catch {
    /* fall through to bracket scanning */
  }

  // Scan from whichever bracket appears first: a model that wraps its object
  // in prose often mentions an inner array before the object's own brace.
  const openers = (["{", "["] as const)
    .map((opener) => ({ opener, index: cleaned.indexOf(opener) }))
    .filter((entry) => entry.index !== -1)
    .sort((a, b) => a.index - b.index);

  for (const { opener, index: start } of openers) {
    const closer = opener === "[" ? "]" : "}";
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < cleaned.length; i += 1) {
      const char = cleaned[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (char === opener) depth += 1;
      else if (char === closer) {
        depth -= 1;
        if (depth === 0) {
          try {
            return JSON.parse(cleaned.slice(start, i + 1));
          } catch {
            break;
          }
        }
      }
    }
  }

  return null;
}

export function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    for (const candidate of Object.values(value as Record<string, unknown>)) {
      if (Array.isArray(candidate)) return candidate;
    }
  }
  return [];
}

export function asString(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

export function asNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : fallback;
}

export function asBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true";
  return fallback;
}

/** Clamp a model-reported confidence into 0..1, tolerating 0-100 scales. */
export function asConfidence(value: unknown, fallback = 0.5): number {
  const raw = asNumber(value, fallback);
  const scaled = raw > 1 ? raw / 100 : raw;
  return Math.min(1, Math.max(0, scaled));
}
