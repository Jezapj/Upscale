import { create } from "zustand";
import type {
  AppData,
  ArcadeProfile,
  GameId,
  GameScoreEntry,
  Goal,
  LearnCard,
  LearnDeck,
  LearnGrade,
  Note,
  Rating,
  Routine,
  User,
} from "@/lib/types";
import { emptyLearnState } from "@/lib/types";
import { emptyAppData } from "@/lib/types";
import { storage } from "@/lib/storage";
import { todayKey } from "@/lib/dates";
import { buildEntry } from "@/lib/rating";
import { signOutGoogle } from "@/lib/auth";
import { signOut as firebaseSignOut } from "firebase/auth";
import { getFirebaseAuth, cloudConfigured } from "@/lib/firebase";
import { waitForFirebaseAuth } from "@/lib/firebaseAuth";
import {
  canPlayGame,
  endlessPlaysRemaining,
  playsRemaining,
  recordGamePlay,
} from "@/lib/gamePlays";
import { recordGameScore as mergeGameScore, getGameScores } from "@/lib/gameLeaderboard";
import { isCloudUser, mergeLocalAndCloud, loadCloudData } from "@/lib/cloudSync";
import { clearFiredReminder, noteReminderId } from "@/lib/reminders";
import { markDailyPlayed as applyDailyPlayed } from "@/lib/dailyChallenge";
import { alignGoogleUserWithFirebase } from "@/lib/storage";
import {
  applyCheckinEarnings,
  applyDailySession,
  applyLearnSessionEarnings,
  applyLoginBonus,
  equipPalette as applyEquipPalette,
  spendContinueTxnId,
  spendTokens,
  TOKEN_COST_CONTINUE,
  tokenBalance as getTokenBalance,
  unlockPalette as applyUnlockPalette,
  type UnlockablePaletteId,
} from "@/lib/economy";
import {
  defaultDeckFields,
  ensureLearn,
  gradeCard,
  makeNewCard,
  makeReview,
} from "@/lib/learn/scheduler";
import {
  deleteLearnMedia,
  mediaKeysForCard,
  putLearnMedia,
} from "@/lib/learn/media";

const uid = () => crypto.randomUUID();

export interface TokenEarnEvent {
  id: string;
  amount: number;
  at: number;
}

interface StoreState {
  user: User | null;
  data: AppData;
  ready: boolean;
  signingIn: boolean;
  today: string;
  /** Latest token earn pulse for toast UI. */
  lastTokenEarn: TokenEarnEvent | null;
  /** In-memory undo for the last flashcard grade. */
  lastLearnUndo: { before: LearnCard; reviewId: string } | null;
  /** Daily login bonus sheet (auto once per day, or from Arcade). */
  loginBonusOpen: boolean;

  init: () => Promise<void>;
  signIn: (user: User) => Promise<void>;
  signOut: () => void;

  addGoal: (g: Omit<Goal, "id" | "createdAt" | "updatedAt">) => Goal;
  updateGoal: (id: string, patch: Partial<Goal>) => void;
  deleteGoal: (id: string) => void;

  addRoutine: (r: Omit<Routine, "id" | "createdAt" | "updatedAt">) => Routine;
  updateRoutine: (id: string, patch: Partial<Routine>) => void;
  deleteRoutine: (id: string) => void;

  addNote: (n: Omit<Note, "id" | "createdAt" | "updatedAt">) => Note;
  updateNote: (id: string, patch: Partial<Note>) => void;
  deleteNote: (id: string) => void;

  rate: (routineId: string, rating: Rating) => void;
  clearRating: (routineId: string) => void;

  refreshToday: () => void;

  gamePlaysLeft: (gameId: GameId) => number;
  canPlay: (gameId: GameId) => boolean;
  consumePlay: (gameId: GameId) => boolean;

  recordGameScore: (
    key: string,
    score: number,
    meta?: Record<string, string>,
  ) => boolean;
  getLeaderboard: (key: string) => GameScoreEntry[];

  markDailyPlayed: (
    gameId: GameId,
    score: number,
    overwrite?: boolean,
    extras?: { ghostTrace?: number[]; continued?: boolean },
  ) => void;
  setArcadeProfile: (profile: ArcadeProfile) => void;
  setGamePremium: (premium: boolean) => void;
  endlessPlaysLeft: () => number;
  tokenBalance: () => number;
  buyContinue: (gameId: GameId) => boolean;
  unlockPalette: (paletteId: UnlockablePaletteId) => boolean;
  equipPalette: (gameId: GameId, paletteId: UnlockablePaletteId | null) => void;
  setLastRecapWeek: (weekKey: string) => void;
  clearTokenEarn: () => void;
  openLoginBonus: () => void;
  closeLoginBonus: () => void;
  claimLoginBonus: () => void;
  pullFromCloud: () => Promise<void>;

  addDeck: (d: Omit<LearnDeck, "id" | "createdAt" | "updatedAt">) => LearnDeck;
  updateDeck: (id: string, patch: Partial<LearnDeck>) => void;
  deleteDeck: (id: string) => void;
  addCard: (c: Omit<LearnCard, "id" | "createdAt" | "updatedAt" | "phase" | "due" | "stability" | "reps" | "lapses"> & Partial<LearnCard>) => LearnCard;
  updateCard: (id: string, patch: Partial<LearnCard>) => void;
  deleteCard: (id: string) => void;
  dismissCard: (id: string) => void;
  importDeck: (
    deck: Omit<LearnDeck, "id" | "createdAt" | "updatedAt">,
    cards: { front: string; back: string; audio?: Blob; image?: Blob }[],
  ) => Promise<LearnDeck>;
  reviewCard: (cardId: string, grade: LearnGrade) => void;
  undoLastReview: () => boolean;
  completeStudySession: (deckId: string) => void;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let saveChain: Promise<void> = Promise.resolve();;

async function syncUserData(userId: string): Promise<AppData> {
  if (isCloudUser(userId) && cloudConfigured()) {
    await waitForFirebaseAuth(8000);
  }
  return storage.loadData(userId);
}

export const useStore = create<StoreState>((set, get) => {
  const persist = () => {
    const { user } = get();
    if (!user) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveChain = saveChain
        .then(async () => {
          const snapshot = get();
          if (!snapshot.user) return;
          // Fast local-only save for debounced persist - no cloud round-trip
          await storage.saveData(snapshot.user.id, snapshot.data, {
            skipCloudSync: true,
          });
        })
        .catch((err) => {
          console.warn("Local save failed", err);
        });
    }, 150);
  };

  const mutate = (fn: (d: AppData) => AppData) => {
    set((s) => ({ data: fn(s.data) }));
    persist();
  };

  return {
    user: null,
    data: emptyAppData(),
    ready: false,
    signingIn: false,
    today: todayKey(),
    lastTokenEarn: null,
    lastLearnUndo: null,
    loginBonusOpen: false,

    async init() {
      let user = storage.getUser();
      if (user) {
        if (isCloudUser(user.id) && cloudConfigured()) {
          await waitForFirebaseAuth(8000);
          user = alignGoogleUserWithFirebase(user);
          storage.setUser(user);
          try {
            const synced = await syncUserData(user.id);
            set({ user, data: applyDailySession(synced), today: todayKey() });
            get().refreshToday();
          } catch (err) {
            console.warn("Cloud sync failed", err);
            const data = storage.loadLocalData(user.id);
            set({ user, data: applyDailySession(data), today: todayKey() });
            get().refreshToday();
          }
        } else {
          const data = storage.loadLocalData(user.id);
          set({ user, data: applyDailySession(data), today: todayKey() });
          get().refreshToday();
        }
      }
      set({ ready: true });
    },

    async signIn(user) {
      set({ signingIn: true });
      try {
        if (isCloudUser(user.id) && cloudConfigured()) {
          await waitForFirebaseAuth(8000);
          user = alignGoogleUserWithFirebase(user);
        }
        storage.setUser(user);
        if (isCloudUser(user.id) && cloudConfigured()) {
          try {
            const synced = await syncUserData(user.id);
            set({ user, data: applyDailySession(synced), today: todayKey() });
          } catch (err) {
            console.warn("Cloud sync failed", err);
            set({
              user,
              data: applyDailySession(storage.loadLocalData(user.id)),
              today: todayKey(),
            });
          }
        } else {
          set({
            user,
            data: applyDailySession(storage.loadLocalData(user.id)),
            today: todayKey(),
          });
        }
        get().refreshToday();
      } finally {
        set({ signingIn: false });
      }
    },

    signOut() {
      signOutGoogle();
      if (cloudConfigured()) {
        const auth = getFirebaseAuth();
        if (auth) void firebaseSignOut(auth);
      }
      storage.setUser(null);
      set({ user: null, data: emptyAppData(), lastTokenEarn: null, lastLearnUndo: null, loginBonusOpen: false });
    },

    addGoal(g) {
      const now = new Date().toISOString();
      const goal: Goal = { ...g, id: uid(), createdAt: now, updatedAt: now };
      mutate((d) => ({ ...d, goals: [...d.goals, goal] }));
      return goal;
    },
    updateGoal(id, patch) {
      const now = new Date().toISOString();
      mutate((d) => ({
        ...d,
        goals: d.goals.map((g) =>
          g.id === id ? { ...g, ...patch, updatedAt: now } : g,
        ),
      }));
    },
    deleteGoal(id) {
      const now = new Date().toISOString();
      mutate((d) => {
        const learn = d.learn
          ? {
              ...d.learn,
              decks: d.learn.decks.map((deck) =>
                deck.goalId === id ? { ...deck, goalId: null, updatedAt: now } : deck,
              ),
            }
          : d.learn;
        return {
          ...d,
          goals: d.goals.filter((g) => g.id !== id),
          routines: d.routines.map((r) =>
            r.goalId === id ? { ...r, goalId: null, updatedAt: now } : r,
          ),
          learn,
        };
      });
    },

    addRoutine(r) {
      const now = new Date().toISOString();
      const routine: Routine = {
        ...r,
        id: uid(),
        createdAt: now,
        updatedAt: now,
      };
      mutate((d) => ({ ...d, routines: [...d.routines, routine] }));
      return routine;
    },
    updateRoutine(id, patch) {
      if ("reminderTime" in patch) clearFiredReminder(id);
      const now = new Date().toISOString();
      mutate((d) => ({
        ...d,
        routines: d.routines.map((r) =>
          r.id === id ? { ...r, ...patch, updatedAt: now } : r,
        ),
      }));
    },
    deleteRoutine(id) {
      mutate((d) => {
        const logs = { ...d.logs };
        for (const key of Object.keys(logs)) {
          if (logs[key].entries[id]) {
            const entries = { ...logs[key].entries };
            delete entries[id];
            logs[key] = { ...logs[key], entries };
          }
        }
        return { ...d, routines: d.routines.filter((r) => r.id !== id), logs };
      });
    },

    addNote(n) {
      const now = new Date().toISOString();
      const note: Note = { ...n, id: uid(), createdAt: now, updatedAt: now };
      mutate((d) => ({ ...d, notes: [note, ...(d.notes ?? [])] }));
      return note;
    },
    updateNote(id, patch) {
      if ("reminderAt" in patch) clearFiredReminder(noteReminderId(id));
      mutate((d) => ({
        ...d,
        notes: (d.notes ?? []).map((n) =>
          n.id === id ? { ...n, ...patch, updatedAt: new Date().toISOString() } : n,
        ),
      }));
    },
    deleteNote(id) {
      clearFiredReminder(noteReminderId(id));
      const now = new Date().toISOString();
      mutate((d) => ({
        ...d,
        notes: (d.notes ?? []).map((n) =>
          n.id === id ? { ...n, deletedAt: now, updatedAt: now } : n,
        ),
      }));
    },

    rate(routineId, rating) {
      const key = todayKey();
      let earned = 0;
      mutate((d) => {
        const log = d.logs[key] ?? { date: key, entries: {} };
        const withLog: AppData = {
          ...d,
          logs: {
            ...d.logs,
            [key]: {
              ...log,
              entries: { ...log.entries, [routineId]: buildEntry(rating) },
            },
          },
        };
        if (rating !== "kinda" && rating !== "yes") return withLog;
        const result = applyCheckinEarnings(withLog, routineId, key);
        earned = result.earned;
        return result.data;
      });
      if (earned > 0) {
        set({
          lastTokenEarn: {
            id: crypto.randomUUID(),
            amount: earned,
            at: Date.now(),
          },
        });
      }
    },

    clearRating(routineId) {
      const key = todayKey();
      mutate((d) => {
        const log = d.logs[key];
        if (!log?.entries[routineId]) return d;
        const entries = { ...log.entries };
        delete entries[routineId];
        return { ...d, logs: { ...d.logs, [key]: { ...log, entries } } };
      });
    },

    refreshToday() {
      const key = todayKey();
      set({ today: key });
      mutate((d) => applyDailySession(d, key));
    },

    gamePlaysLeft(gameId) {
      const { data, today } = get();
      return playsRemaining(data, gameId, today);
    },

    endlessPlaysLeft() {
      const { data, today } = get();
      return endlessPlaysRemaining(data, today);
    },

    canPlay(gameId) {
      const { data, today } = get();
      return canPlayGame(data, gameId, today);
    },

    consumePlay(gameId) {
      const { data, today } = get();
      if (!canPlayGame(data, gameId, today)) return false;
      let ok = false;
      mutate((d) => {
        const next = recordGamePlay(d, gameId, today);
        if (!next) return d;
        ok = true;
        return next;
      });
      return ok;
    },

    recordGameScore(key, score, meta) {
      let isNewBest = false;
      mutate((d) => {
        const { data, isNewBest: best } = mergeGameScore(d, key, score, meta);
        isNewBest = best;
        return data;
      });
      return isNewBest;
    },

    getLeaderboard(key) {
      return getGameScores(get().data, key);
    },

    markDailyPlayed(gameId, score, overwrite = false, extras) {
      mutate((d) =>
        applyDailyPlayed(
          d,
          gameId,
          score,
          todayKey(),
          new Date().toISOString(),
          overwrite,
          extras,
        ),
      );
    },

    setArcadeProfile(profile) {
      mutate((d) => ({ ...d, arcadeProfile: profile }));
    },

    setGamePremium(premium) {
      const { data } = get();
      if (data.gamePremium === premium) return;
      mutate((d) => ({ ...d, gamePremium: premium }));
    },

    tokenBalance() {
      return getTokenBalance(get().data.wallet);
    },

    buyContinue(gameId) {
      const today = todayKey();
      let ok = false;
      mutate((d) => {
        const daily = d.arcadeDaily;
        if (daily?.date === today && daily.completed[gameId]?.continued) {
          return d;
        }
        const spent = spendTokens(
          d,
          TOKEN_COST_CONTINUE,
          "continue",
          spendContinueTxnId(today, gameId),
          today,
        );
        if (!spent) return d;
        ok = true;
        const base = spent.arcadeDaily ?? { date: today, completed: {} };
        const prev = base.completed[gameId];
        return {
          ...spent,
          arcadeDaily: {
            date: today,
            completed: {
              ...base.completed,
              [gameId]: {
                score: prev?.score ?? 0,
                playedAt: prev?.playedAt ?? new Date().toISOString(),
                ghostTrace: prev?.ghostTrace,
                continued: true,
              },
            },
          },
        };
      });
      return ok;
    },

    unlockPalette(paletteId) {
      let ok = false;
      mutate((d) => {
        const next = applyUnlockPalette(d, paletteId);
        if (!next) return d;
        ok = true;
        return next;
      });
      return ok;
    },

    equipPalette(gameId, paletteId) {
      mutate((d) => applyEquipPalette(d, gameId, paletteId));
    },

    setLastRecapWeek(weekKey) {
      mutate((d) =>
        d.lastRecapWeek === weekKey ? d : { ...d, lastRecapWeek: weekKey },
      );
    },

    clearTokenEarn() {
      set({ lastTokenEarn: null });
    },

    openLoginBonus() {
      set({ loginBonusOpen: true });
    },

    closeLoginBonus() {
      const key = todayKey();
      set({ loginBonusOpen: false });
      mutate((d) =>
        d.loginBonus?.lastPopupDate === key
          ? d
          : { ...d, loginBonus: { ...d.loginBonus, lastPopupDate: key } },
      );
    },

    claimLoginBonus() {
      const key = todayKey();
      mutate((d) => {
        const result = applyLoginBonus(d, key);
        return result.data.loginBonus?.lastPopupDate === key
          ? result.data
          : {
              ...result.data,
              loginBonus: { ...result.data.loginBonus, lastPopupDate: key },
            };
      });
      set({ loginBonusOpen: false });
    },

    async pullFromCloud() {
      const { user } = get();
      if (!user || !isCloudUser(user.id) || !cloudConfigured()) return;
      await waitForFirebaseAuth(8000);
      const cloud = await loadCloudData(user.id);
      if (!cloud) return;
      const merged = applyDailySession(mergeLocalAndCloud(get().data, cloud));
      set({ data: merged });
      await storage.saveData(user.id, merged);
    },

    addDeck(d) {
      const now = new Date().toISOString();
      const defaults = defaultDeckFields();
      const deck: LearnDeck = {
        ...defaults,
        ...d,
        id: uid(),
        createdAt: now,
        updatedAt: now,
      };
      mutate((data) => {
        const learn = ensureLearn(data);
        return { ...data, learn: { ...learn, decks: [...learn.decks, deck] } };
      });
      return deck;
    },

    updateDeck(id, patch) {
      const now = new Date().toISOString();
      mutate((data) => {
        const learn = ensureLearn(data);
        return {
          ...data,
          learn: {
            ...learn,
            decks: learn.decks.map((deck) =>
              deck.id === id ? { ...deck, ...patch, updatedAt: now } : deck,
            ),
          },
        };
      });
    },

    deleteDeck(id) {
      const now = new Date().toISOString();
      const keys: string[] = [];
      mutate((data) => {
        const learn = ensureLearn(data);
        for (const c of learn.cards) {
          if (c.deckId === id) keys.push(...mediaKeysForCard(c));
        }
        return {
          ...data,
          routines: data.routines.map((r) =>
            r.deckId === id ? { ...r, deckId: null, updatedAt: now } : r,
          ),
          learn: {
            ...learn,
            decks: learn.decks.map((deck) =>
              deck.id === id ? { ...deck, archived: true, updatedAt: now } : deck,
            ),
            cards: learn.cards.map((c) =>
              c.deckId === id ? { ...c, deletedAt: now, updatedAt: now } : c,
            ),
          },
        };
      });
      void deleteLearnMedia(keys);
    },

    addCard(c) {
      const now = new Date().toISOString();
      const base = makeNewCard(c.deckId, c.front, c.back);
      const card: LearnCard = {
        ...base,
        ...c,
        id: uid(),
        createdAt: now,
        updatedAt: now,
      };
      mutate((data) => {
        const learn = ensureLearn(data);
        return { ...data, learn: { ...learn, cards: [...learn.cards, card] } };
      });
      return card;
    },

    updateCard(id, patch) {
      const now = new Date().toISOString();
      mutate((data) => {
        const learn = ensureLearn(data);
        return {
          ...data,
          learn: {
            ...learn,
            cards: learn.cards.map((c) =>
              c.id === id ? { ...c, ...patch, updatedAt: now } : c,
            ),
          },
        };
      });
    },

    deleteCard(id) {
      const now = new Date().toISOString();
      const keys: string[] = [];
      mutate((data) => {
        const learn = ensureLearn(data);
        const card = learn.cards.find((c) => c.id === id);
        if (card) keys.push(...mediaKeysForCard(card));
        return {
          ...data,
          learn: {
            ...learn,
            cards: learn.cards.map((c) =>
              c.id === id ? { ...c, deletedAt: now, updatedAt: now } : c,
            ),
          },
        };
      });
      void deleteLearnMedia(keys);
    },

    dismissCard(id) {
      const now = new Date().toISOString();
      let snapshot: LearnCard | null = null;
      mutate((data) => {
        const learn = ensureLearn(data);
        const card = learn.cards.find((c) => c.id === id && !c.deletedAt);
        if (!card || card.suspendedAt) return data;
        snapshot = card;
        return {
          ...data,
          learn: {
            ...learn,
            cards: learn.cards.map((c) =>
              c.id === id ? { ...c, suspendedAt: now, updatedAt: now } : c,
            ),
          },
        };
      });
      if (snapshot) set({ lastLearnUndo: { before: snapshot, reviewId: "" } });
    },

    async importDeck(deckInput, cardInputs) {
      const now = new Date().toISOString();
      const defaults = defaultDeckFields();
      const deck: LearnDeck = {
        ...defaults,
        ...deckInput,
        id: uid(),
        createdAt: now,
        updatedAt: now,
      };
      const cards: LearnCard[] = [];
      for (let i = 0; i < cardInputs.length; i++) {
        const pair = cardInputs[i];
        const id = uid();
        let audioKey: string | undefined;
        let imageKey: string | undefined;
        if (pair.audio) {
          audioKey = `${id}:audio`;
          try {
            await putLearnMedia(audioKey, pair.audio);
          } catch {
            audioKey = undefined;
          }
        }
        if (pair.image) {
          imageKey = `${id}:image`;
          try {
            await putLearnMedia(imageKey, pair.image);
          } catch {
            imageKey = undefined;
          }
        }
        cards.push({
          ...makeNewCard(deck.id, pair.front, pair.back, undefined, now),
          id,
          audioKey,
          imageKey,
          createdAt: new Date(Date.now() + i).toISOString(),
          updatedAt: now,
        });
      }
      mutate((data) => {
        const learn = data.learn ?? emptyLearnState();
        return {
          ...data,
          learn: {
            decks: [...learn.decks, deck],
            cards: [...learn.cards, ...cards],
            reviews: learn.reviews,
          },
        };
      });
      return deck;
    },

    reviewCard(cardId, grade) {
      const today = todayKey();
      let snapshot: { before: LearnCard; reviewId: string } | null = null;
      mutate((data) => {
        const learn = ensureLearn(data);
        const card = learn.cards.find((c) => c.id === cardId && !c.deletedAt);
        if (!card) return data;
        const siblings = learn.cards.filter((c) => c.deckId === card.deckId && !c.deletedAt);
        const next = gradeCard(card, grade, today, siblings);
        const review = makeReview(card, grade, today);
        snapshot = { before: card, reviewId: review.id };
        return {
          ...data,
          learn: {
            ...learn,
            cards: learn.cards.map((c) => (c.id === cardId ? next : c)),
            reviews: [...learn.reviews, review],
          },
        };
      });
      if (snapshot) set({ lastLearnUndo: snapshot });
    },

    undoLastReview() {
      const undo = get().lastLearnUndo;
      if (!undo) return false;
      mutate((data) => {
        const learn = data.learn;
        if (!learn) return data;
        return {
          ...data,
          learn: {
            ...learn,
            cards: learn.cards.map((c) => (c.id === undo.before.id ? undo.before : c)),
            reviews: learn.reviews.filter((r) => r.id !== undo.reviewId),
          },
        };
      });
      set({ lastLearnUndo: null });
      return true;
    },

    completeStudySession(deckId) {
      let earned = 0;
      mutate((d) => {
        const result = applyLearnSessionEarnings(d, deckId, todayKey());
        earned = result.earned;
        return result.data;
      });
      if (earned > 0) {
        set({
          lastTokenEarn: {
            id: crypto.randomUUID(),
            amount: earned,
            at: Date.now(),
          },
        });
      }
    },
  };
});
