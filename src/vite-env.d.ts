/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  /** RevenueCat Web Billing public API key (sandbox or production). */
  readonly VITE_REVENUECAT_API_KEY?: string;
  /** Stripe publishable key — enables direct Stripe Checkout fallback. */
  readonly VITE_STRIPE_PUBLISHABLE_KEY?: string;
  /** Override API base URL for subscription endpoints (default `/api`). */
  readonly VITE_SUBSCRIPTION_API_URL?: string;
  /** Dev only: bypass endless play limits. */
  readonly VITE_UNLIMITED_PLAYS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
