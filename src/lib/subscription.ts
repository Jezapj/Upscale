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

/** Force re-pin to current Google sub (for manual recovery). */
export function forceRepinToCurrentSub(user: User | null): string | null {
  if (!user) return null;
  const currentSub = user.id.replace(/^google:/, "");
  try {
    localStorage.setItem(BILLING_UID_KEY, currentSub);
    console.log("[forceRepinToCurrentSub] Re-pinned to:", currentSub);
    return currentSub;
  } catch {
    return currentSub;
  }
}

/** Initialize RevenueCat for the signed-in user. */
export function initSubscriptionSdk(user: User | null): void {
  const uid = subscriptionUserId(user);
  const currentSub = user?.id.replace(/^google:/, "");
  const pinned = getPinnedBillingUid();
  console.log("[initSubscriptionSdk] Configuring RevenueCat:", { 
    uid, 
    currentSub, 
    pinned,
    userId: user?.id,
    match: uid === currentSub 
  });
  if (!uid || !revenueCatConfigured()) return;
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

    // AGGRESSIVE RECONCILIATION: Try ALL possible IDs
    const pinnedUid = getPinnedBillingUid();
    const currentSub = user.id.replace(/^google:/, "");
    const firebaseUid = user.id.startsWith("google:") ? user.id.slice("google:".length) : null;
    
    const candidateIds = [
      { id: currentSub, label: "Google sub" },
      { id: pinnedUid, label: "Pinned UID" },
      { id: firebaseUid, label: "Firebase UID" },
    ].filter((c): c is { id: string; label: string } => !!c.id);

    console.log("[resolveProStatus] Trying all candidate IDs:", { candidates: candidateIds.map(c => c.id) });

    const instance = Purchases.getSharedInstance();
    for (const { id, label } of candidateIds) {
      try {
        console.log(`[resolveProStatus] Checking ${label}:`, id);
        await instance.changeUser(id);
        const info = await instance.getCustomerInfo();
        const active = "Upscale Pro" in info.entitlements.active;
        console.log(`[resolveProStatus] ${label} check:`, { 
          active, 
          activeEntitlements: Object.keys(info.entitlements.active),
          originalAppUserId: info.originalAppUserId,
          id 
        });
        if (active) {
          // Found it! Re-pin to this ID
          clearPinnedBillingUid();
          localStorage.setItem(BILLING_UID_KEY, id);
          console.log("[resolveProStatus] SUCCESS - Re-pinned to:", id);
          return true;
        }
      } catch (err) {
        console.warn(`[resolveProStatus] ${label} check failed:`, err);
      }
    }

    // Restore to pinned (or current sub if nothing pinned)
    const restoreId = pinnedUid || currentSub;
    try {
      await instance.changeUser(restoreId);
    } catch {
      // ignore
    }
  }

  const stripePro = await fetchProFromStripeApi(user);
  console.log("[resolveProStatus] Stripe API fallback:", { stripePro, userId: user.id });
  return stripePro;
}
