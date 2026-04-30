import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
  Easing,
  Pressable,
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

const { width: SCREEN_W } = Dimensions.get("window");

type Game = {
  id: string;
  name: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  accentColor: string;
  bgColor: string;
  bgAccent: string;
  route: string;
  available: boolean;
  badge?: string;
};

const GAMES: Game[] = [
  {
    id: "domino",
    name: "حاسبة الدومينو",
    description: "احسب نقاط جولة الدومينو بين لاعبَين",
    icon: "calculator",
    accentColor: "#EC4899",
    bgColor: "#7C3AED",
    bgAccent: "#EC4899",
    route: "/games/domino",
    available: true,
  },
  {
    id: "cards",
    name: "حاسبة ورق اللعب",
    description: "فردي أو زوجي • نظام X و XX • طاولة دائرية",
    icon: "albums",
    accentColor: "#0EA5E9",
    bgColor: "#10B981",
    bgAccent: "#0EA5E9",
    route: "/games/cards",
    available: true,
  },
  {
    id: "mafia",
    name: "لعبة المافيا",
    description: "6-14 لاعب • أدوار سريّة • جولات ليلية ونهاريّة",
    icon: "skull",
    accentColor: "#F59E0B",
    bgColor: "#DC2626",
    bgAccent: "#7C2D12",
    route: "/games/mafia",
    available: true,
    badge: "مميزة",
  },
  {
    id: "soon-1",
    name: "قريباً",
    description: "ألعاب جديدة في الطريق",
    icon: "game-controller",
    accentColor: "#64748B",
    bgColor: "#1F2937",
    bgAccent: "#374151",
    route: "",
    available: false,
  },
];

// ---------- Floating background blob ----------
function FloatingBlob({ color, size, startX, startY, duration, delay = 0 }: {
  color: string; size: number; startX: number; startY: number; duration: number; delay?: number;
}) {
  const driftX = useRef(new Animated.Value(0)).current;
  const driftY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(driftX, { toValue: 1, duration, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
          Animated.timing(driftY, { toValue: 1, duration, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
        ]),
        Animated.parallel([
          Animated.timing(driftX, { toValue: 0, duration, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
          Animated.timing(driftY, { toValue: 0, duration, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
        ]),
      ])
    );
    const timer = setTimeout(() => loop.start(), delay);
    return () => { clearTimeout(timer); loop.stop(); };
  }, [driftX, driftY, duration, delay]);

  return (
    <Animated.View
      style={[
        styles.blob,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          top: startY,
          left: startX,
          pointerEvents: "none",
          transform: [
            { translateX: driftX.interpolate({ inputRange: [0, 1], outputRange: [0, 40] }) },
            { translateY: driftY.interpolate({ inputRange: [0, 1], outputRange: [0, -50] }) },
          ],
        },
      ]}
    />
  );
}

// ---------- Animated Stat Card ----------
function StatCard({ value, label, delay, testID }: { value: string; label: string; delay: number; testID: string }) {
  const ty = useRef(new Animated.Value(30)).current;
  const sc = useRef(new Animated.Value(0.85)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.spring(ty, { toValue: 0, delay, useNativeDriver: true, friction: 6, tension: 80 }),
      Animated.spring(sc, { toValue: 1, delay, useNativeDriver: true, friction: 6, tension: 80 }),
    ]).start();
  }, [ty, sc, delay]);
  return (
    <Animated.View
      testID={testID}
      style={[styles.statCard, { transform: [{ translateY: ty }, { scale: sc }] }]}
    >
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Animated.View>
  );
}

// ---------- Animated Game Card ----------
function GameCard({ game, delay, onPress }: { game: Game; delay: number; onPress: () => void }) {
  const ty = useRef(new Animated.Value(40)).current;
  const press = useRef(new Animated.Value(1)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(ty, {
      toValue: 0, delay, useNativeDriver: true, friction: 7, tension: 60,
    }).start();

    if (game.badge) {
      const badgeLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1, duration: 1200, useNativeDriver: true, easing: Easing.inOut(Easing.quad) }),
          Animated.timing(pulse, { toValue: 0, duration: 1200, useNativeDriver: true, easing: Easing.inOut(Easing.quad) }),
        ])
      );
      badgeLoop.start();
      return () => badgeLoop.stop();
    }
  }, [ty, delay, pulse, game.badge]);

  const handlePressIn = () => {
    Animated.spring(press, { toValue: 0.97, useNativeDriver: true, friction: 7 }).start();
  };
  const handlePressOut = () => {
    Animated.spring(press, { toValue: 1, useNativeDriver: true, friction: 4 }).start();
  };

  return (
    <Animated.View style={{ transform: [{ translateY: ty }, { scale: press }] }}>
      <Pressable
        testID={`game-card-${game.id}`}
        disabled={!game.available}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[
          styles.gameCard,
          { backgroundColor: game.bgColor, opacity: game.available ? 1 : 0.65 },
        ]}
      >
        <View style={[styles.gameBgCircle1, { backgroundColor: game.bgAccent }]} />
        <View style={[styles.gameBgCircle2, { backgroundColor: game.accentColor, opacity: 0.25 }]} />

        {game.badge && (
          <Animated.View
            style={[
              styles.gameBadge,
              {
                transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) }],
              },
            ]}
          >
            <Ionicons name="star" size={10} color="#FBBF24" />
            <Text style={styles.gameBadgeText}>{game.badge}</Text>
          </Animated.View>
        )}

        <View style={styles.gameIconCircle}>
          <View style={[styles.gameIconInner, { backgroundColor: game.accentColor + "30" }]}>
            <Ionicons name={game.icon} size={36} color="#fff" />
          </View>
        </View>

        <Text style={styles.gameName}>{game.name}</Text>
        <Text style={styles.gameDesc}>{game.description}</Text>

        <View style={styles.gameFooter}>
          {game.available ? (
            <View style={styles.playPill}>
              <Text style={styles.playPillText}>العب الآن</Text>
              <Ionicons name="arrow-back" size={14} color="#0B1020" />
            </View>
          ) : (
            <View style={styles.soonPill}>
              <Ionicons name="time-outline" size={12} color="#fff" />
              <Text style={styles.soonPillText}>قريباً</Text>
            </View>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

// ---------- Main ----------
export default function Home() {
  const router = useRouter();

  const headerTy = useRef(new Animated.Value(-20)).current;
  const sparkRotate = useRef(new Animated.Value(0)).current;
  const titleShimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(headerTy, { toValue: 0, useNativeDriver: true, friction: 7, tension: 50 }).start();

    const spinLoop = Animated.loop(
      Animated.timing(sparkRotate, { toValue: 1, duration: 6000, useNativeDriver: true, easing: Easing.linear })
    );
    spinLoop.start();

    const shimmerLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(titleShimmer, { toValue: 1, duration: 2200, useNativeDriver: true, easing: Easing.inOut(Easing.quad) }),
        Animated.timing(titleShimmer, { toValue: 0, duration: 2200, useNativeDriver: true, easing: Easing.inOut(Easing.quad) }),
      ])
    );
    shimmerLoop.start();
    return () => { spinLoop.stop(); shimmerLoop.stop(); };
  }, [headerTy, sparkRotate, titleShimmer]);

  const available = GAMES.filter((g) => g.available).length;

  return (
    <View style={styles.root} testID="platform-home">
      <FloatingBlob color="#7C3AED" size={260} startX={-80} startY={80} duration={8000} />
      <FloatingBlob color="#EC4899" size={200} startX={SCREEN_W - 120} startY={300} duration={9500} delay={400} />
      <FloatingBlob color="#10B981" size={180} startX={-60} startY={600} duration={11000} delay={800} />

      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View style={[styles.header, { transform: [{ translateY: headerTy }] }]}>
            <View style={styles.brandRow}>
              <Animated.View
                style={{
                  transform: [
                    { rotate: sparkRotate.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }) },
                  ],
                }}
              >
                <Ionicons name="sparkles" size={20} color="#FBBF24" />
              </Animated.View>
              <Text style={styles.brandBadgeText}>منصة الألعاب</Text>
              <Animated.View
                style={{
                  transform: [
                    { rotate: sparkRotate.interpolate({ inputRange: [0, 1], outputRange: ["360deg", "0deg"] }) },
                  ],
                }}
              >
                <Ionicons name="sparkles" size={20} color="#FBBF24" />
              </Animated.View>
            </View>

            <View style={styles.titleWrap}>
              <Text style={styles.title}>اختر لعبتك</Text>
              <Animated.View
                style={[
                  styles.titleShimmer,
                  {
                    pointerEvents: "none",
                    transform: [
                      {
                        translateX: titleShimmer.interpolate({
                          inputRange: [0, 1],
                          outputRange: [-150, 180],
                        }),
                      },
                    ],
                  },
                ]}
              />
            </View>
            <Text style={styles.subtitle}>
              مجموعة من الألعاب الممتعة لقضاء وقت رائع مع الأصدقاء
            </Text>

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Ionicons name="diamond" size={14} color="#FBBF24" />
              <View style={styles.dividerLine} />
            </View>
          </Animated.View>

          <View style={styles.statsRow}>
            <StatCard value={String(available)} label="ألعاب متاحة" delay={100} testID="stat-games" />
            <StatCard value="∞" label="متعة بلا حدود" delay={200} testID="stat-fun" />
            <StatCard value="14" label="لاعب كحد أقصى" delay={300} testID="stat-players" />
          </View>

          <View style={styles.sectionHeader}>
            <View style={styles.sectionAccent} />
            <Text style={styles.sectionTitle}>الألعاب</Text>
            <View style={styles.sectionLine} />
          </View>

          <View style={styles.gamesGrid}>
            {GAMES.map((game, idx) => (
              <GameCard
                key={game.id}
                game={game}
                delay={400 + idx * 100}
                onPress={() => game.available && router.push(game.route as never)}
              />
            ))}
          </View>

          <View style={styles.footerBox}>
            <Ionicons name="heart" size={14} color="#EC4899" />
            <Text style={styles.footerNote}>صُمم بحب لمحبي الألعاب الجماعية</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0B1020",
    overflow: "hidden",
  },
  blob: {
    position: "absolute",
    opacity: 0.14,
  },
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 40,
  },
  // Header
  header: {
    alignItems: "center",
    marginTop: 8,
    marginBottom: 22,
  },
  brandRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    backgroundColor: "rgba(251, 191, 36, 0.12)",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 100,
    gap: 8,
    borderWidth: 1,
    borderColor: "rgba(251, 191, 36, 0.3)",
  },
  brandBadgeText: {
    color: "#FBBF24",
    fontSize: 13,
    fontWeight: "800",
  },
  titleWrap: {
    marginTop: 14,
    position: "relative",
    overflow: "hidden",
  },
  title: {
    fontSize: 42,
    fontWeight: "900",
    color: "#fff",
    textAlign: "center",
    letterSpacing: -0.5,
  },
  titleShimmer: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 90,
    backgroundColor: "rgba(255,255,255,0.25)",
    transform: [{ skewX: "-20deg" }],
  },
  subtitle: {
    fontSize: 14,
    color: "#94A3B8",
    marginTop: 8,
    textAlign: "center",
    paddingHorizontal: 20,
    lineHeight: 20,
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 14,
    width: "60%",
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(251, 191, 36, 0.3)",
  },
  // Stats
  statsRow: {
    flexDirection: "row-reverse",
    gap: 10,
    marginBottom: 26,
  },
  statCard: {
    flex: 1,
    backgroundColor: "rgba(21, 27, 48, 0.9)",
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  statValue: {
    color: "#FBBF24",
    fontSize: 26,
    fontWeight: "900",
  },
  statLabel: {
    color: "#94A3B8",
    fontSize: 10,
    marginTop: 4,
    fontWeight: "700",
  },
  // Section
  sectionHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
  },
  sectionAccent: {
    width: 4,
    height: 22,
    borderRadius: 2,
    backgroundColor: "#FBBF24",
  },
  sectionTitle: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "900",
  },
  sectionLine: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  // Games
  gamesGrid: {
    gap: 14,
  },
  gameCard: {
    borderRadius: 28,
    padding: 22,
    minHeight: 190,
    overflow: "hidden",
    position: "relative",
  },
  gameBgCircle1: {
    position: "absolute",
    width: 200,
    height: 200,
    borderRadius: 100,
    top: -80,
    left: -60,
    opacity: 0.45,
  },
  gameBgCircle2: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 60,
    bottom: -30,
    right: -30,
  },
  gameBadge: {
    position: "absolute",
    top: 16,
    left: 16,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.35)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: "rgba(251, 191, 36, 0.6)",
  },
  gameBadgeText: {
    color: "#FBBF24",
    fontSize: 10,
    fontWeight: "900",
  },
  gameIconCircle: {
    alignSelf: "flex-end",
    marginBottom: 12,
  },
  gameIconInner: {
    width: 62,
    height: 62,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.15)",
  },
  gameName: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "900",
    textAlign: "right",
    letterSpacing: -0.3,
  },
  gameDesc: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 13,
    marginTop: 6,
    textAlign: "right",
    lineHeight: 18,
  },
  gameFooter: {
    marginTop: 16,
    flexDirection: "row-reverse",
  },
  playPill: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 100,
  },
  playPillText: {
    color: "#0B1020",
    fontWeight: "900",
    fontSize: 13,
  },
  soonPill: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 100,
  },
  soonPillText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 12,
  },
  // Footer
  footerBox: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 32,
  },
  footerNote: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "700",
  },
});
