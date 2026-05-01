import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
  Animated,
  Easing,
  Alert,
  FlatList,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { CHAPTERS, Chapter, TOTAL_LEVELS, getChapter } from "../../src/wordle/chapters";
import { loadProgress, resetProgress, WordleProgress } from "../../src/wordle/storage";
import { WorldBackground } from "../../src/wordle/WorldBackground";

const { width: SCREEN_W } = Dimensions.get("window");
const LEVEL_SIZE = 62;
const ROW_HEIGHT = 92;

// Sin-wave positioning for zigzag
function posXForIndex(indexInChapter: number): number {
  const centerX = SCREEN_W / 2;
  const amp = SCREEN_W * 0.28;
  return centerX + Math.sin(indexInChapter * 0.8) * amp - LEVEL_SIZE / 2;
}

// ================== Level bubble ==================
function LevelBubble({
  level,
  chapter,
  stars,
  unlocked,
  current,
  onPress,
}: {
  level: number;
  chapter: Chapter;
  stars: number;
  unlocked: boolean;
  current: boolean;
  onPress: () => void;
}) {
  const pulse = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (current) {
      const l = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true, easing: Easing.inOut(Easing.quad) }),
          Animated.timing(pulse, { toValue: 0, duration: 900, useNativeDriver: true, easing: Easing.inOut(Easing.quad) }),
        ])
      );
      l.start();
      return () => l.stop();
    }
  }, [current, pulse]);

  const bg = unlocked ? chapter.color : "#1E293B";
  const bg2 = unlocked ? chapter.color2 : "#334155";

  return (
    <View style={{ alignItems: "center" }}>
      {/* Pulse ring */}
      {current && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.pulseRing,
            {
              borderColor: chapter.color2,
              opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }),
              transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] }) }],
              width: LEVEL_SIZE, height: LEVEL_SIZE, borderRadius: LEVEL_SIZE / 2,
            },
          ]}
        />
      )}
      <Pressable
        testID={`level-${level}`}
        disabled={!unlocked}
        onPress={onPress}
        onPressIn={() =>
          unlocked && Animated.spring(scale, { toValue: 0.9, useNativeDriver: true, friction: 7 }).start()
        }
        onPressOut={() =>
          unlocked && Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 4 }).start()
        }
      >
        <Animated.View
          style={[
            styles.levelOuter,
            {
              width: LEVEL_SIZE,
              height: LEVEL_SIZE,
              borderRadius: LEVEL_SIZE / 2,
              backgroundColor: bg2,
              transform: [{ scale }],
            },
          ]}
        >
          <View
            style={[
              styles.levelInner,
              {
                backgroundColor: bg,
                width: LEVEL_SIZE - 8,
                height: LEVEL_SIZE - 8,
                borderRadius: (LEVEL_SIZE - 8) / 2,
              },
            ]}
          >
            {!unlocked ? (
              <Ionicons name="lock-closed" size={22} color="#64748B" />
            ) : (
              <Text style={styles.levelNum}>{level}</Text>
            )}
          </View>
        </Animated.View>
      </Pressable>

      {/* Stars */}
      {unlocked && stars > 0 && (
        <View style={styles.starsWrap}>
          <Ionicons name={stars >= 1 ? "star" : "star-outline"} size={11} color="#FBBF24" />
          <Ionicons name={stars >= 2 ? "star" : "star-outline"} size={13} color="#FBBF24" />
          <Ionicons name={stars >= 3 ? "star" : "star-outline"} size={11} color="#FBBF24" />
        </View>
      )}
      {unlocked && stars === 0 && current && (
        <View style={styles.playTag}>
          <Text style={styles.playTagText}>العب</Text>
        </View>
      )}
    </View>
  );
}

// ================== Decorative path dots between two positions ==================
function PathDots({ fromX, fromY, toX, toY, color }: { fromX: number; fromY: number; toX: number; toY: number; color: string }) {
  const dots = 4;
  const items = [];
  for (let i = 1; i <= dots; i++) {
    const t = i / (dots + 1);
    const x = fromX + (toX - fromX) * t;
    const y = fromY + (toY - fromY) * t;
    items.push(
      <View
        key={i}
        style={[
          styles.pathDot,
          { left: x, top: y, backgroundColor: color + "66" },
        ]}
      />
    );
  }
  return <>{items}</>;
}

// ================== Chapter section ==================
function ChapterSection({
  chapter,
  currentLevel,
  progress,
  onLevelPress,
}: {
  chapter: Chapter;
  currentLevel: number;
  progress: WordleProgress;
  onLevelPress: (l: number) => void;
}) {
  const count = chapter.to - chapter.from + 1;
  const sectionHeight = count * ROW_HEIGHT + 60;

  const levels = useMemo(() => {
    const arr: { level: number; x: number; y: number }[] = [];
    for (let i = 0; i < count; i++) {
      const level = chapter.from + i;
      const x = posXForIndex(i) + LEVEL_SIZE / 2;
      const y = i * ROW_HEIGHT + 50;
      arr.push({ level, x: x - LEVEL_SIZE / 2, y });
    }
    return arr;
  }, [chapter, count]);

  // Total stars in chapter
  const earnedStars = useMemo(() => {
    let s = 0;
    for (let l = chapter.from; l <= chapter.to; l++) {
      s += progress.completed[l]?.stars || 0;
    }
    return s;
  }, [progress, chapter]);
  const maxStars = count * 3;

  return (
    <View style={[styles.chapter, { backgroundColor: chapter.bg }]}>
      {/* Animated world background */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <WorldBackground chapter={chapter} height={sectionHeight + 80} />
      </View>

      {/* Chapter header */}
      <View style={styles.chapterHeader}>
        <View style={[styles.chapterBanner, { backgroundColor: chapter.color + "22", borderColor: chapter.color }]}>
          <Text style={styles.chapterEmoji}>{chapter.emoji}</Text>
          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={[styles.chapterName, { color: chapter.color2 }]}>{chapter.name}</Text>
            <Text style={styles.chapterSub}>{chapter.subtitle} • مراحل {chapter.from}–{chapter.to}</Text>
          </View>
          <View style={styles.chapterStars}>
            <Ionicons name="star" size={14} color="#FBBF24" />
            <Text style={styles.chapterStarsText}>{earnedStars}/{maxStars}</Text>
          </View>
        </View>
      </View>

      {/* Path area */}
      <View style={{ height: sectionHeight, position: "relative" }}>
        {/* Path dots between levels */}
        {levels.map((lvl, i) => {
          if (i === levels.length - 1) return null;
          const next = levels[i + 1];
          const fromX = lvl.x + LEVEL_SIZE / 2 - 3;
          const fromY = lvl.y + LEVEL_SIZE / 2 - 3;
          const toX = next.x + LEVEL_SIZE / 2 - 3;
          const toY = next.y + LEVEL_SIZE / 2 - 3;
          return (
            <PathDots
              key={`p-${lvl.level}`}
              fromX={fromX}
              fromY={fromY}
              toX={toX}
              toY={toY}
              color={chapter.color}
            />
          );
        })}

        {/* Level bubbles */}
        {levels.map(({ level, x, y }) => {
          const unlocked = level <= currentLevel;
          const completed = progress.completed[level];
          const stars = completed?.stars || 0;
          return (
            <View key={level} style={{ position: "absolute", left: x, top: y }}>
              <LevelBubble
                level={level}
                chapter={chapter}
                stars={stars}
                unlocked={unlocked}
                current={level === currentLevel && !completed}
                onPress={() => onLevelPress(level)}
              />
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ================== Main map screen ==================
export default function WordleMap() {
  const router = useRouter();
  const [progress, setProgress] = useState<WordleProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const listRef = useRef<FlatList<Chapter>>(null);
  const headerTy = useRef(new Animated.Value(-30)).current;

  const reload = useCallback(async () => {
    const p = await loadProgress();
    setProgress(p);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  useEffect(() => {
    Animated.spring(headerTy, { toValue: 0, useNativeDriver: true, friction: 7 }).start();
  }, [headerTy]);

  // Auto-scroll to current chapter on first load
  useEffect(() => {
    if (progress && listRef.current) {
      const curChapter = getChapter(progress.currentLevel);
      const idx = CHAPTERS.findIndex((c) => c.id === curChapter.id);
      if (idx > 0) {
        setTimeout(() => {
          try {
            listRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0 });
          } catch {}
        }, 500);
      }
    }
  }, [progress?.currentLevel, progress]);

  const handleLevelPress = useCallback(
    (level: number) => {
      router.push({ pathname: "/games/wordle-play", params: { level: String(level) } } as never);
    },
    [router]
  );

  const handleReset = useCallback(() => {
    Alert.alert(
      "تأكيد إعادة التعيين",
      "هل أنت متأكد من حذف كل تقدمك؟ لا يمكن التراجع.",
      [
        { text: "إلغاء", style: "cancel" },
        {
          text: "حذف الكل",
          style: "destructive",
          onPress: async () => {
            await resetProgress();
            await reload();
          },
        },
      ]
    );
  }, [reload]);

  if (loading || !progress) {
    return (
      <View style={[styles.root, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color="#FBBF24" />
      </View>
    );
  }

  const stats = {
    stars: progress.totalStars,
    wins: progress.totalWins,
    current: progress.currentLevel,
  };

  return (
    <View style={styles.root} testID="wordle-map-root">
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <Animated.View style={[styles.topBar, { transform: [{ translateY: headerTy }] }]}>
          <Pressable
            testID="back-btn"
            onPress={() => router.back()}
            style={styles.topIconBtn}
          >
            <Ionicons name="arrow-forward" size={20} color="#fff" />
          </Pressable>

          <View style={styles.titleBlock}>
            <Text style={styles.title}>تخمين الكلمة</Text>
            <Text style={styles.subtitle}>رحلة الكلمات الذهبية</Text>
          </View>

          <Pressable
            testID="reset-btn"
            onPress={handleReset}
            style={styles.topIconBtn}
          >
            <Ionicons name="refresh" size={18} color="#fff" />
          </Pressable>
        </Animated.View>

        <View style={styles.statsRow}>
          <View style={[styles.statCard, { borderColor: "#FBBF24" + "55" }]}>
            <Ionicons name="star" size={16} color="#FBBF24" />
            <Text style={styles.statValue}>{stats.stars}</Text>
            <Text style={styles.statLabel}>نجوم</Text>
          </View>
          <View style={[styles.statCard, { borderColor: "#10B981" + "55" }]}>
            <Ionicons name="trophy" size={16} color="#10B981" />
            <Text style={styles.statValue}>{stats.wins}</Text>
            <Text style={styles.statLabel}>مراحل مكتملة</Text>
          </View>
          <View style={[styles.statCard, { borderColor: "#EC4899" + "55" }]}>
            <Ionicons name="flag" size={16} color="#EC4899" />
            <Text style={styles.statValue}>{stats.current}</Text>
            <Text style={styles.statLabel}>المرحلة الحالية</Text>
          </View>
        </View>

        {/* Continue quick button */}
        <Pressable
          testID="continue-btn"
          style={styles.continueBtn}
          onPress={() => handleLevelPress(progress.currentLevel)}
        >
          <View style={styles.continueLeft}>
            <Ionicons name="play-circle" size={26} color="#fff" />
            <View>
              <Text style={styles.continueTitle}>متابعة اللعب</Text>
              <Text style={styles.continueSub}>المرحلة {progress.currentLevel} من {TOTAL_LEVELS}</Text>
            </View>
          </View>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </Pressable>

        <FlatList
          ref={listRef}
          data={CHAPTERS}
          keyExtractor={(c) => String(c.id)}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <ChapterSection
              chapter={item}
              currentLevel={progress.currentLevel}
              progress={progress}
              onLevelPress={handleLevelPress}
            />
          )}
          getItemLayout={(_, index) => {
            // Rough estimate; ok because we only auto-scroll once
            const heights = CHAPTERS.map((c) => (c.to - c.from + 1) * ROW_HEIGHT + 120);
            let offset = 0;
            for (let i = 0; i < index; i++) offset += heights[i];
            return { length: heights[index] || 0, offset, index };
          }}
          onScrollToIndexFailed={(info) => {
            setTimeout(() => {
              listRef.current?.scrollToIndex({ index: Math.min(info.index, CHAPTERS.length - 1), animated: false });
            }, 300);
          }}
          contentContainerStyle={{ paddingBottom: 40 }}
          initialNumToRender={2}
          maxToRenderPerBatch={2}
          windowSize={3}
          removeClippedSubviews
        />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0B1020" },
  topBar: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingTop: 4,
    paddingBottom: 8,
  },
  topIconBtn: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
  },
  titleBlock: { alignItems: "center" },
  title: { color: "#fff", fontSize: 20, fontWeight: "900", letterSpacing: -0.3 },
  subtitle: { color: "#94A3B8", fontSize: 11, fontWeight: "700", marginTop: 2 },
  statsRow: {
    flexDirection: "row-reverse", gap: 8,
    paddingHorizontal: 14, marginTop: 6, marginBottom: 10,
  },
  statCard: {
    flex: 1,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    backgroundColor: "rgba(21,27,48,0.8)",
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
  },
  statValue: { color: "#fff", fontWeight: "900", fontSize: 15 },
  statLabel: { color: "#94A3B8", fontWeight: "800", fontSize: 10 },
  continueBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 14,
    marginBottom: 14,
    backgroundColor: "#7C3AED",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#A78BFA",
  },
  continueLeft: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  continueTitle: { color: "#fff", fontWeight: "900", fontSize: 15, textAlign: "right" },
  continueSub: { color: "#E9D5FF", fontWeight: "700", fontSize: 11, marginTop: 2, textAlign: "right" },
  // Chapter
  chapter: {
    borderRadius: 0,
    paddingBottom: 16,
  },
  chapterHeader: { paddingTop: 16, paddingHorizontal: 14, paddingBottom: 4 },
  chapterBanner: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
  },
  chapterEmoji: { fontSize: 28 },
  chapterName: { fontSize: 15, fontWeight: "900", textAlign: "center" },
  chapterSub: { color: "#CBD5E1", fontSize: 11, fontWeight: "700", marginTop: 2, textAlign: "center" },
  chapterStars: {
    flexDirection: "row-reverse", alignItems: "center", gap: 4,
    backgroundColor: "rgba(0,0,0,0.3)",
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 100,
  },
  chapterStarsText: { color: "#FBBF24", fontWeight: "900", fontSize: 11 },
  // Levels
  levelOuter: {
    alignItems: "center", justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.25)",
  },
  levelInner: { alignItems: "center", justifyContent: "center" },
  levelNum: { color: "#fff", fontSize: 18, fontWeight: "900" },
  starsWrap: {
    flexDirection: "row-reverse", alignItems: "flex-end", gap: 2,
    marginTop: 3,
  },
  playTag: {
    marginTop: 3,
    backgroundColor: "#FBBF24",
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 100,
  },
  playTagText: { color: "#0B1020", fontWeight: "900", fontSize: 10 },
  // Path
  pathDot: {
    position: "absolute",
    width: 6, height: 6, borderRadius: 3,
  },
  pulseRing: {
    position: "absolute",
    borderWidth: 3,
  },
});
