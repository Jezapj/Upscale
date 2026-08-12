import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Bell, Plus, StickyNote } from "lucide-react";
import { useStore } from "@/store/useStore";
import { StatusBar } from "@/components/StatusBar";
import { PageHeader } from "@/components/PageHeader";
import { Tile } from "@/components/Tile";
import { Sheet } from "@/components/Sheet";
import { NoteForm } from "@/components/NoteForm";
import { formatNoteReminderLabel } from "@/lib/reminders";
import type { Note } from "@/lib/types";
import { useRegisterControls } from "@/store/useControls";

export function NotesScreen() {
  const nav = useNavigate();
  const { data, addNote, updateNote, deleteNote } = useStore();
  const [params, setParams] = useSearchParams();
  const [addOpen, setAddOpen] = useState(false);

  const notes = data.notes ?? [];
  const selectedId = params.get("id");
  const selected = notes.find((n) => n.id === selectedId) ?? null;

  // `?new=1` opens the composer straight away (from the dashboard plus button).
  useEffect(() => {
    if (params.get("new") === null) return;
    setAddOpen(true);
    setParams({}, { replace: true });
  }, [params, setParams]);

  // Clear an invalid ?id once.
  useEffect(() => {
    if (selectedId && !selected) setParams({}, { replace: true });
  }, [selectedId, selected, setParams]);

  useRegisterControls(
    {
      back: () => (selected ? setParams({}) : nav("/")),
      primary: () => setAddOpen(true),
    },
    [nav, selected, setParams],
  );

  return (
    <>
      <StatusBar />
      <div className="scroll-area px-4 pb-4">
        <PageHeader
          title="Notes"
          subtitle="Jot things down and get a nudge when it matters."
          action={
            <button
              onClick={() => setAddOpen(true)}
              className="capsule flex h-10 w-10 shrink-0 items-center justify-center text-cat-learning active:scale-90"
            >
              <Plus size={20} strokeWidth={2.8} />
            </button>
          }
        />

        {notes.length === 0 ? (
          <div className="card mt-6 p-6 text-center">
            <div className="mx-auto mb-3 w-fit">
              <Tile glyph="📝" color="#ffb43d" size={72} state="selected" />
            </div>
            <p className="font-display text-xl font-800 text-ink">No notes yet</p>
            <p className="mt-1 text-sm font-600 text-ink-soft">
              Keep ideas, reflections and shopping lists here — add a reminder to
              any note and Upscale will notify you.
            </p>
            <button onClick={() => setAddOpen(true)} className="btn mt-4">
              <Plus size={18} /> New note
            </button>
          </div>
        ) : (
          <div className="space-y-2.5">
            {notes.map((n) => (
              <NoteCard key={n.id} note={n} onOpen={() => setParams({ id: n.id })} />
            ))}
          </div>
        )}
      </div>

      <Sheet open={addOpen} onClose={() => setAddOpen(false)} title="New note">
        <NoteForm
          onSave={(d) => {
            addNote(d);
            setAddOpen(false);
          }}
        />
      </Sheet>

      <Sheet open={!!selected} onClose={() => setParams({})} title="Edit note">
        {selected && (
          <NoteForm
            initial={selected}
            onSave={(d) => {
              updateNote(selected.id, d);
              setParams({});
            }}
            onDelete={() => {
              deleteNote(selected.id);
              setParams({});
            }}
          />
        )}
      </Sheet>
    </>
  );
}

function NoteCard({ note, onOpen }: { note: Note; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="card flex w-full items-start gap-3 p-3 text-left active:scale-[0.99] transition-transform"
    >
      <span
        className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl text-white shadow-soft"
        style={{ background: note.color }}
      >
        <StickyNote size={18} strokeWidth={2.6} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="content-title truncate font-800">
          {note.title || "Untitled note"}
        </p>
        {note.body && (
          <p className="line-clamp-2 whitespace-pre-line text-xs font-600 text-ink-soft">
            {note.body}
          </p>
        )}
        {note.reminderAt && (
          <span className="mt-1.5 inline-flex items-center gap-1 rounded-pill bg-white/80 px-2.5 py-1 text-[10px] font-900 text-ink-faint shadow-soft">
            <Bell size={11} /> {formatNoteReminderLabel(note.reminderAt)}
          </span>
        )}
      </div>
    </button>
  );
}
