import { doc, getDoc, setDoc } from "firebase/firestore";
import type { AppData } from "./types";
import { emptyAppData } from "./types";
import { getFirebaseDb } from "./firebase";

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

function hasContent(data: AppData): boolean {
  return data.goals.length > 0 || data.routines.length > 0 || Object.keys(data.logs).length > 0;
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
  const sub = googleSubFromUserId(userId);
  if (!db || !sub) return null;

  try {
    const snap = await withTimeout(getDoc(doc(db, "userdata", sub)), CLOUD_LOAD_TIMEOUT_MS);
    if (!snap.exists()) return null;
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
  const sub = googleSubFromUserId(userId);
  if (!db || !sub) return;

  const payload: CloudPayload = {
    updatedAt: data.syncedAt ?? new Date().toISOString(),
    data,
  };

  try {
    await setDoc(doc(db, "userdata", sub), payload);
  } catch (e) {
    console.warn("Cloud save failed", e);
  }
}

export function mergeLocalAndCloud(
  local: AppData,
  cloud: CloudPayload | null,
): AppData {
  if (!cloud) return local;

  const localTs = local.syncedAt ?? "";
  const cloudTs = cloud.updatedAt ?? "";

  if (!hasContent(local) && hasContent(cloud.data)) return cloud.data;
  if (hasContent(local) && !hasContent(cloud.data)) return local;
  if (!localTs && cloudTs) return cloud.data;
  if (localTs && !cloudTs) return local;

  return cloudTs >= localTs ? cloud.data : local;
}
