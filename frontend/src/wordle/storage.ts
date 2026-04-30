import AsyncStorage from "@react-native-async-storage/async-storage";

export type WordleProgress = {
  currentLevel: number;                         // Highest unlocked level (1..TOTAL_LEVELS)
  completed: Record<number, { stars: number; attempts: number; word: string }>;
  totalStars: number;
  totalWins: number;
  totalAttempts: number;
  lastPlayed?: number;
};

const KEY = "@wordle/progress/v1";

const DEFAULT: WordleProgress = {
  currentLevel: 1,
  completed: {},
  totalStars: 0,
  totalWins: 0,
  totalAttempts: 0,
};

export async function loadProgress(): Promise<WordleProgress> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT };
    const parsed = JSON.parse(raw) as Partial<WordleProgress>;
    return {
      ...DEFAULT,
      ...parsed,
      completed: parsed.completed || {},
    };
  } catch {
    return { ...DEFAULT };
  }
}

export async function saveProgress(p: WordleProgress): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // ignore
  }
}

export async function resetProgress(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

export async function recordWin(
  level: number,
  attempts: number,
  stars: number,
  word: string,
  maxLevels: number,
): Promise<WordleProgress> {
  const cur = await loadProgress();
  const prev = cur.completed[level];
  const bestStars = Math.max(prev?.stars || 0, stars);
  const bestAttempts = prev ? Math.min(prev.attempts, attempts) : attempts;
  const diffStars = bestStars - (prev?.stars || 0);
  const next: WordleProgress = {
    ...cur,
    completed: {
      ...cur.completed,
      [level]: { stars: bestStars, attempts: bestAttempts, word },
    },
    totalStars: cur.totalStars + Math.max(0, diffStars),
    totalWins: cur.totalWins + (prev ? 0 : 1),
    totalAttempts: cur.totalAttempts + attempts,
    currentLevel: Math.max(cur.currentLevel, Math.min(level + 1, maxLevels)),
    lastPlayed: Date.now(),
  };
  await saveProgress(next);
  return next;
}
