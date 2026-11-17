import { useState, type ReactNode } from "react";
import { Check, Coins, Lock } from "lucide-react";
import { Sheet } from "@/components/Sheet";
import { SegBar } from "@/components/SegBar";
import { BrushArt, BucketArt, RecordArt } from "@/components/ShopArt";
import { useStore } from "@/store/useStore";
import { useTheme } from "@/store/useTheme";
import { useBackgroundMusic } from "@/store/useBackgroundMusic";
import {
  TOKEN_COST_CONTINUE,
  UNLOCKABLE_PALETTES,
  ensureUnlocks,
  tokenBalance,
  type UnlockablePaletteId,
} from "@/lib/economy";
import { APP_THEMES, type AppThemeId } from "@/lib/appThemes";
import {
  BACKGROUND_TRACKS,
  isTrackOwned,
  type BackgroundTrackId,
} from "@/lib/backgroundMusic";
import type { GameId } from "@/lib/types";
import { GAMES, GAME_GLYPH } from "@/lib/games";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Optional: only offer game-theme equips for this game. */
  focusGameId?: GameId;
}

type ShopTab = "themes" | "game" | "music";

const TABS: { key: ShopTab; label: string }[] = [
  { key: "themes", label: "Themes" },
  { key: "game", label: "Game themes" },
  { key: "music", label: "Music" },
];

const CLASSIC = "classic" as const;
type ThemeChoice = AppThemeId | typeof CLASSIC;

/** One compact grid cell: artwork, name, and price / ownership. */
function ShopItem({
  art,
  name,
  cost,
  owned,
  active,
  selected,
  onSelect,
}: {
  art: ReactNode;
  name: string;
  cost: number;
  owned: boolean;
  /** Currently equipped / playing / applied. */
  active: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`card shop-item flex min-w-0 flex-col items-center gap-1 px-1.5 pb-2 pt-2.5 text-center transition-all active:scale-95 ${
        selected ? "shop-item-selected" : ""
      }`}
    >
      <span className="relative">
        <span className={owned ? "" : "opacity-80"}>{art}</span>
        {!owned && (
          <span className="shop-badge shop-badge-lock absolute -right-1 -top-1">
            <Lock size={11} strokeWidth={3} />
          </span>
        )}
        {active && (
          <span className="shop-badge shop-badge-on absolute -right-1 -top-1">
            <Check size={12} strokeWidth={3.5} />
          </span>
        )}
      </span>
      <span className="flex h-7 w-full items-center justify-center text-[11px] font-800 leading-[1.1] text-ink">
        {name}
      </span>
      {owned ? (
        <span className="text-[10px] font-800 uppercase tracking-wide text-ink-faint">
          {active ? "In use" : "Owned"}
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-[11px] font-800 text-ink-soft">
          <Coins size={11} className="text-cat-project" />
          {cost}
        </span>
      )}
    </button>
  );
}

/** Unlock button with the price, or how many tokens are still missing. */
function UnlockButton({
  cost,
  balance,
  onUnlock,
}: {
  cost: number;
  balance: number;
  onUnlock: () => void;
}) {
  const short = cost - balance;
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        className="btn px-4 py-2 text-sm disabled:opacity-40"
        data-sfx="success"
        disabled={short > 0}
        onClick={onUnlock}
      >
        <Coins size={14} />
        Unlock · {cost}
      </button>
      {short > 0 && (
        <span className="text-[10px] font-800 text-ink-faint">
          {short} more token{short === 1 ? "" : "s"} needed
        </span>
      )}
    </div>
  );
}

function DetailPanel({
  art,
  title,
  blurb,
  action,
  children,
}: {
  art: ReactNode;
  title: string;
  blurb: string;
  action: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="card mt-3 p-3">
      <div className="flex items-center gap-3">
        <span className="shrink-0">{art}</span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg font-800 leading-tight text-ink">
            {title}
          </p>
          <p className="text-xs font-700 text-ink-faint">{blurb}</p>
        </div>
        <div className="shrink-0">{action}</div>
      </div>
      {children}
    </div>
  );
}

const inUseLabel = (text: string) => (
  <span className="inline-flex items-center gap-1 rounded-pill bg-ink/10 px-3 py-2 text-xs font-800 text-ink-soft">
    <Check size={13} strokeWidth={3} />
    {text}
  </span>
);

export function ShopSheet({ open, onClose, focusGameId }: Props) {
  const data = useStore((s) => s.data);
  const unlockPalette = useStore((s) => s.unlockPalette);
  const equipPalette = useStore((s) => s.equipPalette);
  const unlockTrack = useStore((s) => s.unlockTrack);
  const unlockAppTheme = useStore((s) => s.unlockAppTheme);
  const skin = useTheme((s) => s.skin);
  const setSkin = useTheme((s) => s.setSkin);
  const trackId = useBackgroundMusic((s) => s.trackId);
  const setTrackId = useBackgroundMusic((s) => s.setTrackId);

  const balance = tokenBalance(data.wallet);
  const unlocks = ensureUnlocks(data);
  const games = focusGameId ? GAMES.filter((g) => g.id === focusGameId) : GAMES;

  const [tab, setTab] = useState<ShopTab>("themes");
  const [themeSel, setThemeSel] = useState<ThemeChoice>(skin ?? CLASSIC);
  const [paletteSel, setPaletteSel] = useState<UnlockablePaletteId>(
    UNLOCKABLE_PALETTES[0].id,
  );
  const [trackSel, setTrackSel] = useState<BackgroundTrackId>(trackId);

  const themeOwned = (id: ThemeChoice) =>
    id === CLASSIC || !!unlocks.themes?.includes(id);
  const themeActive = (id: ThemeChoice) => (skin ?? CLASSIC) === id;

  const palette =
    UNLOCKABLE_PALETTES.find((p) => p.id === paletteSel) ?? UNLOCKABLE_PALETTES[0];
  const paletteOwned = unlocks.palettes.includes(palette.id);
  const paletteOn = (gameId: GameId) => unlocks.equipped[gameId] === palette.id;
  const paletteEverywhere = games.every((g) => paletteOn(g.id));

  const track =
    BACKGROUND_TRACKS.find((t) => t.id === trackSel) ?? BACKGROUND_TRACKS[0];
  const theme = APP_THEMES.find((t) => t.id === themeSel);

  return (
    <Sheet open={open} onClose={onClose} title="Shop">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs font-700 text-ink-soft">
          Spend the Play Tokens you earn from check-ins.
        </p>
        <span className="capsule inline-flex shrink-0 items-center gap-1.5 px-3 py-1.5 text-sm font-800 text-ink">
          <Coins size={15} className="text-cat-project" />
          {balance}
        </span>
      </div>

      <SegBar options={TABS} value={tab} onChange={setTab} />

      {tab === "themes" && (
        <>
          <div className="mt-3 grid grid-cols-4 gap-2">
            <ShopItem
              art={<BucketArt theme={CLASSIC} size={52} />}
              name="Classic"
              cost={0}
              owned
              active={themeActive(CLASSIC)}
              selected={themeSel === CLASSIC}
              onSelect={() => setThemeSel(CLASSIC)}
            />
            {APP_THEMES.map((t) => (
              <ShopItem
                key={t.id}
                art={<BucketArt theme={t.id} size={52} />}
                name={t.name}
                cost={t.cost}
                owned={themeOwned(t.id)}
                active={themeActive(t.id)}
                selected={themeSel === t.id}
                onSelect={() => setThemeSel(t.id)}
              />
            ))}
          </div>
          <DetailPanel
            art={<BucketArt theme={themeSel} size={60} />}
            title={theme ? theme.name : "Classic"}
            blurb={
              theme
                ? `${theme.blurb} Restyles the whole app.`
                : "The original Upscale look. Follows your light / dark setting."
            }
            action={
              themeActive(themeSel) ? (
                inUseLabel("In use")
              ) : themeOwned(themeSel) ? (
                <button
                  type="button"
                  className="btn px-4 py-2 text-sm"
                  onClick={() => setSkin(theme ? theme.id : null)}
                >
                  Apply
                </button>
              ) : theme ? (
                <UnlockButton
                  cost={theme.cost}
                  balance={balance}
                  onUnlock={() => {
                    if (unlockAppTheme(theme.id)) setSkin(theme.id);
                  }}
                />
              ) : null
            }
          />
        </>
      )}

      {tab === "game" && (
        <>
          <div className="mt-3 grid grid-cols-5 gap-1.5">
            {UNLOCKABLE_PALETTES.map((p) => (
              <ShopItem
                key={p.id}
                art={<BrushArt swatches={p.swatches} size={46} />}
                name={p.name}
                cost={p.cost}
                owned={unlocks.palettes.includes(p.id)}
                active={games.some((g) => unlocks.equipped[g.id] === p.id)}
                selected={paletteSel === p.id}
                onSelect={() => setPaletteSel(p.id)}
              />
            ))}
          </div>
          <DetailPanel
            art={<BrushArt swatches={palette.swatches} size={60} />}
            title={palette.name}
            blurb={
              paletteOwned
                ? "Pick the games to paint with these colours."
                : "Recolours any arcade game you choose."
            }
            action={
              paletteOwned ? (
                games.length > 1 ? (
                  <button
                    type="button"
                    className="btn-ghost px-3 py-2 text-xs"
                    onClick={() =>
                      games.forEach((g) =>
                        equipPalette(g.id, paletteEverywhere ? null : palette.id),
                      )
                    }
                  >
                    {paletteEverywhere ? "Clear all" : "Use on all"}
                  </button>
                ) : null
              ) : (
                <UnlockButton
                  cost={palette.cost}
                  balance={balance}
                  onUnlock={() => unlockPalette(palette.id)}
                />
              )
            }
          >
            {paletteOwned && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {games.map((g) => {
                  const on = paletteOn(g.id);
                  return (
                    <button
                      key={g.id}
                      type="button"
                      aria-pressed={on}
                      aria-label={`${on ? "Remove" : "Use"} ${palette.name} on ${g.name}`}
                      onClick={() => equipPalette(g.id, on ? null : palette.id)}
                      className={`shop-chip inline-flex items-center gap-1 rounded-pill px-2.5 py-1.5 text-xs font-800 transition-all active:scale-95 ${
                        on ? "shop-chip-on" : "bg-ink/10 text-ink-soft"
                      }`}
                    >
                      <span aria-hidden>{GAME_GLYPH[g.id]}</span>
                      {g.name}
                      {on && <Check size={12} strokeWidth={3.5} />}
                    </button>
                  );
                })}
              </div>
            )}
          </DetailPanel>
        </>
      )}

      {tab === "music" && (
        <>
          <div className="mt-3 grid grid-cols-4 gap-2">
            {BACKGROUND_TRACKS.map((t) => (
              <ShopItem
                key={t.id}
                art={<RecordArt colors={t.colors} size={52} />}
                name={t.label}
                cost={t.cost}
                owned={isTrackOwned(t.id, unlocks.tracks)}
                active={trackId === t.id}
                selected={trackSel === t.id}
                onSelect={() => setTrackSel(t.id)}
              />
            ))}
          </div>
          <DetailPanel
            art={<RecordArt colors={track.colors} size={60} />}
            title={track.label}
            blurb={
              track.cost === 0
                ? "The default menu track. Always yours."
                : "Background music for the menus."
            }
            action={
              trackId === track.id ? (
                inUseLabel("Playing")
              ) : isTrackOwned(track.id, unlocks.tracks) ? (
                <button
                  type="button"
                  className="btn px-4 py-2 text-sm"
                  onClick={() => setTrackId(track.id)}
                >
                  Play
                </button>
              ) : (
                <UnlockButton
                  cost={track.cost}
                  balance={balance}
                  onUnlock={() => {
                    if (unlockTrack(track.id)) setTrackId(track.id);
                  }}
                />
              )
            }
          />
        </>
      )}

      <p className="mt-3 px-1 text-center text-[11px] font-700 text-ink-faint">
        Continues cost {TOKEN_COST_CONTINUE} tokens and are bought from a daily
        run&apos;s game-over screen.
      </p>
    </Sheet>
  );
}
