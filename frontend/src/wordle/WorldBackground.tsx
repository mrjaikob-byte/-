// Animated background decorations per chapter/world.
// Light-weight, render-friendly: 8-12 small animated elements floating around.

import React, { useEffect, useMemo, useRef } from "react";
import { View, Animated, Easing, Dimensions, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Chapter, IconName } from "./chapters";

const { width: SCREEN_W } = Dimensions.get("window");

type Item = {
  id: number;
  icon: IconName;
  color: string;
  size: number;
  x: number;
  startY: number;
  endY: number;
  duration: number;
  delay: number;
  rotate: boolean;
  drift: number; // horizontal drift amplitude
};

function rand(min: number, max: number) { return Math.random() * (max - min) + min; }

function buildItems(chapter: Chapter, height: number): Item[] {
  const arr: Item[] = [];
  const id = chapter.id;
  // Different patterns per chapter
  if (id === 1) {
    // Garden: leaves floating up, gentle sway
    for (let i = 0; i < 10; i++) {
      arr.push({
        id: i, icon: "leaf",
        color: i % 2 === 0 ? "#34D399" : "#A7F3D0",
        size: rand(14, 22),
        x: rand(20, SCREEN_W - 40),
        startY: height + rand(0, 60),
        endY: -40,
        duration: rand(9000, 14000),
        delay: rand(0, 6000),
        rotate: true,
        drift: rand(15, 30),
      });
    }
  } else if (id === 2) {
    // Desert: sand particles drifting horizontally
    for (let i = 0; i < 14; i++) {
      arr.push({
        id: i, icon: "ellipse",
        color: i % 3 === 0 ? "#FBBF24" : "#F59E0B",
        size: rand(3, 7),
        x: -20,
        startY: rand(40, height - 40),
        endY: rand(40, height - 40), // dummy; we'll use drift X heavily
        duration: rand(6000, 10000),
        delay: rand(0, 5000),
        rotate: false,
        drift: SCREEN_W + 60, // huge horizontal drift = move across screen
      });
    }
  } else if (id === 3) {
    // Sea: bubbles rising
    for (let i = 0; i < 12; i++) {
      arr.push({
        id: i, icon: "ellipse-outline",
        color: i % 2 === 0 ? "#67E8F9" : "#38BDF8",
        size: rand(8, 16),
        x: rand(20, SCREEN_W - 40),
        startY: height + 20,
        endY: -30,
        duration: rand(7000, 12000),
        delay: rand(0, 5000),
        rotate: false,
        drift: rand(-20, 20),
      });
    }
  } else if (id === 4) {
    // Mountain: snowflakes falling
    for (let i = 0; i < 14; i++) {
      arr.push({
        id: i, icon: "snow",
        color: "#F1F5F9",
        size: rand(10, 18),
        x: rand(10, SCREEN_W - 30),
        startY: -30,
        endY: height + 30,
        duration: rand(7000, 12000),
        delay: rand(0, 6000),
        rotate: true,
        drift: rand(-25, 25),
      });
    }
  } else if (id === 5) {
    // Forest: magical sparkles twinkling
    for (let i = 0; i < 12; i++) {
      arr.push({
        id: i, icon: "sparkles",
        color: i % 3 === 0 ? "#C4B5FD" : i % 3 === 1 ? "#F0ABFC" : "#FDE68A",
        size: rand(12, 22),
        x: rand(15, SCREEN_W - 35),
        startY: rand(30, height - 30),
        endY: rand(30, height - 30) - 40,
        duration: rand(2500, 4500),
        delay: rand(0, 3000),
        rotate: true,
        drift: 0,
      });
    }
  } else if (id === 6) {
    // Castle: warm embers floating up
    for (let i = 0; i < 12; i++) {
      arr.push({
        id: i, icon: "flame",
        color: i % 2 === 0 ? "#F472B6" : "#FBBF24",
        size: rand(10, 18),
        x: rand(20, SCREEN_W - 40),
        startY: height + 20,
        endY: -30,
        duration: rand(6000, 10000),
        delay: rand(0, 5000),
        rotate: false,
        drift: rand(-30, 30),
      });
    }
  } else {
    // Space: twinkling stars
    for (let i = 0; i < 16; i++) {
      arr.push({
        id: i, icon: i % 3 === 0 ? "star" : "ellipse",
        color: i % 4 === 0 ? "#FDE68A" : i % 4 === 1 ? "#C7D2FE" : "#FFFFFF",
        size: rand(4, 12),
        x: rand(10, SCREEN_W - 20),
        startY: rand(20, height - 20),
        endY: rand(20, height - 20),
        duration: rand(2200, 4000),
        delay: rand(0, 3000),
        rotate: false,
        drift: 0,
      });
    }
  }
  return arr;
}

function FloatingItem({ item }: { item: Item }) {
  const t = useRef(new Animated.Value(0)).current;
  const op = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(item.delay),
        Animated.parallel([
          Animated.timing(t, { toValue: 1, duration: item.duration, useNativeDriver: true, easing: Easing.linear }),
          Animated.sequence([
            Animated.timing(op, { toValue: 0.55, duration: Math.min(900, item.duration / 3), useNativeDriver: true }),
            Animated.delay(Math.max(0, item.duration - 1800)),
            Animated.timing(op, { toValue: 0, duration: Math.min(900, item.duration / 3), useNativeDriver: true }),
          ]),
        ]),
        Animated.timing(t, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [t, op, item.delay, item.duration]);

  const ty = t.interpolate({ inputRange: [0, 1], outputRange: [item.startY, item.endY] });
  const tx = t.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, item.drift / 2, item.drift],
  });
  const rot = item.rotate
    ? t.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] })
    : "0deg";

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: item.x,
        opacity: op,
        transform: [{ translateY: ty }, { translateX: tx }, { rotate: rot }],
      }}
    >
      <Ionicons name={item.icon} size={item.size} color={item.color} />
    </Animated.View>
  );
}

export function WorldBackground({ chapter, height }: { chapter: Chapter; height: number }) {
  const items = useMemo(() => buildItems(chapter, height), [chapter.id, height]);
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: "hidden" }]}>
      {items.map((it) => (
        <FloatingItem key={it.id} item={it} />
      ))}
    </View>
  );
}
