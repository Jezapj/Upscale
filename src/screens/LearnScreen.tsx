import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Upload } from "lucide-react";
import { useStore } from "@/store/useStore";
import { StatusBar } from "@/components/StatusBar";
import { PageHeader } from "@/components/PageHeader";
import { Tile } from "@/components/Tile";
import { Sheet } from "@/components/Sheet";
import { ScrollArea } from "@/components/ScrollArea";
import { DeckForm } from "@/components/learn/DeckForm";
import { CardForm } from "@/components/learn/CardForm";
import { ImportDeckPanel } from "@/components/learn/ImportDeckPanel";
import { StudySession } from "@/components/learn/StudySession";
import { deckDueCounts } from "@/lib/learn/scheduler";
import { todayKey } from "@/lib/dates";
import { activeLearnCards, activeLearnDecks, type LearnCard, type LearnDeck } from "@/lib/types";
import { useRegisterControls } from "@/store/useControls";

export function LearnScreen() {
  const nav = useNavigate();
  const data = useStore((s) => s.data);
  const addDeck = useStore((s) => s.addDeck);
  const updateDeck = useStore((s) => s.updateDeck);
  const deleteDeck = useStore((s) => s.deleteDeck);
  const addCard = useStore((s) => s.addCard);
  const updateCard = useStore((s) => s.updateCard);
  const deleteCard = useStore((s) => s.deleteCard);

  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editDeck, setEditDeck] = useState<LearnDeck | null>(null);
  const [browse, setBrowse] = useState<LearnDeck | null>(null);
  const [addCardOpen, setAddCardOpen] = useState(false);
  const [editCard, setEditCard] = useState<LearnCard | null>(null);
  const [studyId, setStudyId] = useState<string | null>(null);

  const goals = data.goals.filter((g) => !g.archived);
  const decks = activeLearnDecks(data.learn?.decks);
  const today = todayKey();

  const counts = useMemo(() => {
    const map = new Map<string, ReturnType<typeof deckDueCounts>>();
    for (const d of decks) map.set(d.id, deckDueCounts(data, d, today));
    return map;
  }, [data, decks, today]);

  useRegisterControls(
    {
      back: () => {
        if (studyId) setStudyId(null);
        else if (editCard) setEditCard(null);
        else if (addCardOpen) setAddCardOpen(false);
        else if (browse) setBrowse(null);
        else if (editDeck) setEditDeck(null);
        else if (addOpen) setAddOpen(false);
        else if (importOpen) setImportOpen(false);
        else nav("/");
      },
      primary: () => {
        if (studyId || addOpen || importOpen || editDeck || browse) return;
        const ready = decks.find((d) => (counts.get(d.id)?.session ?? 0) > 0);
        if (ready) setStudyId(ready.id);
        else setAddOpen(true);
      },
      secondary: () => setAddOpen(true),
    },
    [nav, studyId, editCard, addCardOpen, browse, editDeck, addOpen, importOpen, decks, counts],
  );

  const browseCards = browse
    ? activeLearnCards(data.learn?.cards).filter((c) => c.deckId === browse.id)
    : [];

  return (
    <>
      <StatusBar />
      <ScrollArea className="px-4 pb-4">
        <PageHeader
          title="Learn"
          subtitle="Flashcards that don't pile up on you."
          action={
            <div className="flex gap-2">
              <button
                onClick={() => setImportOpen(true)}
                className="capsule flex h-10 w-10 shrink-0 items-center justify-center text-cat-learning active:scale-90"
                title="Import deck"
              >
                <Upload size={18} strokeWidth={2.8} />
              </button>
              <button
                onClick={() => setAddOpen(true)}
                className="capsule flex h-10 w-10 shrink-0 items-center justify-center text-cat-learning active:scale-90"
              >
                <Plus size={20} strokeWidth={2.8} />
              </button>
            </div>
          }
        />

        {decks.length === 0 ? (
          <div className="card mt-4 p-6 text-center">
            <div className="mx-auto mb-3 w-fit">
              <Tile glyph="🎓" color="#4aa3ff" size={72} state="selected" />
            </div>
            <p className="font-display text-xl font-800 text-ink">No decks yet</p>
            <p className="mt-1 text-sm font-700 text-ink-soft">
              Make a deck, or import one from Anki.
            </p>
            <button onClick={() => setAddOpen(true)} className="btn mt-4 w-full">
              <Plus size={18} /> New deck
            </button>
            <button onClick={() => setImportOpen(true)} className="btn-ghost mt-2 w-full">
              <Upload size={18} /> Import Anki / CSV
            </button>
          </div>
        ) : (
          <div className="panel p-4">
            <div className="grid grid-cols-3 gap-4 sm:grid-cols-4">
              {decks.map((d) => {
                const c = counts.get(d.id);
                const session = c?.session ?? 0;
                return (
                  <button
                    key={d.id}
                    onClick={() => setBrowse(d)}
                    className="flex flex-col items-center gap-1 active:scale-95 transition-transform"
                  >
                    <div className="relative">
                      <Tile glyph={d.icon} color={d.color} size={64} state="selected" />
                      {session > 0 && (
                        <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-cat-exercise px-1 text-[10px] font-900 text-white shadow-soft">
                          {session}
                        </span>
                      )}
                    </div>
                    <span className="content-title line-clamp-2 max-w-full text-center text-[10px] font-800 leading-tight">
                      {d.title}
                    </span>
                    <span className="text-[10px] font-700 text-ink-faint">
                      {session > 0
                        ? `${session} this sitting`
                        : c && c.new + c.due === 0
                          ? "Caught up"
                          : "Browse"}
                    </span>
                  </button>
                );
              })}
              <button
                onClick={() => setAddOpen(true)}
                className="flex flex-col items-center gap-1 active:scale-95 transition-transform"
              >
                <div
                  className="flex items-center justify-center shadow-tile"
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: "30%",
                    background: "linear-gradient(180deg,#f5f6f8,#dde0e6)",
                  }}
                >
                  <Plus size={24} className="text-ink-faint" strokeWidth={2.4} />
                </div>
                <span className="text-[10px] font-800 text-ink-faint">Add</span>
              </button>
            </div>
          </div>
        )}
      </ScrollArea>

      <Sheet open={addOpen} onClose={() => setAddOpen(false)} title="New deck">
        <DeckForm
          goals={goals}
          onSave={(d) => {
            addDeck(d);
            setAddOpen(false);
          }}
        />
      </Sheet>

      <Sheet open={importOpen} onClose={() => setImportOpen(false)} title="Import deck">
        <ImportDeckPanel onImported={() => setImportOpen(false)} />
      </Sheet>

      <Sheet
        open={!!editDeck}
        onClose={() => setEditDeck(null)}
        title="Edit deck"
      >
        {editDeck && (
          <DeckForm
            initial={editDeck}
            goals={goals}
            onSave={(d) => {
              updateDeck(editDeck.id, d);
              setEditDeck(null);
            }}
            onDelete={() => {
              deleteDeck(editDeck.id);
              setEditDeck(null);
              setBrowse(null);
            }}
          />
        )}
      </Sheet>

      <Sheet
        open={!!browse}
        onClose={() => setBrowse(null)}
        title={browse?.title}
      >
        {browse && (
          <div className="space-y-3">
            <p className="text-sm font-700 text-ink-soft">
              {browseCards.length} card{browseCards.length === 1 ? "" : "s"}
              {counts.get(browse.id)?.session
                ? ` · ${counts.get(browse.id)?.session} this sitting`
                : ""}
            </p>
            <div className="flex gap-2">
              <button
                className="btn flex-1"
                onClick={() => {
                  setStudyId(browse.id);
                  setBrowse(null);
                }}
              >
                Study
              </button>
              <button className="btn-ghost" onClick={() => setEditDeck(browse)}>
                Edit
              </button>
            </div>
            <button
              className="btn-ghost w-full"
              onClick={() => setAddCardOpen(true)}
            >
              <Plus size={16} /> Add card
            </button>
            <div className="space-y-2">
              {browseCards.length === 0 ? (
                <div className="card p-4 text-center text-sm font-600 text-ink-soft">
                  Empty deck. Add a card or import one.
                </div>
              ) : (
                browseCards.slice(0, 80).map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setEditCard(c)}
                    className="card w-full p-3 text-left active:scale-[0.99]"
                  >
                    <p className="truncate text-sm font-800 text-ink">{c.front}</p>
                    <p className="mt-0.5 truncate text-xs font-700 text-ink-faint">
                      {c.back || "-"}
                    </p>
                    {c.suspendedAt && (
                      <span className="mt-1 inline-flex rounded-pill bg-white px-2 py-0.5 text-[10px] font-800 text-ink-faint shadow-soft">
                        Got it
                      </span>
                    )}
                  </button>
                ))
              )}
              {browseCards.length > 80 && (
                <p className="text-center text-xs font-700 text-ink-faint">
                  Showing 80 of {browseCards.length}. Study to review the rest.
                </p>
              )}
            </div>
          </div>
        )}
      </Sheet>

      <Sheet open={addCardOpen} onClose={() => setAddCardOpen(false)} title="New card">
        {browse && (
          <CardForm
            onSave={({ front, back }) => {
              addCard({ deckId: browse.id, front, back });
              setAddCardOpen(false);
            }}
          />
        )}
      </Sheet>

      <Sheet open={!!editCard} onClose={() => setEditCard(null)} title="Edit card">
        {editCard && (
          <CardForm
            initial={editCard}
            onSave={({ front, back, suspendedAt }) => {
              updateCard(editCard.id, {
                front,
                back,
                ...(suspendedAt === null ? { suspendedAt: undefined } : {}),
              });
              setEditCard(null);
            }}
            onDelete={() => {
              deleteCard(editCard.id);
              setEditCard(null);
            }}
          />
        )}
      </Sheet>

      {studyId && (
        <StudySession deckId={studyId} onClose={() => setStudyId(null)} />
      )}
    </>
  );
}
