import type { AppData, User } from "./types";
import { emptyAppData } from "./types";

const USER_KEY = "upscale:user";
const dataKey = (userId: string) => `upscale:data:${userId}`;

/**
 * Local-first storage. Everything is persisted in localStorage, scoped by the
 * signed-in user's id so multiple accounts can coexist on one device and a
 * returning user restores exactly what they had. The async signatures keep the
 * door open for a future cloud backend (e.g. Firestore) without touching the
 * rest of the app.
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
    try {
      const raw = localStorage.getItem(dataKey(userId));
      if (!raw) return emptyAppData();
      const parsed = JSON.parse(raw) as AppData;
      return { ...emptyAppData(), ...parsed };
    } catch {
      return emptyAppData();
    }
  },

  async saveData(userId: string, data: AppData): Promise<void> {
    try {
      localStorage.setItem(dataKey(userId), JSON.stringify(data));
    } catch (e) {
      console.error("Failed to persist data", e);
    }
  },
};
