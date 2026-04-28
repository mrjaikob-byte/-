# PRD - منصة الألعاب (Games Platform)

## Overview
A bilingual-friendly (Arabic-first) mobile games platform built with Expo + React Native. Currently hosts the **Domino Calculator (حاسبة الدومينو)** as its first game, designed to expand with more games.

## Implemented Features

### 1. Platform Home (`app/index.tsx`)
- Branded landing screen with stats row and games grid
- Each game rendered as a colorful card (gradient accent)
- Tappable cards route to dedicated game screens
- Placeholder for "قريباً" (coming soon) future games

### 2. Domino Calculator (`app/games/domino.tsx`)
- **Two-column split layout** (right = Player 1, left = Player 2) divided by a vertical line
- **Per-player controls:**
  - Editable name field at the top
  - Live total with progress bar toward target
  - Score input + "إضافة" button to append a score
  - Each score listed with index + value + 🗑 delete button
- **Target selector** at the top: 100 / 150 / 200 / 250 quick chips + custom target input
- **Reset button** (top-right): clears scores but keeps names + target (web `confirm`, native Alert)
- **Winner modal**: appears automatically when a player reaches the target — shows winner name, both totals, and a "جولة جديدة" button
- **Persistence**: target, names, and all scores saved via AsyncStorage and restored on reopen

## Tech
- Expo SDK 54, expo-router (file-based)
- @react-native-async-storage/async-storage (pinned to 2.2.0)
- @expo/vector-icons (Ionicons)
- Pure React Native (StyleSheet); no CSS, no web-only libs
- RTL layout via `flexDirection: row-reverse` and `textAlign: right`

## Architecture
- File-based routes: `app/_layout.tsx` (Stack), `app/index.tsx`, `app/games/domino.tsx`
- No backend used (frontend-only). FastAPI/Mongo skeleton remains for future games requiring sync/leaderboards.

## Roadmap (future games)
- Add new games as `app/games/<name>.tsx` and register them in the GAMES array in `index.tsx`.
