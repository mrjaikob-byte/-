// Client-side Arabic word validator with local cache + backend LLM validation.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { normalizeArabic } from "./engine";

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || "";
// v4: ء now allowed + ة ↔ ه equivalence
const CACHE_KEY = "wordle:dict-cache-v4";

// Allowed Arabic base letters (must match keyboard).
const ALLOWED = new Set(Array.from("ابتثجحخدذرزسشصضطظعغفقكلمنهويةء"));

type CacheMap = Record<string, boolean>;
let memCache: CacheMap | null = null;

async function loadCache(): Promise<CacheMap> {
  if (memCache) return memCache;
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    memCache = raw ? JSON.parse(raw) : {};
  } catch {
    memCache = {};
  }
  return memCache!;
}

async function saveCache() {
  if (!memCache) return;
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(memCache));
  } catch {}
}

function normKey(w: string): string {
  // Same normalisation the backend does (roughly) - for cache key only.
  return normalizeArabic(w).replace(/ة/g, "ه");
}

function isObviousGarbage(w: string): boolean {
  if (!w) return true;
  const chars = Array.from(w);
  if (new Set(chars).size === 1) return true; // all same letter
  // more than 60% same letter
  const counts = new Map<string, number>();
  for (const c of chars) counts.set(c, (counts.get(c) || 0) + 1);
  let max = 0;
  for (const v of counts.values()) if (v > max) max = v;
  if (chars.length >= 4 && max / chars.length > 0.6) return true;
  return false;
}

function isPureArabic(w: string): boolean {
  const chars = Array.from(w);
  if (chars.length === 0) return false;
  for (const c of chars) if (!ALLOWED.has(c)) return false;
  return true;
}

export type ValidationResult = {
  valid: boolean;
  source: "length" | "chars" | "garbage" | "cache" | "llm" | "offline";
};

/**
 * Strict validation: length check + Arabic-only check + backend LLM check (cached).
 * Returns a result indicating validity and where the decision came from.
 */
export async function validateWordStrict(
  word: string,
  expectedLength: number,
): Promise<ValidationResult> {
  const norm = normalizeArabic(word);
  if (Array.from(norm).length !== expectedLength) {
    return { valid: false, source: "length" };
  }
  if (!isPureArabic(norm)) {
    return { valid: false, source: "chars" };
  }
  if (isObviousGarbage(norm)) {
    return { valid: false, source: "garbage" };
  }

  const key = normKey(word);
  const cache = await loadCache();
  if (key in cache) {
    return { valid: cache[key], source: "cache" };
  }

  // Call backend
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);
    const res = await fetch(`${BACKEND_URL}/api/wordle/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`status ${res.status}`);
    const data = (await res.json()) as { valid: boolean };
    cache[key] = !!data.valid;
    memCache = cache;
    saveCache();
    return { valid: !!data.valid, source: "llm" };
  } catch (e) {
    // Graceful: don't block the player if backend unreachable
    return { valid: true, source: "offline" };
  }
}

export async function warmCacheWith(
  pairs: Array<{ word: string; valid: boolean }>,
) {
  const cache = await loadCache();
  let changed = false;
  for (const p of pairs) {
    const k = normKey(p.word);
    if (cache[k] !== p.valid) {
      cache[k] = p.valid;
      changed = true;
    }
  }
  if (changed) {
    memCache = cache;
    saveCache();
  }
}
