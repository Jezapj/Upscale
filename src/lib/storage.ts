import type { AppData, User } from "./types";
import { emptyAppData } from "./types";
import { cloudConfigured } from "./firebase";
import {
  isCloudUser,
  loadCloudData,
  mergeLocalAndCloud,
  saveCloudData,
} from "./cloudSync";
import { getFirebaseAuth } from "./firebase";
import { activeFirestoreUid, waitForFirebaseAuth } from "./firebaseAuth";

const USER_KEY = "upscale:user";
const dataKey = (userId: string) => `upscale:data:${userId}`;

function loadLocal(userId: string): AppData {
  try {
    const raw = localStorage.getItem(dataKey(userId));
    if (!raw) return emptyAppData();
    const parsed = JSON.parse(raw) as AppData;
    return { ...emptyAppData(), ...parsed };
  } catch {
    return emptyAppData();
  }
}

/** Instant local read — use before async cloud merge. */
function readLocalData(userId: string): AppData {
  return loadLocal(userId);
}

function saveLocal(userId: string, data: AppData): void {
  try {
    localStorage.setItem(dataKey(userId), JSON.stringify(data));
  } catch (e) {
    console.error("Failed to persist data locally", e);
  }
}

function hasAppContent(data: AppData): boolean {
  return (
    data.goals.length > 0 ||
    data.routines.length > 0 ||
    Object.keys(data.logs).length > 0
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
    return readLocalData(userId);
  },

  async loadData(userId: string): Promise<AppData> {
    const local = loadLocal(userId);

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

  async saveData(userId: string, data: AppData): Promise<void> {
    const stamped: AppData = { ...data, syncedAt: new Date().toISOString() };
    saveLocal(userId, stamped);

    if (!isCloudUser(userId) || !cloudConfigured()) return;

    const auth = getFirebaseAuth();
    if (!auth?.currentUser) return;

    await saveCloudData(userId, stamped);
  },
};
