// "مكعب الدرج" - 2D side-view physics game with 3D-rotating cube.
// Cube rotates in 3D (perspective + rotateX/Y/Z) but world is 2D.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Pressable,
  Animated,
  Easing,
  Platform,
  StatusBar,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";

const { width: WIN_W, height: WIN_H } = Dimensions.get("window");

// ========== Constants ==========
const TILE = 28; // visual unit
const CUBE_SIZE_BASE = TILE * 1.5;
const STAIR_W = TILE * 1.6;
const STAIR_H = TILE * 5.0; // VERY TALL stairs (long and thin)
const TOTAL_STAIRS = 1000;
const POWERUP_EVERY = 20;
const START_STAIR = 20;
const FINISH_LINE_INDEX = TOTAL_STAIRS - 1; // stair "1" from the end = the goal

// Physics
const GRAVITY = 2400; // px/s²  - stronger for taller stairs
const BOUNCE_DAMP = 0.5;
const FRICTION_GROUND = 1.6; // lower = more sliding
const AIM_SPEED = 1.6; // rad/s pendulum
const STOP_THRESHOLD_VEL = 8; // below this is "stopped"
const STOP_THRESHOLD_TIME = 0.9; // seconds of stopped → end game

// Power-ups
type PowerType =
  | "lowG"
  | "highG"
  | "pullL"
  | "pullR"
  | "pullUp"
  | "bigCube"
  | "smallCube"
  | "ball"
  | "broken";

const POWER_LABELS: Record<PowerType, { label: string; color: string; emoji: string }> = {
  lowG: { label: "جاذبية منخفضة", color: "#06B6D4", emoji: "🪶" },
  highG: { label: "جاذبية قوية", color: "#7C3AED", emoji: "🧲" },
  pullL: { label: "سحب يسار", color: "#F59E0B", emoji: "⬅️" },
  pullR: { label: "سحب يمين", color: "#F59E0B", emoji: "➡️" },
  pullUp: { label: "سحب لأعلى", color: "#10B981", emoji: "⬆️" },
  bigCube: { label: "مكعب عملاق", color: "#EF4444", emoji: "🟥" },
  smallCube: { label: "مكعب صغير", color: "#3B82F6", emoji: "🟦" },
  ball: { label: "تحول إلى كرة", color: "#EC4899", emoji: "⚽" },
  broken: { label: "درج محطم!", color: "#DC2626", emoji: "💥" },
};

const POWERUPS_POOL: PowerType[] = [
  "lowG", "lowG", "highG", "pullL", "pullR", "pullUp",
  "bigCube", "smallCube", "ball", "broken",
];

// Stair (descending to the right)
type Stair = {
  i: number;          // index 0..999
  x: number;          // top-left in world px
  y: number;
  isPower: boolean;
  touched: boolean;
  broken: boolean;
};

// ========== Build stairs ==========
function buildStairs(): Stair[] {
  const arr: Stair[] = [];
  for (let i = 0; i < TOTAL_STAIRS; i++) {
    arr.push({
      i,
      x: i * STAIR_W,
      y: i * STAIR_H,
      isPower: i > 0 && i % POWERUP_EVERY === 0,
      touched: false,
      broken: false,
    });
  }
  return arr;
}

const HIGH_SCORE_KEY = "stair-cube:highscores";

type HighScore = { name: string; score: number; ts: number };

export default function StairCube() {
  const router = useRouter();

  // ===== Phase state =====
  type Phase = "menu" | "aim" | "power" | "flight" | "ended";
  const [phase, setPhase] = useState<Phase>("menu");
  const [playerName, setPlayerName] = useState("لاعب");

  // ===== Game refs =====
  const stairsRef = useRef<Stair[]>([]);
  const cube = useRef({
    x: 0, y: 0, vx: 0, vy: 0,
    size: CUBE_SIZE_BASE,
    rotX: 0, rotY: 0, rotZ: 0,
    rotVX: 0, rotVY: 0, rotVZ: 0,
    isBall: false,
    onGround: false,
    onStair: -1,
  }).current;
  const cam = useRef({ x: 0, y: 0 }).current;
  const aim = useRef({ angle: 0, dir: 1, locked: false }).current; // angle in rad from "up"
  const power = useRef({ value: 0, locked: false, dir: 1 }).current; // 0..1
  const activePowerRef = useRef<{ type: PowerType; ttl: number } | null>(null);
  const stoppedTimerRef = useRef(0);
  const crossedFinishRef = useRef(false);
  const hasThrownRef = useRef(false);

  // Visible UI state
  const [hud, setHud] = useState({
    score: 0,
    aimAngle: 0,
    power: 0,
    activePower: null as { type: PowerType; ttl: number } | null,
    finalScore: 0,
    highScores: [] as HighScore[],
  });

  // ===== Animated values for cube (native driver) =====
  const cubeTX = useRef(new Animated.Value(0)).current;
  const cubeTY = useRef(new Animated.Value(0)).current;
  const cubeRX = useRef(new Animated.Value(0)).current;
  const cubeRY = useRef(new Animated.Value(0)).current;
  const cubeRZ = useRef(new Animated.Value(0)).current;
  const cubeScale = useRef(new Animated.Value(1)).current;
  const camTX = useRef(new Animated.Value(0)).current;
  const camTY = useRef(new Animated.Value(0)).current;
  const arrowAngle = useRef(new Animated.Value(0)).current;
  const powerFill = useRef(new Animated.Value(0)).current;

  // Floats for effects
  const [floats, setFloats] = useState<Array<{ id: number; x: number; y: number; text: string; color: string; ttl: number }>>([]);
  const floatIdRef = useRef(0);

  // ===== Init =====
  const initGame = useCallback(() => {
    stairsRef.current = buildStairs();
    const s = stairsRef.current[START_STAIR];
    cube.x = s.x + STAIR_W / 2;
    cube.y = s.y - CUBE_SIZE_BASE / 2;
    cube.vx = 0; cube.vy = 0;
    cube.size = CUBE_SIZE_BASE;
    cube.rotX = 0; cube.rotY = 0; cube.rotZ = 0;
    cube.rotVX = 0; cube.rotVY = 0; cube.rotVZ = 0;
    cube.isBall = false;
    cube.onGround = true;
    cube.onStair = START_STAIR;
    aim.angle = 0; aim.dir = 1; aim.locked = false;
    power.value = 0; power.locked = false; power.dir = 1;
    activePowerRef.current = null;
    stoppedTimerRef.current = 0;
    crossedFinishRef.current = false;
    hasThrownRef.current = false;

    // Snap camera to cube immediately so it's on screen on first frame
    cam.x = cube.x - WIN_W / 2;
    cam.y = cube.y - WIN_H * 0.45;
    camTX.setValue(-cam.x);
    camTY.setValue(-cam.y);
    cubeTX.setValue(cube.x - cube.size / 2);
    cubeTY.setValue(cube.y - cube.size / 2);

    setHud({ score: 0, aimAngle: 0, power: 0, activePower: null, finalScore: 0, highScores: hud.highScores });
    setFloats([]);
    setPhase("aim");
  }, [aim, cube, power, cam, camTX, camTY, cubeTX, cubeTY, hud.highScores]);

  // Load high scores
  useEffect(() => {
    AsyncStorage.getItem(HIGH_SCORE_KEY).then((raw) => {
      if (raw) {
        try {
          const arr: HighScore[] = JSON.parse(raw);
          setHud((h) => ({ ...h, highScores: arr }));
        } catch {}
      }
    });
  }, []);

  // ===== Game loop =====
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.04, (now - last) / 1000);
      last = now;
      step(dt);
      raf = requestAnimationFrame(tick);
    };
    if (phase !== "menu" && phase !== "ended") {
      raf = requestAnimationFrame(tick);
    }
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const step = (dt: number) => {
    const c = cube;

    // --- AIM oscillation ---
    if (phase === "aim") {
      aim.angle += AIM_SPEED * aim.dir * dt;
      if (aim.angle > 1.1) { aim.angle = 1.1; aim.dir = -1; }
      if (aim.angle < -1.1) { aim.angle = -1.1; aim.dir = 1; }
      arrowAngle.setValue(aim.angle);
    }

    // --- POWER meter ---
    if (phase === "power") {
      power.value += 1.6 * power.dir * dt;
      if (power.value >= 1) { power.value = 1; power.dir = -1; }
      if (power.value <= 0) { power.value = 0; power.dir = 1; }
      powerFill.setValue(power.value);
    }

    // --- FLIGHT physics ---
    if (phase === "flight") {
      // active power-up
      let g = GRAVITY;
      let pullX = 0;
      let pullY = 0;
      const ap = activePowerRef.current;
      if (ap) {
        ap.ttl -= dt;
        if (ap.ttl <= 0) {
          activePowerRef.current = null;
          // restore cube state for size/ball ones
          c.isBall = false;
          c.size = CUBE_SIZE_BASE;
          setHud((h) => ({ ...h, activePower: null }));
        } else {
          if (ap.type === "lowG") g = GRAVITY * 0.35;
          if (ap.type === "highG") g = GRAVITY * 1.8;
          if (ap.type === "pullL") pullX = -1200;
          if (ap.type === "pullR") pullX = 1200;
          if (ap.type === "pullUp") pullY = -1500;
        }
      }

      // Apply forces
      c.vy += g * dt;
      c.vx += pullX * dt;
      c.vy += pullY * dt;

      // Integrate (sub-stepped to prevent tunneling)
      const speed = Math.hypot(c.vx, c.vy);
      const maxStep = c.size * 0.3; // never move more than 30% of cube size per substep
      const steps = Math.max(1, Math.ceil((speed * dt) / maxStep));
      const sdt = dt / steps;
      for (let i = 0; i < steps; i++) {
        c.x += c.vx * sdt;
        c.y += c.vy * sdt;
        collideWithStairs(c, stairsRef.current);
      }

      // Rotation (3D visual): match angular velocity to linear
      c.rotZ += c.rotVZ * dt;
      c.rotX += c.rotVX * dt;
      c.rotY += c.rotVY * dt;

      // Air friction on rotation
      c.rotVX *= 0.995;
      c.rotVY *= 0.995;
      c.rotVZ *= 0.995;

      // Ground friction (sliding feel - low friction)
      if (c.onGround) {
        const sg = Math.sign(c.vx);
        c.vx -= sg * FRICTION_GROUND * 60 * dt;
        if (Math.sign(c.vx) !== sg) c.vx = 0;
        // Slow rotation when grounded
        c.rotVZ *= 0.95;
      }

      // Score: count unique stairs touched
      const touchedCount = stairsRef.current.reduce((acc, s) => acc + (s.touched ? 1 : 0), 0);
      if (touchedCount !== hud.score) {
        setHud((h) => ({ ...h, score: touchedCount }));
      }

      // Crossed finish line?
      const finishStair = stairsRef.current[FINISH_LINE_INDEX];
      if (finishStair && c.x > finishStair.x + STAIR_W) {
        crossedFinishRef.current = true;
      }

      // Stop detection (cube moving very slowly while grounded)
      const totalSpeed = Math.abs(c.vx) + Math.abs(c.vy);
      if (totalSpeed < STOP_THRESHOLD_VEL && c.onGround) {
        stoppedTimerRef.current += dt;
      } else {
        stoppedTimerRef.current = 0;
      }

      // End conditions
      const lastStair = stairsRef.current[TOTAL_STAIRS - 1];
      const fellBelow = c.y > lastStair.y + 2000; // fell off the world
      const wentOffLeft = c.x < -300;
      if (fellBelow || wentOffLeft) {
        endGame(false);
      } else if (stoppedTimerRef.current >= STOP_THRESHOLD_TIME) {
        // Stopped fully on a stair - end game (with bonus if crossed finish)
        endGame(crossedFinishRef.current);
      }
    }

    // --- Camera follows cube ---
    const targetCamX = c.x - WIN_W / 2;
    const targetCamY = c.y - WIN_H * 0.45;
    cam.x += (targetCamX - cam.x) * Math.min(1, dt * 5);
    cam.y += (targetCamY - cam.y) * Math.min(1, dt * 5);
    camTX.setValue(-cam.x);
    camTY.setValue(-cam.y);

    // --- Push cube transforms to native ---
    cubeTX.setValue(c.x - c.size / 2);
    cubeTY.setValue(c.y - c.size / 2);
    cubeRX.setValue(c.rotX);
    cubeRY.setValue(c.rotY);
    cubeRZ.setValue(c.rotZ);
    cubeScale.setValue(c.size / CUBE_SIZE_BASE);
  };

  // ===== Collision (cube vs stair top + side) =====
  const collideWithStairs = (c: typeof cube, stairs: Stair[]) => {
    c.onGround = false;
    // Each stair: top edge at y = stair.y, top surface from x..x+STAIR_W
    // Side wall: at x = stair.x (left wall) from y = stair.y..stair.y+STAIR_H if stair-1 is to the left and above
    // Simpler: treat each stair as a rectangle with TOP at y, from x to x+STAIR_W.
    // The vertical face on the LEFT goes from (stair.y) down to (stair.y + STAIR_H).
    const halfS = c.size / 2;

    // Find candidate stairs near cube
    const startI = Math.max(0, Math.floor((c.x - 200) / STAIR_W));
    const endI = Math.min(TOTAL_STAIRS - 1, Math.ceil((c.x + 200) / STAIR_W));

    for (let i = startI; i <= endI; i++) {
      const s = stairs[i];
      if (s.broken) continue;
      // Stair rectangle: x..x+STAIR_W, y..y+STAIR_H (only top face is real)
      // Top collision: cube falling, lower edge crosses stair.y
      const cubeBottom = c.y + halfS;
      const cubeTop = c.y - halfS;
      const cubeLeft = c.x - halfS;
      const cubeRight = c.x + halfS;
      const stairLeft = s.x;
      const stairRight = s.x + STAIR_W;
      const stairTop = s.y;
      const stairBottom = s.y + 100000; // treat below as solid mass to bottom

      const overlapsX = cubeRight > stairLeft && cubeLeft < stairRight;
      const overlapsY = cubeBottom > stairTop && cubeTop < stairBottom;

      if (overlapsX && overlapsY) {
        // Determine collision side by min penetration
        const penTop = cubeBottom - stairTop;       // hit top of stair from above
        const penLeft = cubeRight - stairLeft;      // hit left wall from outside-left
        // (no right wall - stairs cascade)
        // Resolve smallest penetration
        if (penTop < penLeft && c.vy >= 0) {
          // Land on top
          c.y = stairTop - halfS;
          if (c.vy > 0) {
            // Bounce
            const bounce = c.isBall ? 0.7 : BOUNCE_DAMP;
            c.vy = -c.vy * bounce;
            // Add rotation from impact
            c.rotVZ += (Math.random() - 0.5) * 6;
            c.rotVX += Math.abs(c.vx) * 0.02;
            // Trigger small bounce only if moving fast enough
            if (Math.abs(c.vy) < 60) c.vy = 0;
            if (Math.abs(c.vy) < 60) {
              c.onGround = true;
            }
          }
          // Mark touched
          if (!s.touched) {
            s.touched = true;
            try { Haptics.selectionAsync(); } catch {}
            // Power-up stair?
            if (s.isPower && phase === "flight") {
              triggerRandomPower(s);
            }
          }
          c.onStair = s.i;
        } else if (penLeft < penTop && c.vx > 0) {
          // Hit left wall (treat as bounce off vertical surface)
          c.x = stairLeft - halfS;
          c.vx = -c.vx * BOUNCE_DAMP;
          c.rotVZ -= 4;
        }
      }
    }
  };

  const triggerRandomPower = (s: Stair) => {
    const t = POWERUPS_POOL[Math.floor(Math.random() * POWERUPS_POOL.length)];
    const c = cube;
    if (t === "broken") {
      // Break stairs around this one
      for (let k = -2; k <= 2; k++) {
        const sx = stairsRef.current[s.i + k];
        if (sx) sx.broken = true;
      }
      pushFloat(s.x + STAIR_W / 2, s.y - 30, "💥 محطم!", "#DC2626");
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
      return;
    }
    if (t === "bigCube") c.size = CUBE_SIZE_BASE * 1.6;
    if (t === "smallCube") c.size = CUBE_SIZE_BASE * 0.5;
    if (t === "ball") c.isBall = true;
    activePowerRef.current = { type: t, ttl: 3.5 };
    setHud((h) => ({ ...h, activePower: { type: t, ttl: 3.5 } }));
    pushFloat(s.x + STAIR_W / 2, s.y - 30, `${POWER_LABELS[t].emoji} ${POWER_LABELS[t].label}`, POWER_LABELS[t].color);
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); } catch {}
  };

  const pushFloat = (x: number, y: number, text: string, color: string) => {
    const id = floatIdRef.current++;
    setFloats((f) => [...f, { id, x, y, text, color, ttl: 1.2 }]);
    setTimeout(() => setFloats((f) => f.filter((x) => x.id !== id)), 1200);
  };

  // ===== Tap handler =====
  const onTap = () => {
    if (phase === "menu") {
      initGame();
      return;
    }
    if (phase === "aim" && !aim.locked) {
      aim.locked = true;
      try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
      setPhase("power");
      return;
    }
    if (phase === "power" && !power.locked) {
      power.locked = true;
      // Launch
      const angle = aim.angle; // -1.1 to 1.1, where 0 is straight up
      const speed = 400 + power.value * 1100;
      // Convert: angle 0 = up, positive = tilted right
      const dirX = Math.sin(angle);
      const dirY = -Math.cos(angle);
      cube.vx = dirX * speed;
      cube.vy = dirY * speed;
      cube.rotVZ = (Math.random() - 0.5) * 8;
      cube.rotVX = power.value * 6;
      cube.rotVY = (Math.random() - 0.5) * 4;
      try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); } catch {}
      setPhase("flight");
      return;
    }
  };

  const endGame = useCallback(async (won: boolean = false) => {
    setPhase("ended");
    // Compute current score from stairs touched (avoid stale state)
    const touched = stairsRef.current.reduce((acc, s) => acc + (s.touched ? 1 : 0), 0);
    const bonus = won ? 500 : 0;
    const finalScore = touched + bonus;
    if (won) {
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    }
    // Save high score
    try {
      const raw = await AsyncStorage.getItem(HIGH_SCORE_KEY);
      const arr: HighScore[] = raw ? JSON.parse(raw) : [];
      arr.push({ name: playerName, score: finalScore, ts: Date.now() });
      arr.sort((a, b) => b.score - a.score);
      const top = arr.slice(0, 10);
      await AsyncStorage.setItem(HIGH_SCORE_KEY, JSON.stringify(top));
      setHud((h) => ({ ...h, finalScore, highScores: top, score: touched }));
    } catch {
      setHud((h) => ({ ...h, finalScore, score: touched }));
    }
  }, [playerName]);

  // ===== RENDER ==========

  // Determine which stairs are visible
  const visibleStairs = useMemo(() => {
    const out: Stair[] = [];
    if (!stairsRef.current.length) return out;
    const startI = Math.max(0, Math.floor(cam.x / STAIR_W) - 2);
    const endI = Math.min(TOTAL_STAIRS - 1, startI + Math.ceil(WIN_W / STAIR_W) + 6);
    for (let i = startI; i <= endI; i++) out.push(stairsRef.current[i]);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hud.score, phase]);

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false, animation: "fade" }} />
      <StatusBar hidden />
      {/* Background gradient */}
      <LinearGradient
        colors={["#0F172A", "#1E1B4B", "#312E81", "#4C1D95"]}
        style={StyleSheet.absoluteFill}
      />
      {/* Stars */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {Array.from({ length: 60 }).map((_, i) => (
          <View
            key={i}
            style={{
              position: "absolute",
              left: ((i * 137) % WIN_W),
              top: ((i * 89) % WIN_H * 0.7),
              width: 2 + (i % 3),
              height: 2 + (i % 3),
              borderRadius: 2,
              backgroundColor: "#FFFFFF",
              opacity: 0.3 + (i % 5) * 0.1,
            }}
          />
        ))}
      </View>

      {/* World container (translated by camera) */}
      <Animated.View
        style={[StyleSheet.absoluteFill, { transform: [{ translateX: camTX }, { translateY: camTY }] }]}
        pointerEvents="none"
      >
        {/* Stairs */}
        {visibleStairs.map((s) => (
          <Stair3D
            key={s.i}
            stair={s}
          />
        ))}

        {/* Floats */}
        {floats.map((f) => (
          <Text
            key={f.id}
            style={{
              position: "absolute",
              left: f.x - 80,
              top: f.y - 30,
              width: 160,
              textAlign: "center",
              color: f.color,
              fontWeight: "900",
              fontSize: 16,
              textShadow: "0px 1px 4px rgba(0,0,0,0.8)",
            }}
          >
            {f.text}
          </Text>
        ))}

        {/* Cube (the star) */}
        {phase !== "menu" && (
          <Animated.View
            style={{
              position: "absolute",
              width: CUBE_SIZE_BASE,
              height: CUBE_SIZE_BASE,
              transform: [
                { translateX: cubeTX },
                { translateY: cubeTY },
                { perspective: 800 },
                { rotateX: cubeRX.interpolate({ inputRange: [0, 2 * Math.PI], outputRange: ["0deg", "360deg"] }) },
                { rotateY: cubeRY.interpolate({ inputRange: [0, 2 * Math.PI], outputRange: ["0deg", "360deg"] }) },
                { rotateZ: cubeRZ.interpolate({ inputRange: [0, 2 * Math.PI], outputRange: ["0deg", "360deg"] }) },
                { scale: cubeScale },
              ],
            }}
          >
            <Cube3D size={CUBE_SIZE_BASE} hasPower={!!hud.activePower} powerColor={hud.activePower ? POWER_LABELS[hud.activePower.type].color : ""} />
          </Animated.View>
        )}

        {/* Aim arrow */}
        {phase === "aim" && (
          <Animated.View
            style={{
              position: "absolute",
              left: cube.x - 4,
              top: cube.y - 110,
              width: 8,
              height: 90,
              transform: [
                { translateY: 45 },
                { rotate: arrowAngle.interpolate({ inputRange: [-1.5, 1.5], outputRange: ["-86deg", "86deg"] }) },
                { translateY: -45 },
              ],
            }}
          >
            <View style={styles.arrowStem} />
            <View style={styles.arrowHead} />
          </Animated.View>
        )}

        {/* Power meter (vertical bar overlay near cube) */}
        {phase === "power" && (
          <View
            style={{
              position: "absolute",
              left: cube.x - 80,
              top: cube.y - 80,
              width: 160,
              alignItems: "center",
            }}
          >
            <View style={styles.powerTrack}>
              <Animated.View
                style={[
                  styles.powerFill,
                  {
                    width: powerFill.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }),
                  },
                ]}
              />
            </View>
            <Text style={styles.powerLabel}>اضغط لتحديد القوة</Text>
          </View>
        )}
      </Animated.View>

      {/* Tap surface */}
      <Pressable style={StyleSheet.absoluteFill} onPress={onTap} />

      {/* HUD */}
      <View style={styles.hud} pointerEvents="box-none">
        <Pressable style={styles.hudBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-forward" size={20} color="#fff" />
        </Pressable>
        <View style={styles.hudCenter}>
          <View style={styles.hudPill}>
            <Ionicons name="trophy" size={14} color="#FBBF24" />
            <Text style={styles.hudText}>{hud.score}</Text>
          </View>
          {hud.activePower && (
            <View style={[styles.hudPill, { backgroundColor: POWER_LABELS[hud.activePower.type].color + "33", borderColor: POWER_LABELS[hud.activePower.type].color }]}>
              <Text style={{ fontSize: 13 }}>{POWER_LABELS[hud.activePower.type].emoji}</Text>
              <Text style={[styles.hudText, { color: POWER_LABELS[hud.activePower.type].color }]}>
                {POWER_LABELS[hud.activePower.type].label}
              </Text>
            </View>
          )}
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Phase hint */}
      {phase === "aim" && (
        <View style={styles.bottomHint}>
          <Text style={styles.bottomHintText}>اضغط لتحديد الاتجاه ➤</Text>
        </View>
      )}
      {phase === "power" && (
        <View style={styles.bottomHint}>
          <Text style={styles.bottomHintText}>اضغط لتحديد القوة 💥</Text>
        </View>
      )}

      {/* Menu overlay */}
      {phase === "menu" && (
        <View style={styles.menuOverlay}>
          <Text style={styles.menuTitle}>🎲 مكعب الدرج</Text>
          <Text style={styles.menuSub}>ارمِ المكعب ولامس أكبر عدد من الدرجات</Text>
          <Pressable style={styles.startBtn} onPress={onTap}>
            <Ionicons name="play" size={28} color="#fff" />
            <Text style={styles.startTxt}>ابدأ اللعب</Text>
          </Pressable>
          {hud.highScores.length > 0 && (
            <View style={styles.scoreBox}>
              <Text style={styles.scoreBoxTitle}>🏆 أفضل النتائج</Text>
              {hud.highScores.slice(0, 5).map((h, i) => (
                <View key={i} style={styles.scoreRow}>
                  <Text style={styles.scoreRank}>{i + 1}.</Text>
                  <Text style={styles.scoreName}>{h.name}</Text>
                  <Text style={styles.scoreVal}>{h.score}</Text>
                </View>
              ))}
            </View>
          )}
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="home" size={18} color="#fff" />
            <Text style={styles.backBtnTxt}>عودة للقائمة</Text>
          </Pressable>
        </View>
      )}

      {/* Game Over overlay */}
      {phase === "ended" && (
        <View style={styles.menuOverlay}>
          <Text style={styles.menuTitle}>🏁 انتهت اللعبة</Text>
          <Text style={styles.finalScore}>{hud.finalScore}</Text>
          <Text style={styles.menuSub}>درجة لمستها</Text>
          {hud.highScores.length > 0 && (
            <View style={styles.scoreBox}>
              <Text style={styles.scoreBoxTitle}>🏆 أفضل النتائج</Text>
              {hud.highScores.slice(0, 5).map((h, i) => (
                <View key={i} style={styles.scoreRow}>
                  <Text style={styles.scoreRank}>{i + 1}.</Text>
                  <Text style={styles.scoreName}>{h.name}</Text>
                  <Text style={styles.scoreVal}>{h.score}</Text>
                </View>
              ))}
            </View>
          )}
          <View style={{ flexDirection: "row-reverse", gap: 12, marginTop: 12 }}>
            <Pressable style={styles.startBtn} onPress={() => initGame()}>
              <Ionicons name="refresh" size={20} color="#fff" />
              <Text style={styles.startTxt}>العب مجدداً</Text>
            </Pressable>
            <Pressable style={styles.backBtn} onPress={() => router.back()}>
              <Ionicons name="home" size={18} color="#fff" />
              <Text style={styles.backBtnTxt}>الخروج</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

// ===== Stair component =====
function Stair3D({ stair }: { stair: Stair }) {
  if (stair.broken) {
    return (
      <View
        style={{
          position: "absolute",
          left: stair.x,
          top: stair.y,
          width: STAIR_W,
          height: STAIR_H,
          opacity: 0.15,
          borderColor: "#7F1D1D",
          borderWidth: 1,
          backgroundColor: "rgba(127,29,29,0.3)",
          borderRadius: 4,
        }}
      />
    );
  }
  const baseColor = stair.isPower ? "#FBBF24" : stair.touched ? "#10B981" : "#6366F1";
  const sideColor = stair.isPower ? "#B45309" : stair.touched ? "#065F46" : "#3730A3";
  return (
    <>
      {/* Top face */}
      <LinearGradient
        colors={[baseColor, sideColor]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={{
          position: "absolute",
          left: stair.x,
          top: stair.y - 6,
          width: STAIR_W,
          height: 8,
          borderRadius: 3,
        }}
      />
      {/* Front face (vertical body, descends infinitely down visually) */}
      <View
        style={{
          position: "absolute",
          left: stair.x,
          top: stair.y,
          width: STAIR_W,
          height: STAIR_H + 4,
          backgroundColor: sideColor,
          borderTopWidth: 2,
          borderTopColor: baseColor,
          borderLeftWidth: 1,
          borderLeftColor: "rgba(0,0,0,0.3)",
        }}
      />
      {/* Power ? marker */}
      {stair.isPower && !stair.touched && (
        <Text
          style={{
            position: "absolute",
            left: stair.x,
            top: stair.y - 28,
            width: STAIR_W,
            textAlign: "center",
            fontSize: 22,
            fontWeight: "900",
            color: "#FBBF24",
            textShadow: "0px 0px 8px rgba(251,191,36,0.8)",
          }}
        >
          ?
        </Text>
      )}
      {/* Stair number every 50 */}
      {stair.i % 50 === 0 && stair.i > 0 && (
        <Text
          style={{
            position: "absolute",
            left: stair.x,
            top: stair.y + STAIR_H / 2,
            width: STAIR_W,
            textAlign: "center",
            color: "#fff",
            fontSize: 11,
            fontWeight: "700",
            opacity: 0.7,
          }}
        >
          {stair.i}
        </Text>
      )}
      {/* FINISH LINE marker at the goal stair */}
      {stair.i === FINISH_LINE_INDEX && (
        <>
          {/* Pole */}
          <View
            style={{
              position: "absolute",
              left: stair.x + STAIR_W / 2 - 2,
              top: stair.y - 120,
              width: 4,
              height: 120,
              backgroundColor: "#FFFFFF",
            }}
          />
          {/* Checkered flag */}
          <View
            style={{
              position: "absolute",
              left: stair.x + STAIR_W / 2 + 2,
              top: stair.y - 120,
              width: 56,
              height: 36,
              flexDirection: "row",
              flexWrap: "wrap",
              borderWidth: 1,
              borderColor: "#000",
              overflow: "hidden",
            }}
          >
            {Array.from({ length: 24 }).map((_, k) => {
              const r = Math.floor(k / 8);
              const c = k % 8;
              const black = (r + c) % 2 === 0;
              return (
                <View
                  key={k}
                  style={{
                    width: 7, height: 12,
                    backgroundColor: black ? "#000" : "#fff",
                  }}
                />
              );
            })}
          </View>
          {/* "FINISH" label */}
          <Text
            style={{
              position: "absolute",
              left: stair.x - 30,
              top: stair.y - 150,
              width: STAIR_W + 60,
              textAlign: "center",
              color: "#FBBF24",
              fontSize: 14,
              fontWeight: "900",
              textShadow: "0px 0px 8px rgba(0,0,0,0.9)",
            }}
          >
            🏁 خط النهاية
          </Text>
        </>
      )}
    </>
  );
}

// ===== Cube component (true 3D look with isometric perspective) =====
function Cube3D({ size, hasPower, powerColor }: { size: number; hasPower: boolean; powerColor: string }) {
  // Render the cube with 3 visible isometric faces (top, front, right) - looks truly 3D.
  const main = hasPower ? powerColor : "#F472B6";
  const top = hasPower ? lighten(powerColor) : "#FBCFE8";
  const right = hasPower ? darken(powerColor) : "#9D174D";
  const edge = hasPower ? darken(powerColor, 0.5) : "#500724";
  const dotColor = hasPower ? "#FFFFFF" : "#FFFFFF";

  // Isometric depth offset
  const dx = size * 0.22;
  const dy = size * 0.22;

  return (
    <View style={{ width: size + dx, height: size + dy }}>
      {/* TOP face - parallelogram via skewX */}
      <View
        style={{
          position: "absolute",
          left: dx,
          top: 0,
          width: size,
          height: dy,
          backgroundColor: top,
          transform: [{ skewX: "-45deg" }, { translateX: -dy / 2 }],
          borderTopWidth: 1.5,
          borderTopColor: edge,
          borderLeftWidth: 1.5,
          borderLeftColor: edge,
        }}
      />
      {/* RIGHT face - parallelogram via skewY */}
      <View
        style={{
          position: "absolute",
          left: size,
          top: dy,
          width: dx,
          height: size,
          backgroundColor: right,
          transform: [{ skewY: "-45deg" }, { translateY: -dx / 2 }],
          borderTopWidth: 1.5,
          borderTopColor: edge,
          borderRightWidth: 1.5,
          borderRightColor: edge,
        }}
      />
      {/* FRONT face - solid square with shading & dot */}
      <View
        style={{
          position: "absolute",
          left: 0,
          top: dy,
          width: size,
          height: size,
          backgroundColor: main,
          borderWidth: 1.5,
          borderColor: edge,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 2,
        }}
      >
        {/* Highlight on top-left */}
        <View
          style={{
            position: "absolute",
            top: 3,
            left: 3,
            width: size * 0.45,
            height: size * 0.45,
            backgroundColor: "#FFFFFF",
            opacity: 0.18,
            borderRadius: 4,
          }}
        />
        {/* Center pip */}
        <View
          style={{
            width: size * 0.28,
            height: size * 0.28,
            backgroundColor: dotColor,
            borderRadius: 100,
            opacity: 0.95,
            borderWidth: 2,
            borderColor: edge,
          }}
        />
      </View>
    </View>
  );
}

function lighten(hex: string): string {
  // simple lighten by mixing with white
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = Math.min(255, ((n >> 16) & 0xff) + 60);
  const g = Math.min(255, ((n >> 8) & 0xff) + 60);
  const b = Math.min(255, (n & 0xff) + 60);
  return `rgb(${r},${g},${b})`;
}

function darken(hex: string, amt = 0.25): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = Math.max(0, Math.floor(((n >> 16) & 0xff) * (1 - amt)));
  const g = Math.max(0, Math.floor(((n >> 8) & 0xff) * (1 - amt)));
  const b = Math.max(0, Math.floor((n & 0xff) * (1 - amt)));
  return `rgb(${r},${g},${b})`;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0F172A", overflow: "hidden" },
  hud: {
    position: "absolute",
    top: Platform.OS === "ios" ? 50 : 20,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 10,
  },
  hudBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.2)",
  },
  hudCenter: { flexDirection: "row-reverse", gap: 8 },
  hudPill: {
    flexDirection: "row-reverse", alignItems: "center", gap: 5,
    paddingHorizontal: 14, paddingVertical: 7,
    backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 100,
    borderWidth: 1.5, borderColor: "rgba(255,255,255,0.2)",
  },
  hudText: { color: "#fff", fontWeight: "900", fontSize: 16 },

  arrowStem: {
    position: "absolute", top: 12, left: 0, width: 8, height: 70,
    backgroundColor: "#FBBF24", borderRadius: 4,
    boxShadow: "0px 0px 12px rgba(251,191,36,0.8)",
  },
  arrowHead: {
    position: "absolute", top: 0, left: -8, width: 0, height: 0,
    borderLeftWidth: 12, borderRightWidth: 12, borderBottomWidth: 18,
    borderLeftColor: "transparent", borderRightColor: "transparent",
    borderBottomColor: "#FBBF24",
    transform: [{ rotate: "180deg" }],
  },

  powerTrack: {
    width: 160, height: 18, borderRadius: 100,
    backgroundColor: "rgba(0,0,0,0.5)", borderWidth: 2, borderColor: "#fff",
    overflow: "hidden",
  },
  powerFill: {
    height: "100%",
    backgroundColor: "#EF4444",
    borderRadius: 100,
  },
  powerLabel: { color: "#fff", fontWeight: "900", fontSize: 12, marginTop: 6, textShadow: "0px 1px 3px rgba(0,0,0,0.7)" },

  bottomHint: {
    position: "absolute", bottom: 30, left: 0, right: 0,
    alignItems: "center",
  },
  bottomHintText: {
    color: "#fff", fontWeight: "900", fontSize: 16,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 100,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.2)",
  },

  menuOverlay: {
    position: "absolute", top: 0, bottom: 0, left: 0, right: 0,
    backgroundColor: "rgba(15,23,42,0.92)",
    alignItems: "center", justifyContent: "center",
    paddingHorizontal: 24,
    zIndex: 100,
  },
  menuTitle: { color: "#fff", fontSize: 36, fontWeight: "900", marginBottom: 8 },
  menuSub: { color: "#CBD5E1", fontSize: 16, marginBottom: 20 },
  finalScore: { color: "#FBBF24", fontSize: 72, fontWeight: "900", letterSpacing: -2 },
  startBtn: {
    flexDirection: "row-reverse", gap: 8, alignItems: "center",
    paddingHorizontal: 28, paddingVertical: 14, borderRadius: 100,
    backgroundColor: "#10B981",
    boxShadow: "0px 4px 16px rgba(16,185,129,0.4)",
  },
  startTxt: { color: "#fff", fontWeight: "900", fontSize: 18 },
  backBtn: {
    flexDirection: "row-reverse", gap: 6, alignItems: "center",
    paddingHorizontal: 20, paddingVertical: 12, borderRadius: 100,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.2)",
    marginTop: 18,
  },
  backBtnTxt: { color: "#fff", fontWeight: "900", fontSize: 14 },
  scoreBox: {
    width: "85%", maxWidth: 360,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 16, padding: 14, marginTop: 22,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.15)",
  },
  scoreBoxTitle: { color: "#FBBF24", fontWeight: "900", fontSize: 16, marginBottom: 8, textAlign: "center" },
  scoreRow: {
    flexDirection: "row-reverse", alignItems: "center",
    paddingVertical: 4, gap: 8,
  },
  scoreRank: { color: "#94A3B8", fontWeight: "900", width: 24 },
  scoreName: { color: "#fff", flex: 1, fontWeight: "700", textAlign: "right" },
  scoreVal: { color: "#10B981", fontWeight: "900", fontSize: 16 },
});
