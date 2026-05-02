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
const CUBE_SIZE_BASE = TILE * 1.3;
const STAIR_W = TILE * 2.2;
const STAIR_H = TILE * 1.0;
const TOTAL_STAIRS = 1000;
const POWERUP_EVERY = 20;
const START_STAIR = 20;

// Physics
const GRAVITY = 1800; // px/s²
const BOUNCE_DAMP = 0.55;
const FRICTION_GROUND = 4.5;
const AIM_SPEED = 1.6; // rad/s pendulum

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
    setHud({ score: 0, aimAngle: 0, power: 0, activePower: null, finalScore: 0, highScores: [] });
    setFloats([]);
    setPhase("aim");
  }, [aim, cube, power]);

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

      // Integrate (sub-stepped)
      const speed = Math.hypot(c.vx, c.vy);
      const steps = Math.max(1, Math.ceil(speed * dt / 8));
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

      // Ground friction (rolling stop)
      if (c.onGround) {
        const sg = Math.sign(c.vx);
        c.vx -= sg * FRICTION_GROUND * 60 * dt;
        if (Math.sign(c.vx) !== sg) c.vx = 0;
        c.rotVZ *= 0.92;
      }

      // Score: count unique stairs touched
      const touchedCount = stairsRef.current.reduce((acc, s) => acc + (s.touched ? 1 : 0), 0);
      if (touchedCount !== hud.score) {
        setHud((h) => ({ ...h, score: touchedCount }));
      }

      // End conditions: cube fell off the world OR finished
      const lastStair = stairsRef.current[TOTAL_STAIRS - 1];
      const fellBelow = c.y > lastStair.y + 1500;
      const wentOff = c.x < -300 || c.x > lastStair.x + 1500;
      const slowEnough = Math.abs(c.vx) < 4 && Math.abs(c.vy) < 4 && c.onGround;
      if (fellBelow || wentOff) {
        endGame();
      } else if (slowEnough && phase === "flight") {
        // Settle: return to aim (re-aim from new position)
        aim.angle = 0; aim.dir = 1; aim.locked = false;
        power.value = 0; power.locked = false; power.dir = 1;
        c.rotVX = 0; c.rotVY = 0; c.rotVZ = 0;
        setPhase("aim");
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

  const endGame = useCallback(async () => {
    setPhase("ended");
    const finalScore = hud.score;
    // Save high score
    try {
      const raw = await AsyncStorage.getItem(HIGH_SCORE_KEY);
      const arr: HighScore[] = raw ? JSON.parse(raw) : [];
      arr.push({ name: playerName, score: finalScore, ts: Date.now() });
      arr.sort((a, b) => b.score - a.score);
      const top = arr.slice(0, 10);
      await AsyncStorage.setItem(HIGH_SCORE_KEY, JSON.stringify(top));
      setHud((h) => ({ ...h, finalScore, highScores: top }));
    } catch {
      setHud((h) => ({ ...h, finalScore }));
    }
  }, [hud.score, playerName]);

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
    </>
  );
}

// ===== Cube component (pseudo-3D with 3 faces) =====
function Cube3D({ size, hasPower, powerColor }: { size: number; hasPower: boolean; powerColor: string }) {
  // We'll draw a single colored face with shading lines.
  // Real 3D rotation comes from Animated transforms outside.
  const main = hasPower ? powerColor : "#F472B6";
  const dark = hasPower ? "#1F2937" : "#9D174D";
  const light = "#FFFFFF";
  return (
    <View
      style={{
        width: size,
        height: size,
        backgroundColor: main,
        borderWidth: 3,
        borderColor: dark,
        borderRadius: 6,
        alignItems: "center",
        justifyContent: "center",
        // gradient via overlays
      }}
    >
      {/* Inner highlights to simulate cube lighting */}
      <View style={{ position: "absolute", top: 4, left: 4, right: 4, height: 6, backgroundColor: light, opacity: 0.4, borderRadius: 3 }} />
      <View style={{ position: "absolute", left: 4, top: 4, bottom: 4, width: 6, backgroundColor: light, opacity: 0.25, borderRadius: 3 }} />
      <View style={{ position: "absolute", right: 4, top: 4, bottom: 4, width: 6, backgroundColor: dark, opacity: 0.5, borderRadius: 3 }} />
      <View style={{ position: "absolute", bottom: 4, left: 4, right: 4, height: 6, backgroundColor: dark, opacity: 0.4, borderRadius: 3 }} />
      {/* Center dot decoration */}
      <View style={{ width: size * 0.25, height: size * 0.25, backgroundColor: light, borderRadius: 100, opacity: 0.85 }} />
    </View>
  );
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
