import { emptyAppData, type AppData, type ArcadeProfile } from "./types";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { getFirebaseDb } from "./firebase";
import { activeFirestoreUid } from "./firebaseAuth";
import { mergeArcadeDailyStates } from "./dailyChallenge";
import { todayKey } from "./dates";
import {
  BACKUP_FORMAT_VERSION,
  createBackupEnvelope,
  mergeNotes,
  resolveBackupConflict,
} from "./backup";
import { ensureStarterBalance, mergeArcadeUnlocks, mergeWallets } from "./economy";
import type { GameId } from "./types";

interface CloudPayload {
  formatVersion: number;
  updatedAt: string;
  data: AppData;
}

/** Google subject id from `google:{sub}` user ids. */
export function googleSubFromUserId(userId: string): string | null {
  if (!userId.startsWith("google:")) return null;
  return userId.slice("google:".length);
}

export function isCloudUser(userId: string): boolean {
  return userId.startsWith("google:");
}

/** Firestore `userdata` / leaderboard doc id: must match `request.auth.uid`. */
export function firestoreUserDocId(userId: string): string | null {
  return activeFirestoreUid() ?? googleSubFromUserId(userId);
}

function mergeArcadeProfile(
  a: ArcadeProfile | undefined,
  b: ArcadeProfile | undefined,
): ArcadeProfile | undefined {
  if (!a && !b) return undefined;
  const left = a ?? { username: null, optedOut: false, prompted: false };
  const right = b ?? { username: null, optedOut: false, prompted: false };
  return {
    prompted: left.prompted || right.prompted,
    optedOut: (left.prompted && left.optedOut) || (right.prompted && right.optedOut),
    username: left.username ?? right.username,
  };
}

function mergeGameScores(
  a: AppData["gameScores"],
  b: AppData["gameScores"],
): AppData["gameScores"] {
  if (!a && !b) return undefined;
  if (!a) return b;
  if (!b) return a;
  const out = { ...a };
  for (const [key, entries] of Object.entries(b)) {
    const existing = out[key] ?? [];
    const combined = [...existing, ...entries]
      .sort((x, y) => y.score - x.score)
      .slice(0, 10);
    out[key] = combined;
  }
  return out;
}

/** Firestore rejects `undefined` anywhere in a document (including optional AppData fields). */
function stripUndefined<T>(value: T): T {
  if (value === undefined) return value;
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefined(item)) as T;
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (entry !== undefined) {
        out[key] = stripUndefined(entry);
      }
    }
    return out as T;
  }
  return value;
}

const CLOUD_LOAD_TIMEOUT_MS = 8_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("cloud load timeout")), ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

function normalizeCloudPayload(raw: Record<string, unknown>): CloudPayload | null {
  if (!raw?.data || typeof raw.data !== "object") return null;
  return {
    formatVersion:
      typeof raw.formatVersion === "number" ? raw.formatVersion : BACKUP_FORMAT_VERSION,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : "",
    data: { ...emptyAppData(), ...(raw.data as AppData) },
  };
}

export async function loadCloudData(
  userId: string,
  timeoutMs = CLOUD_LOAD_TIMEOUT_MS,
): Promise<CloudPayload | null> {
  const db = getFirebaseDb();
  const uid = firestoreUserDocId(userId);
  if (!db || !uid) return null;

  try {
    const snap = await withTimeout(getDoc(doc(db, "userdata", uid)), timeoutMs);
    if (!snap.exists()) {
      const legacy = googleSubFromUserId(userId);
      if (legacy && legacy !== uid) {
        const legacySnap = await withTimeout(
          getDoc(doc(db, "userdata", legacy)),
          timeoutMs,
        );
        if (legacySnap.exists()) {
          return normalizeCloudPayload(legacySnap.data() as Record<string, unknown>);
        }
      }
      return null;
    }
    return normalizeCloudPayload(snap.data() as Record<string, unknown>);
  } catch (e) {
    console.warn("Cloud load failed", e);
    return null;
  }
}

/** Upload the same JSON shape as Settings → Export (stored in Firestore for auto-import). */
export async function saveCloudData(userId: string, data: AppData): Promise<void> {
  const db = getFirebaseDb();
  const uid = firestoreUserDocId(userId);
  if (!db || !uid) return;

  const envelope = createBackupEnvelope(data);
  const payload = stripUndefined({
    formatVersion: envelope.formatVersion,
    updatedAt: envelope.exportedAt,
    data: envelope.data,
  }) as CloudPayload;

  try {
    await setDoc(doc(db, "userdata", uid), payload);
  } catch (e) {
    console.warn("Cloud save failed", e);
  }
}

function mergeLastGhosts(
  a: AppData["lastGhosts"],
  b: AppData["lastGhosts"],
): AppData["lastGhosts"] {
  if (!a && !b) return undefined;
  const out: NonNullable<AppData["lastGhosts"]> = { ...(a ?? {}) };
  for (const [key, ghost] of Object.entries(b ?? {})) {
    const gameId = key as GameId;
    const cur = out[gameId];
    if (!cur) {
      out[gameId] = ghost;
      continue;
    }
    if (!ghost) continue;
    if (ghost.day > cur.day || (ghost.day === cur.day && ghost.score >= cur.score)) {
      out[gameId] = ghost;
    }
  }
  return Object.keys(out).length ? out : undefined;
}

/** Login / sync: merge habits, then always union notes/wallet/arcade from both sides. */
export function mergeLocalAndCloud(
  local: AppData,
  cloud: CloudPayload | null,
  day: string = todayKey(),
): AppData {
  if (!cloud) return ensureStarterBalance(local);

  const { data: winner } = resolveBackupConflict(
    local,
    cloud.data,
    cloud.updatedAt,
  );

  const merged: AppData = {
    ...winner,
    notes: mergeNotes(local.notes, cloud.data.notes),
    arcadeDaily: mergeArcadeDailyStates(local.arcadeDaily, cloud.data.arcadeDaily, day),
    arcadeProfile: mergeArcadeProfile(local.arcadeProfile, cloud.data.arcadeProfile),
    gameScores: mergeGameScores(local.gameScores, cloud.data.gameScores),
    gamePlays: local.gamePlays ?? cloud.data.gamePlays,
    gamePremium: local.gamePremium || cloud.data.gamePremium || undefined,
    wallet: mergeWallets(local.wallet, cloud.data.wallet),
    arcadeUnlocks: mergeArcadeUnlocks(local.arcadeUnlocks, cloud.data.arcadeUnlocks),
    lastGhosts: mergeLastGhosts(local.lastGhosts, cloud.data.lastGhosts),
    lastRecapWeek:
      (local.lastRecapWeek ?? "") >= (cloud.data.lastRecapWeek ?? "")
        ? local.lastRecapWeek ?? cloud.data.lastRecapWeek
        : cloud.data.lastRecapWeek ?? local.lastRecapWeek,
  };
  if (!merged.lastGhosts || Object.keys(merged.lastGhosts).length === 0) {
    delete merged.lastGhosts;
  }
  return ensureStarterBalance(merged);
}
