# Upscale ⛰️

A reminder / self‑improvement / goal tracker and **progress mapper**, styled after the
**Nintendo 3DS eShop** (and the IISU launcher reference). Build routines, group them under
big goals, do a daily check‑in, and watch your progress level up.

Built with **TypeScript + React + Vite**, and installable on your phone as a **PWA** —
add it to your home screen and it runs full‑screen and offline like a native app.

---

## Features

- **Routines & Goals.** Freely add routines for the things you do. Optionally group
  routines under an overarching **goal** (e.g. _Learn piano_, _Make a PCB_, _Build a
  website_) so their daily ratings roll up into goal progress.
- **Categories.** Exercise, Instrument, Project, Chores, Health, Learning, Other — each
  with its own glossy gradient icon and example tasks.
- **Frequency & end conditions.** Daily, specific weekdays, or every _N_ days. Each
  routine can be **ongoing forever** or **time‑boxed** with an end date.
- **Daily check‑in flow.** You're prompted goal‑by‑goal (then by routine/category). For
  each, you rate — worst → best — how it went today:

  | Rating         | What happens                                                        |
  | -------------- | ------------------------------------------------------------------- |
  | **No**         | Left undone **and flagged as a priority** (red pulsing glow).        |
  | **Not really** | Left in the queue, unchanged.                                       |
  | **Kinda**      | Counts as **done internally**, but stays in the queue.              |
  | **Yes!**       | **Cleared** for the day until its next scheduled date (per frequency). |

  Ratings **refresh daily** and accumulate into each routine's completion stats.
- **Progress mapper.** Per‑routine GitHub‑style contribution heatmaps, current/best
  streaks, completion %, a 30‑day completion chart, and goal‑level progress rings.
- **Google sign‑in (optional)** + guest mode. Your data is scoped to your account.
- **Offline‑first PWA** with auto‑updating service worker. Export/import your data as JSON.

---

## Getting started

```bash
npm install
npm run dev      # http://localhost:5173
```

Other scripts:

```bash
npm run build    # type-check + production build (generates the service worker)
npm run preview  # preview the production build
npm run lint     # tsc --noEmit
```

### Optional: enable Google sign‑in

By default the app runs in **Guest mode** and stores everything locally on the device.
To enable real Google sign‑in:

1. In the [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials),
   create an **OAuth 2.0 Client ID** of type **Web application**.
2. Add your origin(s) to **Authorized JavaScript origins** (e.g. `http://localhost:5173`
   and your deployed URL).
3. Copy `.env.example` to `.env` and set:

   ```
   VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   VITE_FIREBASE_API_KEY=...
   VITE_FIREBASE_AUTH_DOMAIN=...
   VITE_FIREBASE_PROJECT_ID=...
   VITE_FIREBASE_STORAGE_BUCKET=...
   VITE_FIREBASE_MESSAGING_SENDER_ID=...
   VITE_FIREBASE_APP_ID=...
   ```

4. Restart the dev server. The official Google button now appears on the login screen.
   On Vercel, add the same `VITE_*` variables in **Project → Settings → Environment
   Variables**, then redeploy.

> Firebase config enables cross-device sync for Google accounts. Deploy `firestore.rules`
> from this repo. Guest mode stays local-only.

---

## Install on your phone

1. Open the deployed site (or your dev URL) in mobile Chrome / Safari.
2. Use the browser menu → **Add to Home Screen**.
3. Launch it from your home screen — it runs standalone, full‑screen, and offline.

---

## Project structure

```
src/
  lib/           domain logic (types, categories, dates, frequency, rating, stats, storage, auth)
  store/         Zustand store with persistence (useStore.ts)
  components/    reusable UI (IconChip, Dock, Sheet, RatingButtons, Heatmap, forms, …)
  screens/       Login, Home, Check-in, Goals, Library, Progress
  App.tsx        routing + app shell + daily rollover
public/icons/    generated PWA icons (regenerate via scripts/make_icons.py)
```

## Design

The look closely follows the **IISU** launcher (itself inspired by the 3DS eShop):
a perforated "paper" background with a soft grey vignette and scattered hand‑drawn
line‑art **doodle stickers** drifting around the edges; glossy light **squircle** tiles
that gain a coloured glow frame when selected/done (and a red pulsing glow for
priorities); a wide **"jump back in"** hero card with a circled‑Ⓐ pill; segmented
capsule tab bars with an inset active segment; console‑style **Ⓐ/Ⓑ/⊖/⊕** control hints;
and a floating bottom **dock** with a mint highlight on the active tab and LB/RB shoulder
pills. Rounded display type via _Baloo 2_ / _Nunito_.
