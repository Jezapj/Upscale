import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Crown, Loader2, X } from "lucide-react";
import { Sheet } from "./Sheet";
import { PRO_PRICE_LABEL } from "@/lib/games";
import {
  presentProPaywall,
  purchaseProPackage,
  revenueCatConfigured,
} from "@/lib/revenuecat";
import { useSubscription } from "@/hooks/useSubscription";
import { useStore } from "@/store/useStore";
import { ScrollArea } from "@/components/ScrollArea";

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
        // Let the overlay lay out before RevenueCat measures and renders into it.
        await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
        const target = paywallRef.current;
        if (!target) {
          throw new Error("Paywall container not ready. Try again.");
        }
        target.scrollTop = 0;
        const active = await presentProPaywall(target);
        if (active) onSuccess();
        else setShowPaywall(false);
        return;
      }
      const active = await purchaseProPackage();
      if (active) onSuccess();
    } catch (err) {
      setShowPaywall(false);
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
    <>
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
              You&apos;re on Pro - enjoy unlimited Endless plays.
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
                    `Subscribe · ${PRO_PRICE_LABEL}`
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
                    `Subscribe with Stripe · ${PRO_PRICE_LABEL}`
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
        </div>
      </Sheet>

      <PaywallOverlay
        open={showPaywall}
        onClose={() => setShowPaywall(false)}
        containerRef={paywallRef}
      />
    </>
  );
}

/**
 * Full-height panel for the RevenueCat-hosted paywall. It slides up from the
 * bottom over the whole app (leaving a strip of the screen visible) so the
 * paywall gets its own scroll context and always opens at the top - embedding
 * it inside the sheet made it inherit the sheet's scroll position.
 * Kept mounted so the container ref exists the moment checkout starts.
 */
function PaywallOverlay({
  open,
  onClose,
  containerRef,
}: {
  open: boolean;
  onClose: () => void;
  containerRef: React.RefObject<HTMLDivElement>;
}) {
  const [shell, setShell] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setShell(document.getElementById("app-shell"));
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!shell) return null;

  return createPortal(
    <div
      className={
        open ? "absolute inset-0 z-50 flex flex-col justify-end" : "hidden"
      }
    >
      <button
        aria-label="Close"
        className="absolute inset-0 bg-ink/25 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div className="sheet-panel relative z-10 flex h-[calc(100%-2.75rem)] min-h-0 flex-col overflow-hidden animate-slide-up rounded-t-[2rem] border-t border-white/80 bg-[#f2f3f5]/97 backdrop-blur-xl shadow-[0_-18px_40px_-12px_rgba(70,80,100,0.45)]">
        <div className="flex items-center justify-between px-5 pb-2 pt-3">
          <h2 className="font-display text-xl font-700 text-ink">Checkout</h2>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/80 text-ink-soft shadow-soft active:scale-95"
          >
            <X size={18} />
          </button>
        </div>
        <ScrollArea ref={containerRef} className="min-h-0 flex-1 px-2 pb-2" />
      </div>
    </div>,
    shell,
  );
}
