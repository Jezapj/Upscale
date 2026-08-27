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

const SKIP = "[data-sfx-skip], input[type='range'], textarea, canvas, button:disabled, a[aria-disabled='true']";

const MOVE_CANCEL_PX = 10;

const lastScrollPos = new WeakMap<EventTarget, { top: number; left: number }>();

type Gesture = {
  pointerId: number;
  x: number;
  y: number;
  el: Element;
  cancelled: boolean;
};

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

function tappableOf(target: EventTarget | null): Element | null {
  if (!(target instanceof Element)) return null;
  if (target.closest(SKIP)) return null;
  return target.closest(TAPPABLE);
}

/** UI chimes for taps, sheets, and scroll. */
export function UiTapSound() {
  useEffect(() => {
    preloadUiChimes();
    warmupScrollClip();

    let gesture: Gesture | null = null;

    const onPointerDown = (e: PointerEvent) => {
      const el = tappableOf(e.target);
      if (!el) {
        gesture = null;
        return;
      }
      gesture = {
        pointerId: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        el,
        cancelled: false,
      };
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!gesture || e.pointerId !== gesture.pointerId || gesture.cancelled) return;
      const dx = e.clientX - gesture.x;
      const dy = e.clientY - gesture.y;
      if (dx * dx + dy * dy > MOVE_CANCEL_PX * MOVE_CANCEL_PX) {
        gesture.cancelled = true;
      }
    };

    const onPointerCancel = (e: PointerEvent) => {
      if (gesture && e.pointerId === gesture.pointerId) gesture.cancelled = true;
    };

    const onClick = (e: MouseEvent) => {
      const el = tappableOf(e.target);
      if (!el) {
        gesture = null;
        return;
      }
      if (gesture) {
        const dragged = gesture.cancelled;
        const sameControl = gesture.el === el || gesture.el.contains(el) || el.contains(gesture.el);
        gesture = null;
        if (dragged || !sameControl) return;
      }
      playUiTapKind(pickTapChime(el));
    };

    const onScroll = (e: Event) => {
      if (gesture) gesture.cancelled = true;
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
    document.addEventListener("pointermove", onPointerMove, true);
    document.addEventListener("pointercancel", onPointerCancel, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointermove", onPointerMove, true);
      document.removeEventListener("pointercancel", onPointerCancel, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("scroll", onScroll, true);
    };
  }, []);

  return null;
}
