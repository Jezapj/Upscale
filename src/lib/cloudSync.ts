import { emptyAppData, type AppData, type ArcadeProfile } from "./types";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { getFirebaseDb } from "./firebase";
import { activeFirestoreUid } from "./firebaseAuth";
import { mergeArcadeDailyStates } from "./dailyChallenge";
import { todayKey } from "./dates";

interface CloudPayload {
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

/** Firestore `userdata` / leaderboard doc id — must match `request.auth.uid`. */
export function firestoreUserDocId(userId: string): string | null {
  return activeFirestoreUid() ?? googleSubFromUserId(userId);
}

function hasCoreContent(data: AppData): boolean {
  return (
    data.goals.length > 0 ||
    data.routines.length > 0 ||
    Object.keys(data.logs).length > 0
  );
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

export async function loadCloudData(userId: string): Promise<CloudPayload | null> {
  const db = getFirebaseDb();
  const uid = firestoreUserDocId(userId);
  if (!db || !uid) return null;

  try {
    const snap = await withTimeout(getDoc(doc(db, "userdata", uid)), CLOUD_LOAD_TIMEOUT_MS);
    if (!snap.exists()) {
      const legacy = googleSubFromUserId(userId);
      if (legacy && legacy !== uid) {
        const legacySnap = await withTimeout(
          getDoc(doc(db, "userdata", legacy)),
          CLOUD_LOAD_TIMEOUT_MS,
        );
        if (legacySnap.exists()) {
          const raw = legacySnap.data() as CloudPayload;
          if (raw?.data) {
            return {
              updatedAt: raw.updatedAt ?? "",
              data: { ...emptyAppData(), ...raw.data },
            };
          }
        }
      }
      return null;
    }
    const raw = snap.data() as CloudPayload;
    if (!raw?.data) return null;
    return {
      updatedAt: raw.updatedAt ?? "",
      data: { ...emptyAppData(), ...raw.data },
    };
  } catch (e) {
    console.warn("Cloud load failed", e);
    return null;
  }
}

export async function saveCloudData(userId: string, data: AppData): Promise<void> {
  const db = getFirebaseDb();
  const uid = firestoreUserDocId(userId);
  if (!db || !uid) return;

  const payload: CloudPayload = {
    updatedAt: data.syncedAt ?? new Date().toISOString(),
    data,
  };

  try {
    await setDoc(doc(db, "userdata", uid), payload);
  } catch (e) {
    console.warn("Cloud save failed", e);
  }
}

export function mergeLocalAndCloud(
  local: AppData,
  cloud: CloudPayload | null,
  day: string = todayKey(),
): AppData {
  if (!cloud) return local;

  const localTs = local.syncedAt ?? "";
  const cloudTs = cloud.updatedAt ?? "";

  let base: AppData;
  if (!hasCoreContent(local) && hasCoreContent(cloud.data)) base = cloud.data;
  else if (hasCoreContent(local) && !hasCoreContent(cloud.data)) base = local;
  else if (!localTs && cloudTs) base = cloud.data;
  else if (localTs && !cloudTs) base = local;
  else base = cloudTs >= localTs ? cloud.data : local;

  const other = base === local ? cloud.data : local;
  const syncedAt = localTs > cloudTs ? localTs : cloudTs;

  return {
    ...base,
    syncedAt,
    arcadeDaily: mergeArcadeDailyStates(local.arcadeDaily, other.arcadeDaily, day),
    arcadeProfile: mergeArcadeProfile(local.arcadeProfile, other.arcadeProfile),
    gameScores: mergeGameScores(local.gameScores, other.gameScores),
    gamePlays: base.gamePlays ?? other.gamePlays,
  };
}
