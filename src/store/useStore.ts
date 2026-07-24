import { create } from "zustand";
import type {
  AppData,
  ArcadeProfile,
  GameId,
  GameScoreEntry,
  Goal,
  Rating,
  Routine,
  User,
} from "@/lib/types";
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
  playsRemaining,
  recordGamePlay,
} from "@/lib/gamePlays";
import { recordGameScore as mergeGameScore, getGameScores } from "@/lib/gameLeaderboard";
import { isCloudUser } from "@/lib/cloudSync";
import { clearFiredReminder } from "@/lib/reminders";
import { markDailyPlayed as applyDailyPlayed } from "@/lib/dailyChallenge";
import { alignGoogleUserWithFirebase } from "@/lib/storage";

const uid = () => crypto.randomUUID();

interface StoreState {
  user: User | null;
  data: AppData;
  ready: boolean;
  today: string;

  init: () => Promise<void>;
  signIn: (user: User) => Promise<void>;
  signOut: () => void;

  addGoal: (g: Omit<Goal, "id" | "createdAt">) => Goal;
  updateGoal: (id: string, patch: Partial<Goal>) => void;
  deleteGoal: (id: string) => void;

  addRoutine: (r: Omit<Routine, "id" | "createdAt">) => Routine;
  updateRoutine: (id: string, patch: Partial<Routine>) => void;
  deleteRoutine: (id: string) => void;

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

  markDailyPlayed: (gameId: GameId, score: number, overwrite?: boolean) => void;
  setArcadeProfile: (profile: ArcadeProfile) => void;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

async function syncUserData(userId: string): Promise<AppData> {
  if (isCloudUser(userId) && cloudConfigured()) {
    await waitForFirebaseAuth(8000);
  }
  return storage.loadData(userId);
}

function applyUserData(userId: string, data: AppData) {
  const { user, refreshToday } = useStore.getState();
  if (user?.id !== userId) return;
  useStore.setState({ data });
  refreshToday();
}

export const useStore = create<StoreState>((set, get) => {
  // Debounced persistence whenever data changes.
  const persist = () => {
    const { user, data } = get();
    if (!user) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      void storage.saveData(user.id, data);
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
    today: todayKey(),

    async init() {
      let user = storage.getUser();
      if (user) {
        if (isCloudUser(user.id) && cloudConfigured()) {
          await waitForFirebaseAuth(8000);
          user = alignGoogleUserWithFirebase(user);
          storage.setUser(user);
        }
        const data = storage.loadLocalData(user.id);
        set({ user, data, today: todayKey() });
        get().refreshToday();
        void syncUserData(user.id)
          .then((synced) => applyUserData(user!.id, synced))
          .catch((err) => console.warn("Background sync failed", err));
      }
      set({ ready: true });
    },

    async signIn(user) {
      if (isCloudUser(user.id) && cloudConfigured()) {
        await waitForFirebaseAuth(8000);
        user = alignGoogleUserWithFirebase(user);
      }
      storage.setUser(user);
      const data = storage.loadLocalData(user.id);
      set({ user, data, today: todayKey() });
      get().refreshToday();
      void syncUserData(user.id)
        .then((synced) => applyUserData(user.id, synced))
        .catch((err) => console.warn("Background sync failed", err));
    },

    signOut() {
      signOutGoogle();
      if (cloudConfigured()) {
        const auth = getFirebaseAuth();
        if (auth) void firebaseSignOut(auth);
      }
      storage.setUser(null);
      set({ user: null, data: emptyAppData() });
    },

    addGoal(g) {
      const goal: Goal = { ...g, id: uid(), createdAt: new Date().toISOString() };
      mutate((d) => ({ ...d, goals: [...d.goals, goal] }));
      return goal;
    },
    updateGoal(id, patch) {
      mutate((d) => ({
        ...d,
        goals: d.goals.map((g) => (g.id === id ? { ...g, ...patch } : g)),
      }));
    },
    deleteGoal(id) {
      mutate((d) => ({
        ...d,
        goals: d.goals.filter((g) => g.id !== id),
        // Detach routines from the removed goal rather than deleting them.
        routines: d.routines.map((r) =>
          r.goalId === id ? { ...r, goalId: null } : r,
        ),
      }));
    },

    addRoutine(r) {
      const routine: Routine = {
        ...r,
        id: uid(),
        createdAt: new Date().toISOString(),
      };
      mutate((d) => ({ ...d, routines: [...d.routines, routine] }));
      return routine;
    },
    updateRoutine(id, patch) {
      if ("reminderTime" in patch) clearFiredReminder(id);
      mutate((d) => ({
        ...d,
        routines: d.routines.map((r) => (r.id === id ? { ...r, ...patch } : r)),
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

    rate(routineId, rating) {
      const key = todayKey();
      mutate((d) => {
        const log = d.logs[key] ?? { date: key, entries: {} };
        return {
          ...d,
          logs: {
            ...d.logs,
            [key]: {
              ...log,
              entries: { ...log.entries, [routineId]: buildEntry(rating) },
            },
          },
        };
      });
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
      mutate((d) =>
        d.lastActiveDate === key ? d : { ...d, lastActiveDate: key },
      );
    },

    gamePlaysLeft(gameId) {
      const { data, today } = get();
      return playsRemaining(data, gameId, today);
    },

    canPlay(gameId) {
      const { data, today } = get();
      return canPlayGame(data, gameId, today);
    },

    consumePlay(gameId) {
      const { data, today } = get();
      if (!canPlayGame(data, gameId, today)) return false;
      mutate((d) => recordGamePlay(d, gameId, today));
      return true;
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

    markDailyPlayed(gameId, score, overwrite = false) {
      mutate((d) => applyDailyPlayed(d, gameId, score, todayKey(), new Date().toISOString(), overwrite));
    },

    setArcadeProfile(profile) {
      mutate((d) => ({ ...d, arcadeProfile: profile }));
    },
  };
});
