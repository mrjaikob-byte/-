import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Pressable,
  Platform,
  StatusBar,
  Animated,
  Easing,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ScreenOrientation from "expo-screen-orientation";
import Svg, { Defs, LinearGradient, Stop, Rect, Circle, Path, G } from "react-native-svg";
import {
  GroundTile,
  BrickTile,
  QuestionTile,
  PipeTile,
  Coin as CoinSprite,
  FoxEnemy,
  CrowEnemy,
  Stone as StoneSprite,
  Flag,
} from "../../src/baghdad/Sprites";
import { BaghdadiBoy } from "../../src/baghdad/BaghdadiBoy";
import {
  LEVELS,
  TILE_PX as TILE_DEFAULT,
  GRAVITY,
  PLAYER_W,
  PLAYER_H,
  RUN_ACCEL,
  RUN_MAX,
  JUMP_VEL,
  FRICTION,
  T_EMPTY,
  T_GROUND,
  T_BRICK,
  T_QUESTION,
  T_PIPE_L,
  T_PIPE_R,
  T_USED,
  isSolid,
} from "../../src/baghdad/level";

// === Game tuning (overrides) ===
const TILE_PX = 56; // bigger tiles for more visual presence
const COYOTE_TIME = 0.12; // grace period after walking off ledge
const JUMP_BUFFER = 0.12; // lenient jump if pressed slightly before landing

// === Layout ===
const { width: WIN_W, height: WIN_H } = Dimensions.get("window");
// Landscape view: width > height. We'll force a fixed aspect and rotate if needed.
const VIEW_W = Math.max(WIN_W, WIN_H);
const VIEW_H = Math.min(WIN_W, WIN_H);

type EntityRef = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  alive: boolean;
  dir: 1 | -1;
};

type Stone = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  alive: boolean;
  // animated values for native-driven rendering
  tx: Animated.Value;
  ty: Animated.Value;
  opacity: Animated.Value;
};

export default function BaghdadHero() {
  const router = useRouter();

  // ===== Force landscape orientation =====
  useEffect(() => {
    let isActive = true;
    (async () => {
      try {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
      } catch {}
    })();
    return () => {
      if (!isActive) return;
      isActive = false;
      ScreenOrientation.unlockAsync().catch(() => {});
    };
  }, []);

  // ===== Game state (refs - no re-renders) =====
  const level = useRef(deepCloneLevel(LEVELS[0])).current;
  const player = useRef({
    x: level.spawn.x,
    y: level.spawn.y,
    vx: 0,
    vy: 0,
    grounded: false,
    facing: 1 as 1 | -1,
    walkPhase: 0,
    coyoteTimer: 0,
    jumpBuffer: 0,
    invuln: 0,
    hasSlingshot: false,
    isShootTimer: 0,
  }).current;
  const camRef = useRef({ x: 0 });
  const stonesRef = useRef<Stone[]>([]);
  const stoneIdRef = useRef(0);
  const inputRef = useRef({ left: false, right: false, jumpHeld: false });
  const jumpReleasedRef = useRef(true);
  const lastBumpRef = useRef("");

  // ===== Animated values (native driver) =====
  const playerTX = useRef(new Animated.Value(0)).current;
  const playerTY = useRef(new Animated.Value(0)).current;
  const worldTX = useRef(new Animated.Value(0)).current;

  // Per-enemy animated translate (computed lazily)
  const enemyAnims = useRef(
    level.enemies.map(() => ({
      tx: new Animated.Value(0),
      ty: new Animated.Value(0),
      opacity: new Animated.Value(1),
    }))
  ).current;

  // Per-coin animated opacity (collected = fade out)
  const coinAnims = useRef(level.coins.map(() => new Animated.Value(1))).current;

  // ===== UI state (sparingly updated) =====
  const [hud, setHud] = useState({
    coins: 0,
    score: 0,
    lives: 3,
    timeLeft: 240,
    won: false,
    lost: false,
  });
  const [vis, setVis] = useState({
    hasSlingshot: false,
    facing: 1 as 1 | -1,
    state: "idle" as "idle" | "run" | "jump" | "fall" | "shoot",
    walkPhase: 0,
    invuln: false,
    floats: [] as Array<{ id: number; text: string; color: string; x: number; y: number; ttl: number }>,
    bumpedTiles: [] as Array<{ x: number; y: number; ttl: number; toUsed: boolean; broken: boolean }>,
  });
  const visRef = useRef(vis);
  visRef.current = vis;

  // ===== Animation phase clocks for tiles/coins (decoupled from physics) =====
  const [animPhase, setAnimPhase] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setAnimPhase((p) => (p + 1) % 60), 100);
    return () => clearInterval(id);
  }, []);

  // ===== Game loop =====
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let visUpdateAcc = 0;

    const tick = (now: number) => {
      const dt = Math.min(0.04, (now - last) / 1000);
      last = now;
      step(dt);

      // Push positions to native animated values (no React render)
      playerTX.setValue((player.x - camRef.current.x) * TILE_PX);
      playerTY.setValue((player.y - PLAYER_H) * TILE_PX);
      worldTX.setValue(-camRef.current.x * TILE_PX);

      level.enemies.forEach((e, i) => {
        const a = enemyAnims[i];
        a.tx.setValue(e.x * TILE_PX);
        a.ty.setValue((e.y - 0.5) * TILE_PX);
        if (!e.alive) a.opacity.setValue(0);
      });

      stonesRef.current.forEach((s) => {
        if (s.alive) {
          s.tx.setValue(s.x * TILE_PX);
          s.ty.setValue(s.y * TILE_PX);
        } else {
          s.opacity.setValue(0);
        }
      });

      // Update player visual state (only when changed) at lower freq (~10Hz)
      visUpdateAcc += dt;
      if (visUpdateAcc > 0.05) {
        visUpdateAcc = 0;
        updateVisualState();
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ===== Physics step =====
  const step = (dt: number) => {
    if (hud.won || hud.lost) return;
    const p = player;
    const inp = inputRef.current;

    // Horizontal accel
    if (inp.left) { p.vx -= RUN_ACCEL * dt; p.facing = -1; }
    if (inp.right) { p.vx += RUN_ACCEL * dt; p.facing = 1; }
    if (!inp.left && !inp.right) {
      const sg = Math.sign(p.vx);
      p.vx -= sg * FRICTION * dt;
      if (Math.sign(p.vx) !== sg) p.vx = 0;
    }
    p.vx = Math.max(-RUN_MAX, Math.min(RUN_MAX, p.vx));

    // Coyote time / jump buffer
    if (p.grounded) p.coyoteTimer = COYOTE_TIME;
    else p.coyoteTimer = Math.max(0, p.coyoteTimer - dt);
    p.jumpBuffer = Math.max(0, p.jumpBuffer - dt);

    if (p.jumpBuffer > 0 && p.coyoteTimer > 0) {
      p.vy = JUMP_VEL;
      p.grounded = false;
      p.coyoteTimer = 0;
      p.jumpBuffer = 0;
      try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    }

    // Variable jump height: cut velocity when jump released early
    if (!inp.jumpHeld && p.vy < -3) p.vy *= 0.85;

    // Gravity
    p.vy += GRAVITY * dt;
    if (p.vy > 28) p.vy = 28;

    // Movement w/ collision (sub-stepped for accuracy at high speeds)
    const steps = Math.max(1, Math.ceil((Math.abs(p.vx) + Math.abs(p.vy)) * dt / 0.3));
    const sdt = dt / steps;
    for (let i = 0; i < steps; i++) {
      moveX(p, p.vx * sdt, level);
      moveY(p, p.vy * sdt, level);
    }

    // Walk phase
    if (Math.abs(p.vx) > 0.5 && p.grounded) {
      p.walkPhase = (p.walkPhase + dt * Math.abs(p.vx) * 0.4) % 1;
    } else if (!p.grounded) {
      // freeze
    } else {
      // idle bob
      p.walkPhase = (p.walkPhase + dt * 0.5) % 1;
    }

    if (p.isShootTimer > 0) p.isShootTimer -= dt;
    if (p.invuln > 0) p.invuln -= dt;

    // Fall off world
    if (p.y > level.height + 4) respawnOrLose();

    // Camera follow with deadzone smoothing
    const desiredCam = p.x - VIEW_W / TILE_PX / 2 + 1;
    camRef.current.x += (desiredCam - camRef.current.x) * Math.min(1, dt * 6);
    camRef.current.x = Math.max(0, Math.min(level.width - VIEW_W / TILE_PX, camRef.current.x));

    // Stones
    for (const s of stonesRef.current) {
      if (!s.alive) continue;
      s.vy += GRAVITY * 0.5 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      const tx = Math.floor(s.x), ty = Math.floor(s.y);
      if (tx < 0 || tx >= level.width || ty < 0 || ty >= level.height || isSolid(level.tiles[ty][tx])) {
        s.alive = false;
      }
      for (const e of level.enemies) {
        if (!e.alive) continue;
        if (Math.abs(s.x - e.x) < 0.6 && Math.abs(s.y - e.y) < 0.6) {
          e.alive = false;
          s.alive = false;
          spawnFloat("+200", "#FBBF24", e.x, e.y);
          setHud((h) => ({ ...h, score: h.score + 200 }));
          try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
        }
      }
    }
    stonesRef.current = stonesRef.current.filter((s) => s.alive && Math.abs(s.x - p.x) < 30);

    // Enemies
    for (const e of level.enemies) {
      if (!e.alive) continue;
      if (e.type === "fox") {
        e.x += e.vx * dt;
        e.vy += GRAVITY * dt;
        e.y += e.vy * dt;
        const groundY = findGroundY(level, e.x, e.y);
        if (groundY !== null && e.y >= groundY) { e.y = groundY; e.vy = 0; }
        const ahead = Math.floor(e.x + e.dir * 0.6);
        const below = Math.floor(e.y + 0.3);
        if (ahead < 0 || ahead >= level.width ||
            isSolid(level.tiles[Math.floor(e.y)]?.[ahead] || 0) ||
            (below < level.height && !isSolid(level.tiles[below]?.[ahead] || 0))) {
          e.dir = (e.dir === 1 ? -1 : 1) as 1 | -1;
          e.vx = 1.8 * e.dir;
        }
      } else {
        e.x += e.vx * dt;
        if (e.x < 2) { e.dir = 1; e.vx = 1.2; }
        if (e.x > level.width - 2) { e.dir = -1; e.vx = -1.2; }
      }
      // collide with player
      if (p.invuln <= 0 && Math.abs(p.x - e.x) < 0.85 && Math.abs(p.y - e.y) < 1.0) {
        if (e.type === "fox" && p.vy > 1 && p.y < e.y - 0.2) {
          e.alive = false;
          p.vy = JUMP_VEL * 0.6;
          spawnFloat("+100", "#FBBF24", e.x, e.y);
          setHud((h) => ({ ...h, score: h.score + 100 }));
          try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
        } else {
          hitPlayer();
        }
      }
    }

    // Coins
    level.coins.forEach((c, i) => {
      if (c.collected) return;
      if (Math.abs(p.x - c.x) < 0.7 && Math.abs(p.y - c.y) < 0.9) {
        c.collected = true;
        Animated.timing(coinAnims[i], { toValue: 0, duration: 200, useNativeDriver: true }).start();
        spawnFloat("+50", "#FCD34D", c.x, c.y);
        setHud((h) => ({ ...h, coins: h.coins + 1, score: h.score + 50 }));
        try { Haptics.selectionAsync(); } catch {}
      }
    });

    // Block bump (head hits ?)
    if (p.vy < -1) {
      const headX = Math.floor(p.x);
      const headY = Math.floor(p.y - PLAYER_H + 0.05);
      const key = `${headX},${headY}`;
      if (key !== lastBumpRef.current && headY >= 0) {
        const t = level.tiles[headY]?.[headX];
        if (t === T_QUESTION) {
          level.tiles[headY][headX] = T_USED;
          lastBumpRef.current = key;
          const isSling = level.slingshotBlocks.some((s) => s.x === headX && s.y === headY);
          if (isSling && !p.hasSlingshot) {
            p.hasSlingshot = true;
            spawnFloat("🎯 المصيادة!", "#FBBF24", headX + 0.5, headY - 0.5);
            setHud((h) => ({ ...h, score: h.score + 1000 }));
            try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
          } else {
            spawnFloat("+50", "#FCD34D", headX + 0.5, headY - 0.5);
            setHud((h) => ({ ...h, score: h.score + 50, coins: h.coins + 1 }));
            try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
          }
        } else if (t === T_BRICK && p.hasSlingshot) {
          level.tiles[headY][headX] = T_EMPTY;
          lastBumpRef.current = key;
          try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
        }
      }
    } else {
      lastBumpRef.current = "";
    }

    // Win
    if (p.x >= level.flagX - 0.5 && !hud.won) {
      setHud((h) => ({ ...h, won: true, score: h.score + Math.max(0, h.timeLeft) * 10 }));
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    }
  };

  const updateVisualState = () => {
    const p = player;
    let st: typeof vis.state = "idle";
    if (p.isShootTimer > 0) st = "shoot";
    else if (!p.grounded && p.vy < 0) st = "jump";
    else if (!p.grounded) st = "fall";
    else if (Math.abs(p.vx) > 0.6) st = "run";

    setVis((v) => {
      // Decay floats
      const newFloats = v.floats
        .map((f) => ({ ...f, ttl: f.ttl - 0.05 }))
        .filter((f) => f.ttl > 0);
      const newBumps = v.bumpedTiles
        .map((b) => ({ ...b, ttl: b.ttl - 0.05 }))
        .filter((b) => b.ttl > 0);
      const same =
        v.state === st &&
        v.facing === p.facing &&
        v.hasSlingshot === p.hasSlingshot &&
        v.invuln === p.invuln > 0 &&
        Math.abs(v.walkPhase - p.walkPhase) < 0.05 &&
        v.floats.length === newFloats.length &&
        v.bumpedTiles.length === newBumps.length;
      if (same) return v;
      return {
        ...v,
        state: st,
        facing: p.facing,
        hasSlingshot: p.hasSlingshot,
        walkPhase: p.walkPhase,
        invuln: p.invuln > 0,
        floats: newFloats,
        bumpedTiles: newBumps,
      };
    });
  };

  const spawnFloat = (text: string, color: string, x: number, y: number) => {
    setVis((v) => ({
      ...v,
      floats: [...v.floats, { id: Math.random(), text, color, x, y, ttl: 1.0 }],
    }));
  };

  const respawnOrLose = () => {
    setHud((h) => {
      const next = h.lives - 1;
      if (next <= 0) {
        try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
        return { ...h, lives: 0, lost: true };
      }
      return { ...h, lives: next };
    });
    const p = player;
    p.x = level.spawn.x;
    p.y = level.spawn.y;
    p.vx = 0;
    p.vy = 0;
    p.invuln = 1.5;
    p.hasSlingshot = false;
  };

  const hitPlayer = () => {
    const p = player;
    if (p.invuln > 0) return;
    if (p.hasSlingshot) {
      p.hasSlingshot = false;
      p.invuln = 1.2;
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); } catch {}
    } else {
      respawnOrLose();
    }
  };

  // ===== Timer =====
  useEffect(() => {
    if (hud.won || hud.lost) return;
    const id = setInterval(() => {
      setHud((h) => {
        if (h.timeLeft <= 1) return { ...h, timeLeft: 0, lost: true };
        return { ...h, timeLeft: h.timeLeft - 1 };
      });
    }, 1000);
    return () => clearInterval(id);
  }, [hud.won, hud.lost]);

  // ===== Input handlers =====
  const setLeft = (v: boolean) => { inputRef.current.left = v; };
  const setRight = (v: boolean) => { inputRef.current.right = v; };
  const onJumpDown = () => {
    inputRef.current.jumpHeld = true;
    if (jumpReleasedRef.current) {
      player.jumpBuffer = JUMP_BUFFER;
      jumpReleasedRef.current = false;
    }
  };
  const onJumpUp = () => {
    inputRef.current.jumpHeld = false;
    jumpReleasedRef.current = true;
  };

  const lastShotRef = useRef(0);
  const shoot = () => {
    const p = player;
    if (!p.hasSlingshot) {
      spawnFloat("تحتاج مصيادة!", "#F87171", p.x, p.y - 1);
      return;
    }
    const now = performance.now();
    if (now - lastShotRef.current < 280) return;
    lastShotRef.current = now;
    p.isShootTimer = 0.25;
    const newId = stoneIdRef.current++;
    stonesRef.current.push({
      id: newId,
      x: p.x + p.facing * 0.6,
      y: p.y - 0.5,
      vx: p.facing * 14,
      vy: -2.5,
      alive: true,
      tx: new Animated.Value(0),
      ty: new Animated.Value(0),
      opacity: new Animated.Value(1),
    });
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
  };

  const restart = () => router.replace("/games/baghdad-hero");

  // ===== Render: world is one big absolute container, translated by camera =====
  // Compute visible tile range for current cam (memoized snapshot)
  const cam = camRef.current.x;
  const x0 = Math.max(0, Math.floor(cam) - 1);
  const x1 = Math.min(level.width, Math.ceil(cam + VIEW_W / TILE_PX) + 2);

  const visibleTiles = useMemo(() => {
    const arr: { x: number; y: number; t: number }[] = [];
    for (let y = 0; y < level.height; y++) {
      for (let x = x0; x < x1; x++) {
        const t = level.tiles[y][x];
        if (t !== T_EMPTY) arr.push({ x, y, t });
      }
    }
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [x0, x1, animPhase]);

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false, animation: "fade", orientation: "landscape" }} />
      <StatusBar hidden />

      {/* Sky backdrop (parallax via static SVG, doesn't move) */}
      <Svg width={VIEW_W} height={VIEW_H} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FBBF24" />
            <Stop offset="0.35" stopColor="#FB923C" />
            <Stop offset="0.65" stopColor="#F472B6" />
            <Stop offset="1" stopColor="#7C3AED" />
          </LinearGradient>
          <LinearGradient id="sun" x1="0.5" y1="0" x2="0.5" y2="1">
            <Stop offset="0" stopColor="#FEF9C3" />
            <Stop offset="1" stopColor="#FDE68A" />
          </LinearGradient>
          <LinearGradient id="dunes" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FB923C" stopOpacity="0.6" />
            <Stop offset="1" stopColor="#FB923C" stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill="url(#sky)" />
        {/* Sun */}
        <Circle cx={VIEW_W * 0.78} cy={VIEW_H * 0.22} r={42} fill="url(#sun)" opacity="0.95" />
        <Circle cx={VIEW_W * 0.78} cy={VIEW_H * 0.22} r={70} fill="#FEF9C3" opacity="0.15" />
        {/* Distant dunes */}
        <Path d={`M 0 ${VIEW_H * 0.55} Q ${VIEW_W * 0.2} ${VIEW_H * 0.45} ${VIEW_W * 0.4} ${VIEW_H * 0.55} T ${VIEW_W * 0.8} ${VIEW_H * 0.5} T ${VIEW_W * 1.1} ${VIEW_H * 0.55} L ${VIEW_W} ${VIEW_H} L 0 ${VIEW_H} Z`} fill="url(#dunes)" />
      </Svg>

      {/* Parallax middle layer (slower scroll) */}
      <Animated.View
        style={[StyleSheet.absoluteFill, { transform: [{ translateX: Animated.multiply(worldTX, 0.3) }] }]}
        pointerEvents="none"
      >
        <Svg width={VIEW_W * 3} height={VIEW_H} style={{ position: "absolute", left: 0, top: 0 }}>
          {[0, 1, 2, 3, 4, 5].map((i) => {
            const x = i * VIEW_W * 0.5;
            const h = 90 + (i % 3) * 25;
            return (
              <G key={i}>
                <Rect x={x + 30} y={VIEW_H * 0.55 - h} width={26} height={h} fill="#92400E" opacity="0.4" />
                <Circle cx={x + 43} cy={VIEW_H * 0.55 - h} r={15} fill="#92400E" opacity="0.4" />
                <Path d={`M ${x + 43} ${VIEW_H * 0.55 - h - 18} L ${x + 49} ${VIEW_H * 0.55 - h - 6} L ${x + 37} ${VIEW_H * 0.55 - h - 6} Z`} fill="#FCD34D" opacity="0.6" />
              </G>
            );
          })}
        </Svg>
      </Animated.View>

      {/* Parallax foreground palms (faster scroll) */}
      <Animated.View
        style={[StyleSheet.absoluteFill, { transform: [{ translateX: Animated.multiply(worldTX, 0.6) }] }]}
        pointerEvents="none"
      >
        <Svg width={VIEW_W * 4} height={VIEW_H} style={{ position: "absolute", left: 0, top: 0 }}>
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
            const x = i * VIEW_W * 0.4 + (i % 2 === 0 ? 80 : 200);
            const baseY = VIEW_H * 0.78;
            return (
              <G key={i} opacity="0.65">
                <Rect x={x + 16} y={baseY - 80} width={8} height={100} fill="#5B3A22" />
                {[-30, -18, -6, 6, 18, 30].map((dx, j) => (
                  <Path key={j} d={`M ${x + 20} ${baseY - 80} Q ${x + 20 + dx} ${baseY - 90 - Math.abs(dx) * 0.3} ${x + 20 + dx * 1.6} ${baseY - 70 - Math.abs(dx) * 0.4}`} stroke="#15803D" strokeWidth="4" fill="none" strokeLinecap="round" />
                ))}
                <Circle cx={x + 20} cy={baseY - 84} r={5} fill="#92400E" />
              </G>
            );
          })}
        </Svg>
      </Animated.View>

      {/* === World container (translated by camera, native driver) === */}
      <Animated.View
        style={[StyleSheet.absoluteFill, { transform: [{ translateX: worldTX }] }]}
        pointerEvents="none"
      >
        {/* Tiles */}
        {visibleTiles.map(({ x, y, t }) => (
          <View
            key={`t${x}-${y}`}
            style={{
              position: "absolute",
              left: x * TILE_PX,
              top: y * TILE_PX,
              width: TILE_PX,
              height: TILE_PX,
            }}
          >
            {t === T_GROUND && <GroundTile size={TILE_PX} />}
            {t === T_BRICK && <BrickTile size={TILE_PX} />}
            {t === T_QUESTION && <QuestionTile size={TILE_PX} pulse={animPhase / 60} />}
            {t === T_USED && <QuestionTile size={TILE_PX} used />}
            {t === T_PIPE_L && <PipeTile size={TILE_PX} side="L" />}
            {t === T_PIPE_R && <PipeTile size={TILE_PX} side="R" />}
          </View>
        ))}

        {/* Coins */}
        {level.coins.map((c, i) => (
          <Animated.View
            key={c.id}
            style={{
              position: "absolute",
              left: c.x * TILE_PX - TILE_PX * 0.4,
              top: c.y * TILE_PX - TILE_PX * 0.4,
              width: TILE_PX * 0.8,
              height: TILE_PX * 0.8,
              opacity: coinAnims[i],
            }}
          >
            <CoinSprite size={TILE_PX * 0.8} phase={(animPhase / 60 + c.x * 0.13) % 1} />
          </Animated.View>
        ))}

        {/* Enemies */}
        {level.enemies.map((e, i) => {
          const sz = e.type === "fox" ? TILE_PX * 1.4 : TILE_PX * 1.2;
          return (
            <Animated.View
              key={e.id}
              style={{
                position: "absolute",
                left: -sz / 2,
                top: -sz / 2,
                width: sz,
                height: sz,
                opacity: enemyAnims[i].opacity,
                transform: [
                  { translateX: enemyAnims[i].tx },
                  { translateY: enemyAnims[i].ty },
                ],
              }}
            >
              {e.type === "fox" ? (
                <FoxEnemy size={sz} dir={e.dir} walkPhase={(animPhase / 60 + i * 0.2) % 1} />
              ) : (
                <CrowEnemy size={sz} dir={e.dir} walkPhase={(animPhase / 60 + i * 0.2) % 1} />
              )}
            </Animated.View>
          );
        })}

        {/* Stones */}
        {stonesRef.current.map((s) => (
          <Animated.View
            key={s.id}
            style={{
              position: "absolute",
              left: -TILE_PX * 0.18,
              top: -TILE_PX * 0.18,
              width: TILE_PX * 0.36,
              height: TILE_PX * 0.36,
              opacity: s.opacity,
              transform: [{ translateX: s.tx }, { translateY: s.ty }],
            }}
          >
            <StoneSprite size={TILE_PX * 0.36} />
          </Animated.View>
        ))}

        {/* Flag */}
        <View
          style={{
            position: "absolute",
            left: level.flagX * TILE_PX,
            top: 2 * TILE_PX,
            width: TILE_PX,
            height: TILE_PX * 5,
          }}
        >
          <Flag height={TILE_PX * 5} phase={animPhase / 60} />
        </View>
      </Animated.View>

      {/* === Player (separate Animated.View, native driver) === */}
      <Animated.View
        style={{
          position: "absolute",
          left: -TILE_PX * 0.7,
          top: -TILE_PX * 0.1,
          width: TILE_PX * 1.4,
          height: TILE_PX * 1.7,
          opacity: vis.invuln ? (Math.floor(animPhase / 6) % 2 === 0 ? 0.4 : 1) : 1,
          transform: [{ translateX: playerTX }, { translateY: playerTY }],
        }}
      >
        <BaghdadiBoy
          size={TILE_PX * 1.4}
          facing={vis.facing}
          hasSlingshot={vis.hasSlingshot}
          walkPhase={vis.walkPhase}
          state={vis.state}
        />
      </Animated.View>

      {/* === Floating texts (camera-relative, render with React) === */}
      {vis.floats.map((f) => (
        <Text
          key={f.id}
          style={{
            position: "absolute",
            left: (f.x - cam) * TILE_PX - 60,
            top: f.y * TILE_PX - (1 - f.ttl) * 50 - 40,
            width: 120,
            textAlign: "center",
            color: f.color,
            fontWeight: "900",
            fontSize: 18,
            opacity: f.ttl,
            textShadow: "0px 1px 4px rgba(0,0,0,0.7)",
          }}
        >
          {f.text}
        </Text>
      ))}

      {/* === HUD === */}
      <View style={[styles.hud, { pointerEvents: "box-none" }]}>
        <Pressable style={styles.hudBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-forward" size={20} color="#fff" />
        </Pressable>
        <View style={styles.hudCenter}>
          <View style={styles.hudPill}>
            <Ionicons name="heart" size={14} color="#F87171" />
            <Text style={styles.hudText}>{hud.lives}</Text>
          </View>
          <View style={styles.hudPill}>
            <Text style={{ fontSize: 13 }}>🌴</Text>
            <Text style={styles.hudText}>{hud.coins}</Text>
          </View>
          <View style={styles.hudPill}>
            <Ionicons name="trophy" size={12} color="#FBBF24" />
            <Text style={styles.hudText}>{hud.score.toString().padStart(6, "0")}</Text>
          </View>
          <View style={[styles.hudPill, { backgroundColor: hud.timeLeft < 30 ? "rgba(239,68,68,0.4)" : "rgba(0,0,0,0.4)" }]}>
            <Ionicons name="time" size={12} color="#fff" />
            <Text style={styles.hudText}>{hud.timeLeft}</Text>
          </View>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {/* === Controls === */}
      <View style={[styles.controlsRow, { pointerEvents: "box-none" }]}>
        <View style={styles.dpad}>
          <Pressable
            style={({ pressed }) => [styles.padBtn, pressed && styles.padPressed]}
            onPressIn={() => setLeft(true)}
            onPressOut={() => setLeft(false)}
          >
            <Ionicons name="caret-back" size={36} color="#fff" />
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.padBtn, pressed && styles.padPressed]}
            onPressIn={() => setRight(true)}
            onPressOut={() => setRight(false)}
          >
            <Ionicons name="caret-forward" size={36} color="#fff" />
          </Pressable>
        </View>
        <View style={styles.actions}>
          <Pressable
            style={({ pressed }) => [
              styles.actionBtn,
              {
                backgroundColor: vis.hasSlingshot ? "#DC2626" : "rgba(220,38,38,0.4)",
                transform: [{ scale: pressed ? 0.92 : 1 }],
              },
            ]}
            onPress={shoot}
          >
            <Ionicons name="flame" size={28} color="#fff" />
            <Text style={styles.actionLbl}>رمي</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.actionBtn,
              styles.jumpBtn,
              { transform: [{ scale: pressed ? 0.92 : 1 }] },
            ]}
            onPressIn={onJumpDown}
            onPressOut={onJumpUp}
          >
            <Ionicons name="arrow-up" size={32} color="#fff" />
            <Text style={styles.actionLbl}>قفز</Text>
          </Pressable>
        </View>
      </View>

      {/* === Win/Lose === */}
      {(hud.won || hud.lost) && (
        <View style={styles.modal}>
          <View style={styles.modalCard}>
            <Text style={styles.modalEmoji}>{hud.won ? "🏆" : "💔"}</Text>
            <Text style={styles.modalTitle}>{hud.won ? "أحسنت يا بطل بغداد!" : "حظ أوفر!"}</Text>
            <Text style={styles.modalSub}>النقاط: {hud.score}</Text>
            <Text style={styles.modalSub}>التمر: {hud.coins} 🌴</Text>
            <View style={{ flexDirection: "row-reverse", gap: 12, marginTop: 16 }}>
              <Pressable style={[styles.modalBtn, { backgroundColor: "#10B981" }]} onPress={restart}>
                <Ionicons name="refresh" size={18} color="#fff" />
                <Text style={styles.modalBtnTxt}>العب مجدداً</Text>
              </Pressable>
              <Pressable style={[styles.modalBtn, { backgroundColor: "rgba(255,255,255,0.15)" }]} onPress={() => router.back()}>
                <Ionicons name="home" size={18} color="#fff" />
                <Text style={styles.modalBtnTxt}>القائمة</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

// ===== Helpers =====

function deepCloneLevel(l: typeof LEVELS[0]) {
  return {
    width: l.width,
    height: l.height,
    tiles: l.tiles.map((row) => row.slice()),
    enemies: l.enemies.map((e) => ({ ...e })),
    coins: l.coins.map((c) => ({ ...c })),
    spawn: { ...l.spawn },
    flagX: l.flagX,
    slingshotBlocks: l.slingshotBlocks.map((s) => ({ ...s })),
  };
}

function findGroundY(level: ReturnType<typeof deepCloneLevel>, x: number, y: number): number | null {
  const tx = Math.floor(x);
  for (let ty = Math.floor(y); ty < level.height; ty++) {
    if (isSolid(level.tiles[ty]?.[tx] || 0)) return ty;
  }
  return null;
}

function moveX(p: any, dx: number, level: ReturnType<typeof deepCloneLevel>) {
  if (dx === 0) return;
  p.x += dx;
  const halfW = PLAYER_W / 2;
  const left = p.x - halfW, right = p.x + halfW;
  const top = p.y - PLAYER_H + 0.05, bottom = p.y - 0.05;
  const xs = [Math.floor(left), Math.floor(right)];
  for (let yy = Math.floor(top); yy <= Math.floor(bottom); yy++) {
    for (const xx of xs) {
      if (yy < 0 || yy >= level.height || xx < 0 || xx >= level.width) continue;
      if (isSolid(level.tiles[yy][xx])) {
        if (dx > 0) p.x = xx - halfW - 0.0005;
        else p.x = xx + 1 + halfW + 0.0005;
        p.vx = 0;
      }
    }
  }
}

function moveY(p: any, dy: number, level: ReturnType<typeof deepCloneLevel>) {
  if (dy === 0) return;
  p.y += dy;
  const halfW = PLAYER_W / 2;
  const left = p.x - halfW + 0.05, right = p.x + halfW - 0.05;
  const top = p.y - PLAYER_H, bottom = p.y;
  const ys = [Math.floor(top), Math.floor(bottom)];
  p.grounded = false;
  for (let xx = Math.floor(left); xx <= Math.floor(right); xx++) {
    for (const yy of ys) {
      if (yy < 0 || yy >= level.height || xx < 0 || xx >= level.width) continue;
      if (isSolid(level.tiles[yy][xx])) {
        if (dy > 0) {
          p.y = yy - 0.0005;
          p.vy = 0;
          p.grounded = true;
        } else {
          p.y = yy + 1 + PLAYER_H + 0.0005;
          p.vy = 0;
        }
      }
    }
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0F172A", overflow: "hidden" },
  hud: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 16,
    paddingHorizontal: 16,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 10,
  },
  hudBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  hudCenter: { flexDirection: "row-reverse", gap: 8 },
  hudPill: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: 100,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  hudText: { color: "#fff", fontWeight: "900", fontSize: 14 },
  controlsRow: {
    position: "absolute",
    bottom: 18,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 22,
    zIndex: 10,
  },
  dpad: { flexDirection: "row", gap: 14 },
  padBtn: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.3)",
  },
  padPressed: { backgroundColor: "rgba(255,255,255,0.2)", borderColor: "rgba(255,255,255,0.6)" },
  actions: { flexDirection: "row", gap: 14 },
  actionBtn: {
    width: 82,
    height: 82,
    borderRadius: 41,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.4)",
  },
  jumpBtn: { backgroundColor: "#3B82F6" },
  actionLbl: { color: "#fff", fontWeight: "900", fontSize: 12 },
  modal: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
  },
  modalCard: {
    width: "70%",
    maxWidth: 420,
    backgroundColor: "#1E293B",
    borderRadius: 24,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  modalEmoji: { fontSize: 56, marginBottom: 8 },
  modalTitle: { color: "#fff", fontSize: 22, fontWeight: "900", textAlign: "center", marginBottom: 8 },
  modalSub: { color: "#CBD5E1", fontSize: 16, fontWeight: "700" },
  modalBtn: {
    flexDirection: "row-reverse",
    gap: 6,
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 100,
  },
  modalBtnTxt: { color: "#fff", fontWeight: "900", fontSize: 14 },
});
