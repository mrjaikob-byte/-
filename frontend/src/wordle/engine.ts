// Core gameplay helpers: normalization, guess evaluation, keyboard layout.

import { DICT_WORDS_4, DICT_WORDS_5, DICT_WORDS_6 } from "./words";

export type TileState = "correct" | "present" | "absent" | "empty" | "filled";

// Normalize Arabic input so player has some flexibility:
// - Variations of alef (أ إ آ ٱ) -> ا
// - Alef maqsura ى -> ي
// - Ta marbuta ة is kept distinct (player must type it)
// - Hamza on ya/waw (ئ ؤ) -> ي / و
// - Standalone hamza ء removed
// - Diacritics stripped
export function normalizeArabic(s: string): string {
  if (!s) return "";
  return s
    .replace(/[\u064B-\u065F\u0670]/g, "") // diacritics / tatweel
    .replace(/\u0640/g, "")                // tatweel
    .replace(/[\u0622\u0623\u0625\u0671]/g, "\u0627") // alef variants -> ا
    .replace(/\u0649/g, "\u064A")          // ى -> ي
    .replace(/\u0624/g, "\u0648")          // ؤ -> و
    .replace(/\u0626/g, "\u064A")          // ئ -> ي
    .replace(/\u0621/g, "")                 // standalone hamza
    .trim();
}

export function toChars(s: string): string[] {
  return Array.from(s);
}

// Evaluate guess letters vs target using classic wordle rules.
// Returns array of states for each letter in `guess`.
export function evaluateGuess(guess: string, target: string): TileState[] {
  const g = toChars(normalizeArabic(guess));
  const t = toChars(normalizeArabic(target));
  const n = g.length;
  const res: TileState[] = new Array(n).fill("absent");
  const used: boolean[] = new Array(t.length).fill(false);

  // First pass: exact matches
  for (let i = 0; i < n; i++) {
    if (g[i] === t[i]) {
      res[i] = "correct";
      used[i] = true;
    }
  }
  // Second pass: present in other position
  for (let i = 0; i < n; i++) {
    if (res[i] === "correct") continue;
    for (let j = 0; j < t.length; j++) {
      if (!used[j] && g[i] === t[j]) {
        res[i] = "present";
        used[j] = true;
        break;
      }
    }
  }
  return res;
}

// Merged per-letter state from history (correct > present > absent)
export function mergeKeyStates(
  history: { guess: string; states: TileState[] }[],
): Record<string, TileState> {
  const map: Record<string, TileState> = {};
  const rank: Record<TileState, number> = {
    empty: 0, filled: 0, absent: 1, present: 2, correct: 3,
  };
  for (const row of history) {
    const chars = toChars(normalizeArabic(row.guess));
    for (let i = 0; i < chars.length; i++) {
      const c = chars[i];
      const cur = map[c];
      const next = row.states[i];
      if (!cur || rank[next] > rank[cur]) map[c] = next;
    }
  }
  return map;
}

// Arabic keyboard layout (iPhone-style: ض top-left, ج top-right).
// Rendered with normal flexDirection: row, so array order = visual left-to-right.
export const KB_ROWS: string[][] = [
  ["ض","ص","ث","ق","ف","غ","ع","ه","خ","ح","ج"],
  ["ش","س","ي","ب","ل","ا","ت","ن","م","ك"],
  ["ذ","د","ظ","ط","ز","و","ر","ة"],
];

export function starsForAttempts(attemptsUsed: number, maxAttempts: number): number {
  // 3 stars: first 2 attempts
  // 2 stars: 3-4 attempts
  // 1 star : 5-6 attempts
  if (attemptsUsed <= 2) return 3;
  if (attemptsUsed <= 4) return 2;
  if (attemptsUsed <= maxAttempts) return 1;
  return 0;
}

// Build dictionary lookups (normalized) for fast O(1) validation.
// Uses the EXTENDED dictionary (answers + common Arabic guesses).
const DICT_4 = new Set(DICT_WORDS_4.map((w) => normalizeArabic(w)));
const DICT_5 = new Set(DICT_WORDS_5.map((w) => normalizeArabic(w)));
const DICT_6 = new Set(DICT_WORDS_6.map((w) => normalizeArabic(w)));

export function isValidWord(word: string, length: number): boolean {
  const norm = normalizeArabic(word);
  const chars = Array.from(norm);
  if (chars.length !== length) return false;
  if (length === 4) return DICT_4.has(norm);
  if (length === 5) return DICT_5.has(norm);
  if (length === 6) return DICT_6.has(norm);
  return false;
}
