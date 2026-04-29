import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar as RNStatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

type Game = {
  id: string;
  name: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  colors: [string, string];
  route: string;
  available: boolean;
};

const GAMES: Game[] = [
  {
    id: "domino",
    name: "حاسبة الدومينو",
    description: "احسب نقاط جولة الدومينو بين لاعبَين",
    icon: "calculator",
    colors: ["#7C3AED", "#EC4899"],
    route: "/games/domino",
    available: true,
  },
  {
    id: "cards",
    name: "حاسبة ورق اللعب",
    description: "فردي أو زوجي • نظام X و XX • طاولة دائرية",
    icon: "albums",
    colors: ["#10B981", "#0EA5E9"],
    route: "/games/cards",
    available: true,
  },
  {
    id: "mafia",
    name: "لعبة المافيا",
    description: "6-14 لاعب • أدوار سريّة • جولات ليلية ونهاريّة",
    icon: "skull",
    colors: ["#DC2626", "#7C2D12"],
    route: "/games/mafia",
    available: true,
  },
  {
    id: "soon-1",
    name: "قريباً",
    description: "ألعاب جديدة في الطريق",
    icon: "game-controller",
    colors: ["#1F2937", "#374151"],
    route: "",
    available: false,
  },
];

export default function Home() {
  const router = useRouter();

  return (
    <View style={styles.root} testID="platform-home">
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.brandBadge}>
              <Ionicons name="sparkles" size={16} color="#FBBF24" />
              <Text style={styles.brandBadgeText}>منصة الألعاب</Text>
            </View>
            <Text style={styles.title}>اختر لعبتك</Text>
            <Text style={styles.subtitle}>
              مجموعة من الألعاب الممتعة في مكان واحد
            </Text>
          </View>

          {/* Stats Row */}
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>3</Text>
              <Text style={styles.statLabel}>ألعاب متاحة</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>∞</Text>
              <Text style={styles.statLabel}>متعة بلا حدود</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>14</Text>
              <Text style={styles.statLabel}>لاعب كحد أقصى</Text>
            </View>
          </View>

          {/* Section Title */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>الألعاب</Text>
            <View style={styles.sectionLine} />
          </View>

          {/* Games Grid */}
          <View style={styles.gamesGrid}>
            {GAMES.map((game) => (
              <TouchableOpacity
                key={game.id}
                testID={`game-card-${game.id}`}
                activeOpacity={0.85}
                disabled={!game.available}
                onPress={() => game.available && router.push(game.route as any)}
                style={[
                  styles.gameCard,
                  {
                    backgroundColor: game.colors[0],
                    opacity: game.available ? 1 : 0.6,
                  },
                ]}
              >
                <View
                  style={[
                    styles.gameAccent,
                    { backgroundColor: game.colors[1] },
                  ]}
                />
                <View style={styles.gameIconWrap}>
                  <Ionicons name={game.icon} size={36} color="#fff" />
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
                    <View style={[styles.playPill, styles.soonPill]}>
                      <Text style={styles.soonPillText}>قريباً</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.footerNote}>
            صُمم بحب لمحبي الألعاب الجماعية
          </Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0B1020",
    paddingTop: RNStatusBar.currentHeight ? 0 : 0,
  },
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },
  header: {
    marginTop: 8,
    marginBottom: 24,
    alignItems: "flex-end",
  },
  brandBadge: {
    flexDirection: "row-reverse",
    alignItems: "center",
    backgroundColor: "rgba(251, 191, 36, 0.12)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 100,
    gap: 6,
    borderWidth: 1,
    borderColor: "rgba(251, 191, 36, 0.3)",
  },
  brandBadgeText: {
    color: "#FBBF24",
    fontSize: 12,
    fontWeight: "700",
  },
  title: {
    fontSize: 36,
    fontWeight: "900",
    color: "#fff",
    marginTop: 14,
    textAlign: "right",
    writingDirection: "rtl",
  },
  subtitle: {
    fontSize: 15,
    color: "#94A3B8",
    marginTop: 6,
    textAlign: "right",
    writingDirection: "rtl",
  },
  statsRow: {
    flexDirection: "row-reverse",
    gap: 10,
    marginBottom: 28,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#151B30",
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  statValue: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "900",
  },
  statLabel: {
    color: "#94A3B8",
    fontSize: 11,
    marginTop: 4,
    fontWeight: "600",
  },
  sectionHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  sectionTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "800",
  },
  sectionLine: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  gamesGrid: {
    gap: 14,
  },
  gameCard: {
    borderRadius: 24,
    padding: 20,
    minHeight: 170,
    overflow: "hidden",
    position: "relative",
  },
  gameAccent: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 90,
    top: -60,
    left: -60,
    opacity: 0.5,
  },
  gameIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-end",
    marginBottom: 12,
  },
  gameName: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "900",
    textAlign: "right",
    writingDirection: "rtl",
  },
  gameDesc: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 13,
    marginTop: 6,
    textAlign: "right",
    writingDirection: "rtl",
  },
  gameFooter: {
    marginTop: 14,
    flexDirection: "row-reverse",
  },
  playPill: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#fff",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 100,
  },
  playPillText: {
    color: "#0B1020",
    fontWeight: "800",
    fontSize: 13,
  },
  soonPill: {
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  soonPillText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 12,
  },
  footerNote: {
    textAlign: "center",
    color: "#475569",
    fontSize: 12,
    marginTop: 32,
  },
});
