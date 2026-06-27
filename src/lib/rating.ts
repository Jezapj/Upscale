import type { DayEntry, Rating } from "./types";

export interface RatingMeta {
  key: Rating;
  label: string;
  short: string;
  emoji: string;
  color: string;
  /** describes what happens to the task. */
  effect: string;
}

/** Ordered worst -> best, matching the requested flow. */
export const RATINGS: RatingMeta[] = [
  {
    key: "no",
    label: "No",
    short: "No",
    emoji: "✕",
    color: "#ff5a5a",
    effect: "Left undone & flagged as a priority",
  },
  {
    key: "not_really",
    label: "Not really",
    short: "Meh",
    emoji: "🌥️",
    color: "#ff9f43",
    effect: "Stays in your queue as-is",
  },
  {
    key: "kinda",
    label: "Kinda",
    short: "Kinda",
    emoji: "👍",
    color: "#4aa3ff",
    effect: "Counts as done, but stays in the queue",
  },
  {
    key: "yes",
    label: "Yes!",
    short: "Yes",
    emoji: "✓",
    color: "#2bc4a8",
    effect: "Cleared until its next scheduled day",
  },
];

export const RATING_BY_KEY: Record<Rating, RatingMeta> = RATINGS.reduce(
  (acc, r) => {
    acc[r.key] = r;
    return acc;
  },
  {} as Record<Rating, RatingMeta>,
);

/** Turn a chosen rating into a stored day entry following the rules:
 *  no         -> undone + priority (red glow), stays
 *  not really -> unchanged, stays
 *  kinda      -> completed internally, stays in queue
 *  yes        -> completed + cleared for the day until refresh
 */
export function buildEntry(rating: Rating): DayEntry {
  return {
    rating,
    completed: rating === "kinda" || rating === "yes",
    priority: rating === "no",
    cleared: rating === "yes",
    ratedAt: new Date().toISOString(),
  };
}
