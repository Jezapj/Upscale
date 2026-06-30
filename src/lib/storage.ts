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

function saveLocal(userId: string, data: AppData): void {
  try {
    localStorage.setItem(dataKey(userId), JSON.stringify(data));
  } catch (e) {
    console.error("Failed to persist data locally", e);
  }
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

  async loadData(userId: string): Promise<AppData> {
    const local = loadLocal(userId);

    if (!isCloudUser(userId) || !cloudConfigured()) {
      return local;
    }

    const auth = getFirebaseAuth();
    if (!auth?.currentUser) {
      return local;
    }

    const cloud = await loadCloudData(userId);
    const merged = mergeLocalAndCloud(local, cloud);
    saveLocal(userId, merged);

    const localAhead =
      (local.syncedAt ?? "") > (cloud?.updatedAt ?? "") &&
      (local.goals.length > 0 || local.routines.length > 0 || Object.keys(local.logs).length > 0);
    if (localAhead) {
      void saveCloudData(userId, merged);
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
