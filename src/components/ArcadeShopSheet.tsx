import { Sheet } from "@/components/Sheet";
import { useStore } from "@/store/useStore";
import {
  TOKEN_COST_CONTINUE,
  UNLOCKABLE_PALETTES,
  ensureUnlocks,
  tokenBalance,
  type UnlockablePaletteId,
} from "@/lib/economy";
import type { GameId } from "@/lib/types";
import { GAMES } from "@/lib/games";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Optional: highlight equip for a specific game. */
  focusGameId?: GameId;
}

export function ArcadeShopSheet({ open, onClose, focusGameId }: Props) {
  const data = useStore((s) => s.data);
  const unlock = useStore((s) => s.unlockPalette);
  const equip = useStore((s) => s.equipPalette);
  const balance = tokenBalance(data.wallet);
  const unlocks = ensureUnlocks(data);
  const games = focusGameId
    ? GAMES.filter((g) => g.id === focusGameId)
    : GAMES;

  return (
    <Sheet open={open} onClose={onClose} title="Arcade shop">
      <p className="mb-4 text-sm font-700 text-ink-soft">
        Spend Play Tokens earned from check-ins. You have{" "}
        <span className="font-800 text-ink">{balance}</span> tokens.
      </p>

      <div className="card mb-4 p-4">
        <p className="font-800 text-ink">Continue credit</p>
        <p className="mt-1 text-xs font-700 text-ink-faint">
          One continue on a daily run costs {TOKEN_COST_CONTINUE} tokens. Buy it
          from the game-over screen when you need it.
        </p>
      </div>

      <p className="mb-2 font-display text-lg font-800 text-ink">Palettes</p>
      <div className="space-y-3">
        {UNLOCKABLE_PALETTES.map((p) => {
          const owned = unlocks.palettes.includes(p.id);
          return (
            <div key={p.id} className="card p-4">
              <div className="flex items-center gap-3">
                <div className="flex gap-1">
                  {p.swatches.map((c) => (
                    <span
                      key={c}
                      className="h-6 w-6 rounded-full border border-white/60 shadow-sm"
                      style={{ background: c }}
                    />
                  ))}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-800 text-ink">{p.name}</p>
                  <p className="text-xs font-700 text-ink-faint">
                    {owned ? "Owned" : `${p.cost} tokens`}
                  </p>
                </div>
                {!owned ? (
                  <button
                    type="button"
                    className="btn px-3 py-1.5 text-sm disabled:opacity-40"
                    data-sfx="success"
                    disabled={balance < p.cost}
                    onClick={() => unlock(p.id as UnlockablePaletteId)}
                  >
                    Unlock
                  </button>
                ) : null}
              </div>
              {owned && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {games.map((g) => {
                    const equipped = unlocks.equipped[g.id] === p.id;
                    return (
                      <button
                        key={g.id}
                        type="button"
                        className={`capsule px-3 py-1 text-xs font-800 ${
                          equipped ? "bg-mint/40 text-ink" : "text-ink-soft"
                        }`}
                        onClick={() =>
                          equip(
                            g.id,
                            equipped ? null : (p.id as UnlockablePaletteId),
                          )
                        }
                      >
                        {equipped ? `On ${g.name}` : `Equip ${g.name}`}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Sheet>
  );
}
