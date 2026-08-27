import { useEffect } from "react";
import {
  onUiScroll,
  pickTapChime,
  playUiTapKind,
  preloadUiChimes,
  warmupScrollClip,
} from "@/lib/uiSound";

const TAPPABLE =
  "button, a, [role='button'], input[type='checkbox'], input[type='radio'], select, summary, [data-sfx]";

const lastScrollPos = new WeakMap<EventTarget, { top: number; left: number }>();

function scrollPosOf(
  target: EventTarget | null,
): { key: EventTarget; top: number; left: number } | null {
  if (target instanceof Document) {
    const el = target.scrollingElement;
    if (!el) return null;
    return { key: el, top: el.scrollTop, left: el.scrollLeft };
  }
  if (target instanceof Element) {
    return { key: target, top: target.scrollTop, left: target.scrollLeft };
  }
  return null;
}

/** UI chimes for taps, sheets, and scroll. */
export function UiTapSound() {
  useEffect(() => {
    preloadUiChimes();
    warmupScrollClip();

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      if (target.closest("[data-sfx-skip], input[type='range'], textarea, canvas")) return;
      if (!target.closest(TAPPABLE)) return;
      playUiTapKind(pickTapChime(target));
    };

    const onScroll = (e: Event) => {
      const pos = scrollPosOf(e.target);
      if (!pos) return;
      const prev = lastScrollPos.get(pos.key);
      lastScrollPos.set(pos.key, { top: pos.top, left: pos.left });
      const delta = prev
        ? Math.abs(pos.top - prev.top) + Math.abs(pos.left - prev.left)
        : 1;
      if (delta < 1) return;
      onUiScroll(delta);
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("scroll", onScroll, true);
    };
  }, []);

  return null;
}
