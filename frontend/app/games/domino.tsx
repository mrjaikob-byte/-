import React, { useState, useMemo, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";

type ScoreEntry = {
  id: string;
  value: number;
};

const STORAGE_KEY = "domino_calc_state_v1";
const TARGET_OPTIONS = [100, 150, 200, 250];

export default function DominoCalculator() {
  const router = useRouter();

  const [target, setTarget] = useState<number>(150);
  const [customTargetInput, setCustomTargetInput] = useState<string>("");

  const [name1, setName1] = useState<string>("اللاعب 1");
  const [name2, setName2] = useState<string>("اللاعب 2");

  const [scores1, setScores1] = useState<ScoreEntry[]>([]);
  const [scores2, setScores2] = useState<ScoreEntry[]>([]);

  const [winnerName, setWinnerName] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Load saved state
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const s = JSON.parse(raw);
          if (typeof s.target === "number") setTarget(s.target);
          if (typeof s.name1 === "string") setName1(s.name1);
          if (typeof s.name2 === "string") setName2(s.name2);
          if (Array.isArray(s.scores1)) setScores1(s.scores1);
          if (Array.isArray(s.scores2)) setScores2(s.scores2);
        }
      } catch (e) {
        console.log("load error", e);
      } finally {
        setHydrated(true);
      }
    })();
  }, []);

  // Persist state
  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ target, name1, name2, scores1, scores2 })
    ).catch(() => {});
  }, [target, name1, name2, scores1, scores2, hydrated]);

  const total1 = useMemo(
    () => scores1.reduce((sum, s) => sum + s.value, 0),
    [scores1]
  );
  const total2 = useMemo(
    () => scores2.reduce((sum, s) => sum + s.value, 0),
    [scores2]
  );

  // Check winner
  useEffect(() => {
    if (winnerName !== null) return;
    if (total1 >= target && total2 >= target) {
      setWinnerName(
        total1 >= total2
          ? name1.trim() || "اللاعب 1"
          : name2.trim() || "اللاعب 2"
      );
    } else if (total1 >= target) {
      setWinnerName(name1.trim() || "اللاعب 1");
    } else if (total2 >= target) {
      setWinnerName(name2.trim() || "اللاعب 2");
    }
  }, [total1, total2, target, name1, name2, winnerName]);

  const handleAddScore = (player: 1 | 2, rawValue: string): boolean => {
    if (winnerName) return false;
    const trimmed = (rawValue || "").trim();
    if (trimmed === "") return false;
    const value = parseInt(trimmed, 10);
    if (isNaN(value)) {
      if (Platform.OS === "web") {
        // eslint-disable-next-line no-alert
        window.alert("الرجاء إدخال رقم صحيح");
      } else {
        Alert.alert("رقم غير صحيح", "الرجاء إدخال رقم صحيح فقط");
      }
      return false;
    }
    const entry: ScoreEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      value,
    };
    if (player === 1) {
      setScores1((prev) => [...prev, entry]);
    } else {
      setScores2((prev) => [...prev, entry]);
    }
    return true;
  };

  const deleteScore = (player: 1 | 2, id: string) => {
    if (player === 1) {
      setScores1((prev) => prev.filter((s) => s.id !== id));
    } else {
      setScores2((prev) => prev.filter((s) => s.id !== id));
    }
  };

  const performReset = () => {
    setScores1([]);
    setScores2([]);
    setWinnerName(null);
  };

  const onResetPress = () => {
    if (Platform.OS === "web") {
      // eslint-disable-next-line no-alert
      const ok = window.confirm("هل تريد حذف جميع النقاط والبدء من جديد؟");
      if (ok) performReset();
      return;
    }
    Alert.alert(
      "إعادة اللعبة",
      "هل أنت متأكد من حذف جميع النقاط والبدء من جديد؟",
      [
        { text: "إلغاء", style: "cancel" },
        {
          text: "نعم، إعادة",
          style: "destructive",
          onPress: performReset,
        },
      ]
    );
  };

  const startNewRound = () => {
    setScores1([]);
    setScores2([]);
    setWinnerName(null);
  };

  const applyCustomTarget = () => {
    const v = parseInt((customTargetInput || "").trim(), 10);
    if (isNaN(v) || v <= 0) {
      if (Platform.OS === "web") {
        // eslint-disable-next-line no-alert
        window.alert("الرجاء إدخال رقم موجب");
      } else {
        Alert.alert("هدف غير صحيح", "الرجاء إدخال رقم موجب");
      }
      return;
    }
    setTarget(v);
    setCustomTargetInput("");
  };

  const progress1 = Math.min(100, (total1 / target) * 100);
  const progress2 = Math.min(100, (total2 / target) * 100);

  return (
    <View style={styles.root} testID="domino-screen">
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          {/* Top Bar */}
          <View style={styles.topBar}>
            <TouchableOpacity
              testID="back-button"
              onPress={() => router.back()}
              style={styles.iconBtn}
            >
              <Ionicons name="arrow-forward" size={22} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.topTitle}>حاسبة الدومينو</Text>
            <TouchableOpacity
              testID="reset-button"
              onPress={onResetPress}
              style={styles.iconBtn}
            >
              <Ionicons name="refresh" size={22} color="#fff" />
            </TouchableOpacity>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Target Section */}
            <View style={styles.targetCard}>
              <Text style={styles.sectionLabel}>هدف النقاط</Text>
              <View style={styles.targetRow}>
                {TARGET_OPTIONS.map((t) => (
                  <TouchableOpacity
                    key={t}
                    testID={`target-${t}`}
                    onPress={() => setTarget(t)}
                    style={[
                      styles.targetChip,
                      target === t && styles.targetChipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.targetChipText,
                        target === t && styles.targetChipTextActive,
                      ]}
                    >
                      {t}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.customTargetRow}>
                <TextInput
                  testID="custom-target-input"
                  style={styles.customTargetInput}
                  value={customTargetInput}
                  onChangeText={setCustomTargetInput}
                  placeholder="أو هدف مخصّص..."
                  placeholderTextColor="#64748B"
                  keyboardType="number-pad"
                  textAlign="right"
                />
                <TouchableOpacity
                  testID="apply-custom-target"
                  onPress={applyCustomTarget}
                  style={styles.customTargetBtn}
                >
                  <Text style={styles.customTargetBtnText}>تعيين</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.currentTargetPill}>
                <Ionicons name="flag" size={14} color="#FBBF24" />
                <Text style={styles.currentTargetText}>
                  الهدف الحالي: {target} نقطة
                </Text>
              </View>
            </View>

            {/* Two players split layout */}
            <View style={styles.playersWrap}>
              <PlayerColumn
                testIdPrefix="p1"
                accent="#7C3AED"
                accentSoft="rgba(124, 58, 237, 0.18)"
                name={name1}
                onChangeName={setName1}
                onAdd={(val) => handleAddScore(1, val)}
                scores={scores1}
                onDelete={(id) => deleteScore(1, id)}
                total={total1}
                target={target}
                progress={progress1}
                disabled={!!winnerName}
                placeholder="اسم اللاعب الأول"
              />

              <View style={styles.divider} />

              <PlayerColumn
                testIdPrefix="p2"
                accent="#EC4899"
                accentSoft="rgba(236, 72, 153, 0.18)"
                name={name2}
                onChangeName={setName2}
                onAdd={(val) => handleAddScore(2, val)}
                scores={scores2}
                onDelete={(id) => deleteScore(2, id)}
                total={total2}
                target={target}
                progress={progress2}
                disabled={!!winnerName}
                placeholder="اسم اللاعب الثاني"
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>

        {/* Winner Modal */}
        <Modal
          visible={!!winnerName}
          transparent
          animationType="fade"
          onRequestClose={() => {}}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard} testID="winner-modal">
              <View style={styles.trophyWrap}>
                <Ionicons name="trophy" size={56} color="#FBBF24" />
              </View>
              <Text style={styles.modalTitle}>🎉 الفائز هو 🎉</Text>
              <Text style={styles.modalWinner} testID="winner-name">
                {winnerName}
              </Text>
              <Text style={styles.modalSub}>
                وصل إلى هدف {target} نقطة
              </Text>
              <View style={styles.modalScores}>
                <View style={styles.modalScoreCol}>
                  <Text style={styles.modalScoreName}>{name1}</Text>
                  <Text style={styles.modalScoreVal}>{total1}</Text>
                </View>
                <View style={styles.modalDivider} />
                <View style={styles.modalScoreCol}>
                  <Text style={styles.modalScoreName}>{name2}</Text>
                  <Text style={styles.modalScoreVal}>{total2}</Text>
                </View>
              </View>
              <TouchableOpacity
                testID="new-round-button"
                onPress={startNewRound}
                style={styles.newRoundBtn}
              >
                <Ionicons name="refresh" size={18} color="#0B1020" />
                <Text style={styles.newRoundText}>جولة جديدة</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </View>
  );
}

// PlayerColumn owns its own input state to avoid stale closure issues
function PlayerColumn(props: {
  testIdPrefix: string;
  accent: string;
  accentSoft: string;
  name: string;
  onChangeName: (v: string) => void;
  onAdd: (value: string) => boolean;
  scores: ScoreEntry[];
  onDelete: (id: string) => void;
  total: number;
  target: number;
  progress: number;
  disabled: boolean;
  placeholder: string;
}) {
  const {
    testIdPrefix,
    accent,
    accentSoft,
    name,
    onChangeName,
    onAdd,
    scores,
    onDelete,
    total,
    target,
    progress,
    disabled,
    placeholder,
  } = props;

  const [input, setInput] = useState<string>("");

  const handleAddPress = () => {
    const success = onAdd(input);
    if (success) setInput("");
  };

  return (
    <View style={styles.playerCol} testID={`${testIdPrefix}-column`}>
      {/* Name Input */}
      <View
        style={[
          styles.nameInputWrap,
          { backgroundColor: accentSoft, borderColor: accent },
        ]}
      >
        <TextInput
          testID={`${testIdPrefix}-name-input`}
          style={styles.nameInput}
          value={name}
          onChangeText={onChangeName}
          placeholder={placeholder}
          placeholderTextColor="#64748B"
          textAlign="center"
        />
      </View>

      {/* Total */}
      <View style={[styles.totalCard, { borderColor: accent }]}>
        <Text style={styles.totalLabel}>المجموع</Text>
        <Text
          style={[styles.totalValue, { color: accent }]}
          testID={`${testIdPrefix}-total`}
        >
          {total}
        </Text>
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              { width: `${progress}%`, backgroundColor: accent },
            ]}
          />
        </View>
        <Text style={styles.progressText}>
          {total} / {target}
        </Text>
      </View>

      {/* Add Score */}
      <TextInput
        testID={`${testIdPrefix}-score-input`}
        style={[styles.scoreInput, { borderColor: accent }]}
        value={input}
        onChangeText={setInput}
        placeholder="نقاط"
        placeholderTextColor="#64748B"
        keyboardType="number-pad"
        textAlign="center"
        editable={!disabled}
        onSubmitEditing={handleAddPress}
        returnKeyType="done"
      />
      <TouchableOpacity
        testID={`${testIdPrefix}-add-button`}
        onPress={handleAddPress}
        disabled={disabled}
        style={[
          styles.addBtn,
          { backgroundColor: accent, opacity: disabled ? 0.5 : 1 },
        ]}
      >
        <Ionicons name="add" size={18} color="#fff" />
        <Text style={styles.addBtnText}>إضافة</Text>
      </TouchableOpacity>

      {/* Scores List */}
      <View style={styles.scoresList}>
        {scores.length === 0 && (
          <Text style={styles.emptyText}>لا توجد نقاط</Text>
        )}
        {scores.map((s, idx) => (
          <View
            key={s.id}
            style={styles.scoreItem}
            testID={`${testIdPrefix}-score-item-${idx}`}
          >
            <TouchableOpacity
              testID={`${testIdPrefix}-delete-${idx}`}
              onPress={() => onDelete(s.id)}
              style={styles.deleteBtn}
              hitSlop={8}
            >
              <Ionicons name="trash-outline" size={14} color="#F87171" />
            </TouchableOpacity>
            <Text style={styles.scoreValue}>{s.value}</Text>
            <Text style={[styles.scoreIndex, { color: accent }]}>
              {idx + 1}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0B1020",
  },
  topBar: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#151B30",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  topTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
  },
  scrollContent: {
    padding: 12,
    paddingBottom: 40,
  },
  // Target
  targetCard: {
    backgroundColor: "#151B30",
    borderRadius: 20,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  sectionLabel: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 10,
    textAlign: "right",
  },
  targetRow: {
    flexDirection: "row-reverse",
    gap: 6,
    marginBottom: 10,
  },
  targetChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#0B1020",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  targetChipActive: {
    backgroundColor: "#FBBF24",
    borderColor: "#FBBF24",
  },
  targetChipText: {
    color: "#94A3B8",
    fontSize: 14,
    fontWeight: "800",
  },
  targetChipTextActive: {
    color: "#0B1020",
  },
  customTargetRow: {
    flexDirection: "row-reverse",
    gap: 8,
    marginBottom: 10,
  },
  customTargetInput: {
    flex: 1,
    backgroundColor: "#0B1020",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#fff",
    fontSize: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  customTargetBtn: {
    backgroundColor: "#1E293B",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    justifyContent: "center",
  },
  customTargetBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 13,
  },
  currentTargetPill: {
    flexDirection: "row-reverse",
    alignSelf: "flex-end",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(251, 191, 36, 0.12)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 100,
  },
  currentTargetText: {
    color: "#FBBF24",
    fontSize: 12,
    fontWeight: "700",
  },
  // Players layout
  playersWrap: {
    flexDirection: "row-reverse",
    backgroundColor: "#151B30",
    borderRadius: 20,
    padding: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  divider: {
    width: 2,
    backgroundColor: "rgba(255,255,255,0.08)",
    marginHorizontal: 4,
    borderRadius: 2,
  },
  playerCol: {
    flex: 1,
    paddingHorizontal: 2,
  },
  nameInputWrap: {
    borderRadius: 12,
    borderWidth: 1.5,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginBottom: 8,
  },
  nameInput: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
    paddingVertical: 8,
    minHeight: 36,
  },
  totalCard: {
    backgroundColor: "#0B1020",
    borderRadius: 12,
    padding: 10,
    alignItems: "center",
    borderWidth: 1.5,
    marginBottom: 8,
  },
  totalLabel: {
    color: "#94A3B8",
    fontSize: 10,
    fontWeight: "700",
    marginBottom: 2,
  },
  totalValue: {
    fontSize: 30,
    fontWeight: "900",
  },
  progressTrack: {
    width: "100%",
    height: 4,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 3,
    overflow: "hidden",
    marginTop: 4,
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
  },
  progressText: {
    color: "#64748B",
    fontSize: 10,
    fontWeight: "700",
    marginTop: 3,
  },
  scoreInput: {
    backgroundColor: "#0B1020",
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    marginBottom: 6,
  },
  addBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 10,
  },
  addBtnText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 13,
  },
  scoresList: {
    gap: 5,
  },
  emptyText: {
    color: "#475569",
    fontSize: 11,
    textAlign: "center",
    paddingVertical: 16,
    fontStyle: "italic",
  },
  scoreItem: {
    flexDirection: "row-reverse",
    alignItems: "center",
    backgroundColor: "#0B1020",
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    gap: 4,
  },
  scoreIndex: {
    fontSize: 10,
    fontWeight: "800",
    width: 16,
    textAlign: "center",
  },
  scoreValue: {
    flex: 1,
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
    textAlign: "center",
  },
  deleteBtn: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: "rgba(248, 113, 113, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    backgroundColor: "#151B30",
    borderRadius: 24,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(251, 191, 36, 0.3)",
  },
  trophyWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "rgba(251, 191, 36, 0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
    borderWidth: 2,
    borderColor: "rgba(251, 191, 36, 0.3)",
  },
  modalTitle: {
    color: "#FBBF24",
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 4,
  },
  modalWinner: {
    color: "#fff",
    fontSize: 32,
    fontWeight: "900",
    marginBottom: 4,
    textAlign: "center",
  },
  modalSub: {
    color: "#94A3B8",
    fontSize: 13,
    marginBottom: 20,
  },
  modalScores: {
    flexDirection: "row-reverse",
    width: "100%",
    backgroundColor: "#0B1020",
    borderRadius: 14,
    paddingVertical: 14,
    marginBottom: 16,
  },
  modalScoreCol: {
    flex: 1,
    alignItems: "center",
  },
  modalScoreName: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 4,
  },
  modalScoreVal: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "900",
  },
  modalDivider: {
    width: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  newRoundBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FBBF24",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 100,
  },
  newRoundText: {
    color: "#0B1020",
    fontWeight: "900",
    fontSize: 15,
  },
});
