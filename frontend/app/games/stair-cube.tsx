// "مكعب الدرج" - 2D side-view physics game with TRUE 3D cube via SVG projection.
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
  TextInput,
  KeyboardAvoidingView,
  Keyboard,
  TouchableWithoutFeedback,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Svg, { Polygon, Defs, LinearGradient as SvgLG, Stop } from "react-native-svg";

const { width: WIN_W, height: WIN_H } = Dimensions.get("window");

// ========== Constants ==========
const TILE = 28; // visual unit
const CUBE_SIZE_BASE = TILE * 0.9; // 50% smaller cube
const CUBE_RENDER_SIZE = CUBE_SIZE_BASE * 4; // bigger render area to accommodate bigCube power-up scaling
const STAIR_W = TILE * 5.0; // VERY wide step (long horizontally)
const STAIR_H = TILE * 1.5; // short rise (short vertically)
const STAIR_FRONT_H = STAIR_H * 1.0;
const TOTAL_STAIRS = 1000;
const POWERUP_EVERY = 20;
const START_STAIR = 20;
const FINISH_LINE_INDEX = TOTAL_STAIRS - 1;

// Physics
const GRAVITY = 1400; // px/s²
const BOUNCE_DAMP = 0.34; // vertical restitution (top landings)
const BOUNCE_WALL = 0.55; // horizontal wall restitution — strong but controlled
const FRICTION_GROUND = 0.08; // very very low — MAXIMUM sliding
const AIM_SPEED = 1.6;
const STOP_THRESHOLD_VEL = 6;
const STOP_THRESHOLD_TIME = 1.4;

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
      // skip the start stair from being a power stair (don't give free power on launch)
      isPower: i > 0 && i !== START_STAIR && i % POWERUP_EVERY === 0,
      touched: false,
      broken: false,
    });
  }
  return arr;
}

const HIGH_SCORE_KEY = "stair-cube:highscores";
const PLAYER_NAME_KEY = "stair-cube:playerName";

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

  // Viewport tick — increments as the camera moves between stair buckets.
  // This forces visibleStairs to recompute so stairs appear in real-time during fast flight.
  const [viewportBucket, setViewportBucket] = useState(0);
  const lastViewportBucketRef = useRef(0);

  // World scale (zoom-out when cube moves fast)
  const worldScale = useRef(new Animated.Value(1)).current;
  const currentScaleRef = useRef(1);

  // ===== Init =====
  const initGame = useCallback(() => {
    stairsRef.current = buildStairs();
    const s = stairsRef.current[START_STAIR];
    cube.x = s.x + STAIR_W / 2;
    cube.y = s.y - CUBE_SIZE_BASE / 2;
    cube.vx = 0; cube.vy = 0;
    cube.size = CUBE_SIZE_BASE;
    // Cube orientation: all zero = cube is FLAT on ground, one face down
    // (viewing angle is applied separately in SvgCube3D)
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
    cam.y = cube.y - WIN_H / 2;
    camTX.setValue(-cam.x);
    camTY.setValue(-cam.y);
    cubeTX.setValue(cube.x - cube.size / 2);
    cubeTY.setValue(cube.y - cube.size / 2);
    // Reset world scale
    currentScaleRef.current = 1;
    worldScale.setValue(1);

    setHud({ score: 0, aimAngle: 0, power: 0, activePower: null, finalScore: 0, highScores: hud.highScores });
    setFloats([]);
    // Reset viewport tracking so stairs render around START_STAIR immediately
    lastViewportBucketRef.current = START_STAIR;
    setViewportBucket(START_STAIR);
    setPhase("aim");
  }, [aim, cube, power, cam, camTX, camTY, cubeTX, cubeTY, hud.highScores]);

  // Load high scores & player name
  useEffect(() => {
    AsyncStorage.getItem(HIGH_SCORE_KEY).then((raw) => {
      if (raw) {
        try {
          const arr: HighScore[] = JSON.parse(raw);
          setHud((h) => ({ ...h, highScores: arr }));
        } catch {}
      }
    });
    AsyncStorage.getItem(PLAYER_NAME_KEY).then((name) => {
      if (name && name.trim().length > 0) setPlayerName(name);
    });
  }, []);

  // Save name whenever it changes (if not default)
  useEffect(() => {
    if (playerName && playerName !== "لاعب") {
      AsyncStorage.setItem(PLAYER_NAME_KEY, playerName).catch(() => {});
    }
  }, [playerName]);

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
      const maxStep = c.size * 0.25;
      const steps = Math.max(1, Math.ceil((speed * dt) / maxStep));
      const sdt = dt / steps;
      for (let i = 0; i < steps; i++) {
        c.x += c.vx * sdt;
        c.y += c.vy * sdt;
        collideWithStairs(c, stairsRef.current);
      }

      // === EDGE TUMBLE PHYSICS (real-cube behavior on stairs) ===
      // When cube is on a stair, check how much of it is supported
      if (c.onGround && c.onStair >= 0 && Math.abs(c.vy) < 5) {
        const s = stairsRef.current[c.onStair];
        const stairLeft = s.x;
        const stairRight = s.x + STAIR_W;
        const halfS = c.size / 2;

        // How much of cube extends past stair edges (negative = fully supported)
        const overhangRight = (c.x + halfS) - stairRight;
        const overhangLeft = stairLeft - (c.x - halfS);

        if (overhangRight > 0) {
          // Right edge of cube is past right edge of stair → tip/fall off the right
          // Gravity creates torque around the right corner of the stair (pivot point).
          const tipFactor = Math.min(1, overhangRight / halfS);
          c.rotVZ += tipFactor * 10 * dt * 60; // physical torque from gravity
          // Once overhang > 25% of cube, detach cleanly and let gravity take over
          if (overhangRight > halfS * 0.25) {
            c.onGround = false;
            c.vy = Math.max(c.vy, 30); // small initial drop
            c.vx = Math.max(c.vx, 40); // gentle forward push
            // Keep rotation that was building up - physical continuation
            c.rotVZ = Math.max(c.rotVZ, 4 + tipFactor * 3);
            // No random X/Y kicks - realistic physics only
          }
        } else if (overhangLeft > 0) {
          const tipFactor = Math.min(1, overhangLeft / halfS);
          c.rotVZ -= tipFactor * 10 * dt * 60;
          if (overhangLeft > halfS * 0.25) {
            c.onGround = false;
            c.vy = Math.max(c.vy, 30);
            c.vx = Math.min(c.vx, -40);
            c.rotVZ = Math.min(c.rotVZ, -(4 + tipFactor * 3));
          }
        } else {
          // Cube FULLY on stair → SETTLE flat on nearest face
          if (c.isBall) {
            // Ball keeps rolling — apply low friction only, no rotation snap
            c.vx *= Math.exp(-FRICTION_GROUND * 0.5 * dt);
          } else {
            // CUBE: snap all rotations to flat (face-down) orientation
            const QUARTER = Math.PI / 2;
            // Snap rotZ to nearest 90° (which face is down)
            const targetZ = Math.round(c.rotZ / QUARTER) * QUARTER;
            c.rotZ += (targetZ - c.rotZ) * Math.min(1, dt * 7);
            // Snap rotX and rotY to 0 (flat, not tilted) — ESSENTIAL so cube sits on face
            c.rotX += (0 - c.rotX) * Math.min(1, dt * 7);
            c.rotY += (0 - c.rotY) * Math.min(1, dt * 7);
            c.rotVZ *= Math.exp(-dt * 5);
            c.rotVX *= Math.exp(-dt * 5);
            c.rotVY *= Math.exp(-dt * 5);
            // LOTS of sliding — very low ground friction
            c.vx *= Math.exp(-FRICTION_GROUND * dt);
          }
        }
      }

      // 3D Rotation update from impacts/rolling
      c.rotZ += c.rotVZ * dt;
      c.rotX += c.rotVX * dt;
      c.rotY += c.rotVY * dt;

      // Air friction on rotation (slight)
      c.rotVX *= 0.992;
      c.rotVY *= 0.992;
      c.rotVZ *= 0.992;

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

    // --- Camera follows cube — keep cube centered on screen ---
    const targetCamX = c.x - WIN_W / 2;
    const targetCamY = c.y - WIN_H / 2; // perfect center vertically
    cam.x += (targetCamX - cam.x) * Math.min(1, dt * 6);
    cam.y += (targetCamY - cam.y) * Math.min(1, dt * 6);
    camTX.setValue(-cam.x);
    camTY.setValue(-cam.y);

    // --- Speed-based zoom: faster = pull camera back (smaller scale) ---
    const speedNow = Math.hypot(c.vx, c.vy);
    // Map speed [0..2200] → scale [1.0..0.5]
    let targetScale = 1 - Math.min(1, Math.max(0, speedNow - 400) / 1800) * 0.5;
    // Smoothly approach target scale
    const newScale = currentScaleRef.current + (targetScale - currentScaleRef.current) * Math.min(1, dt * 3);
    currentScaleRef.current = newScale;
    worldScale.setValue(newScale);

    // Update viewport bucket so visibleStairs re-computes when cube moves
    const newBucket = Math.floor(c.x / STAIR_W);
    if (newBucket !== lastViewportBucketRef.current) {
      lastViewportBucketRef.current = newBucket;
      setViewportBucket(newBucket);
    }

    // --- Push cube transforms to native ---
    cubeTX.setValue(c.x - c.size / 2);
    cubeTY.setValue(c.y - c.size / 2);
    cubeRZ.setValue(c.rotZ);
    cubeScale.setValue(c.size / CUBE_SIZE_BASE);
  };

  // ===== Collision (cube vs stair top + side walls) =====
  const collideWithStairs = (c: typeof cube, stairs: Stair[]) => {
    c.onGround = false;
    const halfS = c.size / 2;

    // Find candidate stairs near cube — wider window for fast cubes
    const startI = Math.max(0, Math.floor((c.x - 300) / STAIR_W));
    const endI = Math.min(TOTAL_STAIRS - 1, Math.ceil((c.x + 300) / STAIR_W));

    for (let i = startI; i <= endI; i++) {
      const s = stairs[i];
      if (s.broken) continue;
      // Stair rectangle: x..x+STAIR_W, y..y+infinity (only top face is real)
      const cubeBottom = c.y + halfS;
      const cubeTop = c.y - halfS;
      const cubeLeft = c.x - halfS;
      const cubeRight = c.x + halfS;
      const stairLeft = s.x;
      const stairRight = s.x + STAIR_W;
      const stairTop = s.y;
      const stairBottom = s.y + 100000;

      const overlapsX = cubeRight > stairLeft && cubeLeft < stairRight;
      const overlapsY = cubeBottom > stairTop && cubeTop < stairBottom;

      if (overlapsX && overlapsY) {
        // Calculate penetration on each side
        const penTop = cubeBottom - stairTop;       // hit top of stair from above
        const penLeft = cubeRight - stairLeft;      // hit left wall from outside-left (cube moving right)
        const penRight = stairRight - cubeLeft;     // hit right wall from outside-right (cube moving left)

        // Check if cube is hitting the TOP face (cube center is above stair top, and falling)
        // We require that the cube's previous y was above the stair top (use velocity check)
        const wasAbove = cubeBottom - c.vy * 0.016 < stairTop + 4; // cube was above stair top in previous frame

        if (wasAbove && c.vy >= 0 && penTop < halfS * 2) {
          // === LAND ON TOP ===
          c.y = stairTop - halfS;
          if (c.vy > 0) {
            // === DETECT LANDING ANGLE: flat face vs edge/corner ===
            // Normalize rotZ to [0, π/2) — cube has 4-fold symmetry
            const normRot = ((c.rotZ % (Math.PI / 2)) + (Math.PI / 2)) % (Math.PI / 2);
            const distFromFlat = Math.min(normRot, Math.PI / 2 - normRot) / (Math.PI / 4);
            // 0.0 = perfectly flat (face down), 1.0 = perfectly edge down

            const incomingVy = c.vy;
            const impactStrength = Math.min(1.5, incomingVy / 600);

            if (distFromFlat < 0.2) {
              // === FLAT LANDING === : cube stays down, minimal bounce
              const bounce = c.isBall ? 0.65 : BOUNCE_DAMP * 0.4;
              c.vy = -c.vy * bounce;
              c.vx *= 0.98; // barely reduce vx — preserve slide
              // Very small angular disturbance (real cube: no big tumble)
              c.rotVZ *= 0.5; // damp rolling rotation
              c.rotVX *= 0.5;
              c.rotVY *= 0.5;
              if (Math.abs(c.vy) < 60) {
                c.vy = 0;
                c.onGround = true;
              }
            } else {
              // === EDGE / CORNER LANDING === : tumble!
              const bounce = c.isBall ? 0.65 : BOUNCE_DAMP;
              c.vy = -c.vy * bounce;
              c.vx *= 0.95;
              // Tumble rotation: direction depends on which way cube is leaning
              // The cube tips TOWARDS the leaning direction (torque from weight)
              const leanSign = Math.sin(c.rotZ * 2); // positive if leaning one way
              const tumbleStrength = impactStrength * distFromFlat * 12;
              c.rotVZ += leanSign * tumbleStrength;
              // Horizontal velocity also gets a kick from the edge deflection
              c.vx += leanSign * impactStrength * 80;
              // Small X/Y wobble
              c.rotVX += (Math.random() - 0.5) * 2 * distFromFlat;
              c.rotVY += (Math.random() - 0.5) * 1.5 * distFromFlat;
              // Settle logic same as before
              if (Math.abs(c.vy) < 50) {
                c.vy = 0;
                c.onGround = true;
              }
            }

            // Haptic feedback proportional to impact and edge-ness
            if (impactStrength > 0.3) {
              try {
                const style = (impactStrength > 0.7 || distFromFlat > 0.5)
                  ? Haptics.ImpactFeedbackStyle.Heavy
                  : Haptics.ImpactFeedbackStyle.Medium;
                Haptics.impactAsync(style);
              } catch {}
            }
          }
          // Mark touched
          if (!s.touched) {
            s.touched = true;
            try { Haptics.selectionAsync(); } catch {}
            if (s.isPower && phase === "flight") {
              triggerRandomPower(s);
            }
          }
          c.onStair = s.i;
        } else {
          // === HIT A SIDE WALL ===
          if (penLeft < penRight && c.vx > 0) {
            // Cube moving right, hit LEFT wall
            c.x = stairLeft - halfS;
            const incomingVx = c.vx;
            c.vx = -c.vx * BOUNCE_WALL;
            c.vy *= 0.92;
            const wallStrength = Math.min(1.5, Math.abs(incomingVx) / 500);
            c.rotVY += Math.sign(incomingVx) * wallStrength * 3;
            c.rotVZ -= Math.sign(incomingVx) * wallStrength * 2;
            try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
          } else if (penRight < penLeft && c.vx < 0) {
            // Cube moving LEFT, hit RIGHT wall
            c.x = stairRight + halfS;
            const incomingVx = c.vx;
            c.vx = -c.vx * BOUNCE_WALL;
            c.vy *= 0.92;
            const wallStrength = Math.min(1.5, Math.abs(incomingVx) / 500);
            c.rotVY -= wallStrength * 3;
            c.rotVZ += wallStrength * 2;
            try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
          }
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
      const dirX = Math.sin(angle);
      const dirY = -Math.cos(angle);
      cube.vx = dirX * speed;
      cube.vy = dirY * speed;
      // Initial 3D tumble — true random axis rotation for realistic flight spin
      cube.rotVX = (Math.random() - 0.3) * 8 + power.value * 4;
      cube.rotVY = (Math.random() - 0.5) * 6;
      cube.rotVZ = (Math.random() - 0.5) * 5 + (cube.vx / cube.size) * 0.3;
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

  // Determine which stairs are visible — recomputes when cube crosses stair boundaries
  const visibleStairs = useMemo(() => {
    const out: Stair[] = [];
    if (!stairsRef.current.length) return out;
    // Wider buffer to handle fast cube movement and avoid pop-in
    const centerI = lastViewportBucketRef.current;
    const visible = Math.ceil(WIN_W / STAIR_W) + 12;
    const startI = Math.max(0, centerI - 6);
    const endI = Math.min(TOTAL_STAIRS - 1, startI + visible);
    for (let i = startI; i <= endI; i++) out.push(stairsRef.current[i]);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hud.score, phase, viewportBucket]);

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

      {/* World container (translated by camera, scaled by speed) */}
      <Animated.View
        style={[StyleSheet.absoluteFill, { transform: [{ scale: worldScale }] }]}
        pointerEvents="none"
      >
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

        {/* Cube (the star) — true 3D via SVG */}
        {phase !== "menu" && (
          <Animated.View
            style={{
              position: "absolute",
              width: CUBE_RENDER_SIZE,
              height: CUBE_RENDER_SIZE,
              marginLeft: -CUBE_RENDER_SIZE / 2 + CUBE_SIZE_BASE / 2,
              marginTop: -CUBE_RENDER_SIZE / 2 + CUBE_SIZE_BASE / 2,
              transform: [
                { translateX: cubeTX },
                { translateY: cubeTY },
              ],
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <SvgCube3D
              size={CUBE_SIZE_BASE}
              renderSize={CUBE_RENDER_SIZE}
              cubeRef={{ current: cube as any }}
              hasPower={!!hud.activePower}
              powerColor={hud.activePower ? POWER_LABELS[hud.activePower.type].color : ""}
            />
          </Animated.View>
        )}

        {/* Aim arrow - elegant SVG design with glow */}
        {phase === "aim" && (
          <Animated.View
            style={{
              position: "absolute",
              left: cube.x - 50,
              top: cube.y - 200,
              width: 100,
              height: 160,
              alignItems: "center",
              justifyContent: "flex-end",
              transform: [
                { translateY: 80 },
                { rotate: arrowAngle.interpolate({ inputRange: [-1.5, 1.5], outputRange: ["-86deg", "86deg"] }) },
                { translateY: -80 },
              ],
            }}
          >
            <ArrowIndicator />
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
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={styles.menuOverlay}
          >
            <Text style={styles.menuTitle}>🎲 مكعب الدرج</Text>
            <Text style={styles.menuSub}>ارمِ المكعب ولامس أكبر عدد من الدرجات</Text>

            {/* Name input */}
            <View style={styles.nameBox}>
              <Text style={styles.nameLabel}>اسم اللاعب</Text>
              <TextInput
                style={styles.nameInput}
                value={playerName}
                onChangeText={(t) => setPlayerName(t.slice(0, 16))}
                placeholder="أدخل اسمك"
                placeholderTextColor="rgba(255,255,255,0.4)"
                maxLength={16}
                textAlign="center"
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
              />
            </View>

            <Pressable
              style={[styles.startBtn, !playerName.trim() && { opacity: 0.45 }]}
              disabled={!playerName.trim()}
              onPress={() => {
                Keyboard.dismiss();
                onTap();
              }}
            >
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
          </KeyboardAvoidingView>
        </TouchableWithoutFeedback>
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

// ===== Stair component (clean 2D design) =====
function Stair3D({ stair }: { stair: Stair }) {
  if (stair.broken) {
    return (
      <View
        style={{
          position: "absolute",
          left: stair.x,
          top: stair.y,
          width: STAIR_W,
          height: STAIR_FRONT_H,
          opacity: 0.15,
          borderColor: "#7F1D1D",
          borderWidth: 1,
          backgroundColor: "rgba(127,29,29,0.3)",
          borderRadius: 4,
        }}
      />
    );
  }
  // Color palette per stair type
  let topColor: string, frontColor: string, sideColor: string, edgeColor: string, highlightColor: string;
  if (stair.isPower) {
    topColor = "#FCD34D"; frontColor = "#D97706"; sideColor = "#92400E"; edgeColor = "#451A03"; highlightColor = "#FEF3C7";
  } else if (stair.touched) {
    topColor = "#34D399"; frontColor = "#059669"; sideColor = "#065F46"; edgeColor = "#022C22"; highlightColor = "#A7F3D0";
  } else {
    topColor = "#A5B4FC"; frontColor = "#6366F1"; sideColor = "#3730A3"; edgeColor = "#1E1B4B"; highlightColor = "#E0E7FF";
  }
  return (
    <>
      {/* FRONT face (vertical rise) */}
      <LinearGradient
        colors={[frontColor, sideColor]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={{
          position: "absolute",
          left: stair.x,
          top: stair.y,
          width: STAIR_W,
          height: STAIR_FRONT_H,
          borderWidth: 2,
          borderColor: edgeColor,
          borderRadius: 3,
        }}
      />
      {/* TOP edge highlight strip (creates flat 2D step look) */}
      <View
        style={{
          position: "absolute",
          left: stair.x,
          top: stair.y,
          width: STAIR_W,
          height: 4,
          backgroundColor: topColor,
          borderTopLeftRadius: 3,
          borderTopRightRadius: 3,
        }}
      />
      {/* Subtle inner highlight line */}
      <View
        style={{
          position: "absolute",
          left: stair.x + 3,
          top: stair.y + 4,
          width: STAIR_W - 6,
          height: 1,
          backgroundColor: highlightColor,
          opacity: 0.6,
        }}
      />
      {/* Power ? marker */}
      {stair.isPower && !stair.touched && (
        <Text
          style={{
            position: "absolute",
            left: stair.x,
            top: stair.y - 32,
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
            top: stair.y + STAIR_FRONT_H / 2 - 6,
            width: STAIR_W,
            textAlign: "center",
            color: "#fff",
            fontSize: 11,
            fontWeight: "700",
            opacity: 0.55,
          }}
        >
          {stair.i}
        </Text>
      )}
      {/* FINISH LINE marker at the goal stair */}
      {stair.i === FINISH_LINE_INDEX && (
        <>
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
                  style={{ width: 7, height: 12, backgroundColor: black ? "#000" : "#fff" }}
                />
              );
            })}
          </View>
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

// ===== TRUE 3D Cube via SVG vertex projection =====
// Renders a real 3D cube (6 faces) with rotation around all 3 axes,
// perspective projection, and z-sorted face drawing for proper 3D look.

const CUBE_VERTS: [number, number, number][] = [
  [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], // back face (z=-1)
  [-1, -1,  1], [1, -1,  1], [1, 1,  1], [-1, 1,  1], // front face (z=+1)
];
// Each face: [v0, v1, v2, v3] in CCW order when looking at front
const CUBE_FACES: { idx: number[]; name: string }[] = [
  { idx: [4, 5, 6, 7], name: "front" },
  { idx: [1, 0, 3, 2], name: "back" },
  { idx: [0, 4, 7, 3], name: "left" },
  { idx: [5, 1, 2, 6], name: "right" },
  { idx: [4, 5, 1, 0], name: "bottom" },
  { idx: [3, 2, 6, 7], name: "top" },
];

function rotateXYZ(p: [number, number, number], rx: number, ry: number, rz: number): [number, number, number] {
  let [x, y, z] = p;
  // Z rotation
  let c = Math.cos(rz), s = Math.sin(rz);
  let nx = x * c - y * s; let ny = x * s + y * c;
  x = nx; y = ny;
  // Y rotation
  c = Math.cos(ry); s = Math.sin(ry);
  nx = x * c + z * s; let nz = -x * s + z * c;
  x = nx; z = nz;
  // X rotation
  c = Math.cos(rx); s = Math.sin(rx);
  ny = y * c - z * s; nz = y * s + z * c;
  y = ny; z = nz;
  return [x, y, z];
}

function SvgCube3D({
  size,
  renderSize,
  cubeRef,
  hasPower,
  powerColor,
}: {
  size: number;
  renderSize: number;
  cubeRef: React.MutableRefObject<{ rotX: number; rotY: number; rotZ: number; size: number; isBall: boolean }>;
  hasPower: boolean;
  powerColor: string;
}) {
  // Self-managed re-render at 60fps reading from cubeRef
  const [, tick] = React.useReducer((v: number) => v + 1, 0);
  React.useEffect(() => {
    let raf = 0;
    const loop = () => {
      tick();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const halfSize = size / 2;
  const persp = 8.0;
  const rx = cubeRef.current.rotX;
  const ry = cubeRef.current.rotY;
  const rz = cubeRef.current.rotZ;
  const dynamicSize = cubeRef.current.size;
  const scale = dynamicSize / size;
  const isBall = cubeRef.current.isBall;

  // FIXED viewing angle (isometric camera) — applied AFTER cube's own orientation.
  // This means the cube's physics orientation (rotX/Y/Z) represents the actual
  // cube rotation in the world, while the view angle is a constant camera tilt.
  const VIEW_X = 0.5;
  const VIEW_Y = -0.55;

  // Project all 8 vertices: first rotate by cube orientation, THEN by view angle
  const projected: [number, number, number][] = CUBE_VERTS.map((v) => {
    let [x, y, z] = rotateXYZ(v, rx, ry, rz);
    // Apply fixed viewing angle
    const r2 = rotateXYZ([x, y, z], VIEW_X, VIEW_Y, 0);
    x = r2[0]; y = r2[1]; z = r2[2];
    const f = persp / (persp - z);
    return [x * halfSize * f * scale, y * halfSize * f * scale, z];
  });

  // Compute bounding box & shift so the cube's visual center matches its math center.
  // Specifically, ensure the visual bottom (max y) aligns with halfSize so the cube
  // visually sits on its math bottom (stair top).
  let maxY = -Infinity;
  let minY = Infinity;
  for (const p of projected) {
    if (p[1] > maxY) maxY = p[1];
    if (p[1] < minY) minY = p[1];
  }
  // Shift so visual bottom (maxY) equals math bottom (halfSize * scale)
  const yOffset = halfSize * scale - maxY;
  // Apply offset
  for (const p of projected) {
    p[1] += yOffset;
  }

  // Compute face data with avg Z for sorting
  const facesData = CUBE_FACES.map((face) => {
    const pts = face.idx.map((i) => projected[i]);
    const avgZ = pts.reduce((s, p) => s + p[2], 0) / pts.length;
    // Compute face normal Z (in screen space) for shading
    const [a, b, c] = pts;
    const ux = b[0] - a[0], uy = b[1] - a[1];
    const vx = c[0] - a[0], vy = c[1] - a[1];
    const normalZ = ux * vy - uy * vx; // 2D cross product
    return { face, pts, avgZ, normalZ };
  });

  // Sort back-to-front: smallest avgZ (farthest = z=-1 area) drawn FIRST
  facesData.sort((a, b) => a.avgZ - b.avgZ);

  // Draw ALL 6 faces (no back-face culling) so cube is never "open"
  const facesToRender = facesData;

  // Determine main color
  const mainColor = hasPower && powerColor ? powerColor : "#EC4899"; // pink
  const lightShade = hasPower ? lighten(powerColor) : "#FBCFE8";
  const darkShade = hasPower ? darken(powerColor, 0.4) : "#9D174D";
  const veryDark = hasPower ? darken(powerColor, 0.6) : "#500724";

  // Per-face base shading
  const faceColor = (name: string) => {
    switch (name) {
      case "top": return lightShade;
      case "bottom": return veryDark;
      case "front": return mainColor;
      case "back": return darkShade;
      case "left": return darkShade;
      case "right": return lightShade;
      default: return mainColor;
    }
  };

  // Render via SVG. Box is centered in a renderSize area; math center = (0,0).
  // The math bottom (halfSize) should align with the View's center (which is now CUBE_SIZE_BASE/2 above the renderSize bottom)
  if (isBall) {
    // === BALL MODE: render as sphere ===
    const ballR = halfSize * scale * 1.05;
    const mainColor = hasPower && powerColor ? powerColor : "#EC4899";
    const lightShade = lighten(mainColor);
    const darkShade = darken(mainColor, 0.45);
    // Apply yOffset to keep ball sitting on stair (consistent with cube rendering)
    return (
      <Svg width={renderSize} height={renderSize} viewBox={`${-renderSize / 2} ${-renderSize / 2} ${renderSize} ${renderSize}`}>
        <Defs>
          <SvgLG id={`ballGrad-${Math.round(ballR)}`} x1="0.3" y1="0.2" x2="0.7" y2="0.9">
            <Stop offset="0" stopColor={lightShade} stopOpacity="1" />
            <Stop offset="0.55" stopColor={mainColor} stopOpacity="1" />
            <Stop offset="1" stopColor={darkShade} stopOpacity="1" />
          </SvgLG>
        </Defs>
        {/* Ball body */}
        <Polygon
          points={Array.from({ length: 32 }).map((_, i) => {
            const theta = (i / 32) * Math.PI * 2;
            const x = Math.cos(theta) * ballR;
            const yVal = Math.sin(theta) * ballR + (halfSize * scale - ballR);
            return `${x.toFixed(2)},${yVal.toFixed(2)}`;
          }).join(" ")}
          fill={`url(#ballGrad-${Math.round(ballR)})`}
          stroke={darken(mainColor, 0.7)}
          strokeWidth={1.5}
        />
        {/* Highlight spot */}
        <Polygon
          points={Array.from({ length: 16 }).map((_, i) => {
            const theta = (i / 16) * Math.PI * 2;
            const hx = -ballR * 0.3 + Math.cos(theta) * ballR * 0.25;
            const hy = -ballR * 0.35 + Math.sin(theta) * ballR * 0.18 + (halfSize * scale - ballR);
            return `${hx.toFixed(2)},${hy.toFixed(2)}`;
          }).join(" ")}
          fill="#FFFFFF"
          fillOpacity={0.45}
        />
      </Svg>
    );
  }
  return (
    <Svg width={renderSize} height={renderSize} viewBox={`${-renderSize / 2} ${-renderSize / 2} ${renderSize} ${renderSize}`}>
      {facesToRender.map((f, i) => {
        const points = f.pts.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(" ");
        const lightFactor = Math.max(0.55, Math.min(1, 0.55 + (f.normalZ / (size * size)) * 0.6));
        const fill = applyShade(faceColor(f.face.name), lightFactor);
        return (
          <Polygon
            key={`${f.face.name}-${i}`}
            points={points}
            fill={fill}
            stroke={veryDark}
            strokeWidth={1.2}
            strokeLinejoin="round"
          />
        );
      })}
    </Svg>
  );
}

function applyShade(hex: string, factor: number): string {
  // Multiply each channel by factor; supports #RRGGBB or rgb(r,g,b)
  let r = 0, g = 0, b = 0;
  if (hex.startsWith("#")) {
    const n = parseInt(hex.slice(1), 16);
    r = (n >> 16) & 0xff; g = (n >> 8) & 0xff; b = n & 0xff;
  } else if (hex.startsWith("rgb")) {
    const m = hex.match(/(\d+),\s*(\d+),\s*(\d+)/);
    if (m) { r = parseInt(m[1]); g = parseInt(m[2]); b = parseInt(m[3]); }
  } else {
    return hex;
  }
  r = Math.max(0, Math.min(255, Math.floor(r * factor)));
  g = Math.max(0, Math.min(255, Math.floor(g * factor)));
  b = Math.max(0, Math.min(255, Math.floor(b * factor)));
  return `rgb(${r},${g},${b})`;
}

// ===== Aim Arrow Indicator (sleek SVG design with glow) =====
function ArrowIndicator() {
  // Pulsing glow animation
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        Animated.timing(pulse, { toValue: 0, duration: 600, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
      ])
    ).start();
  }, [pulse]);
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.1] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] });

  return (
    <Animated.View style={{ alignItems: "center", justifyContent: "flex-end", transform: [{ scale }], opacity }}>
      <Svg width={70} height={140} viewBox="0 0 70 140">
        <Defs>
          <SvgLG id="arrowGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FEF3C7" stopOpacity="1" />
            <Stop offset="0.4" stopColor="#FBBF24" stopOpacity="1" />
            <Stop offset="1" stopColor="#D97706" stopOpacity="1" />
          </SvgLG>
          <SvgLG id="arrowGlow" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FBBF24" stopOpacity="0" />
            <Stop offset="1" stopColor="#FBBF24" stopOpacity="0.5" />
          </SvgLG>
        </Defs>
        {/* Trailing trail (3 fading rectangles) */}
        <Polygon points="32,128 38,128 38,118 32,118" fill="#FBBF24" fillOpacity="0.25" />
        <Polygon points="31,114 39,114 39,102 31,102" fill="#FBBF24" fillOpacity="0.4" />
        <Polygon points="30,98 40,98 40,84 30,84" fill="#FBBF24" fillOpacity="0.6" />
        {/* Main arrow body (rectangle stem + triangle head) */}
        <Polygon
          points="28,80 42,80 42,30 55,30 35,2 15,30 28,30"
          fill="url(#arrowGrad)"
          stroke="#92400E"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        {/* Inner highlight on the head */}
        <Polygon
          points="35,10 45,28 25,28"
          fill="#FEF3C7"
          fillOpacity="0.6"
        />
      </Svg>
    </Animated.View>
  );
}

// ===== Legacy isometric Cube (unused fallback, kept for reference) =====
function Cube3DLegacy({ size, hasPower, powerColor }: { size: number; hasPower: boolean; powerColor: string }) {
  const main = hasPower ? powerColor : "#F472B6";
  const top = hasPower ? lighten(powerColor) : "#FBCFE8";
  const right = hasPower ? darken(powerColor) : "#9D174D";
  const edge = hasPower ? darken(powerColor, 0.5) : "#500724";
  const dotColor = "#FFFFFF";
  const dx = size * 0.22;
  const dy = size * 0.22;
  return (
    <View style={{ width: size + dx, height: size + dy }}>
      <View
        style={{
          position: "absolute", left: dx, top: 0, width: size, height: dy,
          backgroundColor: top,
          transform: [{ skewX: "-45deg" }, { translateX: -dy / 2 }],
          borderTopWidth: 1.5, borderTopColor: edge,
          borderLeftWidth: 1.5, borderLeftColor: edge,
        }}
      />
      <View
        style={{
          position: "absolute", left: size, top: dy, width: dx, height: size,
          backgroundColor: right,
          transform: [{ skewY: "-45deg" }, { translateY: -dx / 2 }],
          borderTopWidth: 1.5, borderTopColor: edge,
          borderRightWidth: 1.5, borderRightColor: edge,
        }}
      />
      <View
        style={{
          position: "absolute", left: 0, top: dy, width: size, height: size,
          backgroundColor: main,
          borderWidth: 1.5, borderColor: edge,
          alignItems: "center", justifyContent: "center",
          borderRadius: 2,
        }}
      >
        <View
          style={{
            width: size * 0.28, height: size * 0.28,
            backgroundColor: dotColor, borderRadius: 100,
            borderWidth: 2, borderColor: edge,
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
  bigArrowHead: {
    width: 38,
    height: 56,
    // create a tall pointing-up arrow shape via clipPath-like trick:
    // a tall trapezoid with rounded top creates a clean arrow look
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 6,
    boxShadow: "0px 0px 18px rgba(251,191,36,0.85)",
    borderWidth: 2,
    borderColor: "#FEF3C7",
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
  nameBox: {
    marginTop: 16,
    marginBottom: 8,
    alignItems: "center",
    width: "100%",
    maxWidth: 280,
  },
  nameLabel: {
    color: "rgba(255,255,255,0.75)",
    fontWeight: "700",
    fontSize: 13,
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  nameInput: {
    width: "100%",
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 2,
    borderColor: "rgba(251,191,36,0.5)",
    borderRadius: 12,
    color: "#fff",
    fontSize: 17,
    fontWeight: "800",
  },
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
