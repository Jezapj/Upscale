import { Bell, Plus, StickyNote } from "lucide-react";
import type { Note } from "@/lib/types";
import { formatNoteReminderLabel } from "@/lib/reminders";

interface Props {
  note?: Note;
  count: number;
  onOpen: () => void;
  onAdd: () => void;
}

/** Thin dashboard row: latest note (70%) + add-note button (30%). */
export function NotesStrip({ note, count, onOpen, onAdd }: Props) {
  return (
    <div className="flex gap-2">
      <button
        onClick={onOpen}
        className="card flex min-w-0 flex-[7] items-center gap-2.5 p-2.5 text-left active:scale-[0.99] transition-transform"
      >
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-white shadow-soft"
          style={{ background: note?.color ?? "#ffb43d" }}
        >
          <StickyNote size={16} strokeWidth={2.6} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="content-title block truncate text-sm font-800">
            {note ? note.title || "Untitled note" : "Create a note"}
          </span>
          <span className="flex items-center gap-1 truncate text-[11px] font-700 text-ink-faint">
            {note?.reminderAt && <Bell size={10} className="shrink-0" />}
            {note
              ? note.reminderAt
                ? formatNoteReminderLabel(note.reminderAt)
                : note.body || `${count} note${count === 1 ? "" : "s"}`
              : "Ideas, reminders, lists…"}
          </span>
        </span>
      </button>

      <button
        onClick={onAdd}
        className="capsule flex flex-[3] items-center justify-center gap-1 text-cat-learning active:scale-95 transition-transform"
      >
        <Plus size={18} strokeWidth={2.8} />
      </button>
    </div>
  );
}
