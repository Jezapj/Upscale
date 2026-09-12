import type { User } from "./types";
import { Purchases } from "@revenuecat/purchases-js";
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

const BILLING_UID_KEY = "upscale:billing-uid";

function pinBillingUid(candidate: string): string {
  try {
    const existing = localStorage.getItem(BILLING_UID_KEY);
    if (existing) return existing;
    localStorage.setItem(BILLING_UID_KEY, candidate);
    return candidate;
  } catch {
    return candidate;
  }
}

/** Stable RevenueCat / Stripe app user id, pinned on first sign-in. */
export function subscriptionUserId(user: User | null): string | null {
  if (!user) return null;
  const strippedId = user.id.replace(/^google:/, "");
  return pinBillingUid(strippedId);
}

/** Get the currently pinned billing uid (for debugging/reconciliation). */
export function getPinnedBillingUid(): string | null {
  try {
    return localStorage.getItem(BILLING_UID_KEY);
  } catch {
    return null;
  }
}

/** Clear pinned billing uid (for testing or manual reset). */
export function clearPinnedBillingUid(): void {
  try {
    localStorage.removeItem(BILLING_UID_KEY);
  } catch {
    /* noop */
  }
}

/** Initialize RevenueCat for the signed-in user. */
export function initSubscriptionSdk(user: User | null): void {
  const uid = subscriptionUserId(user);
  if (!uid || !revenueCatConfigured()) return;
  console.log("[initSubscriptionSdk] Configuring RevenueCat with uid:", uid);
  configurePurchases(uid);
}

/** Check Stripe subscription status via server API (fallback when RC is not configured). */
export async function fetchProFromStripeApi(
  user: User | null,
): Promise<boolean> {
  const uid = subscriptionUserId(user);
  const email = user?.email ?? undefined;
  if (!uid || !stripeCheckoutConfigured()) return false;

  try {
    const params = new URLSearchParams({ uid });
    if (email) params.set("email", email);
    const res = await fetch(
      `${subscriptionApiBase()}/subscription-status?${params.toString()}`,
    );
    if (!res.ok) {
      console.warn("[fetchProFromStripeApi] API error:", res.status, await res.text());
      return false;
    }
    const body = (await res.json()) as { active?: boolean };
    console.log("[fetchProFromStripeApi] Result:", { active: body.active, uid, email });
    return body.active === true;
  } catch (err) {
    console.warn("[fetchProFromStripeApi] Failed", err);
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
    console.log("[resolveProStatus] RevenueCat check:", { rcPro, userId: user.id });
    if (rcPro) return true;

    // Reconciliation: if pinned ID differs from current Google sub, try the legacy sub
    const pinnedUid = getPinnedBillingUid();
    const currentSub = user.id.replace(/^google:/, "");
    if (pinnedUid && pinnedUid !== currentSub) {
      console.log("[resolveProStatus] Trying legacy Google sub for reconciliation:", { pinnedUid, currentSub });
      try {
        const instance = Purchases.getSharedInstance();
        // Switch to legacy ID to check
        await instance.changeUser(currentSub);
        const info = await instance.getCustomerInfo();
        const legacyPro = "pro" in info.entitlements.active;
        console.log("[resolveProStatus] Legacy sub check:", { legacyPro, currentSub });
        if (legacyPro) {
          // Found entitlement on legacy ID - re-pin to legacy and keep it
          clearPinnedBillingUid();
          localStorage.setItem(BILLING_UID_KEY, currentSub);
          return true;
        }
        // Restore pinned ID
        await instance.changeUser(pinnedUid);
      } catch (err) {
        console.warn("[resolveProStatus] Legacy reconciliation failed", err);
      }
    }
  }

  const stripePro = await fetchProFromStripeApi(user);
  console.log("[resolveProStatus] Stripe API fallback:", { stripePro, userId: user.id });
  return stripePro;
}
