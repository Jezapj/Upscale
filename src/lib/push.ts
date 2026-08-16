import { doc, getDoc, setDoc } from "firebase/firestore";
import { getToken, onMessage } from "firebase/messaging";
import {
  cloudConfigured,
  getFirebaseDb,
  getFirebaseMessaging,
  vapidConfigured,
} from "./firebase";
import { activeFirestoreUid, waitForFirebaseAuth } from "./firebaseAuth";
import { getRegistration } from "./notifications";
import { getReminderPrefs } from "./reminders";

const COLLECTION = "pushSubscriptions";
const MAX_TOKENS = 5;
const FIRED_KEEP_DAYS = 3;

export interface PushSubscriptionDoc {
  enabled: boolean;
  tokens: string[];
  timeZone: string;
  updatedAt: string;
  fired?: Record<string, string[]>;
}

let remotePushActive = false;
let foregroundBound = false;

export function isRemotePushActive(): boolean {
  return remotePushActive;
}

function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

async function readDoc(uid: string): Promise<PushSubscriptionDoc | null> {
  const db = getFirebaseDb();
  if (!db) return null;
  const snap = await getDoc(doc(db, COLLECTION, uid));
  if (!snap.exists()) return null;
  return snap.data() as PushSubscriptionDoc;
}

async function writeDoc(uid: string, next: PushSubscriptionDoc): Promise<void> {
  const db = getFirebaseDb();
  if (!db) return;
  const fired = next.fired ?? {};
  const keys = Object.keys(fired).sort();
  const trimmed = keys.slice(-FIRED_KEEP_DAYS);
  const firedOut: Record<string, string[]> = {};
  for (const key of trimmed) firedOut[key] = fired[key];
  await setDoc(doc(db, COLLECTION, uid), { ...next, fired: firedOut });
}

function mergeToken(existing: string[] | undefined, token: string): string[] {
  const rest = (existing ?? []).filter((t) => t !== token);
  return [token, ...rest].slice(0, MAX_TOKENS);
}

async function bindForegroundMessages(): Promise<void> {
  if (foregroundBound) return;
  const messaging = await getFirebaseMessaging();
  if (!messaging) return;
  foregroundBound = true;
  onMessage(messaging, (payload) => {
    const data = payload.data ?? {};
    const title = data.title || payload.notification?.title || "Upscale";
    const body = data.body || payload.notification?.body || "";
    void (async () => {
      const registration = await getRegistration();
      const options: NotificationOptions = {
        body,
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        tag: data.tag || "upscale",
        data: { url: data.url || "/" },
      };
      if (registration?.showNotification) {
        await registration.showNotification(title, options);
        return;
      }
      if (Notification.permission === "granted") {
        new Notification(title, options);
      }
    })().catch((err) => console.warn("Foreground push display failed", err));
  });
}

/**
 * Register this device for FCM so Cloud Functions can remind the user while
 * the app is closed. Guest accounts stay on local polling.
 */
export async function syncRemotePush(): Promise<boolean> {
  remotePushActive = false;
  if (!cloudConfigured() || !vapidConfigured()) return false;
  if (!getReminderPrefs().enabled) return false;
  if (typeof Notification === "undefined" || Notification.permission !== "granted") {
    return false;
  }

  await waitForFirebaseAuth();
  const uid = activeFirestoreUid();
  if (!uid) return false;

  const messaging = await getFirebaseMessaging();
  const registration = await getRegistration();
  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
  if (!messaging || !registration || !vapidKey) return false;

  let token: string;
  try {
    token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: registration,
    });
  } catch (err) {
    console.warn("FCM token failed", err);
    return false;
  }
  if (!token) return false;

  const prev = await readDoc(uid);
  await writeDoc(uid, {
    enabled: true,
    tokens: mergeToken(prev?.tokens, token),
    timeZone: deviceTimeZone(),
    updatedAt: new Date().toISOString(),
    fired: prev?.fired,
  });
  await bindForegroundMessages();
  remotePushActive = true;
  return true;
}

export async function setRemotePushEnabled(enabled: boolean): Promise<void> {
  if (!enabled) remotePushActive = false;
  if (!cloudConfigured()) return;
  await waitForFirebaseAuth();
  const uid = activeFirestoreUid();
  if (!uid) return;

  const prev = await readDoc(uid);
  if (!prev && !enabled) return;

  await writeDoc(uid, {
    enabled,
    tokens: prev?.tokens ?? [],
    timeZone: deviceTimeZone(),
    updatedAt: new Date().toISOString(),
    fired: prev?.fired,
  });

  if (enabled) {
    await syncRemotePush();
  }
}
