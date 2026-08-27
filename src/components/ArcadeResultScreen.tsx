import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Copy, Share2 } from "lucide-react";
import type { GameId } from "@/lib/types";
import { GAMES, GAME_BY_ID, GAME_GLYPH, gamePath } from "@/lib/games";
import { dailyChallengeNumber } from "@/lib/dailyChallenge";
import type { DailyBoardEntry } from "@/lib/dailyLeaderboard";
import { GameStatDetail } from "./GameStatDetail";

interface Props {
  gameId: GameId;
  day: string;
  score: number;
  /** Board entries (real players merged with bots), best score first. */
  entries: DailyBoardEntry[];
  /** Board uid of the signed-in user, if their run was submitted. */
  youUid: string | null;
  /** Local run stats, used for the guest "You" row. */
  meta?: Record<string, string>;
}

const MEDAL_BG = [
  "linear-gradient(135deg, #ffe08a, #f6c453)",
  "linear-gradient(135deg, #e8edf5, #b9c4d6)",
  "linear-gradient(135deg, #e0a273, #b06a3c)",
];

const AVATAR_GRADIENTS = [
  "linear-gradient(135deg, #5cd0a8, #2f9d7a)",
  "linear-gradient(135deg, #ff7a59, #d84f2f)",
  "linear-gradient(135deg, #a06bff, #6c3fd1)",
  "linear-gradient(135deg, #ff9e64, #e0742f)",
  "linear-gradient(135deg, #4aa3ff, #2b6fd4)",
  "linear-gradient(135deg, #f472b6, #c23a86)",
];

function avatarGradient(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "?";
  const second = parts[1]?.[0] ?? "";
  return (first + second).toUpperCase();
}

/** LinkedIn-games-style daily result: emblem, share row, ranked board, more games. */
export function ArcadeResultScreen({
  gameId,
  day,
  score,
  entries,
  youUid,
  meta,
}: Props) {
  const nav = useNavigate();
  const game = GAME_BY_ID[gameId];
  const puzzleNo = dailyChallengeNumber(day);
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const board = useMemo(() => {
    const youOnBoard =
      youUid !== null && entries.some((e) => e.uid === youUid);
    if (youOnBoard) return entries;
    const youEntry: DailyBoardEntry = {
      uid: "you",
      score,
      displayName: "You",
      playedAt: new Date().toISOString(),
      gameId,
      day,
      ...(meta ? { meta } : {}),
    };
    return [...entries, youEntry].sort((a, b) => b.score - a.score);
  }, [entries, youUid, score, gameId, day, meta]);

  const youKey = youUid !== null && entries.some((e) => e.uid === youUid) ? youUid : "you";
  const youRank = board.findIndex((e) => e.uid === youKey);
  const shown = expanded
    ? board
    : board.filter((e, i) => i < 3 || e.uid === youKey);

  const shareText = `Upscale ${game.name} #${puzzleNo}\nScore: ${score.toLocaleString()}${
    youRank >= 0 ? `\nRank: ${youRank + 1} of ${board.length}` : ""
  }`;

  const copyScore = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable */
    }
  };

  const shareVia = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ text: shareText });
      } else {
        await copyScore();
      }
    } catch {
      /* share cancelled */
    }
  };

  const otherGames = GAMES.filter((g) => g.id !== gameId);

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-3">
      {/* Emblem + headline */}
      <span
        className="flex h-16 w-16 items-center justify-center rounded-full text-3xl shadow-soft"
        style={{ background: `${game.color}33`, border: `2px solid ${game.color}` }}
        aria-hidden
      >
        {GAME_GLYPH[gameId]}
      </span>
      <p className="text-sm font-800 text-ink-soft">
        {game.name} #{puzzleNo}
      </p>
      <p className="game-shell-title font-display text-3xl font-800 leading-none">
        {score.toLocaleString()} pts
      </p>

      {/* Copy / share */}
      <div className="flex items-start gap-6">
        <button
          type="button"
          onClick={copyScore}
          className="flex flex-col items-center gap-1 text-[11px] font-800 text-ink-soft active:scale-95"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-ink shadow-sm">
            {copied ? <Check size={18} /> : <Copy size={18} />}
          </span>
          {copied ? "Copied!" : "Copy score"}
        </button>
        <button
          type="button"
          onClick={shareVia}
          className="flex flex-col items-center gap-1 text-[11px] font-800 text-ink-soft active:scale-95"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-ink shadow-sm">
            <Share2 size={18} />
          </span>
          Share via
        </button>
      </div>

      {/* Ranked board */}
      <div className="w-full overflow-hidden rounded-2xl border border-white/10 bg-black/25">
        <div className="border-b border-white/10 px-3 py-2 text-left">
          <p className="text-[11px] font-800 text-ink-soft">
            {board.length === 1
              ? "You're first on today's board"
              : `${board.length} players today`}
          </p>
        </div>
        <ul className={`text-sm ${expanded ? "max-h-64 overflow-y-auto" : ""}`}>
          {shown.map((entry) => {
            const rank = board.indexOf(entry);
            const isYou = entry.uid === youKey;
            const name = isYou
              ? "You"
              : entry.displayName?.trim() || "Anonymous";
            return (
              <li
                key={`${entry.uid}-${entry.playedAt}`}
                className={`flex items-center gap-2.5 border-b border-white/5 px-3 py-2 last:border-0 ${
                  isYou ? "bg-accent/10" : ""
                }`}
              >
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-800 tabular-nums"
                  style={
                    rank < 3
                      ? { background: MEDAL_BG[rank], color: "#3a2c10" }
                      : { background: "rgba(255,255,255,0.06)" }
                  }
                >
                  {rank + 1}
                </span>
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-800 text-white"
                  style={{ background: avatarGradient(name) }}
                  aria-hidden
                >
                  {initials(name)}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
                  <span className="truncate font-800 leading-tight text-ink">
                    {name}
                  </span>
                  <GameStatDetail gameId={gameId} meta={entry.meta} />
                </span>
                <span className="shrink-0 text-right font-display text-base font-800 tabular-nums leading-none text-ink">
                  {entry.score.toLocaleString()}
                </span>
              </li>
            );
          })}
        </ul>
        {board.length > shown.length || expanded ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="w-full border-t border-white/10 px-3 py-2.5 text-xs font-800 text-ink-soft active:bg-white/5"
          >
            {expanded ? "Show less" : "See full leaderboard"}
          </button>
        ) : null}
      </div>

      {/* More games */}
      <div className="w-full overflow-hidden rounded-2xl border border-white/10 bg-black/25">
        <p className="border-b border-white/10 px-3 py-2 text-left text-[11px] font-800 text-ink-soft">
          Dive into more games
        </p>
        <ul>
          {otherGames.map((g) => (
            <li
              key={g.id}
              className="flex items-center gap-2.5 border-b border-white/5 px-3 py-2 last:border-0"
            >
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-lg"
                style={{ background: `${g.color}2e`, border: `1.5px solid ${g.color}66` }}
                aria-hidden
              >
                {GAME_GLYPH[g.id]}
              </span>
              <span className="flex min-w-0 flex-1 flex-col text-left">
                <span className="truncate text-sm font-800 leading-tight text-ink">
                  {g.name} #{puzzleNo}
                </span>
                <span className="truncate text-[10px] font-700 text-ink-faint">
                  {g.tagline}
                </span>
              </span>
              <button
                type="button"
                onClick={() => nav(gamePath(g.id))}
                className="shrink-0 rounded-full px-4 py-1.5 text-xs font-800 text-white shadow-sm active:scale-95"
                style={{ background: g.color }}
              >
                Play
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
