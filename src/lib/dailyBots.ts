/**
 * Seeded bot entries for the daily arcade boards so they never look empty.
 * Bots are deterministic per game per day (same on every device) and are
 * merged into the displayed board only - never written to Firestore.
 */

import type { GameId } from "./types";
import type { DailyBoardEntry } from "./dailyLeaderboard";
import { dailySeed } from "./dailyChallenge";

const REGULAR_NAMES = [
  "Tom G",
  "Alex A",
  "Bob C",
  "Mia R",
  "Sam K",
  "Leo P",
  "Nina V",
  "Jess M",
  "Charlie B",
  "Priya S",
  "Owen T",
  "Ruby L",
];

/** Rare cameo names that occasionally sneak onto the board. */
const EASTER_EGG_NAMES = [
  "Ben X",
  "Thierry H",
  "W.D Gaster",
  "Samus O",
  "Daisy D",
  "Falco L",
  "Reggie F",
];

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rand: () => number, list: T[]): T {
  return list[Math.floor(rand() * list.length)];
}

function between(rand: () => number, min: number, max: number): number {
  return min + rand() * (max - min);
}

function medalString(rand: () => number, strong: boolean): string {
  const pool: string[] = strong
    ? ["gold", "gold", "silver", "bronze"]
    : ["silver", "bronze", "bronze", "none", "none"];
  return Array.from({ length: 3 }, () => pick(rand, pool)).join(",");
}

interface BotRun {
  score: number;
  meta: Record<string, string>;
}

function rollRun(gameId: GameId, rand: () => number): BotRun {
  if (gameId === "tiptop") {
    const cleared = rand() < 0.55;
    if (cleared) {
      const score = Math.round(between(rand, 5200, 9550));
      const timeSec = Math.round(between(rand, 32, 95));
      return {
        score,
        meta: {
          Medals: medalString(rand, score > 8200),
          Time: `${timeSec}s`,
        },
      };
    }
    const score = Math.round(between(rand, 60, 370));
    return {
      score,
      meta: {
        Medals: medalString(rand, false),
        Time: `${Math.round(between(rand, 8, 40))}s`,
      },
    };
  }

  if (gameId === "octane") {
    const elapsedSec = between(rand, 12.5, 19.5);
    const topMph = Math.round(between(rand, 108, 162));
    const score = Math.round((402 / elapsedSec) * 5.5 + topMph * 3.2);
    return {
      score,
      meta: {
        "Top speed": `${topMph} mph`,
        Time: `${elapsedSec.toFixed(2)}s`,
      },
    };
  }

  if (gameId === "dissiada") {
    const notes = Math.round(between(rand, 18, 90));
    const score = Math.round(notes * between(rand, 1.1, 1.9));
    const maxCombo = Math.round(between(rand, 4, Math.max(6, notes * 0.6)));
    return {
      score,
      meta: {
        "Max combo": String(maxCombo),
        Notes: String(notes),
      },
    };
  }

  if (gameId === "spacewalk") {
    const survived = rand() < 0.4;
    if (survived) {
      const portals = Math.round(between(rand, 14, 30));
      const flips = Math.round(between(rand, portals, portals * 1.6));
      const score = 8000 + Math.max(0, 2000 - portals * 60);
      return {
        score,
        meta: { Flips: String(flips), Time: "30.0s" },
      };
    }
    const timeSec = between(rand, 6, 27);
    const flips = Math.round(timeSec * between(rand, 0.4, 0.9));
    return {
      score: Math.round(timeSec * 100),
      meta: { Flips: String(flips), Time: `${timeSec.toFixed(1)}s` },
    };
  }

  if (gameId === "accretion") {
    const finished = rand() < 0.45;
    if (finished) {
      const junk = Math.round(between(rand, 8, 26));
      const timeSec = between(rand, 16.5, 19.8);
      const score = 3000 + junk * 120 + Math.round(between(rand, 40, 700));
      return {
        score,
        meta: { Junk: String(junk), Time: `${timeSec.toFixed(1)}s` },
      };
    }
    const junk = Math.round(between(rand, 3, 16));
    return {
      score: junk * 120 + Math.round(between(rand, 100, 700)),
      meta: { Junk: String(junk), Time: "20.0s" },
    };
  }

  // daybreak
  const completed = rand() < 0.35;
  const progress = completed ? 100 : Math.round(between(rand, 15, 92));
  const score = completed
    ? Math.round(between(rand, 3200, 8200))
    : Math.round(progress * between(rand, 18, 42));
  return {
    score,
    meta: {
      Attempts: String(Math.round(between(rand, 1, 10))),
      Progress: `${progress}%`,
    },
  };
}

/** Deterministic bot board entries for one game and day (3-5 bots). */
export function dailyBotEntries(gameId: GameId, day: string): DailyBoardEntry[] {
  // Offset from the level seed so bots don't correlate with course layout.
  const rand = mulberry32((dailySeed(gameId, day) ^ 0x9e3779b9) >>> 0);
  const count = 3 + Math.floor(rand() * 3);

  const names: string[] = [];
  const regulars = [...REGULAR_NAMES];
  for (let i = 0; i < count; i++) {
    if (rand() < 0.08 && EASTER_EGG_NAMES.length > 0) {
      names.push(pick(rand, EASTER_EGG_NAMES));
    } else {
      const idx = Math.floor(rand() * regulars.length);
      names.push(regulars.splice(idx, 1)[0]);
    }
  }

  return names.map((name, i) => {
    const run = rollRun(gameId, rand);
    const hour = 6 + Math.floor(rand() * 14);
    const minute = Math.floor(rand() * 60);
    return {
      uid: `bot:${gameId}:${day}:${i}`,
      score: run.score,
      displayName: name,
      playedAt: `${day}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00.000Z`,
      gameId,
      day,
      meta: run.meta,
    };
  });
}

/** True for entries generated by `dailyBotEntries`. */
export function isBotEntry(entry: DailyBoardEntry): boolean {
  return entry.uid.startsWith("bot:");
}

/** Merge real board entries with the day's bots, best score first. */
export function withDailyBots(
  entries: DailyBoardEntry[],
  gameId: GameId,
  day: string,
): DailyBoardEntry[] {
  return [...entries, ...dailyBotEntries(gameId, day)].sort(
    (a, b) => b.score - a.score,
  );
}
