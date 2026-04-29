import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, Modal, Alert, Pressable, Animated, Easing,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

// ============== Types ==============
type Role =
  | "citizen" | "doctor" | "detective" | "sniper" | "bomber"
  | "citizen_leader" | "mafia_leader" | "silencer_mafia";
type Team = "citizens" | "mafia";

type Player = {
  id: string;
  name: string;
  role: Role;
  alive: boolean;
  silencedNextDay: boolean;
  hasUsedSnipe: boolean;
  isLeaderRevealed: boolean;
  eliminationReason?: string;
  eliminationRound?: number;
};

type RoleCounts = Record<Role, number>;

type NightActions = {
  doctorProtectId?: string | null;
  mafiaTargetId?: string | null;
  silencerTargetId?: string | null;
  detectiveTargetId?: string | null;
  sniperTargetId?: string | null;
  sniperSkip?: boolean;
};

type Phase =
  | "intro" | "players" | "roleCounts" | "distribution" | "manualAssign"
  | "reveal" | "nightStart"
  | "nightDoctor" | "nightMafia" | "nightSilencer" | "nightDetective" | "nightSniper"
  | "nightSummary"
  | "dayResults" | "discussion" | "voting" | "voteResults"
  | "bomberPull" | "end";

const ROLE_INFO: Record<Role, { name: string; team: Team; emoji: string; desc: string; color: string }> = {
  citizen: { name: "مواطن صالح", team: "citizens", emoji: "👤", desc: "لاعب عادي يحاول كشف المافيا", color: "#10B981" },
  doctor: { name: "دكتور", team: "citizens", emoji: "🩺", desc: "يحمي لاعباً كل ليلة (لا يحمي نفس الشخص ليلتين متتاليتين)", color: "#06B6D4" },
  detective: { name: "محقق", team: "citizens", emoji: "🔍", desc: "يكشف هوية لاعب كل ليلة", color: "#3B82F6" },
  sniper: { name: "قناص", team: "citizens", emoji: "🎯", desc: "طلقة واحدة فقط: إن أصاب مافيا يبقى، إن أصاب مواطناً يخرج معه", color: "#F59E0B" },
  bomber: { name: "متفجر", team: "citizens", emoji: "💣", desc: "إذا خرج من اللعبة يسحب لاعباً معه", color: "#EF4444" },
  citizen_leader: { name: "شيخ الصالحين", team: "citizens", emoji: "👑", desc: "إذا كشف كارتته يصبح صوته 3 أصوات", color: "#A855F7" },
  mafia_leader: { name: "شيخ المافيا", team: "mafia", emoji: "🎩", desc: "كل ليلة يختار لاعباً للقتل", color: "#DC2626" },
  silencer_mafia: { name: "مافيا التسكيت", team: "mafia", emoji: "🤐", desc: "يُسكت لاعباً كل ليلة. يرث القتل عند خروج الشيخ", color: "#991B1B" },
};

const ROLE_LIST: Role[] = [
  "citizen", "doctor", "detective", "sniper", "bomber",
  "citizen_leader", "mafia_leader", "silencer_mafia",
];

// Distinct icon per role for the reveal card
const ROLE_ICON: Record<Role, keyof typeof Ionicons.glyphMap> = {
  citizen: "shield-checkmark",
  doctor: "medkit",
  detective: "search",
  sniper: "locate",
  bomber: "flame",
  citizen_leader: "ribbon",
  mafia_leader: "skull",
  silencer_mafia: "volume-mute",
};

const MIN_PLAYERS = 6;
const MAX_PLAYERS = 14;

const initialRoleCounts: RoleCounts = {
  citizen: 0, doctor: 0, detective: 0, sniper: 0, bomber: 0,
  citizen_leader: 0, mafia_leader: 0, silencer_mafia: 0,
};

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const haptic = (type: "light" | "medium" | "heavy" | "success" | "warning" | "error" = "light") => {
  if (Platform.OS === "web") return;
  try {
    if (type === "light") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    else if (type === "medium") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    else if (type === "heavy") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    else if (type === "success") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    else if (type === "warning") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    else if (type === "error") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  } catch {}
};

// ============== Main Component ==============
export default function MafiaGame() {
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>("intro");
  const [playerNames, setPlayerNames] = useState<string[]>([]);
  const [newPlayerName, setNewPlayerName] = useState("");

  const [roleCounts, setRoleCounts] = useState<RoleCounts>({ ...initialRoleCounts });
  const [distribution, setDistribution] = useState<"random" | "manual">("random");

  const [players, setPlayers] = useState<Player[]>([]);
  const [manualAssign, setManualAssign] = useState<Record<string, Role | null>>({});

  const [revealIndex, setRevealIndex] = useState(0);
  const [revealShown, setRevealShown] = useState(false);

  const [round, setRound] = useState(1);
  const [nightActions, setNightActions] = useState<NightActions>({});
  const [lastDoctorProtect, setLastDoctorProtect] = useState<string | null>(null);
  const [detectiveResult, setDetectiveResult] = useState<{ name: string; isMafia: boolean } | null>(null);
  const [nightSummary, setNightSummary] = useState<{ id: string; reason: string; name: string; role: Role }[]>([]);
  const [protectedThisNight, setProtectedThisNight] = useState<string | null>(null);

  const [voteVoterIndex, setVoteVoterIndex] = useState(0);
  const [voteTally, setVoteTally] = useState<Record<string, number>>({});
  const [eliminatedPlayer, setEliminatedPlayer] = useState<Player | null>(null);

  const [pendingBomberPull, setPendingBomberPull] = useState<string | null>(null);
  const [winner, setWinner] = useState<Team | null>(null);

  // ============== Helpers ==============
  const totalPlayers = playerNames.length;
  const totalRolesSum = useMemo(
    () => Object.values(roleCounts).reduce((s, v) => s + v, 0),
    [roleCounts]
  );

  const alivePlayers = useMemo(() => players.filter((p) => p.alive), [players]);
  const aliveMafia = alivePlayers.filter(
    (p) => p.role === "mafia_leader" || p.role === "silencer_mafia"
  );
  const aliveCitizens = alivePlayers.filter(
    (p) => ROLE_INFO[p.role].team === "citizens"
  );
  const mafiaLeaderAlive = !!alivePlayers.find((p) => p.role === "mafia_leader");

  const checkWinner = useCallback((updated: Player[]): Team | null => {
    const aliveAll = updated.filter((p) => p.alive);
    const mafiaCount = aliveAll.filter((p) => ROLE_INFO[p.role].team === "mafia").length;
    const citizenCount = aliveAll.length - mafiaCount;
    if (mafiaCount === 0) return "citizens";
    if (mafiaCount >= citizenCount) return "mafia";
    return null;
  }, []);

  // ============== Phase: Intro ==============
  const goNextFromIntro = () => {
    haptic("medium");
    setPhase("players");
  };

  // ============== Phase: Players ==============
  const addPlayer = () => {
    const name = newPlayerName.trim();
    if (!name) return;
    if (playerNames.length >= MAX_PLAYERS) {
      if (Platform.OS === "web") window.alert(`الحد الأقصى ${MAX_PLAYERS} لاعب`);
      else Alert.alert("تنبيه", `الحد الأقصى ${MAX_PLAYERS} لاعب`);
      return;
    }
    setPlayerNames((p) => [...p, name]);
    setNewPlayerName("");
    haptic("light");
  };

  const removePlayer = (idx: number) => {
    setPlayerNames((p) => p.filter((_, i) => i !== idx));
    haptic("light");
  };

  const renamePlayer = (idx: number, name: string) => {
    setPlayerNames((p) => p.map((n, i) => (i === idx ? name : n)));
  };

  const goToRoleCounts = () => {
    if (playerNames.length < MIN_PLAYERS) {
      if (Platform.OS === "web") window.alert(`الحد الأدنى ${MIN_PLAYERS} لاعبين`);
      else Alert.alert("تنبيه", `الحد الأدنى ${MIN_PLAYERS} لاعبين`);
      return;
    }
    haptic("medium");
    setPhase("roleCounts");
  };

  // ============== Phase: Role Counts ==============
  const incRole = (r: Role, delta: number) => {
    setRoleCounts((rc) => {
      const next = Math.max(0, (rc[r] || 0) + delta);
      return { ...rc, [r]: next };
    });
    haptic("light");
  };

  const goToDistribution = () => {
    if (totalRolesSum !== totalPlayers) {
      const msg = `يجب أن يكون مجموع الكارتات (${totalRolesSum}) = عدد اللاعبين (${totalPlayers})`;
      if (Platform.OS === "web") window.alert(msg);
      else Alert.alert("تنبيه", msg);
      return;
    }
    if ((roleCounts.mafia_leader || 0) === 0) {
      const msg = "يجب اختيار شيخ مافيا واحد على الأقل";
      if (Platform.OS === "web") window.alert(msg);
      else Alert.alert("تنبيه", msg);
      return;
    }
    haptic("medium");
    setPhase("distribution");
  };

  // ============== Phase: Distribution ==============
  const buildRoleBag = (): Role[] => {
    const bag: Role[] = [];
    ROLE_LIST.forEach((r) => {
      for (let i = 0; i < (roleCounts[r] || 0); i++) bag.push(r);
    });
    return bag;
  };

  const startWithRandom = () => {
    const bag = shuffle(buildRoleBag());
    const ps: Player[] = playerNames.map((name, i) => ({
      id: `p-${i}-${Date.now()}`,
      name,
      role: bag[i] || "citizen",
      alive: true,
      silencedNextDay: false,
      hasUsedSnipe: false,
      isLeaderRevealed: false,
    }));
    setPlayers(ps);
    setRevealIndex(0);
    setRevealShown(false);
    haptic("success");
    setPhase("reveal");
  };

  const startManualAssign = () => {
    const init: Record<string, Role | null> = {};
    playerNames.forEach((_, i) => { init[`m-${i}`] = null; });
    setManualAssign(init);
    haptic("medium");
    setPhase("manualAssign");
  };

  // ============== Phase: Manual Assign ==============
  const setManualRole = (key: string, role: Role | null) => {
    setManualAssign((m) => ({ ...m, [key]: role }));
    haptic("light");
  };

  const manualUsedCounts = useMemo(() => {
    const c: Partial<RoleCounts> = {};
    Object.values(manualAssign).forEach((r) => {
      if (r) c[r] = (c[r] || 0) + 1;
    });
    return c;
  }, [manualAssign]);

  const finishManualAssign = () => {
    // Validate all assigned and counts match
    const allAssigned = playerNames.every((_, i) => !!manualAssign[`m-${i}`]);
    if (!allAssigned) {
      if (Platform.OS === "web") window.alert("يجب توزيع الأدوار على جميع اللاعبين");
      else Alert.alert("تنبيه", "يجب توزيع الأدوار على جميع اللاعبين");
      return;
    }
    for (const r of ROLE_LIST) {
      if ((roleCounts[r] || 0) !== (manualUsedCounts[r] || 0)) {
        const msg = `عدد ${ROLE_INFO[r].name} يجب أن يكون ${roleCounts[r]} (الحالي: ${manualUsedCounts[r] || 0})`;
        if (Platform.OS === "web") window.alert(msg);
        else Alert.alert("تنبيه", msg);
        return;
      }
    }
    const ps: Player[] = playerNames.map((name, i) => ({
      id: `p-${i}-${Date.now()}`,
      name,
      role: manualAssign[`m-${i}`]!,
      alive: true,
      silencedNextDay: false,
      hasUsedSnipe: false,
      isLeaderRevealed: false,
    }));
    setPlayers(ps);
    setRevealIndex(0);
    setRevealShown(false);
    haptic("success");
    setPhase("reveal");
  };

  // ============== Phase: Reveal ==============
  const revealCurrent = () => {
    setRevealShown(true);
    haptic("heavy");
  };

  const nextReveal = () => {
    setRevealShown(false);
    if (revealIndex + 1 >= players.length) {
      setRound(1);
      setNightActions({});
      setLastDoctorProtect(null);
      setProtectedThisNight(null);
      setNightSummary([]);
      haptic("success");
      setPhase("nightStart");
    } else {
      setRevealIndex(revealIndex + 1);
      haptic("light");
    }
  };

  // ============== Night flow ==============
  const startNight = () => {
    haptic("medium");
    // skip phases without role
    setNightActions({});
    setProtectedThisNight(null);
    advanceNightFrom("nightStart");
  };

  const advanceNightFrom = (current: Phase) => {
    const sequence: Phase[] = [
      "nightStart", "nightDoctor", "nightMafia", "nightSilencer",
      "nightDetective", "nightSniper", "nightSummary",
    ];
    const idx = sequence.indexOf(current);
    let next: Phase | null = null;
    for (let i = idx + 1; i < sequence.length; i++) {
      const p = sequence[i];
      if (p === "nightDoctor" && alivePlayers.some((x) => x.role === "doctor")) { next = p; break; }
      if (p === "nightMafia" && aliveMafia.length > 0) { next = p; break; }
      if (p === "nightSilencer" && alivePlayers.some((x) => x.role === "silencer_mafia")) { next = p; break; }
      if (p === "nightDetective" && alivePlayers.some((x) => x.role === "detective")) { next = p; break; }
      if (p === "nightSniper") {
        const sniper = alivePlayers.find((x) => x.role === "sniper" && !x.hasUsedSnipe);
        if (sniper) { next = p; break; }
      }
      if (p === "nightSummary") { next = p; break; }
    }
    if (next === "nightSummary") {
      resolveNight();
    } else if (next) {
      setPhase(next);
    }
  };

  const submitDoctorChoice = (id: string | null) => {
    setNightActions((n) => ({ ...n, doctorProtectId: id }));
    haptic("medium");
    advanceNightFrom("nightDoctor");
  };
  const submitMafiaChoice = (id: string | null) => {
    setNightActions((n) => ({ ...n, mafiaTargetId: id }));
    haptic("heavy");
    advanceNightFrom("nightMafia");
  };
  const submitSilencerChoice = (id: string | null) => {
    setNightActions((n) => ({ ...n, silencerTargetId: id }));
    haptic("medium");
    advanceNightFrom("nightSilencer");
  };
  const submitDetectiveChoice = (id: string) => {
    setNightActions((n) => ({ ...n, detectiveTargetId: id }));
    haptic("medium");
    const target = players.find((p) => p.id === id);
    if (target) {
      setDetectiveResult({ name: target.name, isMafia: ROLE_INFO[target.role].team === "mafia" });
    }
  };
  const dismissDetectiveResult = () => {
    setDetectiveResult(null);
    advanceNightFrom("nightDetective");
  };
  const submitSniperChoice = (id: string | null, skip: boolean) => {
    setNightActions((n) => ({ ...n, sniperTargetId: id, sniperSkip: skip }));
    haptic(skip ? "light" : "heavy");
    advanceNightFrom("nightSniper");
  };

  // ============== Resolve Night ==============
  const resolveNight = () => {
    const actions = { ...nightActions };
    const updated: Player[] = players.map((p) => ({ ...p }));
    const summary: { id: string; reason: string; name: string; role: Role }[] = [];
    const protectedId = actions.doctorProtectId || null;
    setProtectedThisNight(protectedId);

    // 1. Mafia kill (blocked by doctor protect)
    if (actions.mafiaTargetId && actions.mafiaTargetId !== protectedId) {
      const t = updated.find((p) => p.id === actions.mafiaTargetId);
      if (t && t.alive) {
        t.alive = false;
        t.eliminationReason = "قتل المافيا";
        t.eliminationRound = round;
        summary.push({ id: t.id, reason: "قُتل من قِبَل المافيا", name: t.name, role: t.role });
      }
    }

    // 2. Silencer applies (target is silenced for next discussion)
    if (actions.silencerTargetId) {
      const t = updated.find((p) => p.id === actions.silencerTargetId);
      if (t && t.alive) t.silencedNextDay = true;
    }

    // 3. Sniper resolution (if not skipped)
    if (!actions.sniperSkip && actions.sniperTargetId) {
      const sniper = updated.find((p) => p.role === "sniper" && p.alive && !p.hasUsedSnipe);
      const target = updated.find((p) => p.id === actions.sniperTargetId);
      if (sniper && target && target.alive) {
        sniper.hasUsedSnipe = true;
        const targetIsMafia = ROLE_INFO[target.role].team === "mafia";
        // target dies if not protected by doctor
        if (target.id === protectedId) {
          // protected from sniper too
          summary.push({ id: target.id, reason: "أصابه القناص لكن الدكتور حماه", name: target.name, role: target.role });
        } else {
          target.alive = false;
          target.eliminationReason = "قنص القناص";
          target.eliminationRound = round;
          summary.push({ id: target.id, reason: "قنصه القناص", name: target.name, role: target.role });
          if (!targetIsMafia) {
            // sniper also dies (shot a citizen)
            sniper.alive = false;
            sniper.eliminationReason = "قنص مواطن صالح";
            sniper.eliminationRound = round;
            summary.push({ id: sniper.id, reason: "خرج القناص لأنه أصاب مواطناً", name: sniper.name, role: sniper.role });
          }
        }
      }
    }

    // Track "protected successfully" message
    if (actions.mafiaTargetId && actions.mafiaTargetId === protectedId) {
      const t = updated.find((p) => p.id === protectedId);
      if (t) {
        summary.push({ id: t.id, reason: "حماه الدكتور من المافيا", name: t.name, role: t.role });
      }
    }

    setLastDoctorProtect(protectedId);
    setPlayers(updated);
    setNightSummary(summary);
    setPhase("dayResults");

    // Check winner
    const w = checkWinner(updated);
    if (w) {
      setWinner(w);
      setPhase("end");
    }
  };

  // ============== Day Results -> Discussion -> Voting ==============
  const startDiscussion = () => {
    haptic("medium");
    setPhase("discussion");
  };

  const startVoting = () => {
    setVoteTally({});
    setVoteVoterIndex(0);
    haptic("medium");
    setPhase("voting");
  };

  const aliveVoters = useMemo(
    () => players.filter((p) => p.alive && !p.silencedNextDay),
    [players]
  );

  const submitVote = (targetId: string) => {
    const voter = aliveVoters[voteVoterIndex];
    if (!voter) return;
    const weight = (voter.role === "citizen_leader" && voter.isLeaderRevealed) ? 3 : 1;
    setVoteTally((t) => ({ ...t, [targetId]: (t[targetId] || 0) + weight }));
    haptic("medium");
    if (voteVoterIndex + 1 >= aliveVoters.length) {
      // resolve voting
      setTimeout(() => resolveVoting(targetId, weight), 200);
    } else {
      setVoteVoterIndex(voteVoterIndex + 1);
    }
  };

  const skipVote = () => {
    if (voteVoterIndex + 1 >= aliveVoters.length) {
      setTimeout(() => resolveVoting(null, 0), 200);
    } else {
      setVoteVoterIndex(voteVoterIndex + 1);
      haptic("light");
    }
  };

  const resolveVoting = (lastTarget: string | null, lastWeight: number) => {
    // Use latest tally including the last vote
    const final: Record<string, number> = { ...voteTally };
    if (lastTarget) final[lastTarget] = (final[lastTarget] || 0) + lastWeight;

    // Find max
    let maxId: string | null = null;
    let maxV = 0;
    let tied = false;
    Object.entries(final).forEach(([id, v]) => {
      if (v > maxV) { maxV = v; maxId = id; tied = false; }
      else if (v === maxV) { tied = true; }
    });

    if (!maxId || maxV === 0 || tied) {
      // No elimination
      setEliminatedPlayer(null);
      setVoteTally(final);
      haptic("warning");
      setPhase("voteResults");
      return;
    }

    const target = players.find((p) => p.id === maxId);
    if (!target) {
      setEliminatedPlayer(null);
      setVoteTally(final);
      setPhase("voteResults");
      return;
    }
    setVoteTally(final);
    setEliminatedPlayer(target);
    haptic("error");

    // If bomber → trigger bomber pull after voteResults shown
    if (target.role === "bomber") {
      setPendingBomberPull(target.id);
    }
    setPhase("voteResults");
  };

  const confirmEliminationFromVote = () => {
    if (!eliminatedPlayer) {
      // No elimination → go back to night
      goToNextRound();
      return;
    }
    const updated = players.map((p) =>
      p.id === eliminatedPlayer.id
        ? { ...p, alive: false, eliminationReason: "تصويت اللاعبين", eliminationRound: round }
        : p
    );
    setPlayers(updated);

    if (pendingBomberPull) {
      haptic("warning");
      setPhase("bomberPull");
      return;
    }

    const w = checkWinner(updated);
    if (w) {
      setWinner(w);
      setPhase("end");
      return;
    }
    goToNextRound(updated);
  };

  const submitBomberPull = (id: string) => {
    const updated = players.map((p) => {
      if (p.id === id) return { ...p, alive: false, eliminationReason: "سحبه المتفجر", eliminationRound: round };
      return p;
    });
    setPlayers(updated);
    setPendingBomberPull(null);
    haptic("error");

    const w = checkWinner(updated);
    if (w) {
      setWinner(w);
      setPhase("end");
      return;
    }
    setTimeout(() => goToNextRound(updated), 200);
  };

  const goToNextRound = (updatedPlayers?: Player[]) => {
    // Clear silenced flag for the next discussion (silence applies one cycle)
    const base = updatedPlayers || players;
    const cleared = base.map((p) => ({ ...p, silencedNextDay: false }));
    setPlayers(cleared);
    setRound((r) => r + 1);
    setNightActions({});
    setNightSummary([]);
    setEliminatedPlayer(null);
    setVoteTally({});
    setVoteVoterIndex(0);
    haptic("medium");
    setPhase("nightStart");
  };

  // ============== Reveal Citizen Leader during discussion ==============
  const revealCitizenLeader = (id: string) => {
    setPlayers((ps) => ps.map((p) => p.id === id ? { ...p, isLeaderRevealed: true } : p));
    haptic("success");
  };

  // ============== Restart ==============
  const restartGame = () => {
    setPhase("intro");
    setPlayerNames([]);
    setNewPlayerName("");
    setRoleCounts({ ...initialRoleCounts });
    setDistribution("random");
    setPlayers([]);
    setManualAssign({});
    setRevealIndex(0);
    setRevealShown(false);
    setRound(1);
    setNightActions({});
    setLastDoctorProtect(null);
    setDetectiveResult(null);
    setNightSummary([]);
    setProtectedThisNight(null);
    setVoteVoterIndex(0);
    setVoteTally({});
    setEliminatedPlayer(null);
    setPendingBomberPull(null);
    setWinner(null);
    haptic("success");
  };

  const exitToHome = () => {
    const doIt = () => router.back();
    if (Platform.OS === "web") {
      if (window.confirm("الخروج من اللعبة سيُلغي التقدم الحالي. متابعة؟")) doIt();
    } else {
      Alert.alert("تأكيد", "الخروج من اللعبة سيُلغي التقدم الحالي", [
        { text: "إلغاء", style: "cancel" },
        { text: "خروج", style: "destructive", onPress: doIt },
      ]);
    }
  };

  // ============== Render ==============
  return (
    <View style={styles.root} testID="mafia-screen">
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        {/* Top bar */}
        {phase !== "intro" && (
          <View style={styles.topBar}>
            <TouchableOpacity testID="mafia-back" onPress={exitToHome} style={styles.iconBtn}>
              <Ionicons name="arrow-forward" size={22} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.topTitle}>لعبة المافيا</Text>
            <View style={{ width: 42 }} />
          </View>
        )}

        {phase === "intro" && <IntroScreen onStart={goNextFromIntro} onBack={() => router.back()} />}
        {phase === "players" && (
          <PlayersScreen
            names={playerNames} newName={newPlayerName} setNewName={setNewPlayerName}
            onAdd={addPlayer} onRemove={removePlayer} onRename={renamePlayer}
            onNext={goToRoleCounts}
          />
        )}
        {phase === "roleCounts" && (
          <RoleCountsScreen
            counts={roleCounts} totalPlayers={totalPlayers} totalSum={totalRolesSum}
            onInc={incRole} onNext={goToDistribution}
          />
        )}
        {phase === "distribution" && (
          <DistributionScreen
            distribution={distribution} setDistribution={setDistribution}
            onRandom={startWithRandom} onManual={startManualAssign}
          />
        )}
        {phase === "manualAssign" && (
          <ManualAssignScreen
            playerNames={playerNames} assign={manualAssign} setRole={setManualRole}
            counts={roleCounts} usedCounts={manualUsedCounts}
            onNext={finishManualAssign}
          />
        )}
        {phase === "reveal" && (
          <RevealScreen
            player={players[revealIndex]} index={revealIndex} total={players.length}
            shown={revealShown} onReveal={revealCurrent} onNext={nextReveal}
          />
        )}
        {phase === "nightStart" && (
          <NightStartScreen round={round} onStart={startNight} />
        )}
        {phase === "nightDoctor" && (
          <NightActionScreen
            roleKey="doctor" title="دور الدكتور" prompt="اختر لاعباً لحمايته"
            instruction="يرجى تمرير الجوال إلى الدكتور"
            color={ROLE_INFO.doctor.color}
            players={alivePlayers}
            disabledIds={lastDoctorProtect ? [lastDoctorProtect] : []}
            disabledLabel="(محمي بالأمس)"
            allowSkip={false}
            onSubmit={(id) => submitDoctorChoice(id)}
          />
        )}
        {phase === "nightMafia" && (
          <NightActionScreen
            roleKey="mafia"
            title={mafiaLeaderAlive ? "دور شيخ المافيا" : "دور مافيا التسكيت (وريث القتل)"}
            prompt="اختر لاعباً لاغتياله (المافيا لا يقتلون أحداً من فريقهم)"
            instruction={`يرجى تمرير الجوال إلى ${mafiaLeaderAlive ? "شيخ المافيا" : "مافيا التسكيت"}`}
            color={ROLE_INFO.mafia_leader.color}
            players={alivePlayers.filter((p) => ROLE_INFO[p.role].team !== "mafia")}
            allowSkip={false}
            onSubmit={(id) => submitMafiaChoice(id)}
          />
        )}
        {phase === "nightSilencer" && (
          <NightActionScreen
            roleKey="silencer_mafia" title="دور مافيا التسكيت"
            prompt="اختر لاعباً لإسكاته في النقاش القادم"
            instruction="يرجى تمرير الجوال إلى مافيا التسكيت"
            color={ROLE_INFO.silencer_mafia.color}
            players={alivePlayers}
            allowSkip
            onSubmit={(id) => submitSilencerChoice(id)}
          />
        )}
        {phase === "nightDetective" && !detectiveResult && (
          <NightActionScreen
            roleKey="detective" title="دور المحقق"
            prompt="اختر لاعباً للتحقق من هويته"
            instruction="يرجى تمرير الجوال إلى المحقق"
            color={ROLE_INFO.detective.color}
            players={alivePlayers}
            allowSkip={false}
            onSubmit={(id) => submitDetectiveChoice(id!)}
          />
        )}
        {phase === "nightDetective" && detectiveResult && (
          <DetectiveResultScreen result={detectiveResult} onDismiss={dismissDetectiveResult} />
        )}
        {phase === "nightSniper" && (
          <NightActionScreen
            roleKey="sniper" title="دور القناص"
            prompt="اختر لاعباً للقنص أو تخطّى"
            instruction="يرجى تمرير الجوال إلى القناص"
            color={ROLE_INFO.sniper.color}
            players={alivePlayers}
            allowSkip
            onSubmit={(id, skip) => submitSniperChoice(id, !!skip)}
          />
        )}
        {phase === "dayResults" && (
          <DayResultsScreen
            round={round} summary={nightSummary}
            onContinue={startDiscussion}
          />
        )}
        {phase === "discussion" && (
          <DiscussionScreen
            players={players} round={round}
            onRevealLeader={revealCitizenLeader}
            onStartVote={startVoting}
          />
        )}
        {phase === "voting" && (
          <VotingScreen
            voters={aliveVoters} voterIndex={voteVoterIndex}
            allAlive={alivePlayers}
            tally={voteTally}
            onVote={submitVote} onSkip={skipVote}
          />
        )}
        {phase === "voteResults" && (
          <VoteResultsScreen
            eliminated={eliminatedPlayer} tally={voteTally} players={players}
            onConfirm={confirmEliminationFromVote}
          />
        )}
        {phase === "bomberPull" && (
          <BomberPullScreen
            bomberName={players.find((p) => p.id === pendingBomberPull)?.name || ""}
            options={players.filter((p) => p.alive && p.id !== pendingBomberPull)}
            onPick={submitBomberPull}
          />
        )}
        {phase === "end" && winner && (
          <EndScreen winner={winner} players={players} onRestart={restartGame} onExit={() => router.back()} />
        )}
      </SafeAreaView>
    </View>
  );
}

// ============== Sub-screens ==============

function IntroScreen({ onStart, onBack }: { onStart: () => void; onBack: () => void }) {
  // Pulsing red circle, gunshot flashes
  const flashes = useRef([new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)]).current;
  const titleScale = useRef(new Animated.Value(0.7)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const subtitleOpacity = useRef(new Animated.Value(0)).current;
  const btnOpacity = useRef(new Animated.Value(0)).current;
  const btnPulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let mounted = true;
    Animated.parallel([
      Animated.spring(titleScale, { toValue: 1, useNativeDriver: true, friction: 5, tension: 80 }),
      Animated.timing(titleOpacity, { toValue: 1, duration: 600, useNativeDriver: true }),
    ]).start();
    Animated.timing(subtitleOpacity, { toValue: 1, duration: 700, delay: 600, useNativeDriver: true }).start();
    Animated.timing(btnOpacity, { toValue: 1, duration: 500, delay: 1200, useNativeDriver: true }).start();

    // Random gunshot flashes — only while mounted
    const gunshot = (anim: Animated.Value, delay: number) => {
      const loop = () => {
        if (!mounted) return;
        Animated.sequence([
          Animated.delay(delay + Math.random() * 1500),
          Animated.timing(anim, { toValue: 1, duration: 80, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0, duration: 200, useNativeDriver: true }),
        ]).start(() => {
          if (!mounted) return;
          haptic("heavy");
          loop();
        });
      };
      loop();
    };
    gunshot(flashes[0], 600);
    gunshot(flashes[1], 1200);
    gunshot(flashes[2], 1800);

    // Button pulse
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(btnPulse, { toValue: 1.08, duration: 800, useNativeDriver: true, easing: Easing.inOut(Easing.quad) }),
        Animated.timing(btnPulse, { toValue: 1, duration: 800, useNativeDriver: true, easing: Easing.inOut(Easing.quad) }),
      ])
    );
    pulseLoop.start();
    return () => {
      mounted = false;
      pulseLoop.stop();
      flashes.forEach((f) => f.stopAnimation());
    };
  }, [titleScale, titleOpacity, subtitleOpacity, btnOpacity, btnPulse, flashes]);

  return (
    <View style={styles.introWrap}>
      {/* Flashes */}
      {flashes.map((f, i) => (
        <Animated.View key={i}
          pointerEvents="none"
          style={[styles.gunshotFlash, {
            opacity: f,
            top: i === 0 ? "20%" : i === 1 ? "55%" : "75%",
            left: i % 2 === 0 ? "10%" : "60%",
          }]}
        />
      ))}

      <TouchableOpacity onPress={onBack} style={[styles.iconBtn, styles.introBack]}>
        <Ionicons name="arrow-forward" size={22} color="#fff" />
      </TouchableOpacity>

      <View style={styles.introContent}>
        <Animated.View style={{ transform: [{ scale: titleScale }], opacity: titleOpacity, alignItems: "center" }}>
          <Text style={styles.introEmoji}>🎩</Text>
          <Text style={styles.introTitle}>المافيا</Text>
          <View style={styles.introBloodLine} />
        </Animated.View>

        <Animated.Text style={[styles.introSubtitle, { opacity: subtitleOpacity }]}>
          مدينة في خطر… المافيا تتحرك ليلاً{"\n"}واجتمع المواطنون للنجاة
        </Animated.Text>

        <Animated.View style={{ opacity: btnOpacity, transform: [{ scale: btnPulse }] }}>
          <TouchableOpacity testID="mafia-start-button" onPress={onStart} style={styles.introBtn}>
            <Ionicons name="play" size={22} color="#fff" />
            <Text style={styles.introBtnText}>بدء اللعبة</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </View>
  );
}

function PlayersScreen(props: {
  names: string[]; newName: string; setNewName: (s: string) => void;
  onAdd: () => void; onRemove: (i: number) => void; onRename: (i: number, n: string) => void;
  onNext: () => void;
}) {
  const { names, newName, setNewName, onAdd, onRemove, onRename, onNext } = props;
  const valid = names.length >= MIN_PLAYERS && names.length <= MAX_PLAYERS;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.phaseScroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.phaseTitle}>إضافة اللاعبين</Text>
        <Text style={styles.phaseHint}>
          عدد اللاعبين بين {MIN_PLAYERS} و {MAX_PLAYERS} • الحالي: {names.length}
        </Text>

        <View style={styles.addPlayerRow}>
          <TextInput
            testID="new-player-input"
            style={styles.addPlayerInput}
            value={newName}
            onChangeText={setNewName}
            placeholder="اسم اللاعب..."
            placeholderTextColor="#64748B"
            textAlign="right"
            onSubmitEditing={onAdd}
            returnKeyType="done"
          />
          <TouchableOpacity testID="add-player-btn" onPress={onAdd} style={styles.addPlayerBtn}>
            <Ionicons name="add" size={22} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={{ gap: 8, marginTop: 14 }}>
          {names.map((n, i) => (
            <View key={i} style={styles.playerRow} testID={`player-row-${i}`}>
              <TouchableOpacity testID={`remove-player-${i}`} onPress={() => onRemove(i)} style={styles.removeBtn}>
                <Ionicons name="trash" size={16} color="#F87171" />
              </TouchableOpacity>
              <TextInput
                style={styles.playerNameInput}
                value={n} onChangeText={(v) => onRename(i, v)}
                textAlign="right"
              />
              <View style={styles.playerNumber}>
                <Text style={styles.playerNumberText}>{i + 1}</Text>
              </View>
            </View>
          ))}
        </View>

        {names.length === 0 && (
          <Text style={styles.emptyHint}>أضف على الأقل {MIN_PLAYERS} لاعبين</Text>
        )}

        <TouchableOpacity
          testID="players-next-btn"
          onPress={onNext}
          disabled={!valid}
          style={[styles.primaryBtn, !valid && { opacity: 0.4 }]}
        >
          <Text style={styles.primaryBtnText}>التالي</Text>
          <Ionicons name="arrow-back" size={18} color="#0B1020" />
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function RoleCountsScreen(props: {
  counts: RoleCounts; totalPlayers: number; totalSum: number;
  onInc: (r: Role, delta: number) => void; onNext: () => void;
}) {
  const { counts, totalPlayers, totalSum, onInc, onNext } = props;
  const valid = totalSum === totalPlayers && counts.mafia_leader > 0;
  const remaining = totalPlayers - totalSum;

  return (
    <ScrollView contentContainerStyle={styles.phaseScroll}>
      <Text style={styles.phaseTitle}>توزيع الأدوار</Text>
      <Text style={styles.phaseHint}>
        مجموع الكارتات يجب أن يساوي عدد اللاعبين ({totalPlayers})
      </Text>

      <View style={[styles.sumPill, remaining === 0 ? styles.sumPillOk : styles.sumPillWarn]}>
        <Text style={styles.sumPillText}>
          {remaining === 0 ? "✓ المجموع مكتمل" : `متبقي: ${remaining}`} • مُسند: {totalSum}/{totalPlayers}
        </Text>
      </View>

      {ROLE_LIST.map((r) => {
        const info = ROLE_INFO[r];
        return (
          <View key={r} style={[styles.roleCard, { borderColor: info.color + "55" }]}>
            <View style={[styles.roleEmojiBox, { backgroundColor: info.color + "22" }]}>
              <Text style={styles.roleEmoji}>{info.emoji}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.roleName, { color: info.color }]}>{info.name}</Text>
              <Text style={styles.roleDesc}>{info.desc}</Text>
              <View style={[styles.teamBadge, info.team === "mafia" ? styles.teamBadgeMafia : styles.teamBadgeCit]}>
                <Text style={[styles.teamBadgeText, info.team === "mafia" ? { color: "#FCA5A5" } : { color: "#86EFAC" }]}>
                  {info.team === "mafia" ? "فريق المافيا" : "فريق المواطنين"}
                </Text>
              </View>
            </View>
            <View style={styles.counterCol}>
              <TouchableOpacity testID={`role-inc-${r}`} onPress={() => onInc(r, 1)} style={[styles.countBtn, { backgroundColor: info.color }]}>
                <Ionicons name="add" size={18} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.countValue}>{counts[r] || 0}</Text>
              <TouchableOpacity testID={`role-dec-${r}`} onPress={() => onInc(r, -1)} style={[styles.countBtn, styles.countBtnDec]}>
                <Ionicons name="remove" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        );
      })}

      <TouchableOpacity
        testID="role-counts-next"
        onPress={onNext}
        disabled={!valid}
        style={[styles.primaryBtn, !valid && { opacity: 0.4 }]}
      >
        <Text style={styles.primaryBtnText}>التالي</Text>
        <Ionicons name="arrow-back" size={18} color="#0B1020" />
      </TouchableOpacity>
    </ScrollView>
  );
}

function DistributionScreen(props: {
  distribution: "random" | "manual";
  setDistribution: (d: "random" | "manual") => void;
  onRandom: () => void; onManual: () => void;
}) {
  const { onRandom, onManual } = props;
  return (
    <ScrollView contentContainerStyle={styles.phaseScroll}>
      <Text style={styles.phaseTitle}>طريقة التوزيع</Text>
      <Text style={styles.phaseHint}>اختر كيف توزَّع الكارتات على اللاعبين</Text>

      <TouchableOpacity testID="distribute-random" onPress={onRandom} style={styles.bigCard}>
        <View style={[styles.bigCardIcon, { backgroundColor: "rgba(168, 85, 247, 0.18)" }]}>
          <Ionicons name="shuffle" size={32} color="#A855F7" />
        </View>
        <Text style={styles.bigCardTitle}>توزيع عشوائي</Text>
        <Text style={styles.bigCardDesc}>اللعبة تختار الكارت لكل لاعب بشكل عشوائي</Text>
      </TouchableOpacity>

      <TouchableOpacity testID="distribute-manual" onPress={onManual} style={styles.bigCard}>
        <View style={[styles.bigCardIcon, { backgroundColor: "rgba(6, 182, 212, 0.18)" }]}>
          <Ionicons name="hand-left" size={32} color="#06B6D4" />
        </View>
        <Text style={styles.bigCardTitle}>توزيع يدوي</Text>
        <Text style={styles.bigCardDesc}>أنت تختار الكارت لكل لاعب</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function ManualAssignScreen(props: {
  playerNames: string[]; assign: Record<string, Role | null>;
  setRole: (key: string, role: Role | null) => void;
  counts: RoleCounts; usedCounts: Partial<RoleCounts>;
  onNext: () => void;
}) {
  const { playerNames, assign, setRole, counts, usedCounts, onNext } = props;
  const [openFor, setOpenFor] = useState<string | null>(null);
  const totalUsed = Object.values(usedCounts).reduce((s, v) => s + (v || 0), 0);
  const ok = totalUsed === playerNames.length;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.phaseScroll}>
        <Text style={styles.phaseTitle}>التوزيع اليدوي</Text>
        <Text style={styles.phaseHint}>اضغط على كل لاعب واختر دوره</Text>

        <View style={styles.usedRow}>
          {ROLE_LIST.filter((r) => (counts[r] || 0) > 0).map((r) => (
            <View key={r} style={[styles.usedChip, { borderColor: ROLE_INFO[r].color + "55" }]}>
              <Text style={styles.usedChipEmoji}>{ROLE_INFO[r].emoji}</Text>
              <Text style={[styles.usedChipText, { color: ROLE_INFO[r].color }]}>
                {usedCounts[r] || 0}/{counts[r]}
              </Text>
            </View>
          ))}
        </View>

        {playerNames.map((name, i) => {
          const key = `m-${i}`;
          const role = assign[key];
          const info = role ? ROLE_INFO[role] : null;
          return (
            <TouchableOpacity
              key={key} testID={`assign-${i}`}
              onPress={() => setOpenFor(key)}
              style={[styles.assignRow, info && { borderColor: info.color }]}
            >
              <View style={styles.playerNumber}>
                <Text style={styles.playerNumberText}>{i + 1}</Text>
              </View>
              <Text style={styles.assignName}>{name}</Text>
              {info ? (
                <View style={[styles.assignRolePill, { backgroundColor: info.color + "22" }]}>
                  <Text style={[styles.assignRoleText, { color: info.color }]}>
                    {info.emoji} {info.name}
                  </Text>
                </View>
              ) : (
                <Text style={styles.assignEmpty}>اضغط لاختيار الدور</Text>
              )}
            </TouchableOpacity>
          );
        })}

        <TouchableOpacity
          testID="manual-assign-next"
          onPress={onNext}
          disabled={!ok}
          style={[styles.primaryBtn, !ok && { opacity: 0.4 }]}
        >
          <Text style={styles.primaryBtnText}>بدء اللعبة</Text>
          <Ionicons name="arrow-back" size={18} color="#0B1020" />
        </TouchableOpacity>
      </ScrollView>

      {/* Role picker modal */}
      <Modal visible={!!openFor} transparent animationType="slide" onRequestClose={() => setOpenFor(null)}>
        <Pressable style={styles.modalOverlay} onPress={() => setOpenFor(null)}>
          <Pressable style={styles.pickerCard} onPress={(e) => e.stopPropagation && e.stopPropagation()}>
            <Text style={styles.pickerTitle}>اختر الدور</Text>
            <ScrollView style={{ maxHeight: 380 }}>
              {ROLE_LIST.filter((r) => (counts[r] || 0) > 0).map((r) => {
                const used = usedCounts[r] || 0;
                const total = counts[r] || 0;
                const myCurrent = openFor && assign[openFor] === r;
                const remaining = total - used + (myCurrent ? 1 : 0);
                const disabled = remaining <= 0;
                const info = ROLE_INFO[r];
                return (
                  <TouchableOpacity
                    key={r}
                    disabled={disabled}
                    onPress={() => {
                      if (openFor) setRole(openFor, r);
                      setOpenFor(null);
                    }}
                    style={[
                      styles.pickerItem,
                      myCurrent && { borderColor: info.color, backgroundColor: info.color + "18" },
                      disabled && { opacity: 0.4 },
                    ]}
                  >
                    <Text style={styles.pickerEmoji}>{info.emoji}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.pickerItemName, { color: info.color }]}>{info.name}</Text>
                      <Text style={styles.pickerItemRem}>متبقي: {remaining}/{total}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity
                onPress={() => { if (openFor) setRole(openFor, null); setOpenFor(null); }}
                style={[styles.pickerItem, { borderColor: "rgba(255,255,255,0.1)" }]}
              >
                <Ionicons name="close-circle" size={22} color="#94A3B8" />
                <Text style={[styles.pickerItemName, { color: "#94A3B8" }]}>إزالة الدور</Text>
              </TouchableOpacity>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function RevealScreen(props: {
  player: Player | undefined; index: number; total: number;
  shown: boolean; onReveal: () => void; onNext: () => void;
}) {
  const { player, index, total, shown, onReveal, onNext } = props;
  const flip = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    flip.setValue(0);
    if (shown) {
      Animated.spring(flip, { toValue: 1, useNativeDriver: true, friction: 6, tension: 60 }).start();
    }
  }, [shown, flip, index]);

  if (!player) return null;
  const info = ROLE_INFO[player.role];

  const rotateY = flip.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] });
  const frontOpacity = flip.interpolate({ inputRange: [0, 0.5, 0.51, 1], outputRange: [1, 1, 0, 0] });
  const backOpacity = flip.interpolate({ inputRange: [0, 0.49, 0.5, 1], outputRange: [0, 0, 1, 1] });

  return (
    <View style={styles.phaseCenter}>
      <Text style={styles.phaseTitle}>كشف الكارتات</Text>
      <Text style={styles.phaseHint}>اللاعب {index + 1} / {total}</Text>

      <View style={{ height: 380, justifyContent: "center", alignItems: "center" }}>
        <Animated.View style={[styles.cardFlip, { transform: [{ perspective: 1000 }, { rotateY }] }]}>
          <Animated.View style={[styles.cardFace, styles.cardBack, { opacity: frontOpacity }]}>
            <Ionicons name="help" size={72} color="#FBBF24" />
            <Text style={styles.cardBackName}>{player.name}</Text>
            <Text style={styles.cardBackHint}>اضغط لكشف دورك</Text>
          </Animated.View>
          <Animated.View
            style={[
              styles.cardFace, styles.cardFront,
              { backgroundColor: info.color + "18", borderColor: info.color, opacity: backOpacity, transform: [{ rotateY: "180deg" }] }
            ]}
          >
            {/* Decorative corner emblems */}
            <View style={[styles.cardCornerTopRight, { borderColor: info.color }]}>
              <Text style={[styles.cardCornerEmoji, { color: info.color }]}>{info.emoji}</Text>
            </View>
            <View style={[styles.cardCornerBotLeft, { borderColor: info.color }]}>
              <Text style={[styles.cardCornerEmoji, { color: info.color }]}>{info.emoji}</Text>
            </View>

            {/* Top label */}
            <Text style={[styles.cardTopLabel, { color: info.color }]}>
              {info.team === "mafia" ? "▲ فريق المافيا ▲" : "▲ فريق المواطنين ▲"}
            </Text>

            {/* Hero icon in a circle */}
            <View style={[styles.cardIconCircle, { borderColor: info.color, backgroundColor: info.color + "26" }]}>
              <Ionicons name={ROLE_ICON[player.role]} size={88} color={info.color} />
              <View style={[styles.cardIconHalo, { borderColor: info.color + "55" }]} />
            </View>

            {/* Role name */}
            <Text style={[styles.cardRoleNameLarge, { color: info.color }]}>{info.name}</Text>

            {/* Description */}
            <Text style={styles.cardRoleDesc}>{info.desc}</Text>

            {/* Team badge */}
            <View style={[styles.teamBadge, info.team === "mafia" ? styles.teamBadgeMafia : styles.teamBadgeCit, { marginTop: 8 }]}>
              <Text style={[styles.teamBadgeText, info.team === "mafia" ? { color: "#FCA5A5" } : { color: "#86EFAC" }]}>
                {info.team === "mafia" ? "🔪 فريق المافيا" : "🛡️ فريق المواطنين"}
              </Text>
            </View>
          </Animated.View>
        </Animated.View>
      </View>

      {!shown ? (
        <TouchableOpacity testID="reveal-btn" onPress={onReveal} style={styles.primaryBtn}>
          <Ionicons name="eye" size={20} color="#0B1020" />
          <Text style={styles.primaryBtnText}>كشف الكارت</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity testID="reveal-next-btn" onPress={onNext} style={styles.primaryBtn}>
          <Text style={styles.primaryBtnText}>
            {index + 1 >= total ? "بدء اللعبة" : "التالي"}
          </Text>
          <Ionicons name="arrow-back" size={18} color="#0B1020" />
        </TouchableOpacity>
      )}
    </View>
  );
}

function NightStartScreen({ round, onStart }: { round: number; onStart: () => void }) {
  const moonAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(moonAnim, { toValue: 1, duration: 1200, useNativeDriver: true }).start();
  }, [moonAnim]);
  return (
    <View style={styles.phaseCenter}>
      <Animated.Text style={[styles.bigEmoji, { opacity: moonAnim, transform: [{ scale: moonAnim }] }]}>
        🌙
      </Animated.Text>
      <Text style={styles.phaseTitle}>الليلة {round}</Text>
      <Text style={[styles.phaseHint, { textAlign: "center", paddingHorizontal: 24 }]}>
        على جميع اللاعبين أن يغمضوا أعينهم{"\n"}سوف تبدأ الليلة الآن
      </Text>
      <TouchableOpacity testID="start-night-btn" onPress={onStart} style={styles.primaryBtn}>
        <Text style={styles.primaryBtnText}>بدء الليلة</Text>
        <Ionicons name="moon" size={18} color="#0B1020" />
      </TouchableOpacity>
    </View>
  );
}

function NightActionScreen(props: {
  roleKey: string; title: string; prompt: string; instruction: string;
  color: string; players: Player[]; allowSkip: boolean;
  disabledIds?: string[]; disabledLabel?: string;
  onSubmit: (id: string | null, skip?: boolean) => void;
}) {
  const { roleKey, title, prompt, instruction, color, players, allowSkip, disabledIds = [], disabledLabel, onSubmit } = props;
  const [revealed, setRevealed] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);

  return (
    <View style={{ flex: 1 }}>
      {!revealed ? (
        <View style={styles.phaseCenter}>
          <View style={[styles.passDevice, { borderColor: color }]}>
            <Ionicons name="eye-off" size={48} color={color} />
            <Text style={styles.phaseTitle}>{title}</Text>
            <Text style={[styles.phaseHint, { textAlign: "center" }]}>{instruction}</Text>
            <TouchableOpacity
              testID={`night-${roleKey}-open`}
              onPress={() => { setRevealed(true); haptic("medium"); }}
              style={[styles.primaryBtn, { backgroundColor: color }]}
            >
              <Text style={[styles.primaryBtnText, { color: "#fff" }]}>أنا جاهز</Text>
              <Ionicons name="eye" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.phaseScroll}>
          <Text style={[styles.phaseTitle, { color }]}>{title}</Text>
          <Text style={styles.phaseHint}>{prompt}</Text>

          <View style={{ gap: 8, marginTop: 14 }}>
            {players.map((p) => {
              const disabled = disabledIds.includes(p.id);
              const selected = chosen === p.id;
              return (
                <TouchableOpacity
                  key={p.id}
                  testID={`night-${roleKey}-target-${p.id}`}
                  disabled={disabled}
                  onPress={() => { setChosen(p.id); haptic("light"); }}
                  style={[
                    styles.targetRow,
                    selected && { backgroundColor: color + "22", borderColor: color },
                    disabled && { opacity: 0.4 },
                  ]}
                >
                  <View style={[styles.playerNumber, { backgroundColor: color + "33" }]}>
                    <Text style={[styles.playerNumberText, { color }]}>•</Text>
                  </View>
                  <Text style={styles.targetName}>{p.name}</Text>
                  {disabled && disabledLabel && <Text style={styles.targetDisabledLabel}>{disabledLabel}</Text>}
                  {selected && <Ionicons name="checkmark-circle" size={20} color={color} />}
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={{ flexDirection: "row-reverse", gap: 10, marginTop: 18 }}>
            {allowSkip && (
              <TouchableOpacity
                testID={`night-${roleKey}-skip`}
                onPress={() => { onSubmit(null, true); }}
                style={[styles.primaryBtn, { flex: 1, backgroundColor: "#1E293B" }]}
              >
                <Text style={[styles.primaryBtnText, { color: "#fff" }]}>تخطّي</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              testID={`night-${roleKey}-confirm`}
              disabled={!chosen}
              onPress={() => onSubmit(chosen, false)}
              style={[styles.primaryBtn, { flex: 1, backgroundColor: color }, !chosen && { opacity: 0.4 }]}
            >
              <Text style={[styles.primaryBtnText, { color: "#fff" }]}>تأكيد</Text>
              <Ionicons name="checkmark" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function DetectiveResultScreen({ result, onDismiss }: { result: { name: string; isMafia: boolean }; onDismiss: () => void }) {
  return (
    <View style={styles.phaseCenter}>
      <Text style={[styles.phaseTitle, { color: ROLE_INFO.detective.color }]}>نتيجة التحقيق</Text>
      <View style={[
        styles.resultBox,
        result.isMafia ? { backgroundColor: "rgba(220,38,38,0.16)", borderColor: "#DC2626" }
                        : { backgroundColor: "rgba(16,185,129,0.16)", borderColor: "#10B981" }
      ]}>
        <Text style={styles.resultEmoji}>{result.isMafia ? "🎩" : "🛡️"}</Text>
        <Text style={styles.resultName}>{result.name}</Text>
        <Text style={[styles.resultText, { color: result.isMafia ? "#FCA5A5" : "#86EFAC" }]}>
          {result.isMafia ? "هذا اللاعب مافيا" : "هذا اللاعب ليس مافيا"}
        </Text>
      </View>
      <TouchableOpacity testID="detective-dismiss" onPress={onDismiss} style={styles.primaryBtn}>
        <Text style={styles.primaryBtnText}>أغمضت عيني</Text>
        <Ionicons name="eye-off" size={18} color="#0B1020" />
      </TouchableOpacity>
    </View>
  );
}

function DayResultsScreen(props: {
  round: number; summary: { id: string; reason: string; name: string; role: Role }[];
  onContinue: () => void;
}) {
  const { round, summary, onContinue } = props;
  const sunAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(sunAnim, { toValue: 1, useNativeDriver: true, friction: 6 }).start();
  }, [sunAnim]);
  const deaths = summary.filter((s) => s.reason !== "حماه الدكتور من المافيا" && s.reason !== "أصابه القناص لكن الدكتور حماه");
  return (
    <ScrollView contentContainerStyle={styles.phaseScroll}>
      <Animated.Text style={[styles.bigEmoji, { transform: [{ scale: sunAnim }] }]}>☀️</Animated.Text>
      <Text style={styles.phaseTitle}>صباح يوم {round}</Text>
      <Text style={[styles.phaseHint, { textAlign: "center" }]}>
        يرجى من جميع اللاعبين فتح أعينهم{"\n"}نتائج الليل:
      </Text>

      <View style={{ gap: 10, marginTop: 18 }}>
        {summary.length === 0 && (
          <View style={styles.dayBox}>
            <Text style={styles.dayBoxText}>ليلة هادئة — لم يحدث شيء</Text>
          </View>
        )}
        {summary.map((s, i) => {
          const info = ROLE_INFO[s.role];
          const isSurvived = s.reason.includes("حماه") || s.reason.includes("أصابه القناص لكن");
          return (
            <View key={i} style={[
              styles.dayBox,
              isSurvived ? { backgroundColor: "rgba(16,185,129,0.1)", borderColor: "rgba(16,185,129,0.4)" }
                          : { backgroundColor: "rgba(220,38,38,0.1)", borderColor: "rgba(220,38,38,0.4)" }
            ]}>
              <Text style={styles.dayBoxEmoji}>{info.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.dayBoxName}>{s.name}</Text>
                <Text style={[styles.dayBoxText, { textAlign: "right" }]}>{s.reason}</Text>
                {!isSurvived && (
                  <Text style={[styles.dayBoxRoleLabel, { color: info.color }]}>كان: {info.name}</Text>
                )}
              </View>
            </View>
          );
        })}
      </View>

      <TouchableOpacity testID="day-continue" onPress={onContinue} style={styles.primaryBtn}>
        <Text style={styles.primaryBtnText}>بدء المناقشة</Text>
        <Ionicons name="chatbubbles" size={18} color="#0B1020" />
      </TouchableOpacity>
    </ScrollView>
  );
}

function DiscussionScreen(props: {
  players: Player[]; round: number;
  onRevealLeader: (id: string) => void; onStartVote: () => void;
}) {
  const { players, round, onRevealLeader, onStartVote } = props;
  const alive = players.filter((p) => p.alive);
  const aliveLeader = alive.find((p) => p.role === "citizen_leader" && !p.isLeaderRevealed);
  return (
    <ScrollView contentContainerStyle={styles.phaseScroll}>
      <Text style={styles.phaseTitle}>المناقشة • يوم {round}</Text>
      <Text style={[styles.phaseHint, { textAlign: "center" }]}>
        ناقشوا، اطرحوا الأسئلة، اكتشفوا المافيا{"\n"}اللاعب المسكَّت لا يستطيع الكلام
      </Text>

      <Text style={styles.sectionLabel}>اللاعبون الأحياء</Text>
      <View style={{ gap: 8 }}>
        {alive.map((p, i) => (
          <View key={p.id} style={styles.playerRow}>
            <View style={styles.playerNumber}>
              <Text style={styles.playerNumberText}>{i + 1}</Text>
            </View>
            <Text style={styles.targetName}>{p.name}</Text>
            {p.silencedNextDay && (
              <View style={styles.silencedPill}>
                <Text style={styles.silencedText}>🤐 مسكَّت</Text>
              </View>
            )}
            {p.role === "citizen_leader" && p.isLeaderRevealed && (
              <View style={styles.leaderPill}>
                <Text style={styles.leaderPillText}>👑 شيخ ×3</Text>
              </View>
            )}
          </View>
        ))}
      </View>

      {aliveLeader && (
        <View style={styles.leaderRevealBox}>
          <Text style={styles.leaderRevealHint}>
            هل أنت شيخ الصالحين؟ اضغط لكشف هويتك (سيُحتسب صوتك = 3)
          </Text>
          <TouchableOpacity
            testID="reveal-leader-btn"
            onPress={() => onRevealLeader(aliveLeader.id)}
            style={[styles.primaryBtn, { backgroundColor: ROLE_INFO.citizen_leader.color }]}
          >
            <Text style={[styles.primaryBtnText, { color: "#fff" }]}>كشف شيخ الصالحين</Text>
            <Ionicons name="ribbon" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity testID="start-vote-btn" onPress={onStartVote} style={styles.primaryBtn}>
        <Text style={styles.primaryBtnText}>بدء التصويت</Text>
        <Ionicons name="checkbox" size={18} color="#0B1020" />
      </TouchableOpacity>
    </ScrollView>
  );
}

function VotingScreen(props: {
  voters: Player[]; voterIndex: number; allAlive: Player[];
  tally: Record<string, number>;
  onVote: (id: string) => void; onSkip: () => void;
}) {
  const { voters, voterIndex, allAlive, onVote, onSkip } = props;
  const voter = voters[voterIndex];
  if (!voter) return <View style={styles.phaseCenter}><Text style={styles.phaseHint}>لا يوجد مصوّتون</Text></View>;

  const targets = allAlive.filter((p) => p.id !== voter.id);
  const weight = (voter.role === "citizen_leader" && voter.isLeaderRevealed) ? 3 : 1;

  return (
    <ScrollView contentContainerStyle={styles.phaseScroll}>
      <Text style={styles.phaseTitle}>التصويت</Text>
      <View style={styles.voteHeaderBox}>
        <Text style={styles.voteVoterLabel}>الصوت رقم {voterIndex + 1} / {voters.length}</Text>
        <Text style={styles.voteVoterName}>{voter.name}</Text>
        <Text style={styles.voteWeight}>وزن صوتك: {weight} {weight === 3 && "👑"}</Text>
      </View>

      <Text style={styles.sectionLabel}>اختر من تريد إخراجه</Text>
      <View style={{ gap: 8 }}>
        {targets.map((t) => (
          <TouchableOpacity
            key={t.id}
            testID={`vote-target-${t.id}`}
            onPress={() => onVote(t.id)}
            style={styles.targetRow}
          >
            <View style={styles.playerNumber}>
              <Text style={styles.playerNumberText}>•</Text>
            </View>
            <Text style={styles.targetName}>{t.name}</Text>
            <Ionicons name="hand-right" size={20} color="#FBBF24" />
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity testID="vote-skip" onPress={onSkip} style={[styles.primaryBtn, { backgroundColor: "#1E293B" }]}>
        <Text style={[styles.primaryBtnText, { color: "#fff" }]}>تخطّي / امتناع</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function VoteResultsScreen(props: {
  eliminated: Player | null; tally: Record<string, number>; players: Player[];
  onConfirm: () => void;
}) {
  const { eliminated, tally, players, onConfirm } = props;
  const sorted = Object.entries(tally).sort((a, b) => b[1] - a[1]);
  return (
    <ScrollView contentContainerStyle={styles.phaseScroll}>
      <Text style={styles.phaseTitle}>نتيجة التصويت</Text>

      <View style={{ gap: 8, marginTop: 10 }}>
        {sorted.map(([id, v]) => {
          const p = players.find((pp) => pp.id === id);
          if (!p) return null;
          const isEliminated = eliminated?.id === id;
          return (
            <View key={id} style={[styles.tallyRow, isEliminated && { backgroundColor: "rgba(248,113,113,0.12)", borderColor: "#F87171" }]}>
              <View style={styles.playerNumber}><Text style={styles.playerNumberText}>•</Text></View>
              <Text style={styles.targetName}>{p.name}</Text>
              <Text style={styles.tallyVotes}>{v} {v === 1 ? "صوت" : "أصوات"}</Text>
            </View>
          );
        })}
        {sorted.length === 0 && (
          <View style={styles.dayBox}><Text style={styles.dayBoxText}>لم يصوّت أحد</Text></View>
        )}
      </View>

      {eliminated ? (
        <View style={[styles.dayBox, { backgroundColor: "rgba(248,113,113,0.12)", borderColor: "#F87171", marginTop: 14 }]}>
          <Text style={styles.dayBoxEmoji}>{ROLE_INFO[eliminated.role].emoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.dayBoxName}>{eliminated.name} خرج من اللعبة</Text>
            <Text style={[styles.dayBoxRoleLabel, { color: ROLE_INFO[eliminated.role].color }]}>
              كان: {ROLE_INFO[eliminated.role].name}
            </Text>
          </View>
        </View>
      ) : (
        <View style={styles.dayBox}>
          <Text style={styles.dayBoxText}>لا توجد نتيجة (تعادل أو امتناع) — لن يخرج أحد هذه الجولة</Text>
        </View>
      )}

      <TouchableOpacity testID="vote-results-continue" onPress={onConfirm} style={styles.primaryBtn}>
        <Text style={styles.primaryBtnText}>متابعة</Text>
        <Ionicons name="arrow-back" size={18} color="#0B1020" />
      </TouchableOpacity>
    </ScrollView>
  );
}

function BomberPullScreen(props: {
  bomberName: string; options: Player[];
  onPick: (id: string) => void;
}) {
  const { bomberName, options, onPick } = props;
  return (
    <ScrollView contentContainerStyle={styles.phaseScroll}>
      <Text style={styles.bigEmoji}>💣</Text>
      <Text style={[styles.phaseTitle, { color: "#EF4444" }]}>المتفجر يفجّر نفسه!</Text>
      <Text style={[styles.phaseHint, { textAlign: "center" }]}>
        {bomberName} خرج من اللعبة ويسحب لاعباً معه
      </Text>
      <View style={{ gap: 8, marginTop: 14 }}>
        {options.map((o) => (
          <TouchableOpacity
            key={o.id}
            testID={`bomber-pull-${o.id}`}
            onPress={() => onPick(o.id)}
            style={styles.targetRow}
          >
            <View style={styles.playerNumber}><Text style={styles.playerNumberText}>•</Text></View>
            <Text style={styles.targetName}>{o.name}</Text>
            <Ionicons name="flash" size={20} color="#EF4444" />
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

function EndScreen(props: {
  winner: Team; players: Player[];
  onRestart: () => void; onExit: () => void;
}) {
  const { winner, players, onRestart, onExit } = props;
  const winners = players.filter((p) => ROLE_INFO[p.role].team === winner);
  const losers = players.filter((p) => ROLE_INFO[p.role].team !== winner);

  const trophyAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(trophyAnim, { toValue: 1, useNativeDriver: true, friction: 5 }).start();
    haptic("success");
  }, [trophyAnim]);

  return (
    <ScrollView contentContainerStyle={styles.phaseScroll}>
      <Animated.View style={{ alignItems: "center", transform: [{ scale: trophyAnim }] }}>
        <Text style={styles.bigEmoji}>{winner === "mafia" ? "🎩" : "🏆"}</Text>
        <Text style={[styles.endTitle, { color: winner === "mafia" ? "#DC2626" : "#10B981" }]}>
          {winner === "mafia" ? "فاز فريق المافيا!" : "فاز فريق المواطنين!"}
        </Text>
      </Animated.View>

      <Text style={styles.sectionLabel}>الفائزون</Text>
      <View style={{ gap: 8 }}>
        {winners.map((p) => (
          <View key={p.id} style={[styles.endPlayerRow, { borderColor: "#10B981" }]}>
            <Text style={styles.dayBoxEmoji}>{ROLE_INFO[p.role].emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.dayBoxName}>{p.name}</Text>
              <Text style={[styles.dayBoxRoleLabel, { color: ROLE_INFO[p.role].color }]}>{ROLE_INFO[p.role].name}</Text>
            </View>
            <Text style={[styles.endStateText, { color: p.alive ? "#10B981" : "#94A3B8" }]}>
              {p.alive ? "حيّ" : "خرج"}
            </Text>
          </View>
        ))}
      </View>

      <Text style={styles.sectionLabel}>الخاسرون</Text>
      <View style={{ gap: 8 }}>
        {losers.map((p) => (
          <View key={p.id} style={[styles.endPlayerRow, { borderColor: "#F87171" }]}>
            <Text style={styles.dayBoxEmoji}>{ROLE_INFO[p.role].emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.dayBoxName}>{p.name}</Text>
              <Text style={[styles.dayBoxRoleLabel, { color: ROLE_INFO[p.role].color }]}>{ROLE_INFO[p.role].name}</Text>
            </View>
            <Text style={[styles.endStateText, { color: p.alive ? "#10B981" : "#94A3B8" }]}>
              {p.alive ? "حيّ" : `خرج (${p.eliminationReason || ""})`}
            </Text>
          </View>
        ))}
      </View>

      <View style={{ flexDirection: "row-reverse", gap: 10, marginTop: 18 }}>
        <TouchableOpacity testID="end-exit" onPress={onExit} style={[styles.primaryBtn, { flex: 1, backgroundColor: "#1E293B" }]}>
          <Text style={[styles.primaryBtnText, { color: "#fff" }]}>الخروج</Text>
        </TouchableOpacity>
        <TouchableOpacity testID="end-restart" onPress={onRestart} style={[styles.primaryBtn, { flex: 1 }]}>
          <Ionicons name="refresh" size={18} color="#0B1020" />
          <Text style={styles.primaryBtnText}>لعبة جديدة</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

// ============== Styles ==============
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0B1020" },
  topBar: {
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)",
  },
  iconBtn: {
    width: 42, height: 42, borderRadius: 14, backgroundColor: "#151B30",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.06)",
  },
  topTitle: { color: "#fff", fontSize: 17, fontWeight: "800" },
  // Intro
  introWrap: {
    flex: 1, backgroundColor: "#0B1020", justifyContent: "center", alignItems: "center",
  },
  introBack: { position: "absolute", top: 16, right: 16, zIndex: 5 },
  introContent: { alignItems: "center", paddingHorizontal: 24 },
  gunshotFlash: {
    position: "absolute", width: 140, height: 140, borderRadius: 70,
    backgroundColor: "#FEF3C7",
    shadowColor: "#FBBF24", shadowOpacity: 0.9, shadowRadius: 30,
  },
  introEmoji: { fontSize: 80, marginBottom: 8 },
  introTitle: {
    color: "#fff", fontSize: 56, fontWeight: "900",
    textShadowColor: "#DC2626", textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 12,
  },
  introBloodLine: {
    width: 120, height: 3, backgroundColor: "#DC2626",
    marginTop: 8, borderRadius: 2,
  },
  introSubtitle: {
    color: "#94A3B8", fontSize: 14, fontWeight: "700",
    textAlign: "center", marginTop: 18, lineHeight: 22,
  },
  introBtn: {
    flexDirection: "row-reverse", alignItems: "center", gap: 10,
    backgroundColor: "#DC2626",
    paddingVertical: 16, paddingHorizontal: 36,
    borderRadius: 100, marginTop: 36,
    shadowColor: "#DC2626", shadowOpacity: 0.6, shadowRadius: 18,
    elevation: 10,
  },
  introBtnText: { color: "#fff", fontSize: 18, fontWeight: "900" },
  // Phase containers
  phaseScroll: { padding: 16, paddingBottom: 40, gap: 4 },
  phaseCenter: { flex: 1, padding: 24, alignItems: "center", justifyContent: "center", gap: 6 },
  phaseTitle: { color: "#fff", fontSize: 24, fontWeight: "900", textAlign: "center" },
  phaseHint: { color: "#94A3B8", fontSize: 13, fontWeight: "700", textAlign: "right", marginTop: 6 },
  bigEmoji: { fontSize: 64, textAlign: "center", marginBottom: 8 },
  // Players phase
  addPlayerRow: { flexDirection: "row-reverse", gap: 8, marginTop: 14 },
  addPlayerInput: {
    flex: 1, backgroundColor: "#151B30", borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 12, color: "#fff", fontSize: 15,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.06)",
  },
  addPlayerBtn: {
    width: 48, height: 48, borderRadius: 12, backgroundColor: "#FBBF24",
    alignItems: "center", justifyContent: "center",
  },
  playerRow: {
    flexDirection: "row-reverse", alignItems: "center",
    backgroundColor: "#151B30", borderRadius: 12,
    paddingHorizontal: 8, paddingVertical: 6,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", gap: 8,
  },
  playerNumber: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: "#FBBF24", alignItems: "center", justifyContent: "center",
  },
  playerNumberText: { color: "#0B1020", fontWeight: "900", fontSize: 13 },
  playerNameInput: { flex: 1, color: "#fff", fontSize: 14, fontWeight: "700", paddingVertical: 8 },
  removeBtn: {
    width: 30, height: 30, borderRadius: 8,
    backgroundColor: "rgba(248,113,113,0.12)",
    alignItems: "center", justifyContent: "center",
  },
  emptyHint: { color: "#475569", fontSize: 12, textAlign: "center", marginTop: 16, fontStyle: "italic" },
  // Buttons
  primaryBtn: {
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: "#FBBF24", paddingVertical: 14, paddingHorizontal: 20,
    borderRadius: 100, marginTop: 24,
  },
  primaryBtnText: { color: "#0B1020", fontWeight: "900", fontSize: 15 },
  // Role counts
  sumPill: {
    alignSelf: "center", paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 100, marginTop: 6, marginBottom: 8,
  },
  sumPillOk: { backgroundColor: "rgba(16,185,129,0.18)" },
  sumPillWarn: { backgroundColor: "rgba(251,191,36,0.18)" },
  sumPillText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  roleCard: {
    flexDirection: "row-reverse", alignItems: "center",
    backgroundColor: "#151B30", borderRadius: 14, padding: 12,
    borderWidth: 1.5, gap: 10, marginTop: 8,
  },
  roleEmojiBox: {
    width: 50, height: 50, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
  },
  roleEmoji: { fontSize: 28 },
  roleName: { fontSize: 16, fontWeight: "900", textAlign: "right" },
  roleDesc: { color: "#94A3B8", fontSize: 11, fontWeight: "600", marginTop: 2, textAlign: "right" },
  teamBadge: {
    alignSelf: "flex-end", paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: 100, marginTop: 4,
  },
  teamBadgeMafia: { backgroundColor: "rgba(220,38,38,0.18)" },
  teamBadgeCit: { backgroundColor: "rgba(16,185,129,0.18)" },
  teamBadgeText: { fontSize: 10, fontWeight: "800" },
  counterCol: { alignItems: "center", gap: 4 },
  countBtn: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  countBtnDec: { backgroundColor: "#1E293B" },
  countValue: { color: "#fff", fontSize: 18, fontWeight: "900", minWidth: 24, textAlign: "center" },
  // Distribution
  bigCard: {
    backgroundColor: "#151B30", borderRadius: 18, padding: 18,
    alignItems: "center", marginTop: 12,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", gap: 6,
  },
  bigCardIcon: {
    width: 64, height: 64, borderRadius: 16,
    alignItems: "center", justifyContent: "center", marginBottom: 6,
  },
  bigCardTitle: { color: "#fff", fontSize: 17, fontWeight: "900" },
  bigCardDesc: { color: "#94A3B8", fontSize: 12, fontWeight: "700", textAlign: "center" },
  // Manual assign
  usedRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 6, marginTop: 8, marginBottom: 8 },
  usedChip: {
    flexDirection: "row-reverse", alignItems: "center", gap: 4,
    backgroundColor: "#151B30", paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 100, borderWidth: 1,
  },
  usedChipEmoji: { fontSize: 14 },
  usedChipText: { fontSize: 11, fontWeight: "800" },
  assignRow: {
    flexDirection: "row-reverse", alignItems: "center",
    backgroundColor: "#151B30", borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 10,
    borderWidth: 1.5, borderColor: "rgba(255,255,255,0.06)", gap: 8, marginTop: 6,
  },
  assignName: { flex: 1, color: "#fff", fontSize: 14, fontWeight: "800" },
  assignRolePill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 100 },
  assignRoleText: { fontSize: 12, fontWeight: "800" },
  assignEmpty: { color: "#64748B", fontSize: 11, fontWeight: "700" },
  // Picker modal
  modalOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.85)",
    alignItems: "center", justifyContent: "center", padding: 16,
  },
  pickerCard: {
    width: "100%", maxWidth: 420, backgroundColor: "#151B30",
    borderRadius: 22, padding: 16,
  },
  pickerTitle: { color: "#fff", fontSize: 18, fontWeight: "900", textAlign: "center", marginBottom: 10 },
  pickerItem: {
    flexDirection: "row-reverse", alignItems: "center", gap: 10,
    backgroundColor: "#0B1020", borderRadius: 12, padding: 10,
    borderWidth: 1.5, borderColor: "rgba(255,255,255,0.06)", marginTop: 6,
  },
  pickerEmoji: { fontSize: 22 },
  pickerItemName: { fontSize: 14, fontWeight: "800" },
  pickerItemRem: { color: "#64748B", fontSize: 11, fontWeight: "700", marginTop: 2 },
  // Reveal card
  cardFlip: {
    width: 280, height: 360, position: "relative",
  },
  cardFace: {
    position: "absolute", width: "100%", height: "100%",
    borderRadius: 22, padding: 20,
    alignItems: "center", justifyContent: "center",
    backfaceVisibility: "hidden",
    borderWidth: 2,
  },
  cardBack: {
    backgroundColor: "#1E293B", borderColor: "#FBBF24", gap: 14,
  },
  cardBackName: { color: "#fff", fontSize: 22, fontWeight: "900" },
  cardBackHint: { color: "#94A3B8", fontSize: 12, fontWeight: "700" },
  cardFront: {},
  cardEmoji: { fontSize: 64 },
  cardRoleName: { fontSize: 28, fontWeight: "900", marginTop: 8, textAlign: "center" },
  cardRoleNameLarge: {
    fontSize: 26, fontWeight: "900", marginTop: 14, textAlign: "center",
    letterSpacing: 0.5,
  },
  cardRoleDesc: {
    color: "#CBD5E1", fontSize: 12, fontWeight: "700",
    textAlign: "center", marginTop: 8, lineHeight: 18, paddingHorizontal: 8,
  },
  cardTopLabel: {
    fontSize: 11, fontWeight: "900", letterSpacing: 1,
    position: "absolute", top: 18, alignSelf: "center",
  },
  cardIconCircle: {
    width: 130, height: 130, borderRadius: 65,
    alignItems: "center", justifyContent: "center",
    borderWidth: 3, marginTop: 10, position: "relative",
  },
  cardIconHalo: {
    position: "absolute", width: 150, height: 150, borderRadius: 75,
    borderWidth: 1, top: -10, left: -10,
  },
  cardCornerTopRight: {
    position: "absolute", top: 8, right: 8,
    width: 36, height: 36, borderRadius: 8,
    borderWidth: 1.5, alignItems: "center", justifyContent: "center",
  },
  cardCornerBotLeft: {
    position: "absolute", bottom: 8, left: 8,
    width: 36, height: 36, borderRadius: 8,
    borderWidth: 1.5, alignItems: "center", justifyContent: "center",
    transform: [{ rotate: "180deg" }],
  },
  cardCornerEmoji: { fontSize: 18, fontWeight: "900" },
  // Pass device card
  passDevice: {
    backgroundColor: "#151B30", borderRadius: 22, padding: 28,
    borderWidth: 2, alignItems: "center", gap: 10, width: "90%",
  },
  // Targets
  targetRow: {
    flexDirection: "row-reverse", alignItems: "center",
    backgroundColor: "#151B30", borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 12,
    borderWidth: 1.5, borderColor: "rgba(255,255,255,0.06)", gap: 8,
  },
  targetName: { flex: 1, color: "#fff", fontSize: 14, fontWeight: "800" },
  targetDisabledLabel: { color: "#64748B", fontSize: 10, fontWeight: "700" },
  // Detective result
  resultBox: {
    width: "90%", padding: 24, borderRadius: 22, borderWidth: 2,
    alignItems: "center", marginVertical: 18, gap: 8,
  },
  resultEmoji: { fontSize: 56 },
  resultName: { color: "#fff", fontSize: 22, fontWeight: "900" },
  resultText: { fontSize: 18, fontWeight: "900" },
  // Day results
  dayBox: {
    flexDirection: "row-reverse", alignItems: "center",
    backgroundColor: "#151B30", borderRadius: 12,
    padding: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", gap: 10,
  },
  dayBoxEmoji: { fontSize: 28 },
  dayBoxName: { color: "#fff", fontSize: 15, fontWeight: "900", textAlign: "right" },
  dayBoxText: { color: "#94A3B8", fontSize: 12, fontWeight: "700", marginTop: 2 },
  dayBoxRoleLabel: { fontSize: 12, fontWeight: "800", marginTop: 2 },
  sectionLabel: {
    color: "#94A3B8", fontSize: 13, fontWeight: "800",
    marginTop: 18, marginBottom: 8, textAlign: "right",
  },
  silencedPill: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 100,
    backgroundColor: "rgba(148,163,184,0.18)",
  },
  silencedText: { color: "#CBD5E1", fontSize: 11, fontWeight: "800" },
  leaderPill: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 100,
    backgroundColor: "rgba(168,85,247,0.18)",
  },
  leaderPillText: { color: "#C4B5FD", fontSize: 11, fontWeight: "800" },
  leaderRevealBox: {
    backgroundColor: "rgba(168,85,247,0.10)",
    borderColor: "rgba(168,85,247,0.4)", borderWidth: 1,
    borderRadius: 14, padding: 12, marginTop: 14, gap: 8,
  },
  leaderRevealHint: { color: "#C4B5FD", fontSize: 12, fontWeight: "800", textAlign: "right" },
  // Voting
  voteHeaderBox: {
    backgroundColor: "#151B30", borderRadius: 16, padding: 14,
    alignItems: "center", marginTop: 8,
    borderWidth: 1, borderColor: "rgba(251,191,36,0.4)",
  },
  voteVoterLabel: { color: "#94A3B8", fontSize: 11, fontWeight: "800" },
  voteVoterName: { color: "#fff", fontSize: 22, fontWeight: "900", marginTop: 2 },
  voteWeight: { color: "#FBBF24", fontSize: 13, fontWeight: "800", marginTop: 2 },
  tallyRow: {
    flexDirection: "row-reverse", alignItems: "center",
    backgroundColor: "#151B30", borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 10,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", gap: 8,
  },
  tallyVotes: { color: "#FBBF24", fontWeight: "900", fontSize: 14 },
  // End
  endTitle: { fontSize: 28, fontWeight: "900", marginTop: 6, textAlign: "center" },
  endPlayerRow: {
    flexDirection: "row-reverse", alignItems: "center",
    backgroundColor: "#151B30", borderRadius: 12,
    padding: 10, borderWidth: 1.5, gap: 10,
  },
  endStateText: { fontSize: 11, fontWeight: "800" },
});
