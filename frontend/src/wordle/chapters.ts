// Chapter definitions - each chapter has a theme, color palette, and level range.
// Candy Crush style: themes change as player progresses.

import type { ComponentProps } from "react";
import { Ionicons } from "@expo/vector-icons";

export type IconName = ComponentProps<typeof Ionicons>["name"];

export type Chapter = {
  id: number;
  name: string;
  subtitle: string;
  from: number; // inclusive
  to: number;   // inclusive
  color: string;
  color2: string;
  bg: string;   // Background tint for map section
  icon: IconName;
  emoji: string;
};

export const CHAPTERS: Chapter[] = [
  { id: 1, name: "الحديقة الخضراء",   subtitle: "بداية الرحلة",    from: 1,    to: 50,   color: "#10B981", color2: "#34D399", bg: "#062C24", icon: "leaf",          emoji: "🌿" },
  { id: 2, name: "الصحراء الذهبية",   subtitle: "رمال وأسرار",     from: 51,   to: 150,  color: "#F59E0B", color2: "#FBBF24", bg: "#2A1C06", icon: "sunny",         emoji: "🏜️" },
  { id: 3, name: "البحر الأزرق",      subtitle: "أمواج المعرفة",   from: 151,  to: 300,  color: "#0EA5E9", color2: "#38BDF8", bg: "#062033", icon: "water",         emoji: "🌊" },
  { id: 4, name: "الجبل الثلجي",      subtitle: "ذرى التحدي",      from: 301,  to: 500,  color: "#94A3B8", color2: "#CBD5E1", bg: "#1A2333", icon: "snow",          emoji: "🏔️" },
  { id: 5, name: "الغابة السحرية",    subtitle: "ألغاز الأشجار",   from: 501,  to: 700,  color: "#7C3AED", color2: "#A78BFA", bg: "#1F1238", icon: "sparkles",      emoji: "🌳" },
  { id: 6, name: "قصر الملك",         subtitle: "كنوز الحكمة",     from: 701,  to: 900,  color: "#EC4899", color2: "#F472B6", bg: "#2B0B22", icon: "diamond",       emoji: "🏰" },
  { id: 7, name: "الفضاء اللامحدود",  subtitle: "سيد الكلمات",     from: 901,  to: 1000, color: "#6366F1", color2: "#818CF8", bg: "#130E2E", icon: "planet",        emoji: "🚀" },
];

export const TOTAL_LEVELS = CHAPTERS[CHAPTERS.length - 1].to;

export function getChapter(level: number): Chapter {
  for (const c of CHAPTERS) {
    if (level >= c.from && level <= c.to) return c;
  }
  return CHAPTERS[0];
}
