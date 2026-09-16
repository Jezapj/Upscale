import { useState } from "react";
import { Upload } from "lucide-react";
import { parseDeckFile, SYNC_CARD_WARN, type DeckImportResult } from "@/lib/learn/ankiImport";
import { useStore } from "@/store/useStore";

interface Props {
  onImported: () => void;
}

export function ImportDeckPanel({ onImported }: Props) {
  const importDeck = useStore((s) => s.importDeck);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<DeckImportResult | null>(null);
  const [fileLabel, setFileLabel] = useState<string | null>(null);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    setPreview(null);
    setFileLabel(file.name);
    try {
      const result = await parseDeckFile(file);
      if (result.cardCount === 0) {
        setError("No cards found in that file.");
      } else {
        setPreview(result);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that file.");
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      for (const deck of preview.decks) {
        await importDeck(
          {
            title: deck.name,
            icon: "🎓",
            color: "#4aa3ff",
            newPerSession: 10,
            sessionSize: 20,
            source: preview.source,
          },
          deck.cards,
        );
      }
      onImported();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't import that file.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm font-700 text-ink-soft">
        Import an Anki <span className="font-800 text-ink">.apkg</span> deck or a
        CSV/TSV with front and back columns. Audio and images stay on this
        device.
      </p>

      <label className="btn w-full cursor-pointer">
        <Upload size={18} />
        {busy ? "Reading…" : "Choose file"}
        <input
          type="file"
          accept=".apkg,.colpkg,.zip,.csv,.tsv,.txt"
          className="hidden"
          disabled={busy}
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
      </label>
      {fileLabel && (
        <p className="text-center text-xs font-700 text-ink-faint">{fileLabel}</p>
      )}

      {error && (
        <div className="card p-3 text-sm font-700 text-cat-exercise">{error}</div>
      )}

      {preview && (
        <div className="space-y-3">
          <div className="card p-4">
            <p className="font-display text-lg font-800 text-ink">
              {preview.cardCount} card{preview.cardCount === 1 ? "" : "s"}
            </p>
            <ul className="mt-2 space-y-1 text-sm font-700 text-ink-soft">
              {preview.decks.map((d) => (
                <li key={d.name}>
                  {d.name} · {d.cards.length}
                </li>
              ))}
            </ul>
            {preview.mediaCount > 0 && (
              <p className="mt-2 text-xs font-700 text-ink-faint">
                {preview.mediaCount} audio/image file
                {preview.mediaCount === 1 ? "" : "s"} will stay on this device.
              </p>
            )}
            {preview.skippedMedia && preview.mediaCount === 0 && (
              <p className="mt-2 text-xs font-700 text-ink-faint">
                This pack had media, but matching audio/image files were not
                found.
              </p>
            )}
          </div>
          {preview.cardCount > SYNC_CARD_WARN && (
            <p className="text-xs font-700 text-cat-project">
              Big deck: this stays on-device. Cloud backup may skip it if the
              save grows past Firestore's size limit.
            </p>
          )}
          <button
            type="button"
            onClick={() => void confirm()}
            disabled={busy}
            className="btn w-full disabled:opacity-50"
          >
            Import {preview.decks.length} deck
            {preview.decks.length === 1 ? "" : "s"}
            {busy ? "…" : ""}
          </button>
        </div>
      )}

      <p className="text-xs font-700 text-ink-faint">
        Tip: two columns per line - Front,Back - also works as a .csv.
      </p>
    </div>
  );
}
