import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Pressable,
  Platform,
  StatusBar,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Svg, { Defs, LinearGradient, Stop, Rect, Circle, Path } from "react-native-svg";
import {
  GroundTile,
  BrickTile,
  QuestionTile,
  PipeTile,
  Coin,
  FoxEnemy,
  CrowEnemy,
  Stone,
  Flag,
} from "../../src/baghdad/Sprites";
import { BaghdadiBoy } from "../../src/baghdad/BaghdadiBoy";
import {
  LEVELS,
  TILE_PX,
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
  Enemy,
  Coin as CoinT,
} from "../../src/baghdad/level";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

type Stone = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  alive: boolean;
};

type FloatText = {
  id: string;
  x: number;
  y: number;
  text: string;
  color: string;
  ttl: number;
};

const VIEW_H = SCREEN_H;
const VIEW_W = SCREEN_W;

export default function BaghdadHero() {
  const router = useRouter();
  const [hud, setHud] = useState({
    coins: 0,
    score: 0,
    lives: 3,
    hasSlingshot: false,
    won: false,
    lost: false,
    timeLeft: 240, // seconds
  });

  // refs for game state (avoid re-renders during loop)
  const level = useRef(deepCloneLevel(LEVELS[0])).current;
  const playerRef = useRef({
    x: level.spawn.x,
    y: level.spawn.y,
    vx: 0,
    vy: 0,
    grounded: false,
    facing: 1 as 1 | -1,
    walkPhase: 0,
    isShooting: 0, // ttl of shoot animation
    invuln: 0,
    hasSlingshot: false,
  });
  const stonesRef = useRef<Stone[]>([]);
  const floatsRef = useRef<FloatText[]>([]);
  const inputRef = useRef({ left: false, right: false, jump: false, jumpEdge: false });
  const cameraRef = useRef({ x: 0 });
  const tickRef = useRef(0);
  const stoneIdRef = useRef(0);
  const floatIdRef = useRef(0);
  const [, force] = useState(0); // for forcing re-render every frame
  const lastTimeRef = useRef<number>(performance.now());
  const lastShotRef = useRef<number>(0);

  // ---- Game loop ----
  useEffect(() => {
    let raf: number;
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - lastTimeRef.current) / 1000);
      lastTimeRef.current = now;
      step(dt);
      tickRef.current++;
      force((v) => (v + 1) % 1000000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Timer ----
  useEffect(() => {
    if (hud.won || hud.lost) return;
    const id = setInterval(() => {
      setHud((h) => {
        if (h.timeLeft <= 1) {
          return { ...h, timeLeft: 0, lost: true };
        }
        return { ...h, timeLeft: h.timeLeft - 1 };
      });
    }, 1000);
    return () => clearInterval(id);
  }, [hud.won, hud.lost]);

  // ---- Step (one physics frame) ----
  const step = (dt: number) => {
    if (hud.won || hud.lost) return;
    const p = playerRef.current;
    const input = inputRef.current;

    // Horizontal movement
    if (input.left) { p.vx -= RUN_ACCEL * dt; p.facing = -1; }
    if (input.right) { p.vx += RUN_ACCEL * dt; p.facing = 1; }
    if (!input.left && !input.right) {
      // friction
      const sign = Math.sign(p.vx);
      p.vx -= sign * FRICTION * dt;
      if (Math.sign(p.vx) !== sign) p.vx = 0;
    }
    p.vx = Math.max(-RUN_MAX, Math.min(RUN_MAX, p.vx));

    // Jump
    if (input.jumpEdge && p.grounded) {
      p.vy = JUMP_VEL;
      p.grounded = false;
      try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    }
    input.jumpEdge = false;

    // Gravity
    p.vy += GRAVITY * dt;
    if (p.vy > 30) p.vy = 30;

    // Move with collision (axis-separated)
    moveAndCollide(p, p.vx * dt, 0, level);
    moveAndCollide(p, 0, p.vy * dt, level);

    // walk phase
    if (Math.abs(p.vx) > 0.5 && p.grounded) {
      p.walkPhase = (p.walkPhase + dt * Math.abs(p.vx) * 0.4) % 1;
    } else if (p.grounded) {
      p.walkPhase = 0;
    }

    if (p.isShooting > 0) p.isShooting -= dt;
    if (p.invuln > 0) p.invuln -= dt;

    // Out-of-world death
    if (p.y > level.height + 5) {
      respawnOrLose();
    }

    // Camera follows player horizontally
    const targetCam = p.x - VIEW_W / TILE_PX / 2;
    cameraRef.current.x += (targetCam - cameraRef.current.x) * Math.min(1, dt * 8);
    cameraRef.current.x = Math.max(0, Math.min(level.width - VIEW_W / TILE_PX, cameraRef.current.x));

    // Update stones
    for (const s of stonesRef.current) {
      if (!s.alive) continue;
      s.vy += GRAVITY * 0.6 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      // hit tile
      const tx = Math.floor(s.x);
      const ty = Math.floor(s.y);
      if (tx < 0 || tx >= level.width || ty < 0 || ty >= level.height || isSolid(level.tiles[ty][tx])) {
        s.alive = false;
      }
      // hit enemy
      for (const e of level.enemies) {
        if (!e.alive) continue;
        if (Math.abs(s.x - e.x) < 0.6 && Math.abs(s.y - e.y) < 0.6) {
          e.alive = false;
          s.alive = false;
          floatsRef.current.push({ id: `f${floatIdRef.current++}`, x: e.x, y: e.y, text: "+200", color: "#FBBF24", ttl: 1.0 });
          setHud((h) => ({ ...h, score: h.score + 200 }));
          try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
        }
      }
    }
    stonesRef.current = stonesRef.current.filter((s) => s.alive && Math.abs(s.x - p.x) < 30 && s.y < level.height + 2);

    // Update enemies
    for (const e of level.enemies) {
      if (!e.alive) continue;
      if (e.type === "fox") {
        e.x += e.vx * dt;
        // simple gravity / floor-check
        e.vy += GRAVITY * dt;
        e.y += e.vy * dt;
        // floor at y = floor of next ground tile
        const ground = findGroundY(level, e.x, e.y);
        if (ground !== null && e.y >= ground) { e.y = ground; e.vy = 0; }
        // turn at edge or wall
        const ahead = Math.floor(e.x + e.dir * 0.6);
        const below = Math.floor(e.y + 0.6);
        if (
          ahead < 0 || ahead >= level.width ||
          isSolid(level.tiles[Math.floor(e.y)]?.[ahead] || 0) ||
          (below < level.height && !isSolid(level.tiles[below]?.[ahead] || 0))
        ) {
          e.dir = (e.dir === 1 ? -1 : 1) as 1 | -1;
          e.vx = 1.5 * e.dir;
        }
      } else if (e.type === "crow") {
        // hover side-to-side at fixed y
        e.x += e.vx * dt;
        if (e.x < 2) { e.dir = 1; e.vx = 1.0; }
        if (e.x > level.width - 2) { e.dir = -1; e.vx = -1.0; }
        // small hover bobbing
        e.y += Math.sin(tickRef.current * 0.05) * 0.005;
      }
      // collide with player
      if (p.invuln <= 0 && Math.abs(p.x - e.x) < 0.8 && Math.abs(p.y - e.y) < 0.9) {
        // stomp: if player coming down on top of fox
        if (e.type === "fox" && p.vy > 1 && p.y < e.y - 0.2) {
          e.alive = false;
          p.vy = JUMP_VEL * 0.7;
          floatsRef.current.push({ id: `f${floatIdRef.current++}`, x: e.x, y: e.y, text: "+100", color: "#FBBF24", ttl: 1.0 });
          setHud((h) => ({ ...h, score: h.score + 100 }));
          try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
        } else {
          // hit
          hitPlayer();
        }
      }
    }

    // Update coins
    for (const c of level.coins) {
      if (c.collected) continue;
      if (Math.abs(p.x - c.x) < 0.7 && Math.abs(p.y - c.y) < 0.9) {
        c.collected = true;
        floatsRef.current.push({ id: `f${floatIdRef.current++}`, x: c.x, y: c.y, text: "+50", color: "#FCD34D", ttl: 0.8 });
        setHud((h) => ({ ...h, coins: h.coins + 1, score: h.score + 50 }));
        try { Haptics.selectionAsync(); } catch {}
      }
    }

    // Floats decay
    for (const f of floatsRef.current) f.ttl -= dt;
    floatsRef.current = floatsRef.current.filter((f) => f.ttl > 0);

    // Check flag (win)
    if (p.x >= level.flagX - 0.5 && p.x <= level.flagX + 1.5) {
      setHud((h) => ({ ...h, won: true, score: h.score + Math.max(0, h.timeLeft) * 10 }));
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    }
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
    const p = playerRef.current;
    p.x = level.spawn.x;
    p.y = level.spawn.y;
    p.vx = 0;
    p.vy = 0;
    p.invuln = 1.5;
    p.hasSlingshot = false;
    setHud((h) => ({ ...h, hasSlingshot: false }));
  };

  const hitPlayer = () => {
    const p = playerRef.current;
    if (p.invuln > 0) return;
    if (p.hasSlingshot) {
      // just lose powerup
      p.hasSlingshot = false;
      p.invuln = 1.2;
      setHud((h) => ({ ...h, hasSlingshot: false }));
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); } catch {}
    } else {
      // lose life
      respawnOrLose();
    }
  };

  // ---- Controls ----
  const setDir = (k: "left" | "right" | "jump", v: boolean) => {
    if (k === "jump" && v && !inputRef.current.jump) inputRef.current.jumpEdge = true;
    inputRef.current[k] = v;
  };

  const shoot = () => {
    const p = playerRef.current;
    const now = performance.now();
    if (!p.hasSlingshot) {
      // visual hint
      floatsRef.current.push({
        id: `f${floatIdRef.current++}`, x: p.x, y: p.y - 1, text: "تحتاج مصيادة!",
        color: "#F87171", ttl: 1.0,
      });
      return;
    }
    if (now - lastShotRef.current < 250) return;
    lastShotRef.current = now;
    p.isShooting = 0.3;
    stonesRef.current.push({
      id: `s${stoneIdRef.current++}`,
      x: p.x + p.facing * 0.6,
      y: p.y - 0.3,
      vx: p.facing * 12,
      vy: -2,
      alive: true,
    });
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
  };

  // ---- Tile interaction (bumping ? blocks from below) ----
  // Detect when player's head hits a question/brick tile during upward motion.
  const lastBumpRef = useRef<string>("");
  useEffect(() => {
    const id = setInterval(() => {
      const p = playerRef.current;
      if (p.vy < -1) {
        const headTileX = Math.floor(p.x);
        const headTileY = Math.floor(p.y - PLAYER_H + 0.05);
        const key = `${headTileX},${headTileY}`;
        if (key !== lastBumpRef.current && headTileY >= 0) {
          const t = level.tiles[headTileY]?.[headTileX];
          if (t === T_QUESTION) {
            level.tiles[headTileY][headTileX] = T_USED;
            lastBumpRef.current = key;
            // Determine reward
            const isSling = level.slingshotBlocks.some((s) => s.x === headTileX && s.y === headTileY);
            if (isSling && !playerRef.current.hasSlingshot) {
              playerRef.current.hasSlingshot = true;
              setHud((h) => ({ ...h, hasSlingshot: true, score: h.score + 1000 }));
              floatsRef.current.push({ id: `f${floatIdRef.current++}`, x: headTileX + 0.5, y: headTileY - 0.5, text: "🎯 المصيادة!", color: "#FBBF24", ttl: 1.5 });
              try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
            } else {
              // give a coin
              level.coins.push({ id: `qc${headTileX}${headTileY}`, x: headTileX + 0.5, y: headTileY - 0.5, collected: false });
              setHud((h) => ({ ...h, score: h.score + 50 }));
              floatsRef.current.push({ id: `f${floatIdRef.current++}`, x: headTileX + 0.5, y: headTileY - 0.5, text: "+50", color: "#FCD34D", ttl: 0.8 });
              try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
            }
          } else if (t === T_BRICK && p.hasSlingshot) {
            level.tiles[headTileY][headTileX] = T_EMPTY;
            lastBumpRef.current = key;
            try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
          }
        }
      } else {
        lastBumpRef.current = "";
      }
    }, 16);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- RENDER ----
  const cam = cameraRef.current.x;
  const p = playerRef.current;
  const tilesToRender = visibleTiles(level, cam, VIEW_W);
  const fmt = (n: number) => n.toString().padStart(6, "0");
  const phase = (tickRef.current / 60) % 1;

  const restart = () => router.replace("/games/baghdad-hero");

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false, animation: "fade" }} />
      <StatusBar hidden />
      {/* Sky gradient backdrop */}
      <Svg width={VIEW_W} height={VIEW_H} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FBBF24" />
            <Stop offset="0.4" stopColor="#FB923C" />
            <Stop offset="0.7" stopColor="#F472B6" />
            <Stop offset="1" stopColor="#7C3AED" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill="url(#sky)" />
        {/* sun */}
        <Circle cx={VIEW_W * 0.78} cy={VIEW_H * 0.18} r="36" fill="#FEF3C7" opacity="0.9" />
        <Circle cx={VIEW_W * 0.78} cy={VIEW_H * 0.18} r="22" fill="#FDE68A" />
        {/* parallax distant minarets */}
        {[0.1, 0.35, 0.6, 0.85, 1.1, 1.35, 1.6, 1.85].map((px, i) => {
          const total = 2.0;
          const cycled = ((px - cam * 0.15) % total + total) % total;
          const x = cycled * VIEW_W * 0.5 - 60;
          if (x < -60 || x > VIEW_W) return null;
          const h = 80 + (i % 2) * 20;
          return (
            <React.Fragment key={i}>
              <Rect x={x} y={VIEW_H * 0.5 - h} width={20} height={h} fill="#92400E" opacity="0.5" />
              <Circle cx={x + 10} cy={VIEW_H * 0.5 - h} r={12} fill="#92400E" opacity="0.5" />
              <Path d={`M ${x + 10} ${VIEW_H * 0.5 - h - 14} L ${x + 14} ${VIEW_H * 0.5 - h - 6} L ${x + 6} ${VIEW_H * 0.5 - h - 6} Z`} fill="#FBBF24" opacity="0.6" />
            </React.Fragment>
          );
        })}
        {/* parallax palm trees nearer */}
        {[0.15, 0.4, 0.7, 1.1, 1.4, 1.7].map((px, i) => {
          const total = 1.5;
          const cycled = ((px - cam * 0.4) % total + total) % total;
          const x = cycled * VIEW_W - 40;
          if (x < -50 || x > VIEW_W + 20) return null;
          const baseY = VIEW_H * 0.62;
          return (
            <React.Fragment key={`pt${i}`}>
              <Rect x={x + 16} y={baseY - 60} width={6} height={80} fill="#5B3A22" />
              {[-25, -15, -5, 5, 15, 25].map((dx, j) => (
                <Path key={j} d={`M ${x + 19} ${baseY - 60} Q ${x + 19 + dx} ${baseY - 70 - Math.abs(dx) * 0.3} ${x + 19 + dx * 1.6} ${baseY - 50 - Math.abs(dx) * 0.4}`} stroke="#15803D" strokeWidth="3" fill="none" strokeLinecap="round" />
              ))}
              <Circle cx={x + 19} cy={baseY - 64} r={4} fill="#92400E" />
            </React.Fragment>
          );
        })}
      </Svg>

      {/* Game world */}
      <View style={StyleSheet.absoluteFill}>
        {/* Tiles */}
        {tilesToRender.map(({ x, y, t }) => {
          const left = (x - cam) * TILE_PX;
          const top = y * TILE_PX;
          if (left < -TILE_PX || left > VIEW_W + TILE_PX) return null;
          return (
            <View key={`t${x}${y}`} style={{ position: "absolute", left, top, width: TILE_PX, height: TILE_PX }}>
              {t === T_GROUND && <GroundTile size={TILE_PX} />}
              {t === T_BRICK && <BrickTile size={TILE_PX} />}
              {t === T_QUESTION && <QuestionTile size={TILE_PX} pulse={phase} />}
              {t === T_USED && <QuestionTile size={TILE_PX} used />}
              {t === T_PIPE_L && <PipeTile size={TILE_PX} side="L" />}
              {t === T_PIPE_R && <PipeTile size={TILE_PX} side="R" />}
            </View>
          );
        })}

        {/* Coins */}
        {level.coins.filter((c) => !c.collected).map((c) => {
          const left = (c.x - cam) * TILE_PX - TILE_PX / 2;
          const top = c.y * TILE_PX - TILE_PX / 2;
          if (left < -TILE_PX || left > VIEW_W + TILE_PX) return null;
          return (
            <View key={c.id} style={{ position: "absolute", left, top, width: TILE_PX * 0.7, height: TILE_PX * 0.7 }}>
              <Coin size={TILE_PX * 0.7} phase={(phase + c.x * 0.13) % 1} />
            </View>
          );
        })}

        {/* Enemies */}
        {level.enemies.filter((e) => e.alive).map((e) => {
          const sz = e.type === "fox" ? TILE_PX * 1.2 : TILE_PX;
          const left = (e.x - cam) * TILE_PX - sz / 2;
          const top = e.y * TILE_PX - sz * 0.5;
          if (left < -sz || left > VIEW_W + sz) return null;
          return (
            <View key={e.id} style={{ position: "absolute", left, top, width: sz, height: sz }}>
              {e.type === "fox" ? (
                <FoxEnemy size={sz} dir={e.dir} walkPhase={(phase + e.x * 0.1) % 1} />
              ) : (
                <CrowEnemy size={sz} dir={e.dir} walkPhase={(phase + e.x * 0.1) % 1} />
              )}
            </View>
          );
        })}

        {/* Stones */}
        {stonesRef.current.filter((s) => s.alive).map((s) => {
          const left = (s.x - cam) * TILE_PX - TILE_PX * 0.2;
          const top = s.y * TILE_PX - TILE_PX * 0.2;
          return (
            <View key={s.id} style={{ position: "absolute", left, top, width: TILE_PX * 0.4, height: TILE_PX * 0.4 }}>
              <Stone size={TILE_PX * 0.4} />
            </View>
          );
        })}

        {/* Flag */}
        <View
          style={{
            position: "absolute",
            left: (level.flagX - cam) * TILE_PX,
            top: (14 - 4) * TILE_PX,
            width: TILE_PX,
            height: TILE_PX * 5,
          }}
        >
          <Flag height={TILE_PX * 5} phase={phase} />
        </View>

        {/* Player */}
        <View
          style={{
            position: "absolute",
            left: (p.x - cam) * TILE_PX - TILE_PX * 0.7,
            top: (p.y - PLAYER_H) * TILE_PX - TILE_PX * 0.1,
            width: TILE_PX * 1.4,
            height: TILE_PX * 1.6,
            opacity: p.invuln > 0 ? (Math.floor(tickRef.current / 4) % 2 === 0 ? 0.4 : 1) : 1,
          }}
        >
          <BaghdadiBoy
            size={TILE_PX * 1.6}
            facing={p.facing}
            hasSlingshot={p.hasSlingshot}
            walkPhase={p.walkPhase}
            isJumping={!p.grounded}
            isShooting={p.isShooting > 0}
          />
        </View>

        {/* Floating texts */}
        {floatsRef.current.map((f) => (
          <Text
            key={f.id}
            style={{
              position: "absolute",
              left: (f.x - cam) * TILE_PX - 50,
              top: f.y * TILE_PX - (1 - f.ttl) * 40 - 30,
              width: 100,
              textAlign: "center",
              color: f.color,
              fontWeight: "900",
              fontSize: 16,
              opacity: f.ttl,
              textShadow: "0px 1px 4px rgba(0,0,0,0.7)",
            }}
          >
            {f.text}
          </Text>
        ))}
      </View>

      {/* HUD */}
      <View style={styles.hud}>
        <Pressable style={styles.hudBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-forward" size={20} color="#fff" />
        </Pressable>
        <View style={styles.hudCenter}>
          <View style={styles.hudPill}>
            <Ionicons name="heart" size={14} color="#F87171" />
            <Text style={styles.hudText}>{hud.lives}</Text>
          </View>
          <View style={styles.hudPill}>
            <Text style={{ fontSize: 12 }}>🌴</Text>
            <Text style={styles.hudText}>{hud.coins}</Text>
          </View>
          <View style={styles.hudPill}>
            <Ionicons name="trophy" size={12} color="#FBBF24" />
            <Text style={styles.hudText}>{fmt(hud.score)}</Text>
          </View>
          <View style={[styles.hudPill, { backgroundColor: hud.timeLeft < 30 ? "rgba(239,68,68,0.3)" : "rgba(0,0,0,0.4)" }]}>
            <Ionicons name="time" size={12} color="#fff" />
            <Text style={styles.hudText}>{hud.timeLeft}</Text>
          </View>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {/* Controls */}
      <View style={[styles.controlsRow, { pointerEvents: "box-none" }]}>
        <View style={styles.dpad}>
          <Pressable
            style={[styles.padBtn, styles.padLeft]}
            onPressIn={() => setDir("left", true)}
            onPressOut={() => setDir("left", false)}
          >
            <Ionicons name="caret-back" size={32} color="#fff" />
          </Pressable>
          <Pressable
            style={[styles.padBtn, styles.padRight]}
            onPressIn={() => setDir("right", true)}
            onPressOut={() => setDir("right", false)}
          >
            <Ionicons name="caret-forward" size={32} color="#fff" />
          </Pressable>
        </View>
        <View style={styles.actions}>
          <Pressable style={[styles.actionBtn, { backgroundColor: hud.hasSlingshot ? "#DC2626" : "rgba(220,38,38,0.4)" }]} onPress={shoot}>
            <Ionicons name="flame" size={24} color="#fff" />
            <Text style={styles.actionLbl}>رمي</Text>
          </Pressable>
          <Pressable
            style={[styles.actionBtn, styles.jumpBtn]}
            onPressIn={() => setDir("jump", true)}
            onPressOut={() => setDir("jump", false)}
          >
            <Ionicons name="arrow-up" size={28} color="#fff" />
            <Text style={styles.actionLbl}>قفز</Text>
          </Pressable>
        </View>
      </View>

      {/* Win/Lose modals */}
      {(hud.won || hud.lost) && (
        <View style={styles.modal}>
          <View style={styles.modalCard}>
            <Text style={styles.modalEmoji}>{hud.won ? "🏆" : "💔"}</Text>
            <Text style={styles.modalTitle}>{hud.won ? "أحسنت يا بطل بغداد!" : "حظ أفضل في المرة القادمة!"}</Text>
            <Text style={styles.modalSub}>النقاط: {hud.score}</Text>
            <Text style={styles.modalSub}>التمر المجموع: {hud.coins}</Text>
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

function visibleTiles(level: ReturnType<typeof deepCloneLevel>, cam: number, viewW: number) {
  const x0 = Math.max(0, Math.floor(cam) - 1);
  const x1 = Math.min(level.width, Math.ceil(cam + viewW / TILE_PX) + 1);
  const result: { x: number; y: number; t: number }[] = [];
  for (let y = 0; y < level.height; y++) {
    for (let x = x0; x < x1; x++) {
      const t = level.tiles[y][x];
      if (t !== T_EMPTY) result.push({ x, y, t });
    }
  }
  return result;
}

function findGroundY(level: ReturnType<typeof deepCloneLevel>, x: number, y: number): number | null {
  const tx = Math.floor(x);
  for (let ty = Math.floor(y); ty < level.height; ty++) {
    if (isSolid(level.tiles[ty]?.[tx] || 0)) return ty;
  }
  return null;
}

function moveAndCollide(
  p: { x: number; y: number; vx: number; vy: number; grounded: boolean },
  dx: number,
  dy: number,
  level: ReturnType<typeof deepCloneLevel>,
) {
  // AABB swept along single axis
  const halfW = PLAYER_W / 2;
  // Player pos = feet at (p.x, p.y); body extends up by PLAYER_H.
  if (dx !== 0) {
    p.x += dx;
    const left = p.x - halfW, right = p.x + halfW;
    const top = p.y - PLAYER_H + 0.05, bottom = p.y - 0.05;
    const xs = [Math.floor(left), Math.floor(right)];
    for (let yy = Math.floor(top); yy <= Math.floor(bottom); yy++) {
      for (const xx of xs) {
        if (yy < 0 || yy >= level.height || xx < 0 || xx >= level.width) continue;
        if (isSolid(level.tiles[yy][xx])) {
          if (dx > 0) p.x = xx - halfW - 0.001;
          else p.x = xx + 1 + halfW + 0.001;
          p.vx = 0;
        }
      }
    }
  }
  if (dy !== 0) {
    p.y += dy;
    const left = p.x - halfW + 0.05, right = p.x + halfW - 0.05;
    const top = p.y - PLAYER_H, bottom = p.y;
    const ys = [Math.floor(top), Math.floor(bottom)];
    p.grounded = false;
    for (let xx = Math.floor(left); xx <= Math.floor(right); xx++) {
      for (const yy of ys) {
        if (yy < 0 || yy >= level.height || xx < 0 || xx >= level.width) continue;
        if (isSolid(level.tiles[yy][xx])) {
          if (dy > 0) {
            p.y = yy - 0.001;
            p.vy = 0;
            p.grounded = true;
          } else {
            p.y = yy + 1 + PLAYER_H + 0.001;
            p.vy = 0;
          }
        }
      }
    }
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#1F2937", overflow: "hidden" },
  hud: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingTop: Platform.OS === "ios" ? 50 : 20,
    paddingHorizontal: 12,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 10,
  },
  hudBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center", justifyContent: "center",
  },
  hudCenter: { flexDirection: "row-reverse", gap: 6 },
  hudPill: {
    flexDirection: "row-reverse", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 5,
    backgroundColor: "rgba(0,0,0,0.4)", borderRadius: 100,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.2)",
  },
  hudText: { color: "#fff", fontWeight: "900", fontSize: 13 },
  controlsRow: {
    position: "absolute",
    bottom: Platform.OS === "ios" ? 30 : 16,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    zIndex: 10,
  },
  dpad: {
    flexDirection: "row",
    gap: 10,
  },
  padBtn: {
    width: 64, height: 64, borderRadius: 32,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 2, borderColor: "rgba(255,255,255,0.25)",
  },
  padLeft: {},
  padRight: {},
  actions: { flexDirection: "row", gap: 12 },
  actionBtn: {
    width: 70, height: 70, borderRadius: 36,
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "rgba(255,255,255,0.3)",
  },
  jumpBtn: { backgroundColor: "#3B82F6" },
  actionLbl: { color: "#fff", fontWeight: "900", fontSize: 11 },
  modal: {
    position: "absolute",
    inset: 0,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center", justifyContent: "center",
    zIndex: 100,
  },
  modalCard: {
    width: "85%",
    maxWidth: 380,
    backgroundColor: "#1E293B",
    borderRadius: 24,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  modalEmoji: { fontSize: 56, marginBottom: 8 },
  modalTitle: { color: "#fff", fontSize: 20, fontWeight: "900", textAlign: "center", marginBottom: 8 },
  modalSub: { color: "#CBD5E1", fontSize: 16, fontWeight: "700" },
  modalBtn: {
    flexDirection: "row-reverse", gap: 6, alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 12, borderRadius: 100,
  },
  modalBtnTxt: { color: "#fff", fontWeight: "900", fontSize: 14 },
});
