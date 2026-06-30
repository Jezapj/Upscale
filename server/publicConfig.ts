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

export function getPublicConfig(env: NodeJS.ProcessEnv = process.env): PublicAppConfig {
  const googleClientId = env.GOOGLE_CLIENT_ID?.trim();
  const apiKey = env.FIREBASE_API_KEY?.trim();
  const projectId = env.FIREBASE_PROJECT_ID?.trim();
  const appId = env.FIREBASE_APP_ID?.trim();
  const authDomain = env.FIREBASE_AUTH_DOMAIN?.trim();
  const storageBucket = env.FIREBASE_STORAGE_BUCKET?.trim();
  const messagingSenderId = env.FIREBASE_MESSAGING_SENDER_ID?.trim();

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
