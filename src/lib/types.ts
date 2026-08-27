// ---- Core domain types for Upscale ----

export type CategoryKey =
  | "exercise"
  | "instrument"
  | "project"
  | "chores"
  | "health"
  | "learning"
  | "relax"
  | "other";

/** The 4-level daily rating, ordered worst -> best. */
export type Rating = "no" | "not_really" | "kinda" | "yes";

export type FrequencyType = "daily" | "weekly" | "interval";

export interface Frequency {
  type: FrequencyType;
  /** weekly: days of week the routine is due, 0 = Sunday .. 6 = Saturday. */
  daysOfWeek?: number[];
  /** interval: due every N days from the start (or last completion). */
  intervalDays?: number;
}

export interface Goal {
  id: string;
  title: string;
  description?: string;
  icon: string; // emoji
  color: string; // hex accent
  createdAt: string; // ISO
  /** ISO timestamp of last edit (for per-entity cloud merge). */
  updatedAt?: string;
  targetDate?: string; // optional ISO deadline
  archived?: boolean;
}

export interface Routine {
  id: string;
  title: string;
  note?: string;
  category: CategoryKey;
  icon: string; // emoji
  color: string; // hex accent (defaults from category)
  frequency: Frequency;
  /** If false the routine is ongoing forever. If true it stops at endDate. */
  hasEnd: boolean;
  endDate?: string; // ISO date (YYYY-MM-DD)
  /** Optional goal this routine contributes toward. */
  goalId?: string | null;
  /** Optional daily reminder time in 24h HH:mm (device local timezone). */
  reminderTime?: string;
  createdAt: string; // ISO
  /** ISO timestamp of last edit (for per-entity cloud merge). */
  updatedAt?: string;
  archived?: boolean;
}

export interface Note {
  id: string;
  title: string;
  body: string;
  color: string; // hex accent
  /** Optional one-off reminder as a local ISO datetime (YYYY-MM-DDTHH:mm). */
  reminderAt?: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO
  /** Tombstone so deletes survive cloud union-merge across devices. */
  deletedAt?: string;
}

export function activeNotes(notes: Note[] | undefined): Note[] {
  return (notes ?? []).filter((n) => !n.deletedAt);
}

/** A single routine's outcome on a given day. */
export interface DayEntry {
  rating: Rating;
  /** "kinda" or "yes" => counts as a completion for stats. */
  completed: boolean;
  /** "no" => flagged as a priority (red glow). */
  priority: boolean;
  /** "yes" => cleared from the queue until the next due date. */
  cleared: boolean;
  ratedAt: string; // ISO timestamp
}

/** All entries logged on a single calendar day. */
export interface DayLog {
  date: string; // YYYY-MM-DD
  entries: Record<string /* routineId */, DayEntry>;
}

export interface AppData {
  goals: Goal[];
  routines: Routine[];
  /** Keyed by YYYY-MM-DD. */
  logs: Record<string, DayLog>;
  /** Free-form notes with optional reminders. */
  notes: Note[];
  /** The last day the user opened/refreshed the app (YYYY-MM-DD). */
  lastActiveDate?: string;
  /** Daily arcade play counts (resets each calendar day). */
  gamePlays?: GamePlaysState;
  /** Pro subscription: unlimited endless plays (synced from RevenueCat / Stripe). */
  gamePremium?: boolean;
  /** ISO timestamp of last local/cloud save (for sync). */
  syncedAt?: string;
  /** Per-game high scores keyed by game id or sub-key (e.g. `octane:402`). */
  gameScores?: Record<string, GameScoreEntry[]>;
  /** One official daily attempt per game per local calendar day. */
  arcadeDaily?: ArcadeDailyState;
  /** Global board display name preference. */
  arcadeProfile?: ArcadeProfile;
  /** Play Token ledger (habits fund the arcade). */
  wallet?: TokenWallet;
  /** Cosmetic unlocks bought with tokens. */
  arcadeUnlocks?: ArcadeUnlocks;
  /** Last TipTop (etc.) ghost traces kept across daily rollover. */
  lastGhosts?: Partial<
    Record<GameId, { day: string; trace: number[]; score: number }>
  >;
  /** ISO week key (e.g. 2026-W12) of the last weekly recap the user saw. */
  lastRecapWeek?: string;
  version: number;
}

export interface ArcadeDailyCompletion {
  score: number;
  playedAt: string;
  /** Compact TipTop flap-time trace for ghost races (ms from run start). */
  ghostTrace?: number[];
  /** True when a continue-credit was already used on this daily run. */
  continued?: boolean;
}

export interface ArcadeDailyState {
  date: string;
  completed: Partial<Record<GameId, ArcadeDailyCompletion>>;
}

export type TokenReason =
  | "starter"
  | "checkin"
  | "clear_day"
  | "streak_milestone"
  | "endless"
  | "continue"
  | "palette"
  | "grace_earn"
  | "grace_spend";

export interface TokenTxn {
  id: string;
  amount: number;
  reason: TokenReason;
  /** Local calendar day YYYY-MM-DD. */
  date: string;
  createdAt: string;
}

export interface TokenWallet {
  txns: TokenTxn[];
}

export interface ArcadeUnlocks {
  /** Unlocked palette ids. */
  palettes: string[];
  /** Equipped palette id per game (falls back to theme default). */
  equipped: Partial<Record<GameId, string>>;
}

export interface ArcadeProfile {
  /** Public board name; null when opted out (shows as Anonymous). */
  username: string | null;
  /** When true, post scores as Anonymous. */
  optedOut: boolean;
  /** True after the user has seen the username prompt at least once. */
  prompted: boolean;
}

export type GameId = "tiptop" | "octane" | "dissiada" | "daybreak";

export interface GamePlaysState {
  date: string;
  /** Total endless-mode runs today across all arcade games. */
  endlessTotal: number;
  /** Legacy per-game counts (migrated to endlessTotal on read). */
  counts?: Partial<Record<GameId, number>>;
}

/** A single saved high-score run for an arcade game. */
export interface GameScoreEntry {
  score: number;
  /** ISO timestamp when the run ended. */
  playedAt: string;
  /** Optional context (e.g. Octane race distance label). */
  meta?: Record<string, string>;
}

export interface User {
  id: string;
  name: string;
  email?: string;
  picture?: string;
  provider: "google" | "guest";
}

export const emptyAppData = (): AppData => ({
  goals: [],
  routines: [],
  logs: {},
  notes: [],
  version: 1,
});
