// Tile, enemy, coin, stone visuals - all SVG-based for crisp scaling.
import React from "react";
import Svg, { Path, Rect, Circle, Ellipse, Defs, LinearGradient, Stop, G, Polygon, RadialGradient } from "react-native-svg";

export function GroundTile({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 36 36">
      <Defs>
        <LinearGradient id="grd" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#D97706" />
          <Stop offset="1" stopColor="#92400E" />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="36" height="36" fill="url(#grd)" />
      {/* sand grain dots */}
      <Circle cx="6" cy="8" r="1" fill="#FCD34D" opacity="0.5" />
      <Circle cx="14" cy="20" r="0.8" fill="#FCD34D" opacity="0.5" />
      <Circle cx="24" cy="6" r="0.8" fill="#FCD34D" opacity="0.5" />
      <Circle cx="30" cy="22" r="1" fill="#FCD34D" opacity="0.4" />
      <Circle cx="20" cy="30" r="0.7" fill="#FCD34D" opacity="0.5" />
      {/* top grass-like accent */}
      <Path d="M 0 4 L 36 4" stroke="#F59E0B" strokeWidth="2" />
      <Path d="M 0 0 L 36 0" stroke="#A16207" strokeWidth="1.5" />
    </Svg>
  );
}

export function BrickTile({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 36 36">
      <Defs>
        <LinearGradient id="brk" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#EA580C" />
          <Stop offset="1" stopColor="#9A3412" />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="36" height="36" fill="url(#brk)" />
      {/* brick mortar lines */}
      <Path d="M 0 12 L 36 12 M 0 24 L 36 24" stroke="#7C2D12" strokeWidth="1.4" />
      <Path d="M 10 0 L 10 12 M 26 0 L 26 12 M 4 12 L 4 24 M 22 12 L 22 24 M 10 24 L 10 36 M 26 24 L 26 36" stroke="#7C2D12" strokeWidth="1.4" />
      {/* arabesque accent corners */}
      <Circle cx="18" cy="18" r="1.5" fill="#FED7AA" opacity="0.6" />
    </Svg>
  );
}

export function QuestionTile({ size, used = false, pulse = 0 }: { size: number; used?: boolean; pulse?: number }) {
  const glow = used ? 0 : 0.4 + Math.sin(pulse * Math.PI * 2) * 0.2;
  return (
    <Svg width={size} height={size} viewBox="0 0 36 36">
      <Defs>
        <LinearGradient id="qgrd" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={used ? "#78350F" : "#FBBF24"} />
          <Stop offset="1" stopColor={used ? "#451A03" : "#D97706"} />
        </LinearGradient>
      </Defs>
      <Rect x="1" y="1" width="34" height="34" rx="3" fill="url(#qgrd)" stroke="#7C2D12" strokeWidth="1.5" />
      {/* corner studs */}
      <Circle cx="6" cy="6" r="2" fill={used ? "#451A03" : "#FED7AA"} />
      <Circle cx="30" cy="6" r="2" fill={used ? "#451A03" : "#FED7AA"} />
      <Circle cx="6" cy="30" r="2" fill={used ? "#451A03" : "#FED7AA"} />
      <Circle cx="30" cy="30" r="2" fill={used ? "#451A03" : "#FED7AA"} />
      {/* ? mark or empty */}
      {!used ? (
        <>
          {/* glow */}
          <Circle cx="18" cy="18" r="11" fill="#FBBF24" opacity={glow} />
          <Path
            d="M 13 14 Q 13 9 18 9 Q 23 9 23 13 Q 23 16 19 18 Q 19 21 19 22"
            stroke="#FFFFFF"
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
          />
          <Circle cx="19" cy="26" r="2" fill="#FFFFFF" />
        </>
      ) : null}
    </Svg>
  );
}

export function PipeTile({ size, side }: { size: number; side: "L" | "R" }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 36 36">
      <Defs>
        <LinearGradient id="pipe" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#15803D" />
          <Stop offset="0.5" stopColor="#22C55E" />
          <Stop offset="1" stopColor="#15803D" />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="36" height="36" fill="url(#pipe)" />
      {side === "L" ? (
        <Rect x="0" y="0" width="6" height="36" fill="#0F4D24" opacity="0.4" />
      ) : (
        <Rect x="30" y="0" width="6" height="36" fill="#0F4D24" opacity="0.4" />
      )}
      <Rect x="0" y="0" width="36" height="2" fill="#16A34A" />
    </Svg>
  );
}

export function Coin({ size, phase = 0 }: { size: number; phase?: number }) {
  // phase 0..1 - simulates spinning
  const sx = Math.cos(phase * Math.PI * 2) * 0.7 + 0.3; // squeeze horizontally
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Defs>
        <RadialGradient id="coin" cx="0.5" cy="0.4" r="0.6">
          <Stop offset="0" stopColor="#FEF3C7" />
          <Stop offset="0.5" stopColor="#F59E0B" />
          <Stop offset="1" stopColor="#92400E" />
        </RadialGradient>
      </Defs>
      <G transform={`translate(12,12) scale(${sx},1) translate(-12,-12)`}>
        <Circle cx="12" cy="12" r="9" fill="url(#coin)" stroke="#7C2D12" strokeWidth="1" />
        {/* date pit shape */}
        <Path d="M 12 6 Q 14 12 12 18 Q 10 12 12 6 Z" fill="#92400E" opacity="0.7" />
        <Circle cx="12" cy="12" r="1" fill="#FEF3C7" />
      </G>
    </Svg>
  );
}

export function FoxEnemy({ size, dir = -1, walkPhase = 0 }: { size: number; dir?: 1 | -1; walkPhase?: number }) {
  const flip = dir === -1 ? -1 : 1;
  const legSwing = Math.sin(walkPhase * Math.PI * 2) * 4;
  return (
    <Svg width={size} height={size * 0.7} viewBox="0 0 50 35">
      <G transform={`translate(25,17.5) scale(${flip},1) translate(-25,-17.5)`}>
        {/* tail */}
        <Path d="M 4 18 Q -2 14 0 8 Q 4 12 8 16" fill="#EA580C" stroke="#7C2D12" strokeWidth="0.8" />
        <Circle cx="0" cy="9" r="3" fill="#FEF3C7" />
        {/* body */}
        <Ellipse cx="22" cy="20" rx="13" ry="7" fill="#EA580C" stroke="#7C2D12" strokeWidth="0.8" />
        {/* legs */}
        <Rect x={14 - legSwing * 0.3} y="24" width="3" height="7" fill="#7C2D12" />
        <Rect x={28 + legSwing * 0.3} y="24" width="3" height="7" fill="#7C2D12" />
        {/* head */}
        <Path d="M 32 14 Q 40 12 42 18 Q 42 24 36 24 Q 30 22 32 14 Z" fill="#EA580C" stroke="#7C2D12" strokeWidth="0.8" />
        {/* ears */}
        <Polygon points="33,12 36,7 38,13" fill="#EA580C" stroke="#7C2D12" strokeWidth="0.5" />
        <Polygon points="38,12 41,7 43,13" fill="#EA580C" stroke="#7C2D12" strokeWidth="0.5" />
        {/* face */}
        <Path d="M 38 19 L 43 19" stroke="#FEF3C7" strokeWidth="2" />
        <Circle cx="40" cy="17" r="1" fill="#1F2937" />
        <Polygon points="42,20 44,21 42,22" fill="#1F2937" />
      </G>
    </Svg>
  );
}

export function CrowEnemy({ size, dir = -1, walkPhase = 0 }: { size: number; dir?: 1 | -1; walkPhase?: number }) {
  const flip = dir === -1 ? -1 : 1;
  const wingFlap = Math.sin(walkPhase * Math.PI * 4) * 6;
  return (
    <Svg width={size} height={size * 0.8} viewBox="0 0 40 32">
      <G transform={`translate(20,16) scale(${flip},1) translate(-20,-16)`}>
        {/* wings flapping */}
        <Path
          d={`M 8 14 Q ${4 - wingFlap} ${4 - wingFlap} 12 ${10 - wingFlap * 0.5}`}
          stroke="#1F2937"
          strokeWidth="6"
          fill="none"
          strokeLinecap="round"
        />
        <Path
          d={`M 28 14 Q ${36 + wingFlap} ${4 - wingFlap} 24 ${10 - wingFlap * 0.5}`}
          stroke="#1F2937"
          strokeWidth="6"
          fill="none"
          strokeLinecap="round"
        />
        {/* body */}
        <Ellipse cx="20" cy="18" rx="9" ry="7" fill="#0F172A" />
        {/* head */}
        <Circle cx="27" cy="13" r="5" fill="#0F172A" />
        {/* eye */}
        <Circle cx="29" cy="12" r="1.6" fill="#FBBF24" />
        <Circle cx="29.5" cy="12" r="0.8" fill="#000" />
        {/* beak */}
        <Polygon points="32,13 36,12 32,15" fill="#F59E0B" />
        {/* feet */}
        <Path d="M 17 24 L 17 28 M 22 24 L 22 28" stroke="#F59E0B" strokeWidth="1.5" />
      </G>
    </Svg>
  );
}

export function Stone({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16">
      <Defs>
        <RadialGradient id="st" cx="0.4" cy="0.4" r="0.7">
          <Stop offset="0" stopColor="#9CA3AF" />
          <Stop offset="1" stopColor="#374151" />
        </RadialGradient>
      </Defs>
      <Circle cx="8" cy="8" r="6" fill="url(#st)" stroke="#1F2937" strokeWidth="1" />
      <Circle cx="6" cy="6" r="1.2" fill="#D1D5DB" opacity="0.6" />
    </Svg>
  );
}

export function Flag({ height, phase = 0 }: { height: number; phase?: number }) {
  const wave = Math.sin(phase * Math.PI * 2) * 3;
  return (
    <Svg width={height * 0.6} height={height} viewBox="0 0 60 100">
      {/* pole */}
      <Rect x="28" y="0" width="4" height="100" fill="#1F2937" />
      <Circle cx="30" cy="0" r="3" fill="#FBBF24" />
      {/* flag - Iraqi colors red/white/black with green star */}
      <Path
        d={`M 32 8 Q ${52 + wave} 12 50 25 Q ${48 + wave} 32 32 28 Z`}
        fill="#DC2626"
      />
      <Path
        d={`M 32 28 Q ${52 + wave} 32 50 45 Q ${48 + wave} 52 32 48 Z`}
        fill="#FFFFFF"
      />
      <Path
        d={`M 32 48 Q ${52 + wave} 52 50 65 Q ${48 + wave} 72 32 68 Z`}
        fill="#0F172A"
      />
      {/* green calligraphic accent */}
      <Path d={`M 36 38 Q 40 36 44 38 Q 42 42 38 41 Q 36 39 36 38`} fill="#15803D" />
    </Svg>
  );
}
