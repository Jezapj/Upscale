/**
 * Play Token wallet: a transaction ledger so cloud merge is a safe union by id.
 * Habits mint tokens; endless arcade plays and cosmetics spend them.
 */

import type {
  AppData,
  ArcadeUnlocks,
  GameId,
  Routine,
  TokenReason,
  TokenTxn,
  TokenWallet,
} from "./types";
import { dayKey, daysBetween, parseDay, todayKey } from "./dates";
import { isScheduledOn } from "./frequency";

/** Lightweight current streak so economy does not import stats (avoids a cycle). */
function currentStreakFor(data: AppData, routine: Routine): number {
  const created = routine.createdAt.slice(0, 10);
  const today = dayKey();
  const total = Math.max(0, daysBetween(created, today)) + 1;
  const days: boolean[] = [];
  for (let i = 0; i < total; i++) {
    const d = parseDay(created);
    d.setDate(d.getDate() + i);
    const key = dayKey(d);
    if (!isScheduledOn(routine, key)) continue;
    days.push(!!data.logs[key]?.entries[routine.id]?.completed);
  }
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i]) streak++;
    else break;
  }
  return streak;
}

export const TOKEN_COST_ENDLESS = 1;
export const TOKEN_COST_CONTINUE = 3;
export const CLEAR_DAY_BONUS = 3;
export const STARTER_TOKEN_AMOUNT = 5;
export const STREAK_MILESTONE_EVERY = 7;
export const MAX_GRACE_BANKED = 2;

export const STARTER_TXN_ID = "starter:v1";

export type UnlockablePaletteId =
  | "sunset"
  | "midnight"
  | "mint"
  | "candy"
  | "mono";

export interface UnlockablePalette {
  id: UnlockablePaletteId;
  name: string;
  cost: number;
  /** Preview swatches shown in the shop. */
  swatches: string[];
}

export const UNLOCKABLE_PALETTES: UnlockablePalette[] = [
  {
    id: "sunset",
    name: "Sunset",
    cost: 8,
    swatches: ["#ff9e64", "#ff5c5c", "#ffd76e"],
  },
  {
    id: "midnight",
    name: "Midnight",
    cost: 8,
    swatches: ["#1a2840", "#6a5a9a", "#c084fc"],
  },
  {
    id: "mint",
    name: "Mint glaze",
    cost: 10,
    swatches: ["#5cd0a8", "#2bc4a8", "#e8f6fc"],
  },
  {
    id: "candy",
    name: "Candy lane",
    cost: 10,
    swatches: ["#ff77b0", "#a06bff", "#4aa3ff"],
  },
  {
    id: "mono",
    name: "Mono ink",
    cost: 12,
    swatches: ["#3c4047", "#9aabb8", "#f0f0f5"],
  },
];

export function emptyWallet(): TokenWallet {
  return { txns: [] };
}

export function ensureWallet(data: AppData): TokenWallet {
  return data.wallet ?? emptyWallet();
}

export function ensureUnlocks(data: AppData): ArcadeUnlocks {
  return data.arcadeUnlocks ?? { palettes: [], equipped: {} };
}

export function tokenBalance(wallet: TokenWallet | undefined): number {
  if (!wallet?.txns?.length) return 0;
  return wallet.txns.reduce((sum, t) => sum + t.amount, 0);
}

export function hasTxn(wallet: TokenWallet | undefined, id: string): boolean {
  return !!wallet?.txns?.some((t) => t.id === id);
}

function appendTxn(wallet: TokenWallet, txn: TokenTxn): TokenWallet {
  if (wallet.txns.some((t) => t.id === txn.id)) return wallet;
  return { txns: [...wallet.txns, txn] };
}

export function makeTxn(
  id: string,
  amount: number,
  reason: TokenReason,
  date: string = todayKey(),
  createdAt: string = new Date().toISOString(),
): TokenTxn {
  return { id, amount, reason, date, createdAt };
}

/** Grant starter tokens once so existing players are not locked out of Endless. */
export function ensureStarterBalance(data: AppData): AppData {
  const wallet = ensureWallet(data);
  if (hasTxn(wallet, STARTER_TXN_ID)) return data.wallet ? data : { ...data, wallet };
  return {
    ...data,
    wallet: appendTxn(
      wallet,
      makeTxn(STARTER_TXN_ID, STARTER_TOKEN_AMOUNT, "starter"),
    ),
  };
}

export function earnRoutineTxnId(date: string, routineId: string): string {
  return `earn:${date}:${routineId}`;
}

export function clearDayTxnId(date: string): string {
  return `clear:${date}`;
}

export function streakMilestoneTxnId(
  routineId: string,
  milestone: number,
): string {
  return `streak:${routineId}:${milestone}`;
}

export function spendEndlessTxnId(date: string, nonce: string): string {
  return `spend:endless:${date}:${nonce}`;
}

export function spendContinueTxnId(
  date: string,
  gameId: GameId,
): string {
  return `spend:continue:${date}:${gameId}`;
}

export function spendPaletteTxnId(paletteId: string): string {
  return `spend:palette:${paletteId}`;
}

export function graceEarnTxnId(routineId: string, milestone: number): string {
  return `grace:earn:${routineId}:${milestone}`;
}

export function graceSpendTxnId(routineId: string, missedDay: string): string {
  return `grace:spend:${routineId}:${missedDay}`;
}

/**
 * After a rating that counts as completed, mint tokens (idempotent per routine/day)
 * plus clear-day and streak milestone bonuses.
 */
export function applyCheckinEarnings(
  data: AppData,
  routineId: string,
  date: string = todayKey(),
): { data: AppData; earned: number; reasons: TokenReason[] } {
  let wallet = ensureWallet(data);
  let earned = 0;
  const reasons: TokenReason[] = [];
  const now = new Date().toISOString();

  const earnId = earnRoutineTxnId(date, routineId);
  if (!hasTxn(wallet, earnId)) {
    wallet = appendTxn(
      wallet,
      makeTxn(earnId, 1, "checkin", date, now),
    );
    earned += 1;
    reasons.push("checkin");
  }

  // Clear-day bonus when every scheduled routine is completed.
  const scheduled = data.routines.filter(
    (r) => !r.archived && isScheduledOn(r, date),
  );
  if (scheduled.length > 0) {
    const allDone = scheduled.every((r) => {
      const entry = data.logs[date]?.entries[r.id];
      return !!entry?.completed;
    });
    const clearId = clearDayTxnId(date);
    if (allDone && !hasTxn(wallet, clearId)) {
      wallet = appendTxn(
        wallet,
        makeTxn(clearId, CLEAR_DAY_BONUS, "clear_day", date, now),
      );
      earned += CLEAR_DAY_BONUS;
      reasons.push("clear_day");
    }
  }

  // Streak milestone: every STREAK_MILESTONE_EVERY completions in current streak.
  const routine = data.routines.find((r) => r.id === routineId);
  if (routine) {
    const streak = currentStreakFor({ ...data, wallet }, routine);
    if (streak > 0 && streak % STREAK_MILESTONE_EVERY === 0) {
      const mid = streakMilestoneTxnId(routineId, streak);
      if (!hasTxn(wallet, mid)) {
        wallet = appendTxn(
          wallet,
          makeTxn(mid, 2, "streak_milestone", date, now),
        );
        earned += 2;
        reasons.push("streak_milestone");
      }
    }

    // Grace insurance: earn 1 grace per milestone, capped via banked count.
    const graceBanked = bankedGraceCount(wallet, routineId);
    if (
      streak > 0 &&
      streak % STREAK_MILESTONE_EVERY === 0 &&
      graceBanked < MAX_GRACE_BANKED
    ) {
      const gid = graceEarnTxnId(routineId, streak);
      if (!hasTxn(wallet, gid)) {
        wallet = appendTxn(
          wallet,
          makeTxn(gid, 0, "grace_earn", date, now),
        );
      }
    }
  }

  if (earned === 0 && wallet === data.wallet) {
    return { data, earned: 0, reasons: [] };
  }
  return { data: { ...data, wallet }, earned, reasons };
}

export function bankedGraceCount(
  wallet: TokenWallet | undefined,
  routineId: string,
): number {
  if (!wallet?.txns?.length) return 0;
  let earned = 0;
  let spent = 0;
  for (const t of wallet.txns) {
    if (t.reason === "grace_earn" && t.id.includes(`:${routineId}:`)) earned++;
    if (t.reason === "grace_spend" && t.id.startsWith(`grace:spend:${routineId}:`)) {
      spent++;
    }
  }
  return Math.max(0, earned - spent);
}

/** List of missed days that have been patched by grace for a routine. */
export function graceShieldedDays(
  wallet: TokenWallet | undefined,
  routineId: string,
): Set<string> {
  const out = new Set<string>();
  if (!wallet?.txns) return out;
  const prefix = `grace:spend:${routineId}:`;
  for (const t of wallet.txns) {
    if (t.reason === "grace_spend" && t.id.startsWith(prefix)) {
      out.add(t.id.slice(prefix.length));
    }
  }
  return out;
}

export function spendTokens(
  data: AppData,
  amount: number,
  reason: TokenReason,
  id: string,
  date: string = todayKey(),
): AppData | null {
  const wallet = ensureWallet(data);
  if (hasTxn(wallet, id)) return data;
  if (tokenBalance(wallet) < amount) return null;
  return {
    ...data,
    wallet: appendTxn(
      wallet,
      makeTxn(id, -amount, reason, date),
    ),
  };
}

export function canAfford(data: AppData, amount: number): boolean {
  return tokenBalance(data.wallet) >= amount;
}

export function unlockPalette(
  data: AppData,
  paletteId: UnlockablePaletteId,
): AppData | null {
  const meta = UNLOCKABLE_PALETTES.find((p) => p.id === paletteId);
  if (!meta) return null;
  const unlocks = ensureUnlocks(data);
  if (unlocks.palettes.includes(paletteId)) return data;
  const spent = spendTokens(
    data,
    meta.cost,
    "palette",
    spendPaletteTxnId(paletteId),
  );
  if (!spent) return null;
  return {
    ...spent,
    arcadeUnlocks: {
      ...ensureUnlocks(spent),
      palettes: [...ensureUnlocks(spent).palettes, paletteId],
    },
  };
}

export function equipPalette(
  data: AppData,
  gameId: GameId,
  paletteId: UnlockablePaletteId | null,
): AppData {
  const unlocks = ensureUnlocks(data);
  if (paletteId && !unlocks.palettes.includes(paletteId)) return data;
  const equipped = { ...unlocks.equipped };
  if (paletteId) equipped[gameId] = paletteId;
  else delete equipped[gameId];
  return {
    ...data,
    arcadeUnlocks: { ...unlocks, equipped },
  };
}

/** Union wallets by transaction id (deterministic, order preserved by createdAt). */
export function mergeWallets(
  a: TokenWallet | undefined,
  b: TokenWallet | undefined,
): TokenWallet | undefined {
  if (!a && !b) return undefined;
  if (!a) return b;
  if (!b) return a;
  const map = new Map<string, TokenTxn>();
  for (const t of [...a.txns, ...b.txns]) {
    if (!map.has(t.id)) map.set(t.id, t);
  }
  const txns = [...map.values()].sort((x, y) =>
    x.createdAt.localeCompare(y.createdAt),
  );
  return { txns };
}

export function mergeArcadeUnlocks(
  a: ArcadeUnlocks | undefined,
  b: ArcadeUnlocks | undefined,
): ArcadeUnlocks | undefined {
  if (!a && !b) return undefined;
  if (!a) return b;
  if (!b) return a;
  const palettes = [...new Set([...a.palettes, ...b.palettes])];
  const equipped = { ...b.equipped, ...a.equipped };
  return { palettes, equipped };
}

export function tokensEarnedOnDate(
  wallet: TokenWallet | undefined,
  date: string,
): number {
  if (!wallet?.txns) return 0;
  return wallet.txns
    .filter((t) => t.date === date && t.amount > 0)
    .reduce((s, t) => s + t.amount, 0);
}

export function tokensEarnedBetween(
  wallet: TokenWallet | undefined,
  start: string,
  end: string,
): number {
  if (!wallet?.txns) return 0;
  return wallet.txns
    .filter((t) => t.amount > 0 && t.date >= start && t.date <= end)
    .reduce((s, t) => s + t.amount, 0);
}
