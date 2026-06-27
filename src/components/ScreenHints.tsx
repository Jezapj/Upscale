import { useLocation } from "react-router-dom";
import { useControls } from "@/store/useControls";
import { HintBar, type Hint } from "./HintBar";

function wire(hints: Hint[], invoke: (k: NonNullable<Hint["action"]>) => void): Hint[] {
  return hints.map((h) =>
    h.action
      ? { ...h, onClick: () => invoke(h.action!) }
      : h,
  );
}

/** Route-aware console hints — clickable and mirrored by keyboard shortcuts. */
export function ScreenHints() {
  const { pathname } = useLocation();
  const invoke = useControls((s) => s.invoke);
  const setSettingsOpen = useControls((s) => s.setSettingsOpen);
  const toggleQuickMenu = useControls((s) => s.toggleQuickMenu);

  const optionsHint: Hint = {
    glyph: "B",
    label: "Options",
    onClick: toggleQuickMenu,
  };
  const settingsHint: Hint = {
    glyph: "LT",
    label: "Menu",
    onClick: () => setSettingsOpen(true),
  };

  if (pathname.startsWith("/checkin")) return null;

  if (pathname === "/") {
    return (
      <HintBar
        insetSafe={false}
        left={[settingsHint, optionsHint]}
        right={wire(
          [
            { glyph: "A", label: "Check-in", action: "primary" },
            { glyph: "+", label: "Add", action: "secondary" },
          ],
          invoke,
        )}
      />
    );
  }

  if (pathname.startsWith("/goals")) {
    return (
      <HintBar
        insetSafe={false}
        left={[
          settingsHint,
          optionsHint,
          ...wire([{ glyph: "←", label: "Back", action: "back" }], invoke),
        ]}
        right={wire([{ glyph: "A", label: "Open goal", action: "primary" }], invoke)}
      />
    );
  }

  if (pathname.startsWith("/library")) {
    return (
      <HintBar
        insetSafe={false}
        left={[
          settingsHint,
          optionsHint,
          ...wire([{ glyph: "←", label: "Back", action: "back" }], invoke),
        ]}
        right={wire(
          [
            { glyph: "A", label: "Open", action: "primary" },
            { glyph: "+", label: "New routine", action: "secondary" },
          ],
          invoke,
        )}
      />
    );
  }

  if (pathname.startsWith("/progress")) {
    return (
      <HintBar
        insetSafe={false}
        left={[settingsHint, optionsHint]}
        right={wire(
          [
            { glyph: "−", label: "Details", action: "tertiary" },
            { glyph: "A", label: "Select", action: "primary" },
          ],
          invoke,
        )}
      />
    );
  }

  return (
    <HintBar
      insetSafe={false}
      left={[settingsHint, optionsHint]}
      right={wire([{ glyph: "A", label: "Select", action: "primary" }], invoke)}
    />
  );
}

/** Check-in flow hints (full-width screen, no dock). */
export function CheckinHints() {
  const invoke = useControls((s) => s.invoke);
  const setSettingsOpen = useControls((s) => s.setSettingsOpen);
  const toggleQuickMenu = useControls((s) => s.toggleQuickMenu);

  return (
    <HintBar
      left={[
        { glyph: "LT", label: "Menu", onClick: () => setSettingsOpen(true) },
        { glyph: "B", label: "Options", onClick: toggleQuickMenu },
        ...wire([{ glyph: "←", label: "Back", action: "back" }], invoke),
        ...wire([{ glyph: "−", label: "Skip", action: "tertiary" }], invoke),
      ]}
      right={wire([{ glyph: "A", label: "Rate", action: "primary" }], invoke)}
    />
  );
}
