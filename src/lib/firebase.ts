import { initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getAppConfig } from "./appConfig";

export function cloudConfigured(): boolean {
  const f = getAppConfig().firebase;
  return !!(f?.apiKey && f?.projectId && f?.appId);
}

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

function firebaseConfig() {
  return getAppConfig().firebase;
}

export function getFirebaseAuth(): Auth | null {
  const config = firebaseConfig();
  if (!config) return null;
  if (!app) app = initializeApp(config);
  if (!auth) auth = getAuth(app);
  return auth;
}

export function getFirebaseDb(): Firestore | null {
  const config = firebaseConfig();
  if (!config) return null;
  if (!app) app = initializeApp(config);
  if (!db) db = getFirestore(app);
  return db;
}
