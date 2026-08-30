/**
 * Play Token wallet: a transaction ledger so cloud merge is a safe union by id.
 * Habits mint tokens; endless arcade plays and cosmetics spend them.
 */

import type {
  AppData,
  ArcadeUnlocks,
  GameId,
  LoginBonusState,
  Routine,
  TokenReason,
  TokenTxn,
  TokenWallet,
} from "./types";
import { dayKey, daysBetween, parseDay, shiftDay, todayKey } from "./dates";
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

/** Consecutive-login daily rate: 1, then 3 at 3 days, then 5 from day 5 on. */
export const LOGIN_DAILY_RATES: { streak: number; daily: number }[] = [
  { streak: 1, daily: 1 },
  { streak: 3, daily: 3 },
  { streak: 5, daily: 5 },
];

/** Extra tokens on specific consecutive-login days (on top of the daily rate). */
export const LOGIN_STREAK_BONUSES: { streak: number; amount: number }[] = [
  { streak: 10, amount: 8 },
  { streak: 20, amount: 10 },
  { streak: 50, amount: 20 },
];

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

export function loginTxnId(date: string): string {
  return `login:${date}`;
}

export function loginDailyRate(streak: number): number {
  let daily = 1;
  for (const step of LOGIN_DAILY_RATES) {
    if (streak >= step.streak) daily = step.daily;
  }
  return daily;
}

export function loginMilestoneBonus(streak: number): number {
  return LOGIN_STREAK_BONUSES.find((b) => b.streak === streak)?.amount ?? 0;
}

export function loginRewardAtStreak(streak: number): {
  daily: number;
  milestone: number;
  total: number;
} {
  const daily = loginDailyRate(streak);
  const milestone = loginMilestoneBonus(streak);
  return { daily, milestone, total: daily + milestone };
}

/** Days shown on one login-bonus board (7×4, like a monthly stamp card). */
export const LOGIN_BOARD_DAYS = 28;

export function nextLoginGoal(streak: number): {
  streak: number;
  kind: "rate" | "bonus";
  value: number;
} | null {
  const nextRate = LOGIN_DAILY_RATES.find((s) => s.streak > streak);
  const nextBonus = LOGIN_STREAK_BONUSES.find((s) => s.streak > streak);
  if (nextRate && (!nextBonus || nextRate.streak <= nextBonus.streak)) {
    return { streak: nextRate.streak, kind: "rate", value: nextRate.daily };
  }
  if (nextBonus) {
    return { streak: nextBonus.streak, kind: "bonus", value: nextBonus.amount };
  }
  return null;
}

/** Consecutive days with a login claim ending on `endDate` (0 if that day is missing). */
export function loginStreakEndingOn(
  wallet: TokenWallet | undefined,
  endDate: string,
): number {
  let streak = 0;
  let date = endDate;
  while (hasTxn(wallet, loginTxnId(date))) {
    streak += 1;
    date = shiftDay(date, -1);
  }
  return streak;
}

export interface LoginBonusSummary {
  date: string;
  claimed: boolean;
  streak: number;
  daily: number;
  milestone: number;
  total: number;
  next: ReturnType<typeof nextLoginGoal>;
}

export function loginBonusSummary(
  data: AppData,
  date: string = todayKey(),
): LoginBonusSummary {
  const claimed = hasTxn(data.wallet, loginTxnId(date));
  const streak = claimed
    ? loginStreakEndingOn(data.wallet, date)
    : loginStreakEndingOn(data.wallet, shiftDay(date, -1)) + 1;
  const daily = loginDailyRate(streak);
  const milestone = loginMilestoneBonus(streak);
  return {
    date,
    claimed,
    streak,
    daily,
    milestone,
    total: daily + milestone,
    next: nextLoginGoal(streak),
  };
}

/**
 * Mint today's login bonus once. Streak is the run of consecutive calendar
 * days that already have a `login:` txn, plus today.
 */
export function applyLoginBonus(
  data: AppData,
  date: string = todayKey(),
): { data: AppData; earned: number; summary: LoginBonusSummary } {
  const summary = loginBonusSummary(data, date);
  if (summary.claimed) {
    return { data, earned: 0, summary };
  }
  const wallet = ensureWallet(data);
  const nextWallet = appendTxn(
    wallet,
    makeTxn(loginTxnId(date), summary.total, "login", date),
  );
  return {
    data: { ...data, wallet: nextWallet },
    earned: summary.total,
    summary: { ...summary, claimed: true },
  };
}

/** Stamp last-active day. Login tokens are claimed from the daily bonus popup. */
export function applyDailySession(
  data: AppData,
  date: string = todayKey(),
): AppData {
  return data.lastActiveDate === date
    ? data
    : { ...data, lastActiveDate: date };
}

export function mergeLoginBonus(
  a: LoginBonusState | undefined,
  b: LoginBonusState | undefined,
): LoginBonusState | undefined {
  if (!a && !b) return undefined;
  const left = a?.lastPopupDate ?? "";
  const right = b?.lastPopupDate ?? "";
  const lastPopupDate =
    left >= right
      ? a?.lastPopupDate ?? b?.lastPopupDate
      : b?.lastPopupDate ?? a?.lastPopupDate;
  if (!lastPopupDate) return undefined;
  return { lastPopupDate };
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
    const prev = map.get(t.id);
    if (!prev || (t.amount > prev.amount && t.amount > 0)) {
      map.set(t.id, t);
    }
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
