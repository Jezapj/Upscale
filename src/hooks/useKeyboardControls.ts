import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useControls } from "@/store/useControls";
import { dockNext, dockPrev } from "@/lib/dock";

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable
  );
}

/** Global keyboard bindings for console-style controls. */
export function useKeyboardControls() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const invoke = useControls((s) => s.invoke);
  const keysRef = useRef(new Set<string>());

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;

      const key = e.key.toLowerCase();
      const lHeld = keysRef.current.has("l");
      const rHeld = keysRef.current.has("r");

      if (e.repeat) {
        keysRef.current.add(key);
        return;
      }

      // LT + T → settings (what B/menu used to open on home).
      if (key === "t" && lHeld) {
        e.preventDefault();
        keysRef.current.add(key);
        const { setQuickMenuOpen, setSettingsOpen } = useControls.getState();
        setQuickMenuOpen(false);
        setSettingsOpen(true);
        return;
      }

      // L + B → dock left; R + B → dock right. B alone must not fire while L/R held.
      if (key === "b") {
        e.preventDefault();
        keysRef.current.add(key);
        if (lHeld) {
          navigate(dockPrev(pathname));
          return;
        }
        if (rHeld) {
          navigate(dockNext(pathname));
          return;
        }
        const { settingsOpen, setSettingsOpen, quickMenuOpen, setQuickMenuOpen, toggleQuickMenu } =
          useControls.getState();
        if (quickMenuOpen) {
          setQuickMenuOpen(false);
          return;
        }
        if (settingsOpen) setSettingsOpen(false);
        toggleQuickMenu();
        return;
      }

      keysRef.current.add(key);

      switch (key) {
        case "a":
        case "enter":
          e.preventDefault();
          invoke("primary");
          break;
        case "+":
        case "=":
          e.preventDefault();
          invoke("secondary");
          break;
        case "-":
        case "_":
          e.preventDefault();
          invoke("tertiary");
          break;
        default:
          break;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key.toLowerCase());
    };

    const onBlur = () => keysRef.current.clear();

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [invoke, navigate, pathname]);
}
