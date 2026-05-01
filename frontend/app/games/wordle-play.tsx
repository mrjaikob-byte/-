import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  Pressable,
  Dimensions,
  Modal,
  BackHandler,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import {
  KB_ROWS,
  TileState,
  evaluateGuess,
  mergeKeyStates,
  normalizeArabic,
  starsForAttempts,
  toChars,
} from "../../src/wordle/engine";
import { getWordLength, pickRandomWordForLevel } from "../../src/wordle/words";
import { getChapter } from "../../src/wordle/chapters";
import { recordWin } from "../../src/wordle/storage";
import { WorldBackground } from "../../src/wordle/WorldBackground";
import { validateWordStrict } from "../../src/wordle/validator";

const MAX_ATTEMPTS = 6;
const { width: SCREEN_W } = Dimensions.get("window");

type Row = { guess: string; states: TileState[] };

// ================== Tile ==================
function Tile({
  char,
  state,
  index,
  revealing,
}: {
  char: string;
  state: TileState;
  index: number;
  revealing: boolean;
}) {
  const flip = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const [shown, setShown] = useState<TileState>(state);

  useEffect(() => {
    if (revealing && (state === "correct" || state === "present" || state === "absent")) {
      Animated.sequence([
        Animated.delay(index * 180),
        Animated.timing(flip, {
          toValue: 1,
          duration: 240,
          useNativeDriver: true,
          easing: Easing.out(Easing.quad),
        }),
      ]).start(() => {
        setShown(state);
        Animated.timing(flip, {
          toValue: 0,
          duration: 240,
          useNativeDriver: true,
          easing: Easing.out(Easing.quad),
        }).start();
      });
    } else {
      setShown(state);
    }
  }, [state, revealing, index, flip]);

  useEffect(() => {
    if (char) {
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.12, duration: 80, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, friction: 4, useNativeDriver: true }),
      ]).start();
    }
  }, [char, scale]);

  const scaleY = flip.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0.05, 1] });

  const style = tileStyleFor(shown, char);

  return (
    <Animated.View
      style={[
        styles.tile,
        style.box,
        { transform: [{ scale }, { scaleY }] },
      ]}
    >
      <Text style={[styles.tileText, style.text]}>{char || ""}</Text>
    </Animated.View>
  );
}

function tileStyleFor(state: TileState, hasChar: string) {
  switch (state) {
    case "correct":
      return {
        box: { backgroundColor: "#16A34A", borderColor: "#22C55E" },
        text: { color: "#fff" },
      };
    case "present":
      return {
        box: { backgroundColor: "#CA8A04", borderColor: "#EAB308" },
        text: { color: "#fff" },
      };
    case "absent":
      return {
        box: { backgroundColor: "#1E293B", borderColor: "#334155" },
        text: { color: "#94A3B8" },
      };
    case "filled":
      return {
        box: { backgroundColor: "rgba(255,255,255,0.08)", borderColor: "#94A3B8" },
        text: { color: "#fff" },
      };
    default:
      return {
        box: {
          backgroundColor: "rgba(255,255,255,0.04)",
          borderColor: hasChar ? "#94A3B8" : "rgba(148,163,184,0.45)",
        },
        text: { color: "#fff" },
      };
  }
}

// ================== Key ==================
function Key({
  label,
  onPress,
  state,
  wide,
  icon,
  accent,
  disabled,
}: {
  label?: string;
  onPress: () => void;
  state?: TileState;
  wide?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  accent?: string;
  disabled?: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const bg = useMemo(() => {
    if (accent) return accent;
    switch (state) {
      case "correct": return "#16A34A";
      case "present": return "#CA8A04";
      case "absent": return "#0F172A";
      default: return "#334155";
    }
  }, [state, accent]);
  const color = useMemo(() => {
    if (state === "absent") return "#475569";
    return "#fff";
  }, [state]);

  return (
    <Pressable
      testID={`key-${label || icon}`}
      disabled={disabled}
      onPressIn={() => {
        Animated.spring(scale, { toValue: 0.9, useNativeDriver: true, friction: 8 }).start();
        try { Haptics.selectionAsync(); } catch {}
      }}
      onPressOut={() =>
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 5 }).start()
      }
      onPress={onPress}
      style={{ flex: wide ? 1.6 : 1 }}
    >
      <Animated.View
        style={[
          styles.key,
          { backgroundColor: bg, transform: [{ scale }] },
          disabled && { opacity: 0.5 },
        ]}
      >
        {icon ? (
          <Ionicons name={icon} size={18} color={color} />
        ) : (
          <Text style={[styles.keyText, { color }]}>{label}</Text>
        )}
      </Animated.View>
    </Pressable>
  );
}

// ================== Toast ==================
function Toast({ message, visible }: { message: string; visible: boolean }) {
  const op = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(-16)).current;
  const scale = useRef(new Animated.Value(0.85)).current;
  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(op, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.spring(ty, { toValue: 0, useNativeDriver: true, friction: 7 }),
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 7 }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(op, { toValue: 0, duration: 250, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 0.92, duration: 250, useNativeDriver: true }),
      ]).start();
    }
  }, [visible, op, ty, scale]);
  return (
    <Animated.View
      style={[styles.toast, { pointerEvents: "none" as const, opacity: op, transform: [{ translateY: ty }, { scale }] }]}
    >
      <Text style={styles.toastText}>{message}</Text>
    </Animated.View>
  );
}

// ================== Main ==================
export default function WordlePlay() {
  const router = useRouter();
  const { level: levelParam } = useLocalSearchParams<{ level: string }>();
  const level = Math.max(1, Math.min(1000, parseInt(levelParam || "1", 10) || 1));
  const chapter = getChapter(level);
  const wordLen = getWordLength(level);
  // Target word is randomly picked per session/retry
  const [target, setTarget] = useState<string>(() => pickRandomWordForLevel(level));
  const targetChars = useMemo(() => toChars(target), [target]);

  const [rows, setRows] = useState<Row[]>([]);
  const [currentGuess, setCurrentGuess] = useState<string>("");
  const [revealingIndex, setRevealingIndex] = useState<number>(-1); // which row index is revealing
  const [locked, setLocked] = useState<boolean>(false);
  const [toast, setToast] = useState<{ msg: string; visible: boolean }>({ msg: "", visible: false });
  const [modalType, setModalType] = useState<"win" | "loss" | null>(null);
  const [stars, setStars] = useState<number>(0);
  const [hintsUsed, setHintsUsed] = useState<number>(0);
  const [validating, setValidating] = useState<boolean>(false);
  const shakeX = useRef(new Animated.Value(0)).current;

  // Reset game state whenever level changes (important for router.replace to another level).
  // Also picks a fresh random word for the new level.
  useEffect(() => {
    setTarget(pickRandomWordForLevel(level));
    setRows([]);
    setCurrentGuess("");
    setRevealingIndex(-1);
    setLocked(false);
    setStars(0);
    setHintsUsed(0);
    setModalType(null);
  }, [level]);

  // Lives / hints - player can reveal a correct letter (cost: 1 attempt effectively)
  const canHint = hintsUsed < 2 && rows.length < MAX_ATTEMPTS - 1 && !locked;

  const currentChars = useMemo(() => toChars(normalizeArabic(currentGuess)), [currentGuess]);
  const keyStates = useMemo(() => mergeKeyStates(rows), [rows]);

  const showToast = useCallback((msg: string, duration: number = 1800) => {
    setToast({ msg, visible: true });
    setTimeout(() => setToast((t) => ({ ...t, visible: false })), duration);
  }, []);

  const shake = useCallback(() => {
    Animated.sequence([
      Animated.timing(shakeX, { toValue: 8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: -8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: 6, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: -6, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
  }, [shakeX]);

  // Handle Android hardware back
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (modalType) { setModalType(null); return true; }
      return false;
    });
    return () => sub.remove();
  }, [modalType]);

  const handleKey = useCallback(
    (letter: string) => {
      if (locked) return;
      if (currentChars.length >= wordLen) return;
      setCurrentGuess((prev) => prev + letter);
    },
    [locked, currentChars.length, wordLen],
  );

  const handleBackspace = useCallback(() => {
    if (locked) return;
    setCurrentGuess((prev) => {
      const chars = toChars(normalizeArabic(prev));
      chars.pop();
      return chars.join("");
    });
  }, [locked]);

  const finishGame = useCallback(
    async (won: boolean, finalRows: Row[]) => {
      setLocked(true);
      if (won) {
        const attempts = finalRows.length;
        const s = starsForAttempts(attempts, MAX_ATTEMPTS);
        setStars(s);
        await recordWin(level, attempts, s, target, 1000);
        try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      } else {
        try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
      }
      setTimeout(() => setModalType(won ? "win" : "loss"), 900);
    },
    [level, target],
  );

  const handleEnter = useCallback(async () => {
    if (locked || validating) return;
    if (currentChars.length !== wordLen) {
      showToast(`الكلمة يجب أن تكون ${wordLen} أحرف`, 1800);
      shake();
      return;
    }
    const guess = currentChars.join("");

    // Strict validation: length + Arabic-only + LLM dictionary check (cached).
    setValidating(true);
    showToast("جاري التحقق من الكلمة…", 8000);
    const result = await validateWordStrict(guess, wordLen);
    setValidating(false);
    // Hide the "checking" toast immediately
    setToast({ msg: "", visible: false });

    if (!result.valid) {
      const msg =
        result.source === "length"
          ? `الكلمة يجب أن تكون ${wordLen} أحرف`
          : result.source === "chars"
          ? "يجب استخدام أحرف عربية فقط"
          : result.source === "garbage"
          ? "هذه ليست كلمة عربية"
          : "الكلمة غير موجودة في القاموس العربي";
      showToast(msg, 2200);
      shake();
      return;
    }

    const states = evaluateGuess(guess, target);
    const newRow: Row = { guess, states };
    const newRows = [...rows, newRow];
    setRows(newRows);
    setCurrentGuess("");
    setRevealingIndex(newRows.length - 1);

    const won = states.every((s) => s === "correct");
    const done = won || newRows.length >= MAX_ATTEMPTS;

    if (done) {
      // Wait for flip animation to complete before modal
      setTimeout(() => finishGame(won, newRows), 180 * wordLen + 300);
    }
  }, [locked, validating, currentChars, wordLen, target, rows, showToast, shake, finishGame]);

  const handleHint = useCallback(() => {
    if (!canHint) return;
    // Find a target char that hasn't been revealed yet in any row's correct state,
    // and reveal it by placing it in the currentGuess at the correct position (if empty there).
    const correctRevealed = new Set<number>();
    for (const r of rows) {
      for (let i = 0; i < r.states.length; i++) {
        if (r.states[i] === "correct") correctRevealed.add(i);
      }
    }
    const candidates: number[] = [];
    for (let i = 0; i < targetChars.length; i++) {
      if (!correctRevealed.has(i)) candidates.push(i);
    }
    if (candidates.length === 0) return;
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    const letter = targetChars[pick];
    setHintsUsed((h) => h + 1);
    showToast(`الحرف رقم ${pick + 1} هو   «${letter}»`, 3500);
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
  }, [canHint, rows, targetChars, showToast]);

  const gridWidth = Math.min(SCREEN_W - 32, 400);
  const tileSize = Math.min(
    Math.floor((gridWidth - (wordLen - 1) * 10) / wordLen),
    78,
  );

  // Header progress
  const solved = rows.length > 0 && rows[rows.length - 1].states.every((s) => s === "correct");
  const attemptsLeft = Math.max(0, MAX_ATTEMPTS - rows.length - (solved ? 0 : 0));

  return (
    <View style={[styles.root, { backgroundColor: chapter.bg }]} testID="wordle-play-root">
      {/* Animated chapter background */}
      <WorldBackground chapter={chapter} height={Dimensions.get("window").height} />
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            testID="back-btn"
            onPress={() => router.back()}
            style={[styles.iconBtn, { backgroundColor: "rgba(255,255,255,0.08)" }]}
          >
            <Ionicons name="arrow-forward" size={20} color="#fff" />
          </Pressable>
          <View style={styles.headerCenter}>
            <View style={[styles.chapterPill, { backgroundColor: chapter.color + "26", borderColor: chapter.color + "66" }]}>
              <Ionicons name={chapter.icon} size={12} color={chapter.color2} />
              <Text style={[styles.chapterName, { color: chapter.color2 }]}>{chapter.name}</Text>
            </View>
            <Text style={styles.levelBig}>المرحلة {level}</Text>
          </View>
          <Pressable
            testID="hint-btn"
            disabled={!canHint}
            onPress={handleHint}
            style={[
              styles.iconBtn,
              { backgroundColor: canHint ? "#FBBF2422" : "rgba(255,255,255,0.05)", borderColor: canHint ? "#FBBF24" : "transparent", borderWidth: 1 },
            ]}
          >
            <Ionicons name="bulb" size={18} color={canHint ? "#FBBF24" : "#475569"} />
            <Text style={[styles.hintCount, { color: canHint ? "#FBBF24" : "#475569" }]}>{2 - hintsUsed}</Text>
          </Pressable>
        </View>

        {/* Attempts dots */}
        <View style={styles.attemptsRow}>
          {Array.from({ length: MAX_ATTEMPTS }).map((_, i) => {
            const done = i < rows.length;
            const row = done ? rows[i] : null;
            const win = row && row.states.every((s) => s === "correct");
            return (
              <View
                key={i}
                style={[
                  styles.attemptDot,
                  done
                    ? win
                      ? { backgroundColor: "#16A34A" }
                      : { backgroundColor: "#64748B" }
                    : { backgroundColor: "rgba(255,255,255,0.12)" },
                ]}
              />
            );
          })}
        </View>

        <View style={styles.body}>
          {/* Grid */}
          <Animated.View style={[styles.grid, { width: gridWidth, transform: [{ translateX: shakeX }] }]}>
            {Array.from({ length: MAX_ATTEMPTS }).map((_, rIdx) => {
              const isCurrent = rIdx === rows.length && !locked;
              const row = rows[rIdx];
              return (
                <View key={rIdx} style={styles.row}>
                  {Array.from({ length: wordLen }).map((_, cIdx) => {
                    let char = "";
                    let state: TileState = "empty";
                    if (row) {
                      char = toChars(row.guess)[cIdx] || "";
                      state = row.states[cIdx];
                    } else if (isCurrent) {
                      char = currentChars[cIdx] || "";
                      state = char ? "filled" : "empty";
                    }
                    return (
                      <View key={cIdx} style={{ width: tileSize, height: tileSize }}>
                        <Tile
                          char={char}
                          state={state}
                          index={cIdx}
                          revealing={row != null && rIdx === revealingIndex}
                        />
                      </View>
                    );
                  })}
                </View>
              );
            })}
          </Animated.View>

          <Toast message={toast.msg} visible={toast.visible} />
        </View>

        {/* Keyboard - standard Arabic layout (ض top-left like iPhone) */}
        <View style={styles.kb}>
          {KB_ROWS.map((r, i) => (
            <View key={i} style={styles.kbRow}>
              {i === 2 && (
                <Key
                  icon="backspace"
                  onPress={handleBackspace}
                  wide
                  accent="#DC2626"
                  disabled={locked}
                />
              )}
              {r.map((ch) => (
                <Key key={ch} label={ch} onPress={() => handleKey(ch)} state={keyStates[ch]} disabled={locked} />
              ))}
              {i === 2 && (
                <Key
                  icon="return-down-back"
                  onPress={handleEnter}
                  wide
                  accent="#2563EB"
                  disabled={locked || validating}
                />
              )}
            </View>
          ))}
        </View>
      </SafeAreaView>

      {/* Result Modal */}
      <Modal visible={modalType !== null} transparent animationType="fade" onRequestClose={() => setModalType(null)}>
        <View style={styles.modalBackdrop}>
          <ResultCard
            type={modalType}
            level={level}
            target={target}
            stars={stars}
            chapter={chapter}
            onNext={() => {
              setModalType(null);
              if (level < 1000) {
                router.replace({ pathname: "/games/wordle-play", params: { level: String(level + 1) } } as never);
              } else {
                router.replace("/games/wordle" as never);
              }
            }}
            onRetry={() => {
              // Pick a new random word DIFFERENT from the previous target
              setTarget(pickRandomWordForLevel(level, target));
              setRows([]);
              setCurrentGuess("");
              setLocked(false);
              setStars(0);
              setHintsUsed(0);
              setRevealingIndex(-1);
              setModalType(null);
            }}
            onHome={() => {
              setModalType(null);
              router.replace("/games/wordle" as never);
            }}
          />
        </View>
      </Modal>
    </View>
  );
}

// ================== Result card ==================
function ResultCard({
  type,
  level,
  target,
  stars,
  chapter,
  onNext,
  onRetry,
  onHome,
}: {
  type: "win" | "loss" | null;
  level: number;
  target: string;
  stars: number;
  chapter: ReturnType<typeof getChapter>;
  onNext: () => void;
  onRetry: () => void;
  onHome: () => void;
}) {
  const scale = useRef(new Animated.Value(0.7)).current;
  const s1 = useRef(new Animated.Value(0)).current;
  const s2 = useRef(new Animated.Value(0)).current;
  const s3 = useRef(new Animated.Value(0)).current;
  const confettiSpin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!type) return;
    Animated.spring(scale, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }).start();
    if (type === "win") {
      Animated.stagger(220, [
        Animated.spring(s1, { toValue: stars >= 1 ? 1 : 0, friction: 4, useNativeDriver: true }),
        Animated.spring(s2, { toValue: stars >= 2 ? 1 : 0, friction: 4, useNativeDriver: true }),
        Animated.spring(s3, { toValue: stars >= 3 ? 1 : 0, friction: 4, useNativeDriver: true }),
      ]).start();
      Animated.loop(
        Animated.timing(confettiSpin, { toValue: 1, duration: 3000, easing: Easing.linear, useNativeDriver: true }),
      ).start();
    }
  }, [type, stars, scale, s1, s2, s3, confettiSpin]);

  if (!type) return null;

  return (
    <Animated.View style={[styles.modalCard, { transform: [{ scale }] }]}>
      <View style={[styles.modalRibbon, { backgroundColor: type === "win" ? chapter.color : "#DC2626" }]} />
      <View style={[styles.modalIconWrap, { backgroundColor: type === "win" ? chapter.color + "26" : "#DC262626", borderColor: type === "win" ? chapter.color : "#DC2626" }]}>
        <Animated.View style={{ transform: [{ rotate: confettiSpin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }) }] }}>
          <Ionicons
            name={type === "win" ? "trophy" : "close-circle"}
            size={48}
            color={type === "win" ? chapter.color2 : "#F87171"}
          />
        </Animated.View>
      </View>

      <Text style={styles.modalTitle}>{type === "win" ? "أحسنت! 🎉" : "حاول مجدداً"}</Text>
      <Text style={styles.modalSub}>
        {type === "win" ? `أنهيت المرحلة ${level}` : `الكلمة كانت: ${target}`}
      </Text>

      {type === "win" && (
        <View style={styles.starsRow}>
          {[s1, s2, s3].map((a, i) => (
            <Animated.View
              key={i}
              style={{ transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }, { rotate: a.interpolate({ inputRange: [0, 1], outputRange: ["-40deg", "0deg"] }) }], opacity: a }}
            >
              <Ionicons name="star" size={44} color="#FBBF24" />
            </Animated.View>
          ))}
        </View>
      )}

      {type === "win" && (
        <View style={styles.wordReveal}>
          <Text style={styles.wordRevealLabel}>الكلمة</Text>
          <Text style={styles.wordRevealText}>{target}</Text>
        </View>
      )}

      <View style={styles.modalButtons}>
        {type === "win" ? (
          <>
            <Pressable testID="modal-home" style={[styles.modalBtn, styles.modalBtnGhost]} onPress={onHome}>
              <Ionicons name="map" size={16} color="#fff" />
              <Text style={styles.modalBtnGhostText}>الخريطة</Text>
            </Pressable>
            <Pressable
              testID="modal-next"
              style={[styles.modalBtn, { backgroundColor: chapter.color }]}
              onPress={onNext}
            >
              <Text style={styles.modalBtnText}>التالي</Text>
              <Ionicons name="arrow-back" size={16} color="#fff" />
            </Pressable>
          </>
        ) : (
          <>
            <Pressable testID="modal-home" style={[styles.modalBtn, styles.modalBtnGhost]} onPress={onHome}>
              <Ionicons name="map" size={16} color="#fff" />
              <Text style={styles.modalBtnGhostText}>الخريطة</Text>
            </Pressable>
            <Pressable
              testID="modal-retry"
              style={[styles.modalBtn, { backgroundColor: "#DC2626" }]}
              onPress={onRetry}
            >
              <Text style={styles.modalBtnText}>إعادة المحاولة</Text>
              <Ionicons name="refresh" size={16} color="#fff" />
            </Pressable>
          </>
        )}
      </View>
    </Animated.View>
  );
}

// ================== Styles ==================
const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 6,
  },
  iconBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    minWidth: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: "center",
  },
  hintCount: { fontWeight: "900", fontSize: 12, marginStart: 2 },
  headerCenter: { alignItems: "center", gap: 4 },
  chapterPill: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 100,
    borderWidth: 1,
  },
  chapterName: { fontSize: 11, fontWeight: "900" },
  levelBig: { color: "#fff", fontSize: 18, fontWeight: "900", letterSpacing: -0.3 },
  attemptsRow: {
    flexDirection: "row-reverse",
    alignSelf: "center",
    gap: 6,
    marginTop: 6,
    marginBottom: 8,
  },
  attemptDot: { width: 22, height: 4, borderRadius: 2 },
  body: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  grid: { gap: 10, alignSelf: "center" },
  row: { flexDirection: "row-reverse", gap: 10, justifyContent: "center" },
  tile: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  tileText: { fontSize: 30, fontWeight: "900" },
  kb: { paddingHorizontal: 4, paddingTop: 6, paddingBottom: 8, gap: 7 },
  kbRow: { flexDirection: "row", gap: 4, justifyContent: "center" },
  key: {
    height: 50,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  keyText: { fontSize: 19, fontWeight: "900" },
  toast: {
    position: "absolute",
    top: 14,
    backgroundColor: "rgba(2, 6, 23, 0.95)",
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: 100,
    borderWidth: 1.5,
    borderColor: "rgba(251, 191, 36, 0.55)",
  },
  toastText: { color: "#fff", fontWeight: "900", fontSize: 16, textAlign: "center" },
  // Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "#0F172A",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingVertical: 22,
    paddingHorizontal: 20,
    alignItems: "center",
    overflow: "hidden",
  },
  modalRibbon: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 6,
  },
  modalIconWrap: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    marginTop: 4,
    marginBottom: 12,
  },
  modalTitle: { color: "#fff", fontSize: 22, fontWeight: "900" },
  modalSub: { color: "#94A3B8", fontSize: 13, fontWeight: "700", marginTop: 4, textAlign: "center" },
  starsRow: { flexDirection: "row-reverse", gap: 16, marginTop: 16 },
  wordReveal: {
    marginTop: 16,
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
  },
  wordRevealLabel: { color: "#64748B", fontSize: 11, fontWeight: "800" },
  wordRevealText: { color: "#fff", fontSize: 22, fontWeight: "900", letterSpacing: 2, marginTop: 2 },
  modalButtons: { flexDirection: "row-reverse", gap: 10, marginTop: 22, width: "100%" },
  modalBtn: {
    flex: 1,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    borderRadius: 14,
  },
  modalBtnText: { color: "#fff", fontWeight: "900", fontSize: 14 },
  modalBtnGhost: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  modalBtnGhostText: { color: "#fff", fontWeight: "900", fontSize: 14 },
});
