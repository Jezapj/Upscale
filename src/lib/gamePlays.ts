import { UNLIMITED_PLAYS } from "./games";
import {
  canAfford,
  spendEndlessTxnId,
  spendTokens,
  TOKEN_COST_ENDLESS,
  tokenBalance,
} from "./economy";
import type { AppData, GameId } from "./types";

/**
 * Endless plays cost Play Tokens (habits fund the arcade).
 * Arcade Pro and VITE_UNLIMITED_PLAYS bypass the cost.
 */

export function endlessPlaysRemaining(data: AppData, _today: string): number {
  if (UNLIMITED_PLAYS || data.gamePremium) return 999;
  return Math.floor(tokenBalance(data.wallet) / TOKEN_COST_ENDLESS);
}

export function playsRemaining(
  data: AppData,
  _gameId: GameId,
  today: string,
): number {
  return endlessPlaysRemaining(data, today);
}

export function canPlayGame(
  data: AppData,
  gameId: GameId,
  today: string,
): boolean {
  if (UNLIMITED_PLAYS || data.gamePremium) return true;
  return playsRemaining(data, gameId, today) > 0;
}

/** Spend one token for an endless run. Returns null if the player cannot afford it. */
export function recordGamePlay(
  data: AppData,
  _gameId: GameId,
  today: string,
): AppData | null {
  if (UNLIMITED_PLAYS || data.gamePremium) return data;
  if (!canAfford(data, TOKEN_COST_ENDLESS)) return null;
  const nonce = crypto.randomUUID();
  return spendTokens(
    data,
    TOKEN_COST_ENDLESS,
    "endless",
    spendEndlessTxnId(today, nonce),
    today,
  );
}
