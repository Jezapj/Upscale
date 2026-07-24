/**
 * Global daily arcade leaderboard backed by Firestore.
 * Path: dailyBoards/{gameId}_{day}/entries/{googleSub}
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  type Firestore,
} from "firebase/firestore";
import { getFirebaseAuth, getFirebaseDb, cloudConfigured } from "./firebase";
import { waitForFirebaseAuth } from "./firebaseAuth";
import { dailyBoardDocId } from "./dailyChallenge";
import { firestoreUserDocId } from "./cloudSync";
import type { GameId } from "./types";
import { todayKey } from "./dates";

export interface DailyBoardEntry {
  uid: string;
  score: number;
  displayName: string | null;
  playedAt: string;
  gameId: GameId;
  day: string;
  meta?: Record<string, string>;
}

function entriesCol(db: Firestore, gameId: GameId, day: string) {
  return collection(db, "dailyBoards", dailyBoardDocId(gameId, day), "entries");
}

/**
 * Create-once submit. Returns true if this client created the doc;
 * false if an entry already existed or submit was skipped.
 */
export async function submitDailyScore(args: {
  userId: string;
  gameId: GameId;
  score: number;
  displayName: string | null;
  day?: string;
  meta?: Record<string, string>;
}): Promise<{ ok: boolean; reason?: string }> {
  if (!cloudConfigured()) return { ok: false, reason: "cloud_unavailable" };
  const db = getFirebaseDb();
  if (!db) return { ok: false, reason: "cloud_unavailable" };

  const authed = await waitForFirebaseAuth();
  const auth = getFirebaseAuth();
  if (!authed || !auth?.currentUser) return { ok: false, reason: "not_signed_in" };

  const uid = firestoreUserDocId(args.userId);
  if (!uid) return { ok: false, reason: "guest" };

  const day = args.day ?? todayKey();
  const ref = doc(entriesCol(db, args.gameId, day), uid);

  try {
    const existing = await getDoc(ref);
    if (existing.exists()) return { ok: false, reason: "exists" };

    const payload: DailyBoardEntry = {
      uid,
      score: args.score,
      displayName: args.displayName,
      playedAt: new Date().toISOString(),
      gameId: args.gameId,
      day,
      ...(args.meta ? { meta: args.meta } : {}),
    };
    await setDoc(ref, payload);
    return { ok: true };
  } catch (err) {
    console.warn("daily board submit failed", err);
    return { ok: false, reason: "exists_or_denied" };
  }
}

/** True if this user already has an official daily score on the board (any device). */
export async function hasUserDailyBoardEntry(
  userId: string,
  gameId: GameId,
  day: string = todayKey(),
): Promise<boolean> {
  if (!cloudConfigured()) return false;
  const db = getFirebaseDb();
  if (!db) return false;

  const authed = await waitForFirebaseAuth();
  const auth = getFirebaseAuth();
  if (!authed || !auth?.currentUser) return false;

  const uid = firestoreUserDocId(userId);
  if (!uid) return false;

  try {
    const snap = await getDoc(doc(entriesCol(db, gameId, day), uid));
    return snap.exists();
  } catch {
    return false;
  }
}

export async function listDailyBoard(
  gameId: GameId,
  day: string = todayKey(),
  max = 50,
): Promise<DailyBoardEntry[]> {
  if (!cloudConfigured()) return [];
  const db = getFirebaseDb();
  if (!db) return [];

  const authed = await waitForFirebaseAuth();
  const auth = getFirebaseAuth();
  if (!authed || !auth?.currentUser) return [];

  try {
    const q = query(entriesCol(db, gameId, day), orderBy("score", "desc"), limit(max));
    const snap = await Promise.race([
      getDocs(q),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("daily board timeout")), 12_000),
      ),
    ]);
    return snap.docs.map((d) => d.data() as DailyBoardEntry);
  } catch (err) {
    console.warn("daily board list failed", err);
    throw err;
  }
}
