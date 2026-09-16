import type { AppData, LearnState, User } from "./types";
import { emptyAppData } from "./types";
import { compactGameScores } from "./gameLeaderboard";
import { cloudConfigured } from "./firebase";
import {
  isCloudUser,
  loadCloudData,
  mergeLocalAndCloud,
  saveCloudData,
} from "./cloudSync";
import { getFirebaseAuth } from "./firebase";
import { activeFirestoreUid, waitForFirebaseAuth } from "./firebaseAuth";
import { ensureStarterBalance } from "./economy";

const USER_KEY = "upscale:user";
const dataKey = (userId: string) => `upscale:data:${userId}`;
const learnKey = (userId: string) => `upscale:learn:${userId}`;

/* ---- IndexedDB fallback for learn data when localStorage is too small ---- */

const IDB_NAME = "upscale-overflow";
const IDB_STORE = "kv";

function openOverflowDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key: string, value: string): Promise<void> {
  const db = await openOverflowDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function idbGet(key: string): Promise<string | undefined> {
  try {
    const db = await openOverflowDb();
    const value = await new Promise<string | undefined>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve(req.result as string | undefined);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return value;
  } catch {
    return undefined;
  }
}

/* ---- Learn state split: stored separately so importing a big deck doesn't
   blow the quota for the rest of the app's data. ---- */

function saveLearnToLocalStorage(userId: string, learn: LearnState | undefined): boolean {
  if (!learn || (learn.decks.length === 0 && learn.cards.length === 0)) {
    try { localStorage.removeItem(learnKey(userId)); } catch { /* ok */ }
    return true;
  }
  try {
    localStorage.setItem(learnKey(userId), JSON.stringify(learn));
    return true;
  } catch {
    return false;
  }
}

function loadLearnFromLocalStorage(userId: string): LearnState | undefined {
  try {
    const raw = localStorage.getItem(learnKey(userId));
    if (!raw) return undefined;
    return JSON.parse(raw) as LearnState;
  } catch {
    return undefined;
  }
}

/** Trim review log when the learn payload is too large for localStorage. */
function trimLearnForStorage(learn: LearnState): LearnState {
  const MAX_REVIEWS = 5000;
  if (learn.reviews.length <= MAX_REVIEWS) return learn;
  const sorted = [...learn.reviews].sort((a, b) =>
    b.reviewedAt.localeCompare(a.reviewedAt),
  );
  return { ...learn, reviews: sorted.slice(0, MAX_REVIEWS) };
}

function loadLocal(userId: string): AppData {
  try {
    const raw = localStorage.getItem(dataKey(userId));
    if (!raw) return emptyAppData();
    const parsed = JSON.parse(raw) as AppData;
    const merged = { ...emptyAppData(), ...parsed };
    const learn = loadLearnFromLocalStorage(userId);
    if (learn) merged.learn = learn;
    return { ...merged, gameScores: compactGameScores(merged.gameScores) };
  } catch {
    return emptyAppData();
  }
}

/** Try loading learn data from IndexedDB when localStorage didn't have it. */
async function loadLocalAsync(userId: string): Promise<AppData> {
  const data = loadLocal(userId);
  if (!data.learn || (data.learn.decks.length === 0 && data.learn.cards.length === 0)) {
    try {
      const raw = await idbGet(learnKey(userId));
      if (raw) {
        data.learn = JSON.parse(raw) as LearnState;
      }
    } catch { /* ok */ }
  }
  return data;
}

/** Instant local read: use before async cloud merge. */
function readLocalData(userId: string): AppData {
  return loadLocal(userId);
}

function saveLocal(userId: string, data: AppData): void {
  const next = { ...data, gameScores: compactGameScores(data.gameScores) };

  // Save learn state separately so it doesn't bloat the main key
  const learn = next.learn;
  const coreSave = { ...next, learn: undefined };
  delete coreSave.learn;

  // Try core data first (without learn)
  try {
    localStorage.setItem(dataKey(userId), JSON.stringify(coreSave));
  } catch (e) {
    console.error("Failed to persist core data locally", e);
    return;
  }

  // Now save learn state; try trimming if too large
  if (learn) {
    if (!saveLearnToLocalStorage(userId, learn)) {
      const trimmed = trimLearnForStorage(learn);
      if (!saveLearnToLocalStorage(userId, trimmed)) {
        // localStorage full even after trim - fall back to IndexedDB
        console.warn("Learn data too large for localStorage, saving to IndexedDB");
        void idbSet(learnKey(userId), JSON.stringify(trimmed)).catch((e) =>
          console.error("Failed to persist learn data to IndexedDB", e),
        );
      }
    }
  } else {
    try { localStorage.removeItem(learnKey(userId)); } catch { /* ok */ }
  }
}

function hasAppContent(data: AppData): boolean {
  return (
    data.goals.length > 0 ||
    data.routines.length > 0 ||
    Object.keys(data.logs).length > 0 ||
    (data.notes ?? []).some((n) => !n.deletedAt)
  );
}

/**
 * Older builds stored `google:{googleOAuthSub}` while Firestore rules expect
 * `request.auth.uid` (Firebase uid). Re-key local data after Auth restores.
 */
export function alignGoogleUserWithFirebase(user: User): User {
  if (user.provider !== "google") return user;
  const fbUid = activeFirestoreUid();
  if (!fbUid) return user;

  const canonicalId = `google:${fbUid}`;
  if (user.id === canonicalId) return user;

  const oldData = readLocalData(user.id);
  const newData = readLocalData(canonicalId);
  if (!hasAppContent(newData) && hasAppContent(oldData)) {
    saveLocal(canonicalId, oldData);
  }
  return { ...user, id: canonicalId };
}

/**
 * Local-first storage with optional Firestore sync for Google accounts.
 * Guest data stays on-device only. Google users sync when Firebase is configured
 * and they have an active Firebase Auth session (established at sign-in).
 */
export const storage = {
  getUser(): User | null {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? (JSON.parse(raw) as User) : null;
    } catch {
      return null;
    }
  },

  setUser(user: User | null) {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  },

  loadLocalData(userId: string): AppData {
    return ensureStarterBalance(readLocalData(userId));
  },

  async loadData(userId: string): Promise<AppData> {
    const local = ensureStarterBalance(await loadLocalAsync(userId));

    if (!isCloudUser(userId) || !cloudConfigured()) {
      return local;
    }

    await waitForFirebaseAuth(8000);

    const auth = getFirebaseAuth();
    if (!auth?.currentUser) {
      console.warn(
        "Upscale: Google account is signed in locally but Firebase Auth is not active. " +
          "Cross-device sync and daily boards need VITE_FIREBASE_* env vars and a successful Firebase sign-in. " +
          "Sign out and sign in again after fixing Firebase setup.",
      );
      return local;
    }

    const cloud = await loadCloudData(userId);
    const merged = mergeLocalAndCloud(local, cloud);
    saveLocal(userId, merged);

    if (auth?.currentUser) {
      await saveCloudData(userId, merged);
    }

    return merged;
  },

  async saveData(
    userId: string,
    data: AppData,
    options?: { skipCloudSync?: boolean }
  ): Promise<AppData> {
    const next: AppData = { ...data, syncedAt: new Date().toISOString() };

    if (isCloudUser(userId) && cloudConfigured() && !options?.skipCloudSync) {
      const auth = getFirebaseAuth();
      if (auth?.currentUser) {
        const cloud = await loadCloudData(userId, 3_000);
        const merged = {
          ...mergeLocalAndCloud(data, cloud),
          syncedAt: new Date().toISOString(),
        };
        saveLocal(userId, merged);
        await saveCloudData(userId, merged);
        return merged;
      }
    }

    saveLocal(userId, next);
    return next;
  },
};
