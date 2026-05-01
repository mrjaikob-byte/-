// Core gameplay helpers: normalization, guess evaluation, keyboard layout.

export type TileState = "correct" | "present" | "absent" | "empty" | "filled";

// Normalize Arabic input so player has some flexibility:
// - Variations of alef (أ إ آ ٱ) -> ا
// - Alef maqsura ى -> ي
// - Hamza on ya/waw (ئ ؤ) -> ي / و
// - Standalone hamza ء is KEPT (many real words end with ء like سماء, ضوء, بناء)
// - Ta marbuta ة -> ه (treated as equivalent in casual Arabic typing)
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
    .replace(/\u0629/g, "\u0647")          // ة -> ه
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
  ["ذ","د","ظ","ط","ز","و","ر","ة","ء"],
];

/**
 * Compute star rating:
 * - Solved on attempts 1–5: 3 stars
 * - Solved on attempt 6 (last chance): 2 stars
 * - Using any hint subtracts 1 star (minimum 1 star if solved)
 * - Not solved: 0 stars
 */
export function computeStars(
  attemptsUsed: number,
  maxAttempts: number,
  hintsUsed: number,
  solved: boolean,
): number {
  if (!solved) return 0;
  let base = attemptsUsed >= maxAttempts ? 2 : 3;
  if (hintsUsed > 0) base -= 1;
  if (base < 1) base = 1;
  return base;
}

// Legacy helper kept for compatibility (no hints considered).
export function starsForAttempts(attemptsUsed: number, maxAttempts: number): number {
  return computeStars(attemptsUsed, maxAttempts, 0, true);
}

// Build allowed-letter set for input validation.
const ALLOWED_LETTERS = new Set(Array.from("ابتثجحخدذرزسشصضطظعغفقكلمنهويةء"));

/**
 * Quick local check: word has the right length and uses only allowed Arabic letters.
 * Strict dictionary validation happens via the backend (validator.ts).
 */
export function isValidWord(word: string, length: number): boolean {
  const norm = normalizeArabic(word);
  const chars = Array.from(norm);
  if (chars.length !== length) return false;
  for (const c of chars) {
    if (!ALLOWED_LETTERS.has(c)) return false;
  }
  return true;
}
