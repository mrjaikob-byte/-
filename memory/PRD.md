# PRD - منصة الألعاب (Games Platform)

## Overview
A bilingual-friendly (Arabic-first) mobile games platform built with Expo + React Native. Now hosts **3 games** with room to expand.

## Implemented Games

### 1. Domino Calculator (`app/games/domino.tsx`)
Two-column scoreboard (right=Player 1, left=Player 2), live total + progress bar to target (100/150/200/250 or custom), per-score delete, reset, winner modal, AsyncStorage persistence.

### 2. Card Game Calculator – حاسبة ورق اللعب (`app/games/cards.tsx`)
- Setup: Individual (2/3/4) or Pairs (4 in 2 teams of opposing seats), rounds (6/8/10 or custom), names
- Playing: green circular table with slots positioned around in flex rows (top / [left+table+right] / bottom)
- Entry modal: number input, X (-25), XX (-50), per-entry delete with scrollable history
- Round-complete banner with spring animation, slot total pulse, glow ring on active slots
- Auto results modal (sorted ascending: 🏆 winner / ❌ loser) with cascade reveal
- AsyncStorage persistence

### 3. Mafia – لعبة المافيا (`app/games/mafia.tsx`)
- Single-device pass-around model, 6-14 players
- **8 Roles**: مواطن صالح، دكتور، محقق، قناص، متفجر، شيخ الصالحين (3 votes if revealed), شيخ المافيا، مافيا التسكيت
- **Phases**:
  1. **Intro**: animated welcome (gunshot flashes, pulsing CTA, haptics)
  2. **Players**: add/edit/remove names (6-14)
  3. **Role counts**: per-role +/- counters, sum must equal player count, min 1 mafia leader
  4. **Distribution**: random or manual (with role picker modal + per-role usage tracking)
  5. **Reveal**: card-flip animation per player to see their secret role
  6. **Night sequence** (skips phases when no living player has role):
     - Doctor → protect (cannot protect same person two nights in a row)
     - Mafia kill → leader (or silencer inherits if leader dead)
     - Silencer → silence (target loses next discussion vote)
     - Detective → investigate (shows mafia/not result, auto-hides)
     - Sniper → shoot or skip (one-shot; misses citizen → sniper dies)
  7. **Day results**: full night resolution respecting order (protect → kill → silence → snipe)
  8. **Discussion**: alive list, silenced badge, citizen-leader reveal button
  9. **Voting**: pass-device per voter (citizen leader's vote = 3 if revealed), skip option
  10. **Vote results** with tally + eliminated player
  11. **Bomber pull**: if eliminated player was bomber, drag another out
  12. **End game**: winner team + full role reveal, restart or exit
- Haptic feedback throughout (light/medium/heavy/notification)
- Win condition: all mafia eliminated → citizens win • mafia ≥ citizens → mafia wins

## Tech
- Expo SDK 54, expo-router (file-based)
- @react-native-async-storage/async-storage 2.2.0
- @expo/vector-icons (Ionicons)
- expo-haptics
- Pure React Native (Animated API for animations) + StyleSheet
- RTL via `flexDirection: row-reverse` and `textAlign: right`

## Architecture
- Routes: `app/_layout.tsx` (Stack) + `app/index.tsx` + `app/games/<game>.tsx`
- All games are frontend-only, no backend required.
- FastAPI/Mongo skeleton remains for future games (leaderboards, profiles).

## Roadmap
- More games can be added by creating `app/games/<name>.tsx` and appending to `GAMES` in `index.tsx`
- Possible additions: حاسبة الكيرم، البلوت، الترنيب، عداد جلسات
- Mafia enhancements: audio (gunshot sound, narrator voice), more roles, role descriptions during night, history log per game, shareable game summary
