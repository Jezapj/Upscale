// ---- Core domain types for Upscale ----

export type CategoryKey =
  | "exercise"
  | "instrument"
  | "project"
  | "chores"
  | "health"
  | "learning"
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
  createdAt: string; // ISO
  archived?: boolean;
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
  /** The last day the user opened/refreshed the app (YYYY-MM-DD). */
  lastActiveDate?: string;
  version: number;
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
  version: 1,
});
