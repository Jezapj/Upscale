import { useCallback, useEffect, useState } from "react";
import { useStore } from "@/store/useStore";
import {
  initSubscriptionSdk,
  resolveProStatus,
  startStripeCheckout,
  stripeCheckoutConfigured,
} from "@/lib/subscription";
import { revenueCatConfigured } from "@/lib/revenuecat";

export function useSubscription() {
  const user = useStore((s) => s.user);
  const isPro = useStore((s) => s.data.gamePremium === true);
  const setGamePremium = useStore((s) => s.setGamePremium);
  const [checking, setChecking] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  const paymentsConfigured =
    revenueCatConfigured() || stripeCheckoutConfigured();

  const syncProStatus = useCallback(async () => {
    if (!user || user.provider !== "google") {
      setGamePremium(false);
      return false;
    }
    setChecking(true);
    try {
      const active = await resolveProStatus(user);
      setGamePremium(active);
      return active;
    } finally {
      setChecking(false);
    }
  }, [user, setGamePremium]);

  useEffect(() => {
    initSubscriptionSdk(user);
  }, [user]);

  useEffect(() => {
    if (user?.provider === "google") {
      void syncProStatus();
    }
  }, [user, syncProStatus]);

  const startCheckout = useCallback(async () => {
    if (!user) return false;
    setCheckoutLoading(true);
    try {
      const url = await startStripeCheckout(user, user.email);
      if (url) {
        window.location.href = url;
        return true;
      }
      return false;
    } finally {
      setCheckoutLoading(false);
    }
  }, [user]);

  return {
    isPro,
    checking,
    checkoutLoading,
    paymentsConfigured,
    syncProStatus,
    startCheckout,
  };
}
