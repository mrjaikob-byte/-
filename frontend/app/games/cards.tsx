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
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";

type Mode = "individual" | "pairs";
type EntryKind = "number" | "X" | "XX";
type Entry = { id: string; kind: EntryKind; value: number };
type Entity = { id: string; name: string; entries: Entry[] };

const STORAGE_KEY = "cards_calc_state_v1";
const ROUND_OPTIONS = [6, 8, 10];
const X_VALUE = -25;
const XX_VALUE = -50;

// Position layouts based on number of slots and mode
// position index meaning: 0=top, 1=right, 2=bottom, 3=left
function getSlotPositions(numSlots: number, mode: Mode): number[] {
  if (mode === "pairs") return [0, 1, 2, 3]; // 4 players: top, right, bottom, left
  if (numSlots === 2) return [0, 2];
  if (numSlots === 3) return [0, 1, 3]; // top, right, left
  return [0, 1, 2, 3];
}

// In pairs mode: players at positions 0&2 are team A, 1&3 are team B
function teamIndexForSlot(slotIndex: number): 0 | 1 {
  return slotIndex % 2 === 0 ? 0 : 1;
}

const PLAYER_COLORS = ["#7C3AED", "#EC4899", "#10B981", "#F59E0B"];
const TEAM_COLORS = ["#7C3AED", "#EC4899"];

export default function CardsCalculator() {
  const router = useRouter();

  type Phase = "setup" | "playing";
  const [phase, setPhase] = useState<Phase>("setup");

  // Setup state
  const [mode, setMode] = useState<Mode>("individual");
  const [numPlayers, setNumPlayers] = useState<2 | 3 | 4>(4);
  const [rounds, setRounds] = useState<number>(8);
  const [customRoundsInput, setCustomRoundsInput] = useState<string>("");
  const [setupNames, setSetupNames] = useState<string[]>([
    "اللاعب 1",
    "اللاعب 2",
    "اللاعب 3",
    "اللاعب 4",
  ]);

  // Game state
  const [players, setPlayers] = useState<Entity[]>([]);
  const [teams, setTeams] = useState<Entity[]>([]);

  // Modal: entry editor for selected entity
  const [selected, setSelected] = useState<{
    type: "player" | "team";
    index: number;
  } | null>(null);
  const [entryInput, setEntryInput] = useState<string>("");

  // Results modal
  const [showResults, setShowResults] = useState<boolean>(false);

  const [hydrated, setHydrated] = useState(false);

  // Load
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const s = JSON.parse(raw);
          if (s.phase) setPhase(s.phase);
          if (s.mode) setMode(s.mode);
          if (s.numPlayers) setNumPlayers(s.numPlayers);
          if (s.rounds) setRounds(s.rounds);
          if (Array.isArray(s.setupNames)) setSetupNames(s.setupNames);
          if (Array.isArray(s.players)) setPlayers(s.players);
          if (Array.isArray(s.teams)) setTeams(s.teams);
        }
      } catch {}
      setHydrated(true);
    })();
  }, []);

  // Persist
  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        phase,
        mode,
        numPlayers,
        rounds,
        setupNames,
        players,
        teams,
      })
    ).catch(() => {});
  }, [phase, mode, numPlayers, rounds, setupNames, players, teams, hydrated]);

  // Effective entities for display
  const numSlots = mode === "pairs" ? 4 : numPlayers;
  const slotPositions = useMemo(
    () => getSlotPositions(numSlots, mode),
    [numSlots, mode]
  );

  // Totals
  const totalFor = (e: Entity) =>
    e.entries.reduce((s, en) => s + en.value, 0);

  // Round progress: based on entries count
  const entitiesArr = mode === "pairs" ? teams : players;
  const minEntries = entitiesArr.length
    ? Math.min(...entitiesArr.map((e) => e.entries.length))
    : 0;
  const maxEntries = entitiesArr.length
    ? Math.max(...entitiesArr.map((e) => e.entries.length))
    : 0;
  const currentRound = Math.min(rounds, minEntries + 1);
  const allDone =
    entitiesArr.length > 0 &&
    entitiesArr.every((e) => e.entries.length >= rounds);

  // Auto-show results when complete
  useEffect(() => {
    if (phase === "playing" && allDone && !showResults) {
      setShowResults(true);
    }
  }, [phase, allDone, showResults]);

  // Setup helpers
  const setName = (idx: number, val: string) => {
    setSetupNames((prev) => {
      const next = [...prev];
      next[idx] = val;
      return next;
    });
  };

  const startGame = () => {
    if (mode === "pairs") {
      const t1Name =
        (setupNames[0] || "اللاعب 1") + " و " + (setupNames[2] || "اللاعب 3");
      const t2Name =
        (setupNames[1] || "اللاعب 2") + " و " + (setupNames[3] || "اللاعب 4");
      setTeams([
        { id: "t0", name: t1Name, entries: [] },
        { id: "t1", name: t2Name, entries: [] },
      ]);
      setPlayers(
        [0, 1, 2, 3].map((i) => ({
          id: `p${i}`,
          name: setupNames[i] || `اللاعب ${i + 1}`,
          entries: [],
        }))
      );
    } else {
      const ps = Array.from({ length: numPlayers }, (_, i) => ({
        id: `p${i}`,
        name: setupNames[i] || `اللاعب ${i + 1}`,
        entries: [],
      }));
      setPlayers(ps);
      setTeams([]);
    }
    setShowResults(false);
    setPhase("playing");
  };

  const applyCustomRounds = () => {
    const v = parseInt((customRoundsInput || "").trim(), 10);
    if (isNaN(v) || v <= 0) {
      if (Platform.OS === "web") window.alert("الرجاء إدخال رقم موجب");
      else Alert.alert("خطأ", "الرجاء إدخال رقم موجب");
      return;
    }
    setRounds(v);
    setCustomRoundsInput("");
  };

  // Add entry
  const addEntry = (kind: EntryKind, rawValue?: string) => {
    if (!selected) return;
    let value = 0;
    if (kind === "number") {
      const trimmed = (rawValue || "").trim();
      if (trimmed === "") return;
      const v = parseInt(trimmed, 10);
      if (isNaN(v)) {
        if (Platform.OS === "web") window.alert("الرجاء إدخال رقم صحيح");
        return;
      }
      value = v;
    } else if (kind === "X") {
      value = X_VALUE;
    } else {
      value = XX_VALUE;
    }
    const entry: Entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      kind,
      value,
    };
    if (selected.type === "team") {
      setTeams((prev) =>
        prev.map((t, i) =>
          i === selected.index ? { ...t, entries: [...t.entries, entry] } : t
        )
      );
    } else {
      setPlayers((prev) =>
        prev.map((p, i) =>
          i === selected.index ? { ...p, entries: [...p.entries, entry] } : p
        )
      );
    }
    setEntryInput("");
  };

  const deleteEntry = (entryId: string) => {
    if (!selected) return;
    if (selected.type === "team") {
      setTeams((prev) =>
        prev.map((t, i) =>
          i === selected.index
            ? { ...t, entries: t.entries.filter((e) => e.id !== entryId) }
            : t
        )
      );
    } else {
      setPlayers((prev) =>
        prev.map((p, i) =>
          i === selected.index
            ? { ...p, entries: p.entries.filter((e) => e.id !== entryId) }
            : p
        )
      );
    }
  };

  const onTapSlot = (slotIndex: number) => {
    if (mode === "pairs") {
      const teamIdx = teamIndexForSlot(slotIndex);
      setSelected({ type: "team", index: teamIdx });
    } else {
      // slotIndex maps to player index in slotPositions order
      const pIdx = slotPositions.indexOf(slotIndex);
      if (pIdx === -1) return;
      setSelected({ type: "player", index: pIdx });
    }
  };

  const closeModal = () => {
    setSelected(null);
    setEntryInput("");
  };

  const exitToSetup = () => {
    const doIt = () => {
      setPhase("setup");
      setShowResults(false);
      setPlayers([]);
      setTeams([]);
    };
    if (Platform.OS === "web") {
      if (window.confirm("الرجوع لشاشة الإعداد سيُلغي اللعبة الحالية. متابعة؟"))
        doIt();
    } else {
      Alert.alert("تأكيد", "الرجوع لشاشة الإعداد سيُلغي اللعبة الحالية", [
        { text: "إلغاء", style: "cancel" },
        { text: "متابعة", style: "destructive", onPress: doIt },
      ]);
    }
  };

  const newGameSameSetup = () => {
    setShowResults(false);
    if (mode === "pairs") {
      setTeams((prev) => prev.map((t) => ({ ...t, entries: [] })));
    } else {
      setPlayers((prev) => prev.map((p) => ({ ...p, entries: [] })));
    }
  };

  if (!hydrated) {
    return <View style={styles.root} />;
  }

  // ============ SETUP PHASE ============
  if (phase === "setup") {
    return (
      <View style={styles.root} testID="cards-screen">
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
              <Text style={styles.topTitle}>حاسبة ورق اللعب</Text>
              <View style={{ width: 42 }} />
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.setupScroll}
              showsVerticalScrollIndicator={false}
            >
              {/* Mode selection */}
              <Text style={styles.setupLabel}>تريد اللعب زوجي أو فردي؟</Text>
              <View style={styles.modeRow}>
                <TouchableOpacity
                  testID="mode-individual"
                  onPress={() => setMode("individual")}
                  style={[
                    styles.modeCard,
                    mode === "individual" && styles.modeCardActive,
                  ]}
                >
                  <Ionicons
                    name="person"
                    size={28}
                    color={mode === "individual" ? "#0B1020" : "#fff"}
                  />
                  <Text
                    style={[
                      styles.modeCardTitle,
                      mode === "individual" && { color: "#0B1020" },
                    ]}
                  >
                    فردي
                  </Text>
                  <Text
                    style={[
                      styles.modeCardDesc,
                      mode === "individual" && { color: "#0B1020" },
                    ]}
                  >
                    2 / 3 / 4 لاعبين
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  testID="mode-pairs"
                  onPress={() => setMode("pairs")}
                  style={[
                    styles.modeCard,
                    mode === "pairs" && styles.modeCardActive,
                  ]}
                >
                  <Ionicons
                    name="people"
                    size={28}
                    color={mode === "pairs" ? "#0B1020" : "#fff"}
                  />
                  <Text
                    style={[
                      styles.modeCardTitle,
                      mode === "pairs" && { color: "#0B1020" },
                    ]}
                  >
                    زوجي
                  </Text>
                  <Text
                    style={[
                      styles.modeCardDesc,
                      mode === "pairs" && { color: "#0B1020" },
                    ]}
                  >
                    4 لاعبين / فريقين
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Player count (individual only) */}
              {mode === "individual" && (
                <>
                  <Text style={styles.setupLabel}>عدد اللاعبين</Text>
                  <View style={styles.chipRow}>
                    {[2, 3, 4].map((n) => (
                      <TouchableOpacity
                        key={n}
                        testID={`players-${n}`}
                        onPress={() => setNumPlayers(n as 2 | 3 | 4)}
                        style={[
                          styles.chip,
                          numPlayers === n && styles.chipActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            numPlayers === n && styles.chipTextActive,
                          ]}
                        >
                          {n}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              {/* Player names */}
              <Text style={styles.setupLabel}>أسماء اللاعبين</Text>
              <View style={styles.namesGrid}>
                {Array.from({ length: mode === "pairs" ? 4 : numPlayers }).map(
                  (_, i) => {
                    const teamA = mode === "pairs" && (i === 0 || i === 2);
                    const accent =
                      mode === "pairs"
                        ? teamA
                          ? TEAM_COLORS[0]
                          : TEAM_COLORS[1]
                        : PLAYER_COLORS[i];
                    return (
                      <View
                        key={i}
                        style={[
                          styles.nameRow,
                          { borderColor: accent + "55" },
                        ]}
                      >
                        <View
                          style={[
                            styles.nameAvatar,
                            { backgroundColor: accent },
                          ]}
                        >
                          <Text style={styles.nameAvatarText}>{i + 1}</Text>
                        </View>
                        <TextInput
                          testID={`setup-name-${i}`}
                          style={styles.nameInput}
                          value={setupNames[i]}
                          onChangeText={(v) => setName(i, v)}
                          placeholder={`اللاعب ${i + 1}`}
                          placeholderTextColor="#64748B"
                          textAlign="right"
                        />
                        {mode === "pairs" && (
                          <View
                            style={[
                              styles.teamBadge,
                              { backgroundColor: accent + "22" },
                            ]}
                          >
                            <Text
                              style={[styles.teamBadgeText, { color: accent }]}
                            >
                              فريق {teamA ? "أ" : "ب"}
                            </Text>
                          </View>
                        )}
                      </View>
                    );
                  }
                )}
              </View>

              {/* Rounds */}
              <Text style={styles.setupLabel}>عدد الجولات</Text>
              <View style={styles.chipRow}>
                {ROUND_OPTIONS.map((n) => (
                  <TouchableOpacity
                    key={n}
                    testID={`rounds-${n}`}
                    onPress={() => setRounds(n)}
                    style={[styles.chip, rounds === n && styles.chipActive]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        rounds === n && styles.chipTextActive,
                      ]}
                    >
                      {n}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.customRow}>
                <TextInput
                  testID="custom-rounds-input"
                  style={styles.customInput}
                  value={customRoundsInput}
                  onChangeText={setCustomRoundsInput}
                  placeholder="عدد جولات مخصّص..."
                  placeholderTextColor="#64748B"
                  keyboardType="number-pad"
                  textAlign="right"
                />
                <TouchableOpacity
                  testID="apply-rounds"
                  onPress={applyCustomRounds}
                  style={styles.customBtn}
                >
                  <Text style={styles.customBtnText}>تعيين</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.currentTargetPill}>
                <Ionicons name="repeat" size={14} color="#FBBF24" />
                <Text style={styles.currentTargetText}>
                  الجولات الحالية: {rounds}
                </Text>
              </View>

              {/* Start */}
              <TouchableOpacity
                testID="start-button"
                onPress={startGame}
                style={styles.startBtn}
              >
                <Ionicons name="play" size={20} color="#0B1020" />
                <Text style={styles.startBtnText}>بدء اللعبة</Text>
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </View>
    );
  }

  // ============ PLAYING PHASE ============
  // Build slot data: each slot maps to either a player or team
  const slotData = slotPositions.map((pos, idx) => {
    if (mode === "pairs") {
      const teamIdx = teamIndexForSlot(pos);
      const team = teams[teamIdx];
      const player = players[pos];
      return {
        slotPos: pos,
        label: player?.name || `اللاعب ${pos + 1}`,
        teamLabel: `فريق ${teamIdx === 0 ? "أ" : "ب"}`,
        total: team ? totalFor(team) : 0,
        entries: team?.entries || [],
        color: TEAM_COLORS[teamIdx],
      };
    }
    const player = players[idx];
    return {
      slotPos: pos,
      label: player?.name || `اللاعب ${idx + 1}`,
      teamLabel: null,
      total: player ? totalFor(player) : 0,
      entries: player?.entries || [],
      color: PLAYER_COLORS[idx % PLAYER_COLORS.length],
    };
  });

  // Selected entity data for modal
  const selectedEntity = selected
    ? selected.type === "team"
      ? teams[selected.index]
      : players[selected.index]
    : null;
  const selectedColor = selected
    ? selected.type === "team"
      ? TEAM_COLORS[selected.index]
      : PLAYER_COLORS[selected.index % PLAYER_COLORS.length]
    : "#7C3AED";

  // Sorted results
  const resultsList = (() => {
    const arr =
      mode === "pairs"
        ? teams.map((t, i) => ({
            name: t.name,
            total: totalFor(t),
            color: TEAM_COLORS[i],
          }))
        : players.map((p, i) => ({
            name: p.name,
            total: totalFor(p),
            color: PLAYER_COLORS[i % PLAYER_COLORS.length],
          }));
    return [...arr].sort((a, b) => a.total - b.total);
  })();

  return (
    <View style={styles.root} testID="cards-game-screen">
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        {/* Top Bar */}
        <View style={styles.topBar}>
          <TouchableOpacity
            testID="back-to-setup"
            onPress={exitToSetup}
            style={styles.iconBtn}
          >
            <Ionicons name="arrow-forward" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={{ alignItems: "center" }}>
            <Text style={styles.topTitle}>حاسبة ورق اللعب</Text>
            <Text style={styles.topSubtitle}>
              الجولة {currentRound} / {rounds}
              {mode === "pairs" ? "  •  زوجي" : `  •  فردي`}
            </Text>
          </View>
          <TouchableOpacity
            testID="show-results"
            onPress={() => setShowResults(true)}
            style={styles.iconBtn}
          >
            <Ionicons name="trophy" size={22} color="#FBBF24" />
          </TouchableOpacity>
        </View>

        {/* Round progress bar */}
        <View style={styles.progressBarOuter}>
          <View
            style={[
              styles.progressBarInner,
              {
                width: `${Math.min(100, (maxEntries / rounds) * 100)}%`,
              },
            ]}
          />
        </View>

        {/* Table area */}
        <View style={styles.tableArea}>
          <View style={styles.table}>
            <View style={styles.tableInner}>
              <Ionicons name="diamond" size={32} color="rgba(255,255,255,0.15)" />
              <Text style={styles.tableHint}>اضغط على لاعب لتسجيل النقاط</Text>
            </View>
          </View>

          {/* Slot rendering: absolute positioning */}
          {slotData.map((s, i) => (
            <PlayerSlot
              key={i}
              slotPos={s.slotPos}
              label={s.label}
              teamLabel={s.teamLabel}
              total={s.total}
              entries={s.entries}
              color={s.color}
              testID={`slot-${i}`}
              onPress={() => onTapSlot(s.slotPos)}
            />
          ))}
        </View>
      </SafeAreaView>

      {/* Entry Modal */}
      <Modal
        visible={!!selected}
        transparent
        animationType="slide"
        onRequestClose={closeModal}
      >
        <Pressable style={styles.modalOverlay} onPress={closeModal}>
          <Pressable
            style={[styles.entryCard, { borderColor: selectedColor + "55" }]}
            onPress={(e) => e.stopPropagation()}
            testID="entry-modal"
          >
            <View
              style={[styles.entryHeader, { backgroundColor: selectedColor }]}
            >
              <Text style={styles.entryHeaderName}>
                {selectedEntity?.name || ""}
              </Text>
              <Text style={styles.entryHeaderTotal}>
                المجموع:{" "}
                {selectedEntity ? totalFor(selectedEntity) : 0}
              </Text>
            </View>

            <View style={styles.entryBody}>
              <Text style={styles.entrySectionLabel}>إضافة نقاط</Text>
              <View style={styles.entryInputRow}>
                <TextInput
                  testID="entry-number-input"
                  style={[
                    styles.entryNumberInput,
                    { borderColor: selectedColor },
                  ]}
                  value={entryInput}
                  onChangeText={setEntryInput}
                  placeholder="رقم"
                  placeholderTextColor="#64748B"
                  keyboardType="number-pad"
                  textAlign="center"
                />
                <TouchableOpacity
                  testID="entry-add-number"
                  onPress={() => addEntry("number", entryInput)}
                  style={[
                    styles.entryAddBtn,
                    { backgroundColor: selectedColor },
                  ]}
                >
                  <Ionicons name="add" size={20} color="#fff" />
                </TouchableOpacity>
              </View>

              <View style={styles.xRow}>
                <TouchableOpacity
                  testID="entry-add-x"
                  onPress={() => addEntry("X")}
                  style={[styles.xBtn, styles.xBtnSingle]}
                >
                  <Text style={styles.xBtnLabel}>X</Text>
                  <Text style={styles.xBtnSub}>−25</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  testID="entry-add-xx"
                  onPress={() => addEntry("XX")}
                  style={[styles.xBtn, styles.xBtnDouble]}
                >
                  <Text style={styles.xBtnLabel}>XX</Text>
                  <Text style={styles.xBtnSub}>−50</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.entrySectionLabel}>السجلّ</Text>
              <ScrollView
                style={styles.entryHistory}
                contentContainerStyle={{ gap: 6 }}
              >
                {selectedEntity?.entries.length === 0 && (
                  <Text style={styles.emptyText}>لا توجد إدخالات</Text>
                )}
                {selectedEntity?.entries.map((e, idx) => (
                  <View
                    key={e.id}
                    style={styles.histItem}
                    testID={`hist-item-${idx}`}
                  >
                    <TouchableOpacity
                      testID={`hist-delete-${idx}`}
                      onPress={() => deleteEntry(e.id)}
                      style={styles.histDelete}
                      hitSlop={8}
                    >
                      <Ionicons
                        name="trash-outline"
                        size={16}
                        color="#F87171"
                      />
                    </TouchableOpacity>
                    <Text
                      style={[
                        styles.histValue,
                        e.kind !== "number" && { color: "#F87171" },
                      ]}
                    >
                      {e.kind === "number"
                        ? e.value
                        : e.kind === "X"
                        ? "X (−25)"
                        : "XX (−50)"}
                    </Text>
                    <Text
                      style={[styles.histIdx, { color: selectedColor }]}
                    >
                      جولة {idx + 1}
                    </Text>
                  </View>
                ))}
              </ScrollView>

              <TouchableOpacity
                testID="entry-close"
                onPress={closeModal}
                style={styles.entryClose}
              >
                <Text style={styles.entryCloseText}>إغلاق</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Results Modal */}
      <Modal
        visible={showResults}
        transparent
        animationType="fade"
        onRequestClose={() => setShowResults(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.resultsCard} testID="results-modal">
            <View style={styles.trophyWrap}>
              <Ionicons name="trophy" size={48} color="#FBBF24" />
            </View>
            <Text style={styles.resultsTitle}>النتيجة النهائية</Text>
            <Text style={styles.resultsSub}>
              الفائز هو من حصل على أقل نقاط
            </Text>

            <View style={styles.resultsList}>
              {resultsList.map((r, idx) => {
                const isWinner = idx === 0;
                const isLoser = idx === resultsList.length - 1;
                return (
                  <View
                    key={idx}
                    style={[
                      styles.resultRow,
                      isWinner && styles.resultRowWinner,
                      isLoser && styles.resultRowLoser,
                    ]}
                    testID={`result-row-${idx}`}
                  >
                    <View style={styles.rankWrap}>
                      <Text style={styles.rank}>
                        {isWinner ? "🏆" : isLoser ? "❌" : `#${idx + 1}`}
                      </Text>
                    </View>
                    <Text style={styles.resultName}>{r.name}</Text>
                    <Text
                      style={[
                        styles.resultTotal,
                        { color: isWinner ? "#10B981" : "#fff" },
                      ]}
                    >
                      {r.total}
                    </Text>
                  </View>
                );
              })}
            </View>

            <View style={styles.resultActions}>
              <TouchableOpacity
                testID="results-close"
                onPress={() => setShowResults(false)}
                style={[styles.actionBtn, styles.actionBtnSecondary]}
              >
                <Text style={styles.actionBtnSecondaryText}>متابعة اللعب</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="results-new-game"
                onPress={newGameSameSetup}
                style={[styles.actionBtn, styles.actionBtnPrimary]}
              >
                <Ionicons name="refresh" size={16} color="#0B1020" />
                <Text style={styles.actionBtnPrimaryText}>جولة جديدة</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ============== Player Slot Component ==============
function PlayerSlot(props: {
  slotPos: number;
  label: string;
  teamLabel: string | null;
  total: number;
  entries: Entry[];
  color: string;
  onPress: () => void;
  testID: string;
}) {
  const { slotPos, label, teamLabel, total, entries, color, onPress, testID } =
    props;

  // Position the slot around the table
  // 0=top, 1=right, 2=bottom, 3=left
  let posStyle: any = {};
  if (slotPos === 0) posStyle = { top: 0, alignSelf: "center" };
  else if (slotPos === 2) posStyle = { bottom: 0, alignSelf: "center" };
  else if (slotPos === 1) posStyle = { left: 0, top: "50%", marginTop: -50 };
  else if (slotPos === 3) posStyle = { right: 0, top: "50%", marginTop: -50 };

  const lastEntry = entries[entries.length - 1];

  return (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      activeOpacity={0.85}
      style={[styles.slot, posStyle, { borderColor: color }]}
    >
      <View style={[styles.slotAvatar, { backgroundColor: color }]}>
        <Ionicons name="person" size={18} color="#fff" />
      </View>
      <Text style={styles.slotName} numberOfLines={1}>
        {label}
      </Text>
      {teamLabel && (
        <Text style={[styles.slotTeam, { color }]}>{teamLabel}</Text>
      )}
      <Text style={[styles.slotTotal, { color }]} testID={`${testID}-total`}>
        {total}
      </Text>
      {lastEntry && (
        <View style={[styles.slotLast, { backgroundColor: color + "22" }]}>
          <Text style={[styles.slotLastText, { color }]}>
            آخر:{" "}
            {lastEntry.kind === "number"
              ? lastEntry.value
              : lastEntry.kind}
          </Text>
        </View>
      )}
      <Text style={styles.slotEntriesCount}>
        {entries.length} إدخال
      </Text>
    </TouchableOpacity>
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
    fontSize: 17,
    fontWeight: "800",
  },
  topSubtitle: {
    color: "#94A3B8",
    fontSize: 11,
    marginTop: 2,
    fontWeight: "700",
  },
  // Setup
  setupScroll: {
    padding: 16,
    paddingBottom: 40,
  },
  setupLabel: {
    color: "#94A3B8",
    fontSize: 13,
    fontWeight: "800",
    marginTop: 18,
    marginBottom: 10,
    textAlign: "right",
  },
  modeRow: {
    flexDirection: "row-reverse",
    gap: 10,
  },
  modeCard: {
    flex: 1,
    backgroundColor: "#151B30",
    borderRadius: 18,
    padding: 16,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.06)",
    gap: 6,
  },
  modeCardActive: {
    backgroundColor: "#FBBF24",
    borderColor: "#FBBF24",
  },
  modeCardTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "900",
  },
  modeCardDesc: {
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "600",
  },
  chipRow: {
    flexDirection: "row-reverse",
    gap: 8,
  },
  chip: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#151B30",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  chipActive: {
    backgroundColor: "#FBBF24",
    borderColor: "#FBBF24",
  },
  chipText: {
    color: "#94A3B8",
    fontSize: 16,
    fontWeight: "800",
  },
  chipTextActive: {
    color: "#0B1020",
  },
  namesGrid: {
    gap: 8,
  },
  nameRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    backgroundColor: "#151B30",
    borderRadius: 14,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1.5,
    gap: 8,
  },
  nameAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  nameAvatarText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 13,
  },
  nameInput: {
    flex: 1,
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
    paddingVertical: 10,
  },
  teamBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 100,
  },
  teamBadgeText: {
    fontSize: 11,
    fontWeight: "800",
  },
  customRow: {
    flexDirection: "row-reverse",
    gap: 8,
    marginTop: 10,
  },
  customInput: {
    flex: 1,
    backgroundColor: "#151B30",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#fff",
    fontSize: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  customBtn: {
    backgroundColor: "#1E293B",
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
    justifyContent: "center",
  },
  customBtnText: {
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
    marginTop: 10,
  },
  currentTargetText: {
    color: "#FBBF24",
    fontSize: 12,
    fontWeight: "700",
  },
  startBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#FBBF24",
    paddingVertical: 16,
    borderRadius: 18,
    marginTop: 28,
  },
  startBtnText: {
    color: "#0B1020",
    fontWeight: "900",
    fontSize: 16,
  },
  // Playing
  progressBarOuter: {
    height: 4,
    backgroundColor: "rgba(255,255,255,0.05)",
    marginHorizontal: 14,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressBarInner: {
    height: "100%",
    backgroundColor: "#FBBF24",
    borderRadius: 2,
  },
  tableArea: {
    flex: 1,
    margin: 16,
    position: "relative",
  },
  table: {
    position: "absolute",
    top: "50%",
    left: "50%",
    width: 220,
    height: 220,
    marginTop: -110,
    marginLeft: -110,
    borderRadius: 110,
    backgroundColor: "#064E3B",
    borderWidth: 6,
    borderColor: "#065F46",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#10B981",
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 8,
  },
  tableInner: {
    alignItems: "center",
    gap: 8,
  },
  tableHint: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
    paddingHorizontal: 12,
  },
  // Slot
  slot: {
    position: "absolute",
    width: 110,
    height: 100,
    backgroundColor: "#151B30",
    borderRadius: 16,
    borderWidth: 2,
    padding: 6,
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
  },
  slotAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  slotName: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "800",
    maxWidth: "100%",
  },
  slotTeam: {
    fontSize: 10,
    fontWeight: "800",
    marginTop: -1,
  },
  slotTotal: {
    fontSize: 22,
    fontWeight: "900",
  },
  slotLast: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 100,
    marginTop: 1,
  },
  slotLastText: {
    fontSize: 9,
    fontWeight: "800",
  },
  slotEntriesCount: {
    color: "#64748B",
    fontSize: 9,
    fontWeight: "700",
    marginTop: 1,
  },
  // Modal: entry
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  entryCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#151B30",
    borderRadius: 22,
    overflow: "hidden",
    borderWidth: 1.5,
    maxHeight: "85%",
  },
  entryHeader: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  entryHeaderName: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 18,
  },
  entryHeaderTotal: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 2,
  },
  entryBody: {
    padding: 14,
    gap: 8,
  },
  entrySectionLabel: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "800",
    textAlign: "right",
    marginTop: 6,
  },
  entryInputRow: {
    flexDirection: "row-reverse",
    gap: 8,
  },
  entryNumberInput: {
    flex: 1,
    backgroundColor: "#0B1020",
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  entryAddBtn: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  xRow: {
    flexDirection: "row-reverse",
    gap: 8,
  },
  xBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  xBtnSingle: {
    backgroundColor: "rgba(248, 113, 113, 0.18)",
    borderWidth: 1.5,
    borderColor: "#F87171",
  },
  xBtnDouble: {
    backgroundColor: "rgba(220, 38, 38, 0.25)",
    borderWidth: 1.5,
    borderColor: "#DC2626",
  },
  xBtnLabel: {
    color: "#FCA5A5",
    fontWeight: "900",
    fontSize: 22,
    letterSpacing: 1,
  },
  xBtnSub: {
    color: "#FCA5A5",
    fontSize: 11,
    fontWeight: "700",
  },
  entryHistory: {
    maxHeight: 200,
    backgroundColor: "#0B1020",
    borderRadius: 12,
    padding: 8,
    minHeight: 80,
  },
  emptyText: {
    color: "#475569",
    fontSize: 12,
    textAlign: "center",
    paddingVertical: 16,
    fontStyle: "italic",
  },
  histItem: {
    flexDirection: "row-reverse",
    alignItems: "center",
    backgroundColor: "#151B30",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    gap: 8,
  },
  histIdx: {
    fontSize: 11,
    fontWeight: "800",
    width: 56,
    textAlign: "right",
  },
  histValue: {
    flex: 1,
    color: "#fff",
    fontSize: 15,
    fontWeight: "800",
    textAlign: "center",
  },
  histDelete: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "rgba(248, 113, 113, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  entryClose: {
    backgroundColor: "#1E293B",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 6,
  },
  entryCloseText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
  },
  // Results modal
  resultsCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#151B30",
    borderRadius: 24,
    padding: 20,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(251, 191, 36, 0.3)",
  },
  trophyWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(251, 191, 36, 0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
    borderWidth: 2,
    borderColor: "rgba(251, 191, 36, 0.3)",
  },
  resultsTitle: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "900",
  },
  resultsSub: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
    marginBottom: 16,
  },
  resultsList: {
    width: "100%",
    gap: 8,
    marginBottom: 16,
  },
  resultRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    backgroundColor: "#0B1020",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.05)",
    gap: 10,
  },
  resultRowWinner: {
    backgroundColor: "rgba(16, 185, 129, 0.12)",
    borderColor: "#10B981",
  },
  resultRowLoser: {
    backgroundColor: "rgba(248, 113, 113, 0.08)",
    borderColor: "rgba(248, 113, 113, 0.3)",
  },
  rankWrap: {
    width: 36,
    alignItems: "center",
  },
  rank: {
    fontSize: 18,
    fontWeight: "900",
    color: "#fff",
  },
  resultName: {
    flex: 1,
    color: "#fff",
    fontSize: 15,
    fontWeight: "800",
    textAlign: "right",
  },
  resultTotal: {
    fontSize: 22,
    fontWeight: "900",
  },
  resultActions: {
    flexDirection: "row-reverse",
    gap: 8,
    width: "100%",
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 100,
  },
  actionBtnPrimary: {
    backgroundColor: "#FBBF24",
  },
  actionBtnPrimaryText: {
    color: "#0B1020",
    fontWeight: "900",
    fontSize: 14,
  },
  actionBtnSecondary: {
    backgroundColor: "#1E293B",
  },
  actionBtnSecondaryText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 14,
  },
});
