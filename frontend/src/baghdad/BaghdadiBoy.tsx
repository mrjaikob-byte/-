// Iraqi Baghdadi boy character "كرّومي" - SVG-based with two outfits.
import React from "react";
import Svg, { Defs, G, Path, Circle, Ellipse, Rect, LinearGradient, Stop, RadialGradient } from "react-native-svg";

type Props = {
  size: number;
  facing: 1 | -1;
  hasSlingshot: boolean;
  walkPhase?: number; // 0..1 for animation
  isJumping?: boolean;
  isShooting?: boolean;
};

export function BaghdadiBoy({
  size,
  facing,
  hasSlingshot,
  walkPhase = 0,
  isJumping = false,
  isShooting = false,
}: Props) {
  // Animation offsets for legs (sin wave)
  const legSwing = isJumping ? 0 : Math.sin(walkPhase * Math.PI * 2) * 6;
  const armSwing = isJumping ? -10 : Math.sin(walkPhase * Math.PI * 2) * 5;
  const bob = isJumping ? -1 : Math.abs(Math.sin(walkPhase * Math.PI * 2)) * 1;

  // Outfit colors
  const tunic = hasSlingshot ? "#DC2626" : "#FAFAFA"; // red sash power-up vs white dishdasha
  const tunicShade = hasSlingshot ? "#991B1B" : "#E5E7EB";
  const trim = hasSlingshot ? "#FBBF24" : "#A78BFA";

  const flipScale = facing === -1 ? -1 : 1;

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <LinearGradient id="kufiyya" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="1" stopColor="#E5E7EB" />
        </LinearGradient>
        <LinearGradient id="tunicGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={tunic} />
          <Stop offset="1" stopColor={tunicShade} />
        </LinearGradient>
        <RadialGradient id="cheek" cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor="#F87171" stopOpacity="0.6" />
          <Stop offset="1" stopColor="#F87171" stopOpacity="0" />
        </RadialGradient>
      </Defs>

      <G transform={`translate(50, 50) scale(${flipScale}, 1) translate(-50, ${bob})`}>
        {/* Shadow under feet */}
        <Ellipse cx="50" cy="92" rx="16" ry="3" fill="#000" opacity="0.25" />

        {/* LEGS */}
        <G>
          {/* back leg */}
          <Rect
            x={isJumping ? 38 : 40 - legSwing * 0.3}
            y={isJumping ? 70 : 72}
            width="9"
            height={isJumping ? 14 : 16}
            rx="3"
            fill="#3F2D1A"
          />
          {/* front leg */}
          <Rect
            x={isJumping ? 53 : 51 + legSwing * 0.3}
            y={isJumping ? 68 : 72}
            width="9"
            height={isJumping ? 14 : 16}
            rx="3"
            fill="#5B3A22"
          />
          {/* sandals */}
          <Ellipse cx={isJumping ? 42.5 : 44.5 - legSwing * 0.3} cy={isJumping ? 86 : 89} rx="6" ry="2" fill="#1F2937" />
          <Ellipse cx={isJumping ? 57.5 : 55.5 + legSwing * 0.3} cy={isJumping ? 84 : 89} rx="6" ry="2" fill="#1F2937" />
        </G>

        {/* BODY (tunic / dishdasha) */}
        <G>
          <Path
            d="M 32 50 Q 30 56 32 74 L 68 74 Q 70 56 68 50 Q 60 46 50 46 Q 40 46 32 50 Z"
            fill="url(#tunicGrad)"
            stroke={tunicShade}
            strokeWidth="0.5"
          />
          {/* embroidered collar trim */}
          <Path
            d="M 38 48 Q 50 52 62 48"
            stroke={trim}
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
          />
          {/* sash diagonal (when has slingshot) */}
          {hasSlingshot && (
            <Path d="M 30 56 L 70 70 L 70 74 L 30 60 Z" fill="#FBBF24" stroke="#92400E" strokeWidth="0.6" />
          )}
          {/* belt */}
          <Rect x="32" y="68" width="36" height="3" fill={hasSlingshot ? "#7C2D12" : "#92400E"} />
        </G>

        {/* ARMS */}
        <G>
          {/* back arm */}
          <Rect
            x={36}
            y={52 + armSwing * 0.2}
            width="6"
            height="18"
            rx="3"
            fill={tunicShade}
          />
          {/* front arm - holds slingshot if has it */}
          {hasSlingshot ? (
            <G transform={`translate(${isShooting ? 60 : 58}, ${isShooting ? 50 : 54})`}>
              <Rect x="0" y="0" width="6" height="18" rx="3" fill={tunic} />
              {/* skin hand */}
              <Circle cx="3" cy="18" r="3" fill="#D9A574" />
              {/* slingshot Y shape */}
              <G transform={`translate(${isShooting ? -2 : 0}, ${isShooting ? -8 : -6})`}>
                <Path d="M 3 12 L 3 22" stroke="#78350F" strokeWidth="2.4" strokeLinecap="round" />
                <Path d="M 3 12 L -3 4" stroke="#78350F" strokeWidth="2.4" strokeLinecap="round" />
                <Path d="M 3 12 L 9 4" stroke="#78350F" strokeWidth="2.4" strokeLinecap="round" />
                {/* rubber band */}
                <Path
                  d={isShooting ? "M -3 4 Q 3 12 9 4" : "M -3 4 Q 3 8 9 4"}
                  stroke="#1F2937"
                  strokeWidth="0.8"
                  fill="none"
                />
                {/* stone in pouch */}
                {!isShooting && <Circle cx="3" cy="8" r="1.5" fill="#374151" />}
              </G>
            </G>
          ) : (
            <Rect x={56} y={52 - armSwing * 0.2} width="6" height="18" rx="3" fill={tunic} />
          )}
        </G>

        {/* HEAD */}
        <G>
          {/* skin face */}
          <Circle cx="50" cy="34" r="13" fill="#E8B98C" />
          {/* hair edge */}
          <Path
            d="M 38 30 Q 40 22 50 21 Q 60 22 62 30 L 60 28 Q 50 24 40 28 Z"
            fill="#1F1410"
          />
          {/* kufiyya/قبعة - white with red checker pattern */}
          <Path
            d="M 35 28 Q 35 18 50 16 Q 65 18 65 28 L 64 30 Q 50 22 36 30 Z"
            fill="url(#kufiyya)"
          />
          {/* red stripes on kufiyya */}
          <Path d="M 38 22 L 42 24 M 45 19 L 48 21 M 53 19 L 55 22 M 58 22 L 62 24" stroke="#DC2626" strokeWidth="1.3" strokeLinecap="round" />
          {/* iqal (black band on top) */}
          <Path d="M 36 26 Q 50 22 64 26" stroke="#0F172A" strokeWidth="2" fill="none" strokeLinecap="round" />

          {/* eyebrows - mischievous */}
          <Path d="M 42 31 L 47 30" stroke="#1F1410" strokeWidth="1.6" strokeLinecap="round" />
          <Path d="M 53 30 L 58 31" stroke="#1F1410" strokeWidth="1.6" strokeLinecap="round" />
          {/* eyes - bright and big */}
          <Circle cx="44.5" cy="35" r="2.4" fill="#FFFFFF" />
          <Circle cx="55.5" cy="35" r="2.4" fill="#FFFFFF" />
          <Circle cx={44.5 + facing * 0.6} cy="35.2" r="1.5" fill="#1F2937" />
          <Circle cx={55.5 + facing * 0.6} cy="35.2" r="1.5" fill="#1F2937" />
          {/* eye shine */}
          <Circle cx={45 + facing * 0.6} cy="34.4" r="0.5" fill="#FFFFFF" />
          <Circle cx={56 + facing * 0.6} cy="34.4" r="0.5" fill="#FFFFFF" />
          {/* cheeks blush */}
          <Ellipse cx="42" cy="40" rx="3" ry="2" fill="url(#cheek)" />
          <Ellipse cx="58" cy="40" rx="3" ry="2" fill="url(#cheek)" />
          {/* mouth - mischievous smile */}
          <Path
            d={isShooting ? "M 46 41 Q 50 44 54 41" : "M 46 41 Q 50 43.5 54 41"}
            stroke="#7F1D1D"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
          />
          {/* nose */}
          <Path d="M 49 36 Q 50 38 51 38" stroke="#A26442" strokeWidth="1" fill="none" strokeLinecap="round" />
        </G>
      </G>
    </Svg>
  );
}
