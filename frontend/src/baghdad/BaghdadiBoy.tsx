// Iraqi Baghdadi boy "كرّومي" - high-detail SVG with multiple animation states.
import React, { memo } from "react";
import Svg, {
  Defs,
  G,
  Path,
  Circle,
  Ellipse,
  Rect,
  LinearGradient,
  Stop,
  RadialGradient,
} from "react-native-svg";

type Props = {
  size: number;
  facing: 1 | -1;
  hasSlingshot: boolean;
  walkPhase?: number;
  state: "idle" | "run" | "jump" | "fall" | "shoot";
};

function BaghdadiBoyComp({ size, facing, hasSlingshot, walkPhase = 0, state }: Props) {
  const t = walkPhase * Math.PI * 2;
  const isRun = state === "run";
  const isShoot = state === "shoot";
  const legSwingL = isRun ? Math.sin(t) * 14 : 0;
  const legSwingR = isRun ? Math.sin(t + Math.PI) * 14 : 0;
  const armSwingL = isRun ? Math.sin(t + Math.PI) * 12 : 0;
  const armSwingR = isRun ? Math.sin(t) * 12 : 0;
  const bodyBob = isRun ? Math.abs(Math.sin(t)) * 4 - 2 : 0;
  const idleBob = state === "idle" ? Math.sin(walkPhase * Math.PI * 2) * 1.5 : 0;
  const tiltAir = state === "jump" ? -3 : state === "fall" ? 3 : 0;
  const flip = facing === -1 ? -1 : 1;

  const tunicMain = hasSlingshot ? "#DC2626" : "#FAFAFA";
  const tunicShade = hasSlingshot ? "#7F1D1D" : "#D1D5DB";
  const tunicHi = hasSlingshot ? "#FCA5A5" : "#FFFFFF";
  const collarColor = hasSlingshot ? "#FBBF24" : "#7C3AED";
  const collarShade = hasSlingshot ? "#B45309" : "#5B21B6";
  const beltColor = hasSlingshot ? "#451A03" : "#92400E";
  const skin = "#E8B98C";
  const skinShade = "#C99A6A";

  return (
    <Svg width={size} height={size * 1.2} viewBox="0 0 200 240">
      <Defs>
        <LinearGradient id="tunic" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={tunicHi} />
          <Stop offset="0.5" stopColor={tunicMain} />
          <Stop offset="1" stopColor={tunicShade} />
        </LinearGradient>
        <LinearGradient id="kufiyya" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="1" stopColor="#D1D5DB" />
        </LinearGradient>
        <LinearGradient id="skinG" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#F2C896" />
          <Stop offset="1" stopColor={skin} />
        </LinearGradient>
        <RadialGradient id="cheek" cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor="#F87171" stopOpacity="0.6" />
          <Stop offset="1" stopColor="#F87171" stopOpacity="0" />
        </RadialGradient>
        <LinearGradient id="sash" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FBBF24" />
          <Stop offset="1" stopColor="#B45309" />
        </LinearGradient>
        <LinearGradient id="wood" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#92400E" />
          <Stop offset="1" stopColor="#451A03" />
        </LinearGradient>
      </Defs>
      <G transform={`translate(100, 120) scale(${flip}, 1) translate(-100, ${bodyBob + idleBob}) rotate(${tiltAir} 100 120)`}>
        <Ellipse cx="100" cy="222" rx="38" ry="6" fill="#000" opacity="0.25" />
        {/* LEGS */}
        <G transform={`translate(${85 + legSwingL * 0.4}, ${165 - Math.abs(legSwingL) * 0.5})`}>
          <Path d="M 0 0 Q 4 25 0 50 L 18 50 Q 22 25 18 0 Z" fill="#3F2A18" />
          <Ellipse cx="9" cy="52" rx="14" ry="4" fill="#1F1B17" />
        </G>
        <G transform={`translate(${100 - legSwingR * 0.4}, ${165 - Math.abs(legSwingR) * 0.5})`}>
          <Path d="M 0 0 Q 4 25 0 50 L 18 50 Q 22 25 18 0 Z" fill="#5B3A22" />
          <Ellipse cx="9" cy="52" rx="14" ry="4" fill="#1F1B17" />
        </G>
        {/* BODY */}
        <Path d="M 65 110 Q 60 130 62 165 Q 80 175 100 175 Q 120 175 138 165 Q 140 130 135 110 Q 120 100 100 100 Q 80 100 65 110 Z" fill="url(#tunic)" stroke={tunicShade} strokeWidth="1.5" />
        {!hasSlingshot && (
          <G opacity="0.6">
            <Path d="M 78 110 L 76 170" stroke="#D1D5DB" strokeWidth="0.8" />
            <Path d="M 100 105 L 100 175" stroke="#D1D5DB" strokeWidth="0.8" />
            <Path d="M 122 110 L 124 170" stroke="#D1D5DB" strokeWidth="0.8" />
          </G>
        )}
        <Path d="M 80 105 L 100 122 L 120 105" stroke={collarColor} strokeWidth="3.5" fill="none" strokeLinecap="round" />
        <Path d="M 84 107 L 100 119 L 116 107" stroke={collarShade} strokeWidth="1.5" fill="none" strokeLinecap="round" />
        {hasSlingshot && (
          <Path d="M 60 120 L 145 158 L 145 168 L 60 130 Z" fill="url(#sash)" stroke="#7C2D12" strokeWidth="1" />
        )}
        <Rect x="60" y="155" width="80" height="6" fill={beltColor} rx="1" />
        <Rect x="95" y="153" width="10" height="10" fill="#FBBF24" stroke="#7C2D12" strokeWidth="1" />
        <Rect x="98" y="156" width="4" height="4" fill="#7C2D12" />
        {/* ARMS */}
        <G transform={`translate(${68 + armSwingL * 0.3}, 120) rotate(${armSwingL * 0.5})`}>
          <Path d="M 0 0 Q -4 20 -2 40 Q 6 42 8 40 Q 10 20 6 0 Z" fill={tunicShade} />
          <Circle cx="2" cy="42" r="6" fill={skin} stroke={skinShade} strokeWidth="0.5" />
        </G>
        {hasSlingshot ? (
          <G transform={`translate(${isShoot ? 145 : 138}, ${isShoot ? 110 : 120}) rotate(${isShoot ? -20 : 5})`}>
            <Path d="M 0 0 Q 4 15 2 30 Q 10 32 12 30 Q 14 15 10 0 Z" fill={tunicMain} stroke={tunicShade} strokeWidth="0.8" />
            <Circle cx="6" cy="32" r="6" fill={skin} stroke={skinShade} strokeWidth="0.5" />
            <G transform="translate(6, 30)">
              <Path d="M 0 0 L 0 25" stroke="url(#wood)" strokeWidth="6" strokeLinecap="round" />
              <Path d="M 0 0 Q -3 -6 -10 -14" stroke="url(#wood)" strokeWidth="5" strokeLinecap="round" fill="none" />
              <Path d="M 0 0 Q 3 -6 10 -14" stroke="url(#wood)" strokeWidth="5" strokeLinecap="round" fill="none" />
              <Circle cx="-10" cy="-14" r="2.5" fill="#451A03" />
              <Circle cx="10" cy="-14" r="2.5" fill="#451A03" />
              <Path d={isShoot ? "M -10 -14 Q 0 0 10 -14" : "M -10 -14 Q 0 -8 10 -14"} stroke="#1F2937" strokeWidth="1.4" fill="none" />
              {!isShoot && <Ellipse cx="0" cy="-8" rx="5" ry="3" fill="#78350F" stroke="#1F2937" strokeWidth="0.6" />}
              {!isShoot && <Circle cx="0" cy="-8" r="3" fill="#6B7280" />}
            </G>
          </G>
        ) : (
          <G transform={`translate(${130 - armSwingR * 0.3}, 120) rotate(${-armSwingR * 0.5})`}>
            <Path d="M 0 0 Q -4 20 -2 40 Q 6 42 8 40 Q 10 20 6 0 Z" fill={tunicMain} stroke={tunicShade} strokeWidth="0.8" />
            <Circle cx="2" cy="42" r="6" fill={skin} stroke={skinShade} strokeWidth="0.5" />
          </G>
        )}
        {/* HEAD */}
        <Rect x="92" y="92" width="16" height="14" fill={skin} />
        <Ellipse cx="100" cy="70" rx="32" ry="34" fill="url(#skinG)" stroke={skinShade} strokeWidth="0.8" />
        <Path d="M 70 50 Q 75 35 100 33 Q 125 35 130 50 L 128 55 Q 115 45 100 46 Q 85 45 72 55 Z" fill="#1F1410" />
        <Path d="M 71 60 Q 65 65 68 75" stroke="#1F1410" strokeWidth="3" fill="none" strokeLinecap="round" />
        <Path d="M 129 60 Q 135 65 132 75" stroke="#1F1410" strokeWidth="3" fill="none" strokeLinecap="round" />
        <Path d="M 62 50 Q 58 25 100 22 Q 142 25 138 50 L 142 65 L 138 70 Q 100 50 62 70 L 58 65 Z" fill="url(#kufiyya)" stroke="#9CA3AF" strokeWidth="0.8" />
        <G opacity="0.85">
          <Path d="M 70 35 L 76 40 M 85 26 L 91 31 M 95 24 L 101 29 M 105 24 L 111 29 M 115 26 L 121 31 M 125 30 L 131 35" stroke="#DC2626" strokeWidth="1.8" strokeLinecap="round" />
          <Path d="M 67 45 L 73 50 M 88 38 L 94 43 M 100 36 L 106 41 M 110 38 L 116 43 M 131 45 L 137 50" stroke="#DC2626" strokeWidth="1.8" strokeLinecap="round" />
        </G>
        <Path d="M 64 48 Q 100 38 136 48" stroke="#0F172A" strokeWidth="4" fill="none" strokeLinecap="round" />
        <Circle cx="64" cy="50" r="3" fill="#0F172A" />
        <Circle cx="136" cy="50" r="3" fill="#0F172A" />
        {/* eyebrows */}
        <Path d="M 80 65 Q 86 62 92 64" stroke="#1F1410" strokeWidth="2.5" strokeLinecap="round" fill="none" />
        <Path d="M 108 64 Q 114 62 120 65" stroke="#1F1410" strokeWidth="2.5" strokeLinecap="round" fill="none" />
        {/* eyes */}
        <Ellipse cx="86" cy="74" rx="5.5" ry="6.5" fill="#FFFFFF" stroke="#1F2937" strokeWidth="1" />
        <Ellipse cx="114" cy="74" rx="5.5" ry="6.5" fill="#FFFFFF" stroke="#1F2937" strokeWidth="1" />
        <Circle cx={86 + facing * 1.5} cy="75" r="3.5" fill="#3B2812" />
        <Circle cx={114 + facing * 1.5} cy="75" r="3.5" fill="#3B2812" />
        <Circle cx={86 + facing * 1.5} cy="75" r="1.8" fill="#000" />
        <Circle cx={114 + facing * 1.5} cy="75" r="1.8" fill="#000" />
        <Circle cx={87 + facing * 1.5} cy="73" r="1.2" fill="#FFFFFF" />
        <Circle cx={115 + facing * 1.5} cy="73" r="1.2" fill="#FFFFFF" />
        {/* nose */}
        <Path d="M 98 80 Q 100 86 102 80" fill={skinShade} opacity="0.5" />
        {/* cheeks */}
        <Ellipse cx="78" cy="86" rx="6" ry="4" fill="url(#cheek)" />
        <Ellipse cx="122" cy="86" rx="6" ry="4" fill="url(#cheek)" />
        {/* mouth */}
        {isShoot ? (
          <Ellipse cx="100" cy="92" rx="4" ry="3" fill="#7F1D1D" />
        ) : (
          <Path d="M 90 91 Q 100 97 110 91" stroke="#7F1D1D" strokeWidth="2.2" fill="none" strokeLinecap="round" />
        )}
        {/* ears */}
        <Ellipse cx="65" cy="74" rx="3.5" ry="6" fill={skin} stroke={skinShade} strokeWidth="0.6" />
        <Ellipse cx="135" cy="74" rx="3.5" ry="6" fill={skin} stroke={skinShade} strokeWidth="0.6" />
      </G>
    </Svg>
  );
}

export const BaghdadiBoy = memo(BaghdadiBoyComp);
