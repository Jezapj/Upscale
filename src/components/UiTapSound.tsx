import { useEffect } from "react";
import { playUiTap } from "@/lib/uiSound";
import { useUiSound } from "@/store/useUiSound";

const TAPPABLE =
  "button, a, [role='button'], input[type='checkbox'], input[type='radio'], select, summary";

/** Plays a soft eShop-style blip whenever a tappable element is pressed. */
export function UiTapSound() {
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      if (!target.closest(TAPPABLE)) return;
      const { volume, muted } = useUiSound.getState();
      if (!muted) playUiTap(volume);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, []);

  return null;
}
