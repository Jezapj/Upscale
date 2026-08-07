import { useCallback, useEffect, useRef, useState } from "react";
import { Crown, Loader2 } from "lucide-react";
import { Sheet } from "./Sheet";
import { PRO_PRICE_LABEL } from "@/lib/games";
import {
  presentProPaywall,
  purchaseProPackage,
  revenueCatConfigured,
} from "@/lib/revenuecat";
import { useSubscription } from "@/hooks/useSubscription";
import { useStore } from "@/store/useStore";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ProSubscriptionSheet({ open, onClose }: Props) {
  const user = useStore((s) => s.user);
  const setGamePremium = useStore((s) => s.setGamePremium);
  const {
    isPro,
    paymentsConfigured,
    checkoutLoading,
    startCheckout,
    syncProStatus,
  } = useSubscription();

  const paywallRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);

  useEffect(() => {
    if (!open) {
      setShowPaywall(false);
      setError(null);
    }
  }, [open]);

  const onSuccess = useCallback(() => {
    setGamePremium(true);
    onClose();
  }, [onClose, setGamePremium]);

  const subscribeWithRevenueCat = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      if (revenueCatConfigured()) {
        setShowPaywall(true);
        const target = paywallRef.current;
        if (!target) {
          throw new Error("Paywall container not ready. Try again.");
        }
        const active = await presentProPaywall(target);
        if (active) onSuccess();
        return;
      }
      const active = await purchaseProPackage();
      if (active) onSuccess();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not complete subscription.",
      );
    } finally {
      setBusy(false);
    }
  }, [onSuccess]);

  const subscribeWithStripe = useCallback(async () => {
    setError(null);
    const started = await startCheckout();
    if (!started) {
      setError("Could not start checkout. Check Stripe API configuration.");
    }
  }, [startCheckout]);

  const needsSignIn = !user || user.provider !== "google";

  return (
    <Sheet open={open} onClose={onClose} title="Upscale Pro">
      <div className="space-y-4">
        <div className="card flex items-start gap-3 p-4">
          <Crown size={22} className="mt-0.5 shrink-0 text-cat-project" />
          <div className="min-w-0">
            <p className="font-800 text-ink">Unlimited Endless plays</p>
            <p className="mt-1 text-sm font-600 text-ink-soft">
              Daily challenges stay free. Pro unlocks unlimited Endless mode
              across all arcade games.
            </p>
            <p className="mt-2 text-sm font-800 text-ink">{PRO_PRICE_LABEL}</p>
          </div>
        </div>

        {isPro ? (
          <p className="text-center text-sm font-800 text-accent">
            You&apos;re on Pro — enjoy unlimited Endless plays.
          </p>
        ) : needsSignIn ? (
          <p className="text-center text-sm font-700 text-ink-soft">
            Sign in with Google to subscribe and sync Pro across devices.
          </p>
        ) : !paymentsConfigured ? (
          <p className="text-center text-sm font-700 text-ink-soft">
            Payments are not configured yet. Add RevenueCat or Stripe keys to
            your environment.
          </p>
        ) : (
          <div className="space-y-2">
            {revenueCatConfigured() && (
              <button
                type="button"
                className="btn w-full"
                disabled={busy || checkoutLoading}
                onClick={() => void subscribeWithRevenueCat()}
              >
                {busy ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  `Subscribe — ${PRO_PRICE_LABEL}`
                )}
              </button>
            )}
            {!revenueCatConfigured() && (
              <button
                type="button"
                className="btn w-full"
                disabled={checkoutLoading}
                onClick={() => void subscribeWithStripe()}
              >
                {checkoutLoading ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  `Subscribe with Stripe — ${PRO_PRICE_LABEL}`
                )}
              </button>
            )}
          </div>
        )}

        {error && (
          <p className="text-center text-sm font-700 text-cat-health">{error}</p>
        )}

        {user?.provider === "google" && (
          <button
            type="button"
            className="btn-ghost w-full text-sm"
            onClick={() => void syncProStatus()}
          >
            Refresh subscription status
          </button>
        )}

        <div
          ref={paywallRef}
          className={
            showPaywall
              ? "min-h-[280px] rounded-2xl border border-black/5 bg-white/50"
              : "hidden"
          }
        />
      </div>
    </Sheet>
  );
}
