import { initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import type { Messaging } from "firebase/messaging";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export function cloudConfigured(): boolean {
  return !!(
    firebaseConfig.apiKey &&
    firebaseConfig.projectId &&
    firebaseConfig.appId
  );
}

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let messaging: Messaging | null = null;
let messagingChecked = false;

export function vapidConfigured(): boolean {
  return !!import.meta.env.VITE_FIREBASE_VAPID_KEY;
}

export function getFirebaseApp(): FirebaseApp | null {
  if (!cloudConfigured()) return null;
  if (!app) app = initializeApp(firebaseConfig);
  return app;
}

export function getFirebaseAuth(): Auth | null {
  const firebaseApp = getFirebaseApp();
  if (!firebaseApp) return null;
  if (!auth) auth = getAuth(firebaseApp);
  return auth;
}

export function getFirebaseDb(): Firestore | null {
  const firebaseApp = getFirebaseApp();
  if (!firebaseApp) return null;
  if (!db) db = getFirestore(firebaseApp);
  return db;
}

export async function getFirebaseMessaging(): Promise<Messaging | null> {
  const firebaseApp = getFirebaseApp();
  if (!firebaseApp || !vapidConfigured()) return null;
  if (messagingChecked) return messaging;
  messagingChecked = true;
  try {
    const { getMessaging, isSupported } = await import("firebase/messaging");
    if (!(await isSupported())) return null;
    messaging = getMessaging(firebaseApp);
    return messaging;
  } catch {
    return null;
  }
}
