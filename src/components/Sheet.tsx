import { type ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

/** Bottom sheet for add/edit forms. Portals to the app shell so it can extend
 *  behind the dock; the dock (z-50) stays on top while you scroll the form. */
export function Sheet({ open, onClose, title, children }: Props) {
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

  if (!open || !shell) return null;

  return createPortal(
    <div className="absolute inset-0 z-40 flex flex-col justify-end">
      <button
        aria-label="Close"
        className="absolute inset-0 bg-ink/20 backdrop-blur-[2px] animate-pop-in"
        onClick={onClose}
      />
      <div className="sheet-panel relative z-10 flex max-h-[96%] min-h-0 flex-col overflow-hidden animate-slide-up rounded-t-[2rem] border-t border-white/80 bg-[#f2f3f5]/97 backdrop-blur-xl shadow-[0_-18px_40px_-12px_rgba(70,80,100,0.45)]">
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <div className="mx-auto h-1.5 w-12 rounded-full bg-ink-faint/40" />
        </div>
        <div className="flex items-center justify-between px-5 pb-1">
          {title && (
            <h2 className="font-display text-xl font-700 text-ink">{title}</h2>
          )}
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/80 text-ink-soft shadow-soft active:scale-95"
          >
            <X size={18} />
          </button>
        </div>
        {/* Extra bottom padding clears the dock so the confirm button scrolls into view. */}
        <div className="scroll-area min-h-0 flex-1 px-5 pt-3 pb-[calc(6.75rem+env(safe-area-inset-bottom))]">
          {children}
        </div>
      </div>
    </div>,
    shell,
  );
}
