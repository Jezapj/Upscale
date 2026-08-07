import {
  Purchases,
  ErrorCode,
  PurchasesError,
  type Package,
} from "@revenuecat/purchases-js";

/** Entitlement identifier — must match RevenueCat dashboard. */
export const PRO_ENTITLEMENT = "pro";

export function revenueCatConfigured(): boolean {
  return !!import.meta.env.VITE_REVENUECAT_API_KEY;
}

function apiKey(): string {
  return import.meta.env.VITE_REVENUECAT_API_KEY ?? "";
}

/** Configure RevenueCat for a signed-in user (Firebase uid). */
export function configurePurchases(appUserId: string): Purchases | null {
  if (!revenueCatConfigured()) return null;
  try {
    return Purchases.configure({ apiKey: apiKey(), appUserId });
  } catch {
    return Purchases.getSharedInstance();
  }
}

export function isProEntitlementActive(
  entitlements: Record<string, unknown>,
): boolean {
  return PRO_ENTITLEMENT in entitlements;
}

/** Fetch whether the current customer has an active Pro entitlement. */
export async function fetchProFromRevenueCat(): Promise<boolean> {
  if (!revenueCatConfigured()) return false;
  try {
    const info = await Purchases.getSharedInstance().getCustomerInfo();
    return isProEntitlementActive(info.entitlements.active);
  } catch (err) {
    console.warn("RevenueCat customer info failed", err);
    return false;
  }
}

/** Present the RevenueCat-managed paywall inside a container element. */
export async function presentProPaywall(
  htmlTarget: HTMLElement,
): Promise<boolean> {
  if (!revenueCatConfigured()) return false;
  try {
    const result = await Purchases.getSharedInstance().presentPaywall({
      htmlTarget,
    });
    return isProEntitlementActive(result.customerInfo.entitlements.active);
  } catch (err) {
    if (
      err instanceof PurchasesError &&
      err.errorCode === ErrorCode.UserCancelledError
    ) {
      return false;
    }
    throw err;
  }
}

/** Purchase the monthly Pro package from the current offering. */
export async function purchaseProPackage(): Promise<boolean> {
  if (!revenueCatConfigured()) return false;
  const offerings = await Purchases.getSharedInstance().getOfferings({
    currency: "USD",
  });
  const pkg: Package | undefined =
    offerings.current?.monthly ?? offerings.current?.availablePackages[0];
  if (!pkg) throw new Error("No subscription package found in RevenueCat offering.");

  try {
    const result = await Purchases.getSharedInstance().purchase({
      rcPackage: pkg,
    });
    return isProEntitlementActive(result.customerInfo.entitlements.active);
  } catch (err) {
    if (
      err instanceof PurchasesError &&
      err.errorCode === ErrorCode.UserCancelledError
    ) {
      return false;
    }
    throw err;
  }
}
