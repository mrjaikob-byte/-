import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Animated,
  Easing,
  Pressable,
  Dimensions,
  Image,
  ImageSourcePropType,
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
  accent: string;
  accent2: string;
  route: string;
  available: boolean;
  image?: ImageSourcePropType;
  badge?: string;
};

const GAMES: Game[] = [
  {
    id: "domino",
    name: "حاسبة الدومينو",
    description: "احسب نقاط جولة الدومينو بين لاعبَين",
    icon: "calculator",
    accent: "#EC4899",
    accent2: "#7C3AED",
    route: "/games/domino",
    available: true,
    image: require("../assets/images/domino.jpg"),
  },
  {
    id: "cards",
    name: "حاسبة ورق اللعب",
    description: "فردي أو زوجي • نظام X و XX • طاولة دائرية",
    icon: "albums",
    accent: "#0EA5E9",
    accent2: "#10B981",
    route: "/games/cards",
    available: true,
    image: require("../assets/images/cards.jpg"),
  },
  {
    id: "mafia",
    name: "لعبة المافيا",
    description: "6-14 لاعب • أدوار سريّة • جولات ليلية ونهاريّة",
    icon: "skull",
    accent: "#DC2626",
    accent2: "#F59E0B",
    route: "/games/mafia",
    available: true,
    image: require("../assets/images/mafia.jpg"),
    badge: "مميزة",
  },
  {
    id: "soon-1",
    name: "قريباً",
    description: "ألعاب جديدة في الطريق",
    icon: "game-controller",
    accent: "#64748B",
    accent2: "#374151",
    route: "",
    available: false,
  },
];

// ========= Floating blob =========
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
    const t = setTimeout(() => loop.start(), delay);
    return () => { clearTimeout(t); loop.stop(); };
  }, [driftX, driftY, duration, delay]);
  return (
    <Animated.View
      style={[
        styles.blob,
        {
          width: size, height: size, borderRadius: size / 2,
          backgroundColor: color, top: startY, left: startX,
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

// ========= Stat Card =========
function StatCard({ icon, value, label, delay, accent, testID }: {
  icon: keyof typeof Ionicons.glyphMap; value: string; label: string; delay: number; accent: string; testID: string;
}) {
  const ty = useRef(new Animated.Value(30)).current;
  useEffect(() => {
    Animated.spring(ty, { toValue: 0, delay, useNativeDriver: true, friction: 6, tension: 80 }).start();
  }, [ty, delay]);
  return (
    <Animated.View testID={testID} style={[styles.statCard, { transform: [{ translateY: ty }] }]}>
      <View style={[styles.statIcon, { backgroundColor: accent + "24", borderColor: accent + "55" }]}>
        <Ionicons name={icon} size={16} color={accent} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Animated.View>
  );
}

// ========= Hero Game Card (with image) =========
function HeroCard({ game, delay, onPress }: { game: Game; delay: number; onPress: () => void }) {
  const ty = useRef(new Animated.Value(50)).current;
  const press = useRef(new Animated.Value(1)).current;
  const badgePulse = useRef(new Animated.Value(0)).current;
  const shineX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(ty, { toValue: 0, delay, useNativeDriver: true, friction: 8, tension: 55 }).start();

    let cleanup: (() => void) | undefined;
    if (game.badge) {
      const l = Animated.loop(
        Animated.sequence([
          Animated.timing(badgePulse, { toValue: 1, duration: 1100, useNativeDriver: true, easing: Easing.inOut(Easing.quad) }),
          Animated.timing(badgePulse, { toValue: 0, duration: 1100, useNativeDriver: true, easing: Easing.inOut(Easing.quad) }),
        ])
      );
      l.start();
      cleanup = () => l.stop();
    }

    // Subtle shine sweep across cards every ~5s
    const shine = Animated.loop(
      Animated.sequence([
        Animated.delay(1800 + delay),
        Animated.timing(shineX, { toValue: 1, duration: 1400, useNativeDriver: true, easing: Easing.out(Easing.quad) }),
        Animated.timing(shineX, { toValue: 0, duration: 0, useNativeDriver: true }),
        Animated.delay(4000),
      ])
    );
    shine.start();

    return () => {
      cleanup?.();
      shine.stop();
    };
  }, [ty, delay, badgePulse, shineX, game.badge]);

  const onIn = () => Animated.spring(press, { toValue: 0.97, useNativeDriver: true, friction: 7 }).start();
  const onOut = () => Animated.spring(press, { toValue: 1, useNativeDriver: true, friction: 4 }).start();

  return (
    <Animated.View style={{ transform: [{ translateY: ty }, { scale: press }] }}>
      <Pressable
        testID={`game-card-${game.id}`}
        disabled={!game.available}
        onPress={onPress}
        onPressIn={onIn}
        onPressOut={onOut}
        style={[styles.heroCard, !game.available && { opacity: 0.7 }]}
      >
        {/* Hero image */}
        {game.image ? (
          <View style={styles.heroImageWrap}>
            <Image source={game.image} style={styles.heroImage} resizeMode="cover" />
            {/* Color wash for brand consistency */}
            <View style={[styles.heroColorWash, { backgroundColor: game.accent + "10" }]} />
            {/* Gradient-like bottom overlay via stacked semi-transparent Views */}
            <View style={[styles.heroOverlayBottom, { backgroundColor: "rgba(11,16,32,0.55)" }]} />
            {/* Animated shine stripe */}
            <Animated.View
              style={[
                styles.heroShine,
                {
                  pointerEvents: "none",
                  transform: [
                    { translateX: shineX.interpolate({ inputRange: [0, 1], outputRange: [-200, SCREEN_W] }) },
                    { skewX: "-20deg" },
                  ],
                },
              ]}
            />
          </View>
        ) : (
          <View style={[styles.heroImageWrap, { backgroundColor: game.accent2 }]}>
            <View style={[styles.heroPlaceholderCircle, { backgroundColor: game.accent + "33" }]} />
            <Ionicons name={game.icon} size={64} color="#fff" style={{ opacity: 0.85 }} />
          </View>
        )}

        {/* Badge (featured) */}
        {game.badge && (
          <Animated.View
            style={[
              styles.featuredBadge,
              {
                transform: [{ scale: badgePulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) }],
              },
            ]}
          >
            <Ionicons name="star" size={11} color="#FBBF24" />
            <Text style={styles.featuredBadgeText}>{game.badge}</Text>
          </Animated.View>
        )}

        {/* Content */}
        <View style={styles.heroContent}>
          <View style={styles.heroTopRow}>
            <View style={[styles.heroIconCircle, { backgroundColor: game.accent + "26", borderColor: game.accent }]}>
              <Ionicons name={game.icon} size={22} color={game.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroTitle} numberOfLines={1}>{game.name}</Text>
              <Text style={styles.heroDesc} numberOfLines={2}>{game.description}</Text>
            </View>
          </View>

          <View style={styles.heroFooter}>
            {game.available ? (
              <View style={[styles.playPill, { backgroundColor: "#fff" }]}>
                <Text style={styles.playPillText}>العب الآن</Text>
                <Ionicons name="arrow-back" size={14} color="#0B1020" />
              </View>
            ) : (
              <View style={styles.soonPill}>
                <Ionicons name="time-outline" size={12} color="#fff" />
                <Text style={styles.soonPillText}>قريباً</Text>
              </View>
            )}
            <View style={[styles.heroAccentStripe, { backgroundColor: game.accent }]} />
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

// ========= Main =========
export default function Home() {
  const router = useRouter();
  const headerTy = useRef(new Animated.Value(-30)).current;
  const sparkRotate = useRef(new Animated.Value(0)).current;
  const titleShimmer = useRef(new Animated.Value(0)).current;
  const heartBeat = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.spring(headerTy, { toValue: 0, useNativeDriver: true, friction: 8, tension: 50 }).start();

    const spin = Animated.loop(
      Animated.timing(sparkRotate, { toValue: 1, duration: 6000, useNativeDriver: true, easing: Easing.linear })
    );
    spin.start();

    const shimmer = Animated.loop(
      Animated.sequence([
        Animated.timing(titleShimmer, { toValue: 1, duration: 2400, useNativeDriver: true, easing: Easing.inOut(Easing.quad) }),
        Animated.timing(titleShimmer, { toValue: 0, duration: 2400, useNativeDriver: true, easing: Easing.inOut(Easing.quad) }),
      ])
    );
    shimmer.start();

    const beat = Animated.loop(
      Animated.sequence([
        Animated.timing(heartBeat, { toValue: 1.25, duration: 400, useNativeDriver: true, easing: Easing.out(Easing.quad) }),
        Animated.timing(heartBeat, { toValue: 1, duration: 600, useNativeDriver: true, easing: Easing.in(Easing.quad) }),
        Animated.delay(1200),
      ])
    );
    beat.start();

    return () => { spin.stop(); shimmer.stop(); beat.stop(); };
  }, [headerTy, sparkRotate, titleShimmer, heartBeat]);

  const available = GAMES.filter((g) => g.available).length;

  return (
    <View style={styles.root} testID="platform-home">
      <FloatingBlob color="#7C3AED" size={280} startX={-100} startY={60} duration={8000} />
      <FloatingBlob color="#EC4899" size={220} startX={SCREEN_W - 140} startY={280} duration={9500} delay={400} />
      <FloatingBlob color="#10B981" size={200} startX={-80} startY={600} duration={11000} delay={800} />
      <FloatingBlob color="#F59E0B" size={150} startX={SCREEN_W - 100} startY={800} duration={10500} delay={1200} />

      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Header */}
          <Animated.View style={[styles.header, { transform: [{ translateY: headerTy }] }]}>
            <View style={styles.brandRow}>
              <Animated.View style={{ transform: [{ rotate: sparkRotate.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }) }] }}>
                <Ionicons name="sparkles" size={18} color="#FBBF24" />
              </Animated.View>
              <Text style={styles.brandBadgeText}>منصة الألعاب</Text>
              <Animated.View style={{ transform: [{ rotate: sparkRotate.interpolate({ inputRange: [0, 1], outputRange: ["360deg", "0deg"] }) }] }}>
                <Ionicons name="sparkles" size={18} color="#FBBF24" />
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
                      { translateX: titleShimmer.interpolate({ inputRange: [0, 1], outputRange: [-160, 220] }) },
                    ],
                  },
                ]}
              />
            </View>

            <Text style={styles.subtitle}>
              ألعاب رائعة لقضاء وقت ممتع مع الأصدقاء والعائلة
            </Text>

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Ionicons name="diamond" size={14} color="#FBBF24" />
              <View style={styles.dividerLine} />
            </View>
          </Animated.View>

          {/* Stats */}
          <View style={styles.statsRow}>
            <StatCard icon="game-controller" value={String(available)} label="ألعاب متاحة" delay={100} accent="#FBBF24" testID="stat-games" />
            <StatCard icon="infinite" value="∞" label="متعة بلا حدود" delay={200} accent="#EC4899" testID="stat-fun" />
            <StatCard icon="people" value="14" label="حد أقصى" delay={300} accent="#10B981" testID="stat-players" />
          </View>

          {/* Section */}
          <View style={styles.sectionHeader}>
            <View style={styles.sectionAccent} />
            <Text style={styles.sectionTitle}>الألعاب</Text>
            <View style={styles.sectionLine} />
          </View>

          {/* Games with hero images */}
          <View style={styles.gamesGrid}>
            {GAMES.map((game, idx) => (
              <HeroCard
                key={game.id}
                game={game}
                delay={400 + idx * 130}
                onPress={() => game.available && router.push(game.route as never)}
              />
            ))}
          </View>

          <View style={styles.footerBox}>
            <Animated.View style={{ transform: [{ scale: heartBeat }] }}>
              <Ionicons name="heart" size={14} color="#EC4899" />
            </Animated.View>
            <Text style={styles.footerNote}>صُمم بحب لمحبي الألعاب الجماعية</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0B1020", overflow: "hidden" },
  blob: { position: "absolute", opacity: 0.14 },
  scroll: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 40 },
  // Header
  header: { alignItems: "center", marginTop: 8, marginBottom: 22 },
  brandRow: {
    flexDirection: "row-reverse", alignItems: "center",
    backgroundColor: "rgba(251, 191, 36, 0.10)",
    paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 100, gap: 10,
    borderWidth: 1, borderColor: "rgba(251, 191, 36, 0.35)",
  },
  brandBadgeText: { color: "#FBBF24", fontSize: 12, fontWeight: "900", letterSpacing: 0.3 },
  titleWrap: { marginTop: 16, position: "relative", overflow: "hidden" },
  title: {
    fontSize: 44, fontWeight: "900", color: "#fff",
    textAlign: "center", letterSpacing: -0.8,
  },
  titleShimmer: {
    position: "absolute", top: 0, bottom: 0,
    width: 110, backgroundColor: "rgba(255,255,255,0.22)",
  },
  subtitle: {
    fontSize: 13, color: "#94A3B8",
    marginTop: 8, textAlign: "center",
    paddingHorizontal: 20, lineHeight: 20,
  },
  divider: {
    flexDirection: "row", alignItems: "center",
    gap: 10, marginTop: 14, width: "65%",
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: "rgba(251, 191, 36, 0.3)" },
  // Stats
  statsRow: { flexDirection: "row-reverse", gap: 10, marginBottom: 24 },
  statCard: {
    flex: 1, backgroundColor: "rgba(21, 27, 48, 0.9)",
    borderRadius: 18, paddingVertical: 14, paddingHorizontal: 8,
    alignItems: "center",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.06)",
  },
  statIcon: {
    width: 32, height: 32, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, marginBottom: 6,
  },
  statValue: { color: "#fff", fontSize: 22, fontWeight: "900" },
  statLabel: { color: "#94A3B8", fontSize: 10, marginTop: 2, fontWeight: "800" },
  // Section
  sectionHeader: { flexDirection: "row-reverse", alignItems: "center", gap: 10, marginBottom: 14 },
  sectionAccent: { width: 4, height: 22, borderRadius: 2, backgroundColor: "#FBBF24" },
  sectionTitle: { color: "#fff", fontSize: 22, fontWeight: "900" },
  sectionLine: { flex: 1, height: 1, backgroundColor: "rgba(255,255,255,0.08)" },
  // Games
  gamesGrid: { gap: 16 },
  heroCard: {
    borderRadius: 24, overflow: "hidden",
    backgroundColor: "#151B30",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
    elevation: 4,
  },
  heroImageWrap: {
    width: "100%", height: 200,
    position: "relative",
    alignItems: "center", justifyContent: "center",
    overflow: "hidden",
  },
  heroImage: { width: "100%", height: "100%" },
  heroOverlayTop: {
    position: "absolute", top: 0, left: 0, right: 0, height: 40,
    backgroundColor: "rgba(11,16,32,0.25)",
  },
  heroOverlayBottom: {
    position: "absolute", left: 0, right: 0, bottom: 0, height: 50,
  },
  heroColorWash: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
  },
  heroShine: {
    position: "absolute", top: -20, bottom: -20, width: 80,
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  heroPlaceholderCircle: {
    position: "absolute", width: 140, height: 140, borderRadius: 70,
  },
  featuredBadge: {
    position: "absolute", top: 12, left: 12,
    flexDirection: "row-reverse", alignItems: "center", gap: 4,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 100,
    borderWidth: 1, borderColor: "#FBBF24",
  },
  featuredBadgeText: { color: "#FBBF24", fontSize: 10, fontWeight: "900" },
  heroContent: { padding: 14, gap: 12 },
  heroTopRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  heroIconCircle: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1.5,
  },
  heroTitle: {
    color: "#fff", fontSize: 18, fontWeight: "900",
    textAlign: "right", letterSpacing: -0.3,
  },
  heroDesc: {
    color: "#94A3B8", fontSize: 12, fontWeight: "700",
    textAlign: "right", marginTop: 2, lineHeight: 16,
  },
  heroFooter: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  heroAccentStripe: { width: 44, height: 4, borderRadius: 2 },
  playPill: {
    flexDirection: "row-reverse", alignItems: "center",
    gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 100,
  },
  playPillText: { color: "#0B1020", fontWeight: "900", fontSize: 12 },
  soonPill: {
    flexDirection: "row-reverse", alignItems: "center",
    gap: 4, backgroundColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100,
  },
  soonPillText: { color: "#fff", fontWeight: "800", fontSize: 11 },
  // Footer
  footerBox: {
    flexDirection: "row-reverse", alignItems: "center",
    justifyContent: "center", gap: 6, marginTop: 28,
  },
  footerNote: { color: "#475569", fontSize: 12, fontWeight: "700" },
});
