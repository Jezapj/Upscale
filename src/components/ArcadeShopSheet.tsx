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
import { GAMES, GAME_GLYPH } from "@/lib/games";

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

  const isEquipped = (gameId: GameId, paletteId: UnlockablePaletteId) =>
    unlocks.equipped[gameId] === paletteId;

  const handleToggle = (gameId: GameId, paletteId: UnlockablePaletteId) => {
    const currentlyEquipped = isEquipped(gameId, paletteId);
    equip(gameId, currentlyEquipped ? null : paletteId);
  };

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
              <div className="flex items-center gap-3 mb-3">
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
                <div className="rounded-2xl bg-ink/5 p-4">
                  <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                    {games.map((g) => {
                      const equipped = isEquipped(g.id, p.id);
                      return (
                        <button
                          key={g.id}
                          type="button"
                          className="relative flex flex-col items-center gap-2 py-3"
                          onClick={() => handleToggle(g.id, p.id)}
                          data-sfx="click"
                          aria-label={`${equipped ? "Unequip" : "Equip"} ${p.name} for ${g.name}`}
                        >
                          <span className="text-lg">{GAME_GLYPH[g.id]}</span>
                          <div
                            className={`relative w-full max-w-[64px] h-6 rounded-full border-2 transition-colors ${
                              equipped
                                ? "bg-mint border-mint"
                                : "bg-ink/10 border-ink/20"
                            }`}
                          >
                            <span
                              className={`absolute top-0.5 h-4 w-4 rounded-full shadow-md transition-transform duration-150 ${
                                equipped
                                  ? "translate-x-full-1px bg-mint"
                                  : "translate-x-[-15px] bg-ink/30"
                              }`}
                            />
                          </div>
                          <span className="text-[10px] font-700 text-ink-faint uppercase tracking-wide">
                            {g.name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Sheet>
  );
}