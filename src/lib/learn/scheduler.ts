import type {
  AppData,
  LearnCard,
  LearnDeck,
  LearnGrade,
  LearnReview,
  LearnState,
} from "../types";
import { emptyLearnState, studyLearnCards } from "../types";
import { daysBetween, shiftDay, todayKey } from "../dates";

export const DEFAULT_NEW_PER_SESSION = 10;
export const DEFAULT_SESSION_SIZE = 20;

const HARD_GROWTH = 1.2;
const GOOD_GROWTH = 2.5;
const EASY_GROWTH = 3.5;
const MIN_STABILITY = 1;
const LEARNING_AGAIN_STABILITY = 0.5;
const NEW_EASY_INTERVAL = 4;

export function ensureLearn(data: AppData): LearnState {
  return data.learn ?? emptyLearnState();
}

export function defaultDeckFields(): Pick<
  LearnDeck,
  "newPerSession" | "sessionSize" | "icon" | "color"
> {
  return {
    newPerSession: DEFAULT_NEW_PER_SESSION,
    sessionSize: DEFAULT_SESSION_SIZE,
    icon: "🎓",
    color: "#4aa3ff",
  };
}

export function makeNewCard(
  deckId: string,
  front: string,
  back: string,
  today: string = todayKey(),
  now: string = new Date().toISOString(),
): Omit<LearnCard, "id"> {
  return {
    deckId,
    front,
    back,
    phase: "new",
    due: today,
    stability: 0,
    reps: 0,
    lapses: 0,
    createdAt: now,
    updatedAt: now,
  };
}

function hash01(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

/** ±5% fuzz so imported decks do not clump on one day. */
function fuzzDays(days: number, cardId: string): number {
  if (days < 2) return days;
  const jitter = (hash01(cardId) - 0.5) * 0.1;
  return Math.max(1, days * (1 + jitter));
}

function dueLoadOn(
  cards: LearnCard[],
  deckId: string,
  day: string,
  excludeId?: string,
): number {
  let n = 0;
  for (const c of cards) {
    if (c.deletedAt || c.deckId !== deckId || c.id === excludeId) continue;
    if (c.due === day) n++;
  }
  return n;
}

/** Shift toward the lightest nearby day (±2) to spread backlog. */
function loadBalanceDue(
  cards: LearnCard[],
  deckId: string,
  cardId: string,
  target: string,
): string {
  let best = target;
  let bestLoad = dueLoadOn(cards, deckId, target, cardId);
  for (const delta of [-2, -1, 1, 2]) {
    const day = shiftDay(target, delta);
    if (day < target && delta < 0) continue;
    const load = dueLoadOn(cards, deckId, day, cardId);
    if (load < bestLoad) {
      bestLoad = load;
      best = day;
    }
  }
  return best;
}

function roundInterval(days: number): number {
  if (days < 1) return 0;
  return Math.max(1, Math.round(days));
}

export function previewIntervals(
  card: LearnCard,
  today: string = todayKey(),
): Record<LearnGrade, string> {
  const next = {
    again: gradeCard(card, "again", today),
    hard: gradeCard(card, "hard", today),
    good: gradeCard(card, "good", today),
    easy: gradeCard(card, "easy", today),
  };
  const label = (c: LearnCard) => {
    const gap = daysBetween(today, c.due);
    if (gap <= 0) return "<1d";
    if (gap === 1) return "1d";
    return `${gap}d`;
  };
  return {
    again: label(next.again),
    hard: label(next.hard),
    good: label(next.good),
    easy: label(next.easy),
  };
}

/**
 * Stability-based SM-2 variant: Again halves interval (floor 1d) instead of
 * compounding an ease penalty, so lapsed cards recover instead of entering
 * "ease hell".
 */
export function gradeCard(
  card: LearnCard,
  grade: LearnGrade,
  today: string = todayKey(),
  siblings: LearnCard[] = [],
): LearnCard {
  const now = new Date().toISOString();
  const elapsed = Math.max(0, daysBetween(card.due, today));
  let phase = card.phase;
  let stability = card.stability;
  let intervalDays = 0;
  let lapses = card.lapses;

  if (grade === "again") {
    lapses = card.phase === "review" ? card.lapses + 1 : card.lapses;
    phase = "learning";
    if (card.phase === "review" && card.stability > 0) {
      stability = Math.max(MIN_STABILITY, card.stability * 0.5);
    } else {
      stability = LEARNING_AGAIN_STABILITY;
    }
    intervalDays = 0;
  } else if (card.phase === "new" || card.phase === "learning") {
    if (grade === "hard") {
      phase = "learning";
      stability = MIN_STABILITY;
      intervalDays = 1;
    } else if (grade === "good") {
      phase = "review";
      intervalDays = card.stability >= MIN_STABILITY ? Math.max(2, Math.round(card.stability)) : 1;
      stability = intervalDays;
    } else {
      phase = "review";
      intervalDays = NEW_EASY_INTERVAL;
      stability = NEW_EASY_INTERVAL;
    }
  } else {
    const grown =
      grade === "hard"
        ? Math.max(MIN_STABILITY, card.stability * HARD_GROWTH)
        : grade === "good"
          ? Math.max(2, card.stability * GOOD_GROWTH)
          : Math.max(NEW_EASY_INTERVAL, card.stability * EASY_GROWTH);
    const scheduled = grown + elapsed * 0.5;
    stability = grown;
    intervalDays = roundInterval(fuzzDays(scheduled, card.id));
    phase = "review";
  }

  let due = intervalDays <= 0 ? today : shiftDay(today, intervalDays);
  if (intervalDays >= 2) {
    due = loadBalanceDue(siblings, card.deckId, card.id, due);
  }

  return {
    ...card,
    phase,
    due,
    stability,
    reps: card.reps + 1,
    lapses,
    updatedAt: now,
  };
}

export function makeReview(
  card: LearnCard,
  grade: LearnGrade,
  today: string = todayKey(),
  reviewedAt: string = new Date().toISOString(),
): LearnReview {
  return {
    id: `review:${card.id}:${reviewedAt}`,
    cardId: card.id,
    deckId: card.deckId,
    grade,
    date: today,
    reviewedAt,
    elapsedDays: Math.max(0, daysBetween(card.due, today)),
  };
}

export interface DueCounts {
  new: number;
  due: number;
  session: number;
  remainingAfterSession: number;
}

export function deckDueCounts(
  data: AppData,
  deck: LearnDeck,
  today: string = todayKey(),
): DueCounts {
  const cards = studyLearnCards(data.learn?.cards).filter((c) => c.deckId === deck.id);
  const news = cards.filter((c) => c.phase === "new");
  const due = cards.filter((c) => c.phase !== "new" && c.due <= today);
  const newQueued = Math.min(news.length, deck.newPerSession);
  const dueQueued = Math.min(due.length, deck.sessionSize);
  const session = newQueued + dueQueued;
  return {
    new: news.length,
    due: due.length,
    session,
    remainingAfterSession: Math.max(0, due.length - dueQueued + news.length - newQueued),
  };
}

export function dueCounts(
  data: AppData,
  today: string = todayKey(),
): Record<string, DueCounts> & { all: DueCounts } {
  const decks = (data.learn?.decks ?? []).filter((d) => !d.archived);
  const per: Record<string, DueCounts> = {};
  const all: DueCounts = { new: 0, due: 0, session: 0, remainingAfterSession: 0 };
  for (const deck of decks) {
    const c = deckDueCounts(data, deck, today);
    per[deck.id] = c;
    all.new += c.new;
    all.due += c.due;
    all.session += c.session;
    all.remainingAfterSession += c.remainingAfterSession;
  }
  return { ...per, all };
}

export interface StudySessionPlan {
  deck: LearnDeck;
  cards: LearnCard[];
  counts: DueCounts;
}

export function buildSession(
  data: AppData,
  deckId: string,
  today: string = todayKey(),
): StudySessionPlan | null {
  const deck = data.learn?.decks.find((d) => d.id === deckId && !d.archived);
  if (!deck) return null;
  const cards = studyLearnCards(data.learn?.cards).filter((c) => c.deckId === deckId);
  const due = cards
    .filter((c) => c.phase !== "new" && c.due <= today)
    .sort((a, b) => a.due.localeCompare(b.due) || a.createdAt.localeCompare(b.createdAt))
    .slice(0, deck.sessionSize);
  const news = cards
    .filter((c) => c.phase === "new")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(0, deck.newPerSession);
  const mixed: LearnCard[] = [];
  const max = Math.max(due.length, news.length);
  for (let i = 0; i < max; i++) {
    if (due[i]) mixed.push(due[i]);
    if (news[i]) mixed.push(news[i]);
  }
  return { deck, cards: mixed, counts: deckDueCounts(data, deck, today) };
}

export function learnStudyStreak(reviews: LearnReview[] | undefined, today: string = todayKey()): number {
  if (!reviews?.length) return 0;
  const days = new Set(reviews.map((r) => r.date));
  let streak = 0;
  let cursor = today;
  while (days.has(cursor)) {
    streak++;
    cursor = shiftDay(cursor, -1);
  }
  return streak;
}
