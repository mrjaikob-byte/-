# PRD - منصة الألعاب (Games Platform)

## Overview
A bilingual-friendly (Arabic-first) mobile games platform built with Expo + React Native. Currently hosts two games and is designed to expand with more.

## Implemented Features

### 1. Platform Home (`app/index.tsx`)
- Branded landing screen with stats row and games grid
- Each game rendered as a colorful card (gradient accent)
- Tappable cards route to dedicated game screens
- Placeholder card for future games

### 2. Domino Calculator (`app/games/domino.tsx`)
- Two-column split layout (right = Player 1, left = Player 2) divided by a vertical line
- Editable name field per player, live total + progress bar to target
- Score input + add button per player; per-score delete in the list
- Target selector: 100 / 150 / 200 / 250 chips + custom target input
- Reset confirmation that keeps names + target
- Winner modal when target reached, with "جولة جديدة" button
- AsyncStorage persistence

### 3. Card Game Calculator – حاسبة ورق اللعب (`app/games/cards.tsx`)
- **Setup phase**: choose mode (`Individual` 2/3/4 players OR `Pairs` 4 players in 2 teams of opposing seats), choose number of rounds (6/8/10 or custom), edit each player's name
- **Playing phase**: a green circular table with player slots positioned around it (top / right / bottom / left). Each slot shows name, total, last entry preview, entries count
- **Tap any slot** → entry modal with: number input, X button (−25), XX button (−50)
- **Pairs scoring**: opposite players (slots 0&2, 1&3) share a team total; tapping any of the 4 slots updates the team
- **Per-entry delete** in the history list (labels show `X (−25)` / `XX (−50)`)
- **Results modal**: sorted ascending, 🏆 winner (lowest) + ❌ loser (highest); `جولة جديدة` (keeps setup, resets scores) + `متابعة اللعب`
- **Auto-trigger** results when all entities reach the round count, plus manual trophy button
- AsyncStorage persistence (mode, rounds, names, scores, phase)

## Tech
- Expo SDK 54, expo-router (file-based)
- @react-native-async-storage/async-storage 2.2.0
- @expo/vector-icons (Ionicons)
- Pure React Native + StyleSheet; no CSS, no web-only libs
- RTL via `flexDirection: row-reverse` and `textAlign: right`

## Architecture
- Routes: `app/_layout.tsx` (Stack) + `app/index.tsx` + `app/games/<game>.tsx`
- No backend used (frontend-only). FastAPI/Mongo skeleton remains for future games requiring sync/leaderboards.

## Roadmap (future games)
- Add new game by creating `app/games/<name>.tsx` and appending to `GAMES` array in `index.tsx`.
- Ideas: حاسبة الكيرم، حاسبة البلوت، مؤقت الجلسات، إضافة سجل آخر الجولات (history) لكل لعبة.
