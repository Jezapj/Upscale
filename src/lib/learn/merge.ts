import type { LearnCard, LearnDeck, LearnReview, LearnState } from "../types";
import { emptyLearnState } from "../types";

function stamp(entity: { updatedAt?: string; createdAt: string; deletedAt?: string }): string {
  const updated = entity.updatedAt || entity.createdAt || "";
  const deleted = entity.deletedAt || "";
  return deleted > updated ? deleted : updated;
}

function mergeDecks(a: LearnDeck[], b: LearnDeck[]): LearnDeck[] {
  const map = new Map<string, LearnDeck>();
  for (const d of [...a, ...b]) {
    const existing = map.get(d.id);
    if (!existing || stamp(d) >= stamp(existing)) map.set(d.id, d);
  }
  return [...map.values()];
}

function mergeCards(a: LearnCard[], b: LearnCard[]): LearnCard[] {
  const map = new Map<string, LearnCard>();
  for (const c of [...a, ...b]) {
    const existing = map.get(c.id);
    if (!existing || stamp(c) >= stamp(existing)) map.set(c.id, c);
  }
  return [...map.values()];
}

function mergeReviews(a: LearnReview[], b: LearnReview[]): LearnReview[] {
  const map = new Map<string, LearnReview>();
  for (const r of [...a, ...b]) map.set(r.id, r);
  return [...map.values()].sort((x, y) => x.reviewedAt.localeCompare(y.reviewedAt));
}

export function mergeLearn(
  a: LearnState | undefined,
  b: LearnState | undefined,
): LearnState | undefined {
  if (!a && !b) return undefined;
  const left = a ?? emptyLearnState();
  const right = b ?? emptyLearnState();
  return {
    decks: mergeDecks(left.decks, right.decks),
    cards: mergeCards(left.cards, right.cards),
    reviews: mergeReviews(left.reviews, right.reviews),
  };
}
