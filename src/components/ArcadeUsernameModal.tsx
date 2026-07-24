import { useState } from "react";
import { validateArcadeUsername } from "@/lib/dailyChallenge";

interface Props {
  initialUsername?: string;
  onSave: (result: { username: string | null; optedOut: boolean }) => void;
}

/** First-run prompt: pick a board name or stay anonymous. */
export function ArcadeUsernameModal({ initialUsername = "", onSave }: Props) {
  const [value, setValue] = useState(initialUsername);
  const [error, setError] = useState<string | null>(null);

  const submitName = () => {
    const name = validateArcadeUsername(value);
    if (!name) {
      setError("Use 3–16 letters, numbers, or spaces.");
      return;
    }
    onSave({ username: name, optedOut: false });
  };

  return (
    <div className="game-overlay absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="game-shell-title font-display text-xl font-800">Board name</p>
      <p className="max-w-xs text-sm font-700 text-ink-soft">
        Choose how you appear on today&apos;s global leaderboard, or stay anonymous.
      </p>
      <input
        type="text"
        value={value}
        maxLength={16}
        placeholder="Username"
        autoComplete="nickname"
        className="w-full max-w-xs rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-center text-sm font-700 text-ink outline-none focus:border-accent"
        onChange={(e) => {
          setValue(e.target.value);
          setError(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") submitName();
        }}
      />
      {error && <p className="text-xs font-700 text-cat-health">{error}</p>}
      <button type="button" className="btn w-full max-w-xs" onClick={submitName}>
        Use this name
      </button>
      <button
        type="button"
        className="btn-ghost"
        onClick={() => onSave({ username: null, optedOut: true })}
      >
        Stay anonymous
      </button>
    </div>
  );
}
