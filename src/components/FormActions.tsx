import { useState, type ReactNode } from "react";
import { Trash2 } from "lucide-react";

interface Props {
  /** Omit to hide the delete button (e.g. when creating). */
  onDelete?: () => void;
  /** What's being deleted, e.g. "note" -> "Delete this note?" */
  itemLabel: string;
  /** Optional extra warning shown under the question. */
  deleteDetail?: string;
  /** The save button. */
  children: ReactNode;
}

/** Bottom row of an edit form: trash + save, with an inline "are you sure?" step before deleting. */
export function FormActions({ onDelete, itemLabel, deleteDetail, children }: Props) {
  const [confirming, setConfirming] = useState(false);

  if (confirming && onDelete) {
    return (
      <div className="card space-y-3 p-4 pt-3">
        <div className="text-center">
          <p className="text-sm font-800 text-ink">
            Are you sure you want to delete this {itemLabel}?
          </p>
          {deleteDetail && (
            <p className="mt-1 text-xs font-600 text-ink-soft">{deleteDetail}</p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="btn-ghost flex-1"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-pill bg-cat-exercise font-800 text-white shadow-soft active:scale-95"
            data-sfx="alert"
          >
            <Trash2 size={18} /> Delete
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2 pt-1">
      {onDelete && (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          aria-label={`Delete ${itemLabel}`}
          className="flex h-12 w-12 items-center justify-center rounded-pill bg-white/80 text-cat-exercise shadow-soft active:scale-95"
        >
          <Trash2 size={20} />
        </button>
      )}
      {children}
    </div>
  );
}
