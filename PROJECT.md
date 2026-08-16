# Upscale: Project Documentation

A **habit, routine, and goal tracker** styled after the **Nintendo 3DS eShop** (and the IISU launcher). Build routines, group them under goals, do a daily check-in, map your progress, and unwind in a built-in arcade - all as an installable **PWA**.

---

## Table of contents

1. [Overview](#overview)
2. [Tech stack](#tech-stack)
3. [Features](#features)
4. [Architecture](#architecture)
5. [Project structure](#project-structure)
6. [Data model](#data-model)
7. [Authentication & cloud sync](#authentication--cloud-sync)
8. [Firestore schema](#firestore-schema)
9. [Arcade games](#arcade-games)
10. [PWA & offline](#pwa--offline)
11. [Design system](#design-system)
12. [Getting started](#getting-started)
13. [Environment variables](#environment-variables)
14. [Deployment](#deployment)
15. [Scripts](#scripts)

---

## Overview

Upscale helps you track recurring habits and long-term goals with a console-inspired UI. Each day you rate how routines went, see streaks and heatmaps, and optionally compete on daily arcade leaderboards.

| Mode | Storage | Sync |
| ---- | ------- | ---- |
| **Guest** | `localStorage` on device | None |
| **Google** | `localStorage` + Firestore | Cross-device auto-backup |

The app is **offline-first**: all reads and writes hit local storage immediately; cloud sync runs in the background for signed-in Google users when Firebase is configured.

---

## Tech stack

| Layer | Technology |
| ----- | ---------- |
| Language | TypeScript |
| UI | React 18 |
| Build | Vite 5 |
| Routing | React Router 6 |
| State | Zustand |
| Styling | Tailwind CSS 3 |
| Icons | Lucide React |
| Dates | date-fns |
| Auth (optional) | Google Identity Services (GIS) |
| Backend (optional) | Firebase Auth + Firestore |
| PWA | vite-plugin-pwa (Workbox) |
| Hosting | Vercel (SPA rewrites) |

---

## Features

### Routines & goals

- **Routines**: recurring tasks with category, icon, color, frequency, optional end date, optional goal link, and optional daily reminder time.
- **Goals**: overarching targets (e.g. “Learn piano”, “Build a website”). Routines can be tagged to a goal so their ratings roll up into goal progress.
- **Categories**: Exercise, Instrument, Project, Chores, Health, Learning, Relax, Other - each with a glossy gradient icon and example tasks.

### Frequency & scheduling

| Type | Behaviour |
| ---- | --------- |
| **Daily** | Due every calendar day |
| **Weekly** | Due on selected weekdays (0 = Sunday … 6 = Saturday) |
| **Interval** | Due every N days from creation date |

Routines can be **ongoing forever** or **time-boxed** with an end date. Archived routines are hidden from active views but kept in data.

### Daily check-in

A guided flow (`/checkin`) walks you through due routines goal-by-goal. Four ratings, worst → best:

| Rating | Effect |
| ------ | ------ |
| **No** | Undone; flagged as **priority** (red pulsing glow) |
| **Not really** | Stays in queue, unchanged |
| **Kinda** | Counts as **done** for stats, stays in queue |
| **Yes!** | **Cleared** until the next scheduled date |

Ratings reset each calendar day and accumulate into per-routine completion stats.

### Progress mapper

- Per-routine GitHub-style **contribution heatmaps**
- Current and best **streaks**
- Completion **percentage**
- 30-day completion chart
- Goal-level **progress rings** (by routine / by goal views)

### Notes

Free-form notes with an optional one-off reminder.

- **Dashboard strip**: a thin row under Goals: ~70% shows the most recent note (or “Create a note” when empty), ~30% is a plus button that opens the composer.
- **Notes screen** (`/notes`): list, create, edit and delete notes; each has a title, body, accent colour and optional reminder date/time.
- **Entry points**: the dashboard strip (both halves) and a Notes card on the check-in screen, under the progress bar.

### Reminders

Optional browser notifications for routines with a `reminderTime` (24h `HH:mm`, device local timezone) and for notes with a `reminderAt` (local `YYYY-MM-DDTHH:mm`).

- **Guest / no FCM:** polled in the open tab via `useRoutineReminders`; fired state is tracked per day in `localStorage` (note ids are namespaced as `note:{id}`).
- **Google + VAPID key:** the client registers an FCM token in Firestore `pushSubscriptions/{uid}` (tokens, IANA `timeZone`, enabled flag). A scheduled Cloud Function (`sendReminders`, every minute) reads due routines/notes from `userdata` and sends **data-only** web pushes. The service worker shows the notification while the app is closed. Local polling is skipped when remote push is active so reminders are not doubled.

### Arcade

Four mini-games with **daily challenges** (one seeded run per game per calendar day) and unlimited **practice** mode:

| Game | ID | Description |
| ---- | -- | ----------- |
| **TipTop** | `tiptop` | Flappy-style side-scroller into pits |
| **Octane** | `octane` | Drag race / free ride: rev to redline |
| **Dissiada** | `dissiada` | Rhythm tiles on a beat line |
| **Daybreak** | `daybreak` | Platformer: jump on the beat for bonus points |

- **Personal high scores**: stored in `AppData.gameScores` (top 10 per board key).
- **Global daily leaderboard**: Firestore `dailyBoards/{gameId}_{day}/entries/{uid}`; one create-once entry per user per game per day.
- **Arcade profile**: optional public display name for leaderboards (or anonymous opt-out).

### Settings & backup

- Export / import full backup as JSON (Settings sheet).
- Google accounts auto-backup to Firestore on every save.
- Sign out clears session; guest data stays on device.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  React UI (screens, components)                             │
├─────────────────────────────────────────────────────────────┤
│  Zustand store (useStore): debounced persist (150 ms)      │
├─────────────────────────────────────────────────────────────┤
│  storage.ts: localStorage read/write + cloud orchestration │
├──────────────────────┬──────────────────────────────────────┤
│  localStorage        │  cloudSync.ts → Firestore userdata   │
│  upscale:user        │  dailyLeaderboard.ts → dailyBoards   │
│  upscale:data:{id}   │  push.ts → pushSubscriptions         │
└──────────────────────┴──────────────────────────────────────┘
```

### Key flows

**App init** (`useStore.init`):
1. Read user from `localStorage`.
2. If Google + Firebase configured, wait for Firebase Auth, align legacy user IDs.
3. Load local data, merge with cloud (`mergeLocalAndCloud`), save merged result locally and push to cloud.

**Data mutation** (add goal, rate routine, record score, etc.):
1. Update Zustand state.
2. Debounced `storage.saveData` → local write + optional cloud upload.

**Conflict resolution** (`resolveBackupConflict` in `backup.ts`):
- Compares `syncedAt` / cloud `updatedAt` timestamps.
- Newer full backup wins (not field-level merge), except arcade daily/profile/scores which are merged explicitly in `mergeLocalAndCloud`.

---

## Project structure

```
Upscale/
├── public/                  # Static assets (icons, audio, game sprites, SW helpers)
│   ├── icons/               # PWA icons (regenerate via scripts/make_icons.py)
│   ├── seo.html             # Indexable copy served to crawlers
│   └── sw-notifications.js  # Notification taps + FCM background messages
├── scripts/
│   └── make_icons.py        # Generate PWA icon set
├── src/
│   ├── App.tsx              # Auth gate, routing, app shell, daily rollover
│   ├── main.tsx             # React entry
│   ├── index.css            # Global styles, 3DS-inspired design tokens
│   ├── components/          # Reusable UI
│   │   ├── Dock.tsx         # Bottom navigation (LB/RB shoulder pills)
│   │   ├── Sheet.tsx        # Modal bottom sheet
│   │   ├── RatingButtons.tsx
│   │   ├── Heatmap.tsx      # GitHub-style contribution grid
│   │   ├── RoutineForm.tsx / GoalForm.tsx / NoteForm.tsx
│   │   ├── NotesStrip.tsx   # Dashboard notes row (latest note + add)
│   │   ├── GameShell.tsx    # (via games/) Arcade session wrapper
│   │   └── …
│   ├── screens/             # Route-level views
│   │   ├── HomeScreen.tsx
│   │   ├── CheckinScreen.tsx
│   │   ├── GoalsScreen.tsx
│   │   ├── LibraryScreen.tsx
│   │   ├── NotesScreen.tsx
│   │   ├── ProgressScreen.tsx
│   │   ├── GamesScreen.tsx
│   │   ├── LoginScreen.tsx
│   │   └── games/           # Per-game screen wrappers
│   ├── games/               # Arcade game implementations
│   │   ├── GameShell.tsx    # Play/pause, daily vs practice, leaderboards
│   │   ├── TipTopGame.tsx
│   │   ├── OctaneGame.tsx
│   │   ├── DissiadaGame.tsx
│   │   ├── DaybreakGame.tsx
│   │   ├── daybreak/        # Daybreak sub-modules (audio, level gen, config)
│   │   ├── gameLoop.ts      # Shared rAF game loop
│   │   ├── gameAudio.ts
│   │   └── gameResult.ts
│   ├── store/
│   │   ├── useStore.ts      # Main app state + persistence
│   │   ├── useControls.ts   # Console-style A/B/+/− hints
│   │   ├── useTheme.ts
│   │   └── useBackgroundMusic.ts
│   ├── hooks/
│   │   ├── useKeyboardControls.ts
│   │   └── useRoutineReminders.ts
│   ├── lib/                 # Domain logic (no UI)
│       ├── types.ts         # Core TypeScript types
│       ├── storage.ts       # Local + cloud persistence layer
│       ├── cloudSync.ts     # Firestore userdata read/write
│       ├── backup.ts        # Export/import envelope format
│       ├── auth.ts          # Google GIS + Firebase credential exchange
│       ├── firebase.ts      # Firebase app init
│       ├── firebaseAuth.ts  # Auth session helpers
│       ├── push.ts          # FCM token registration
│       ├── dailyLeaderboard.ts
│       ├── dailyChallenge.ts
│       ├── gameLeaderboard.ts
│       ├── gamePlays.ts
│       ├── games.ts
│       ├── categories.ts
│       ├── frequency.ts     # Scheduling logic
│       ├── rating.ts        # DayEntry builder
│       ├── stats.ts         # Streaks, heatmaps, goal progress
│       ├── dates.ts
│       ├── calendar.ts
│       ├── reminders.ts
│       └── notifications.ts
├── functions/               # Cloud Function: sendReminders (FCM)
├── middleware.js            # Crawler rewrite → seo.html (Vercel)
├── firestore.rules          # Security rules (userdata, push, dailyBoards)
├── firebase.json
├── vite.config.ts           # Vite + PWA manifest
├── tailwind.config.js
├── vercel.json              # SPA rewrite to index.html
├── .env.example
├── package.json
├── README.md                # Quick-start guide
└── PROJECT.md               # This file
```

---

## Data model

### `User`

```ts
interface User {
  id: string;           // "guest:{uuid}" or "google:{firebaseUid}"
  name: string;
  email?: string;
  picture?: string;
  provider: "google" | "guest";
}
```

### `AppData` (persisted per user)

```ts
interface AppData {
  goals: Goal[];
  routines: Routine[];
  logs: Record<string, DayLog>;   // keyed by YYYY-MM-DD
  notes: Note[];
  lastActiveDate?: string;
  gamePlays?: GamePlaysState;
  gamePremium?: boolean;
  syncedAt?: string;              // ISO: last save timestamp for conflict resolution
  gameScores?: Record<string, GameScoreEntry[]>;
  arcadeDaily?: ArcadeDailyState;
  arcadeProfile?: ArcadeProfile;
  version: number;
}
```

### `Goal`

```ts
interface Goal {
  id: string;
  title: string;
  description?: string;
  icon: string;       // emoji
  color: string;      // hex accent
  createdAt: string;  // ISO
  targetDate?: string;
  archived?: boolean;
}
```

### `Routine`

```ts
interface Routine {
  id: string;
  title: string;
  note?: string;
  category: CategoryKey;
  icon: string;
  color: string;
  frequency: Frequency;
  hasEnd: boolean;
  endDate?: string;
  goalId?: string | null;
  reminderTime?: string;  // HH:mm
  createdAt: string;
  archived?: boolean;
}
```

### `Note`

```ts
interface Note {
  id: string;
  title: string;
  body: string;
  color: string;        // hex accent
  reminderAt?: string;  // local YYYY-MM-DDTHH:mm
  createdAt: string;
  updatedAt: string;
}
```

### `DayEntry` / `DayLog`

```ts
interface DayEntry {
  rating: "no" | "not_really" | "kinda" | "yes";
  completed: boolean;   // "kinda" or "yes"
  priority: boolean;    // "no"
  cleared: boolean;     // "yes"
  ratedAt: string;
}

interface DayLog {
  date: string;         // YYYY-MM-DD
  entries: Record<string, DayEntry>;  // routineId → entry
}
```

### Local storage keys

| Key | Contents |
| --- | -------- |
| `upscale:user` | Current `User` object |
| `upscale:data:{userId}` | `AppData` JSON |
| `upscale:guestId` | Stable guest UUID |
| `upscale:reminder-prefs` | Notification toggle |
| `upscale:reminder-fired:{date}` | Routine IDs already notified today |

---

## Authentication & cloud sync

Upscale uses **two** Google integrations when fully configured:

| Piece | Env vars | Purpose |
| ----- | -------- | ------- |
| **Google Identity (GIS)** | `VITE_GOOGLE_CLIENT_ID` | “Continue with Google” button, JWT |
| **Firebase** | `VITE_FIREBASE_*` | Exchange JWT → Firebase Auth session; read/write Firestore |

### Sign-in flow

1. User clicks Google button → GIS returns a credential JWT.
2. JWT is decoded for profile info (`sub`, name, email, picture).
3. If Firebase is configured, `signInWithCredential` establishes a Firebase Auth session; user ID becomes `google:{firebaseUid}`.
4. User is stored in `localStorage`; `storage.loadData` merges local + cloud.

### Cloud save (`saveCloudData`)

- Writes to `userdata/{firebaseUid}`.
- Payload matches the Settings → Export JSON envelope: `{ formatVersion, updatedAt, data }`.
- `undefined` fields are stripped before `setDoc` (Firestore rejects `undefined`).

### Cloud load (`loadCloudData`)

- Reads `userdata/{uid}`; falls back to legacy `google:{googleSub}` doc if present.
- On login/sync, `mergeLocalAndCloud` picks the newer full backup and merges arcade-specific fields.

### Guest mode

- No Firebase required.
- All data stays in `localStorage`.
- Export/import JSON for manual backup.

---

## Firestore schema

### `userdata/{userId}`

Owned by the authenticated user (`request.auth.uid == userId`).

```json
{
  "formatVersion": 1,
  "updatedAt": "2026-08-01T12:00:00.000Z",
  "data": {
    "goals": [ /* … */ ],
    "routines": [ /* … */ ],
    "logs": { /* … */ },
    "syncedAt": "2026-08-01T12:00:00.000Z",
    "gameScores": { "tiptop": [ /* … */ ] },
    "arcadeDaily": { "date": "2026-08-01", "completed": { /* … */ } },
    "arcadeProfile": { "username": "Player", "optedOut": false, "prompted": true },
    "version": 1
  }
}
```

### `pushSubscriptions/{userId}`

Owned by the authenticated user. Used by Cloud Functions to send FCM reminders.

```json
{
  "enabled": true,
  "tokens": ["fcm-device-token"],
  "timeZone": "Australia/Sydney",
  "updatedAt": "2026-08-16T01:00:00.000Z",
  "fired": { "2026-08-16": ["routineId", "note:noteId"] }
}
```

### `dailyBoards/{gameId}_{day}/entries/{uid}`

Global daily arcade scores. **Create-once** per user per game per day (no updates or deletes).

```json
{
  "uid": "firebaseUid",
  "score": 12345,
  "displayName": "Player",
  "playedAt": "2026-08-01T12:00:00.000Z",
  "gameId": "tiptop",
  "day": "2026-08-01",
  "meta": { "optional": "context" }
}
```

Deploy rules:

```bash
npm install -g firebase-tools
firebase login
firebase use YOUR_FIREBASE_PROJECT_ID
firebase deploy --only firestore:rules
```

---

## Arcade games

### Shared infrastructure

- **`GameShell`**: canvas container, pause menu, daily vs practice mode, score submission, personal and global leaderboards.
- **`gameLoop.ts`**: requestAnimationFrame loop with delta time.
- **`dailySeed(gameId, day)`**: deterministic uint32 seed from `{day}:{gameId}` so all players get the same daily course.
- **`GamePaletteContext`**: per-game color theming.

### Play modes

| Mode | Seeding | Leaderboard | Attempts |
| ---- | ------- | ----------- | -------- |
| **Daily** | `dailySeed()` | Global `dailyBoards` + local `arcadeDaily` | One official run per day |
| **Practice** | Random or game-specific | Personal `gameScores` only | Unlimited (3/day cap planned) |

### Game-specific notes

- **Octane**: daily is always a ¼-mile (402 m) drag; practice supports distance picker and separate board keys (`octane:402`, etc.).
- **Daybreak**: daily mode grants a fixed pool of 10 attempts (`DAILY_DAYBREAK_ATTEMPTS`).
- **TipTop / Dissiada**: seeded obstacle/tile patterns from daily seed.

---

## PWA & offline

Configured in `vite.config.ts` via `vite-plugin-pwa`:

- **Manifest**: standalone display, theme/background colors, 192/512 icons.
- **Service worker**: auto-update, precaches JS/CSS/HTML/assets, `navigateFallback` to `index.html` for SPA routing.
- **Notifications**: `sw-notifications.js` imported into the service worker handles notification taps and FCM background messages. Closed-app routine/note reminders for Google accounts are sent by the `sendReminders` Cloud Function.

Install on mobile: browser menu → **Add to Home Screen**. Runs full-screen and works offline for guest/local data; cloud features need network.

---

## Design system

Inspired by the **IISU launcher** / **3DS eShop**:

- Perforated paper background with soft grey vignette and drifting doodle stickers (`BackgroundDecor`).
- Glossy light **squircle** tiles with colored glow frames (red pulse for priorities).
- Wide **“jump back in”** hero card with circled-Ⓐ pill.
- Segmented capsule tab bars with inset active segment.
- Dashboard rows stay compact: a goal strip reveals its routine icons and a routine row reveals its rating buttons only while pressed (one open at a time); a chevron opens the goal itself.
- Console-style **Ⓐ/Ⓑ/⊖/⊕** control hints (`ScreenHints`, `useControls`).
- Floating bottom **dock** with mint active-tab highlight and LB/RB shoulder pills.
- Typography: _Baloo 2_ / _Nunito_ (rounded display type).
- Loading screen: the app logo over a wordmark whose letters rise and glow one at a time on a repeating wave, so a slow start-up never looks stalled. Glow colour comes from the `--loading-glow` token (blue in light mode, purple in dark).
- Tailwind custom tokens in `index.css` and `tailwind.config.js` (`ink`, `cat-*` category colors, shadows, animations).

---

## Getting started

```bash
npm install
npm run dev      # http://localhost:5173
```

Other scripts:

```bash
npm run build    # tsc -b && vite build (generates service worker)
npm run preview  # preview production build
npm run lint     # tsc --noEmit
```

### Optional: Google sign-in + cloud sync

1. Create an **OAuth 2.0 Web client** in [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials).
2. Add dev/production origins to **Authorized JavaScript origins**.
3. In [Firebase Console](https://console.firebase.google.com):
   - Enable **Authentication → Google** sign-in.
   - Create a **Firestore** database.
   - Copy web app config from **Project settings → Your apps**.
4. Copy `.env.example` → `.env` and fill in all `VITE_*` values.
5. Deploy `firestore.rules` (see above).
6. Add `localhost` and your production domain to **Authentication → Authorized domains**.
7. Restart dev server (or redeploy on Vercel with the same env vars).

**Verify sync:** Sign in with Google, use the app, then check Firestore for `userdata/{your-firebase-uid}` with goals/routines JSON. Console should not show `Firebase sign-in failed` or `Cloud save failed`.

---

## Environment variables

| Variable | Required | Description |
| -------- | -------- | ----------- |
| `VITE_GOOGLE_CLIENT_ID` | For Google sign-in | OAuth 2.0 Web client ID |
| `VITE_FIREBASE_API_KEY` | For cloud sync | Firebase web config |
| `VITE_FIREBASE_AUTH_DOMAIN` | For cloud sync | |
| `VITE_FIREBASE_PROJECT_ID` | For cloud sync | |
| `VITE_FIREBASE_STORAGE_BUCKET` | For cloud sync | |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | For cloud sync | |
| `VITE_FIREBASE_APP_ID` | For cloud sync | |
| `VITE_FIREBASE_VAPID_KEY` | For closed-app push | Web Push certificate (public key) |
| `VITE_PUBLIC_SITE_URL` | For SEO | Canonical origin, no trailing slash |

Leave all blank to run in **guest-only** mode with local storage.

---

## Deployment

### Vercel

`vercel.json` configures SPA rewrites so all routes serve `index.html`:

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

Add all `VITE_*` environment variables in **Project → Settings → Environment Variables**, then deploy. Include `VITE_FIREBASE_VAPID_KEY` and `VITE_PUBLIC_SITE_URL` for push and search.

`middleware.js` rewrites crawler user-agents to `/seo.html` so the in-app experience is unchanged.

### Firebase rules and functions

```bash
cd functions && npm install && cd ..
firebase deploy --only functions,firestore:rules
```

Or `npm run deploy:firebase`. First functions deploy enables Cloud Scheduler on Blaze.

---

## Scripts

| Command | Description |
| ------- | ----------- |
| `npm run dev` | Start Vite dev server with HMR |
| `npm run build` | Type-check and production build |
| `npm run preview` | Serve the production build locally |
| `npm run deploy:firebase` | Build Cloud Functions and deploy functions + Firestore rules |

### Routes

| Path | Screen |
| ---- | ------ |
| `/` | Home: today’s overview, featured routine, quick add |
| `/checkin` | Daily check-in flow (full-screen, no dock) |
| `/goals` | Goals list and detail |
| `/library` | Routine library by category |
| `/notes` | Notes list, editor and reminders |
| `/progress` | Heatmaps, streaks, charts |
| `/games` | Arcade hub |
| `/games/tiptop` | TipTop |
| `/games/octane` | Octane |
| `/games/dissiada` | Dissiada |
| `/games/daybreak` | Daybreak |

---

## License & credits

Private project (`package.json`: `"private": true`). Arcade games, 3DS-inspired UI, and habit-tracking logic are original to this codebase. Background music and game assets live under `public/`.
