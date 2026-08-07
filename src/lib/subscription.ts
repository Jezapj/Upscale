import { firestoreUserDocId } from "./cloudSync";
import type { User } from "./types";
import {
  configurePurchases,
  fetchProFromRevenueCat,
  revenueCatConfigured,
} from "./revenuecat";

export function stripeCheckoutConfigured(): boolean {
  return !!import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
}

function subscriptionApiBase(): string {
  return import.meta.env.VITE_SUBSCRIPTION_API_URL ?? "/api";
}

/** Firebase uid used as RevenueCat / Stripe app user id. */
export function subscriptionUserId(user: User | null): string | null {
  if (!user) return null;
  return firestoreUserDocId(user.id) ?? user.id.replace(/^google:/, "");
}

/** Initialize RevenueCat for the signed-in user. */
export function initSubscriptionSdk(user: User | null): void {
  const uid = subscriptionUserId(user);
  if (!uid || !revenueCatConfigured()) return;
  configurePurchases(uid);
}

/** Check Stripe subscription status via server API (fallback when RC is not configured). */
export async function fetchProFromStripeApi(
  user: User | null,
): Promise<boolean> {
  const uid = subscriptionUserId(user);
  if (!uid || !stripeCheckoutConfigured()) return false;

  try {
    const res = await fetch(
      `${subscriptionApiBase()}/subscription-status?uid=${encodeURIComponent(uid)}`,
    );
    if (!res.ok) return false;
    const body = (await res.json()) as { active?: boolean };
    return body.active === true;
  } catch {
    return false;
  }
}

/** Verify a Stripe Checkout session after redirect (success URL). */
export async function verifyCheckoutSession(sessionId: string): Promise<boolean> {
  try {
    const res = await fetch(
      `${subscriptionApiBase()}/verify-checkout?session_id=${encodeURIComponent(sessionId)}`,
    );
    if (!res.ok) return false;
    const body = (await res.json()) as { active?: boolean };
    return body.active === true;
  } catch {
    return false;
  }
}

/** Start Stripe Checkout for Pro subscription (direct Stripe path). */
export async function startStripeCheckout(
  user: User,
  email?: string,
): Promise<string | null> {
  const uid = subscriptionUserId(user);
  if (!uid) return null;

  const res = await fetch(`${subscriptionApiBase()}/create-checkout-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      uid,
      email,
      returnUrl: `${window.location.origin}/games`,
    }),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { url?: string };
  return body.url ?? null;
}

/** Resolve Pro status from RevenueCat, then Stripe API fallback. */
export async function resolveProStatus(user: User | null): Promise<boolean> {
  if (!user || user.provider !== "google") return false;

  initSubscriptionSdk(user);

  if (revenueCatConfigured()) {
    const rcPro = await fetchProFromRevenueCat();
    if (rcPro) return true;
  }

  return fetchProFromStripeApi(user);
}
