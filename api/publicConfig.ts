/** Public client config served by GET /api/config (no secrets). */

export interface PublicFirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

export interface PublicAppConfig {
  googleClientId?: string;
  firebase?: PublicFirebaseConfig;
}

function envFirst(env: NodeJS.ProcessEnv, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

export function getPublicConfig(env: NodeJS.ProcessEnv = process.env): PublicAppConfig {
  const googleClientId = envFirst(env, "GOOGLE_CLIENT_ID", "VITE_GOOGLE_CLIENT_ID");
  const apiKey = envFirst(env, "FIREBASE_API_KEY", "VITE_FIREBASE_API_KEY");
  const projectId = envFirst(env, "FIREBASE_PROJECT_ID", "VITE_FIREBASE_PROJECT_ID");
  const appId = envFirst(env, "FIREBASE_APP_ID", "VITE_FIREBASE_APP_ID");
  const authDomain = envFirst(env, "FIREBASE_AUTH_DOMAIN", "VITE_FIREBASE_AUTH_DOMAIN");
  const storageBucket = envFirst(
    env,
    "FIREBASE_STORAGE_BUCKET",
    "VITE_FIREBASE_STORAGE_BUCKET",
  );
  const messagingSenderId = envFirst(
    env,
    "FIREBASE_MESSAGING_SENDER_ID",
    "VITE_FIREBASE_MESSAGING_SENDER_ID",
  );

  const config: PublicAppConfig = {};
  if (googleClientId) config.googleClientId = googleClientId;

  if (
    apiKey &&
    projectId &&
    appId &&
    authDomain &&
    storageBucket &&
    messagingSenderId
  ) {
    config.firebase = {
      apiKey,
      authDomain,
      projectId,
      storageBucket,
      messagingSenderId,
      appId,
    };
  }

  return config;
}
