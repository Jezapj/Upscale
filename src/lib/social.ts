/**
 * Friend codes, public streak summaries, and daily kudos (Google accounts).
 * Each client only writes its own `social/{uid}` doc; requests live in a
 * shared create-once collection so Firestore rules stay simple.
 */

import {
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { getFirebaseDb, cloudConfigured } from "./firebase";
import { waitForFirebaseAuth } from "./firebaseAuth";
import { firestoreUserDocId } from "./cloudSync";
import type { AppData } from "./types";
import { todayKey } from "./dates";
import { isScheduledOn } from "./frequency";
import { computeRoutineStats } from "./stats";

export interface SocialProfile {
  uid: string;
  friendCode: string;
  friendUids: string[];
  displayName: string;
  updatedAt: string;
}

export interface FriendRequest {
  id: string;
  fromUid: string;
  toUid: string;
  fromName: string;
  createdAt: string;
  status: "pending" | "accepted" | "declined";
}

export interface PublicStats {
  uid: string;
  displayName: string;
  bestStreak: number;
  daysActiveThisWeek: number;
  completedToday: boolean;
  updatedAt: string;
}

export interface KudosEntry {
  fromUid: string;
  fromName: string;
  day: string;
}

function digitsOnlyCode(): string {
  const n = () => Math.floor(Math.random() * 10);
  const block = () => `${n()}${n()}${n()}${n()}`;
  return `${block()}-${block()}-${block()}`;
}

export function normaliseFriendCode(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 12);
  if (digits.length !== 12) return "";
  return `${digits.slice(0, 4)}-${digits.slice(4, 8)}-${digits.slice(8, 12)}`;
}

export async function ensureSocialProfile(
  userId: string,
  displayName: string,
): Promise<SocialProfile | null> {
  if (!cloudConfigured()) return null;
  const db = getFirebaseDb();
  if (!db) return null;
  await waitForFirebaseAuth();
  const uid = firestoreUserDocId(userId);
  if (!uid) return null;

  const ref = doc(db, "social", uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return snap.data() as SocialProfile;

  let code = digitsOnlyCode();
  for (let i = 0; i < 5; i++) {
    const codeRef = doc(db, "friendCodes", code);
    const existing = await getDoc(codeRef);
    if (!existing.exists()) break;
    code = digitsOnlyCode();
  }

  const profile: SocialProfile = {
    uid,
    friendCode: code,
    friendUids: [],
    displayName: displayName.slice(0, 24) || "Player",
    updatedAt: new Date().toISOString(),
  };

  await setDoc(ref, profile);
  await setDoc(doc(db, "friendCodes", code), { uid, createdAt: profile.updatedAt });
  return profile;
}

export async function loadSocialProfile(userId: string): Promise<SocialProfile | null> {
  if (!cloudConfigured()) return null;
  const db = getFirebaseDb();
  if (!db) return null;
  await waitForFirebaseAuth();
  const uid = firestoreUserDocId(userId);
  if (!uid) return null;
  const snap = await getDoc(doc(db, "social", uid));
  return snap.exists() ? (snap.data() as SocialProfile) : null;
}

export async function listIncomingRequests(userId: string): Promise<FriendRequest[]> {
  if (!cloudConfigured()) return [];
  const db = getFirebaseDb();
  if (!db) return [];
  await waitForFirebaseAuth();
  const uid = firestoreUserDocId(userId);
  if (!uid) return [];
  try {
    const q = query(
      collection(db, "friendRequests"),
      where("toUid", "==", uid),
      where("status", "==", "pending"),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<FriendRequest, "id">) }));
  } catch (e) {
    console.warn("friendRequests query failed", e);
    return [];
  }
}

export async function requestFriendByCode(
  userId: string,
  rawCode: string,
  fromName: string,
): Promise<{ ok: boolean; reason?: string }> {
  if (!cloudConfigured()) return { ok: false, reason: "cloud_unavailable" };
  const db = getFirebaseDb();
  if (!db) return { ok: false, reason: "cloud_unavailable" };
  await waitForFirebaseAuth();
  const uid = firestoreUserDocId(userId);
  if (!uid) return { ok: false, reason: "guest" };

  const code = normaliseFriendCode(rawCode);
  if (!code) return { ok: false, reason: "invalid_code" };

  const codeSnap = await getDoc(doc(db, "friendCodes", code));
  if (!codeSnap.exists()) return { ok: false, reason: "not_found" };
  const targetUid = (codeSnap.data() as { uid: string }).uid;
  if (targetUid === uid) return { ok: false, reason: "self" };

  const me = await loadSocialProfile(userId);
  if (!me) return { ok: false, reason: "missing_profile" };
  if (me.friendUids.includes(targetUid)) return { ok: false, reason: "already_friends" };

  const reqId = `${uid}_${targetUid}`;
  const reqRef = doc(db, "friendRequests", reqId);
  const existing = await getDoc(reqRef);
  if (existing.exists()) {
    const data = existing.data() as FriendRequest;
    if (data.status === "pending" || data.status === "accepted") {
      return { ok: false, reason: "already_friends" };
    }
  }

  // If they already requested us, accept both sides locally.
  const reverseId = `${targetUid}_${uid}`;
  const reverse = await getDoc(doc(db, "friendRequests", reverseId));
  if (reverse.exists() && (reverse.data() as FriendRequest).status === "pending") {
    await acceptFriendRequest(userId, reverseId);
    return { ok: true };
  }

  await setDoc(reqRef, {
    fromUid: uid,
    toUid: targetUid,
    fromName: fromName.slice(0, 24) || "Player",
    createdAt: new Date().toISOString(),
    status: "pending",
  });
  return { ok: true };
}

export async function acceptFriendRequest(
  userId: string,
  requestId: string,
): Promise<boolean> {
  if (!cloudConfigured()) return false;
  const db = getFirebaseDb();
  if (!db) return false;
  await waitForFirebaseAuth();
  const uid = firestoreUserDocId(userId);
  if (!uid) return false;

  const reqRef = doc(db, "friendRequests", requestId);
  const snap = await getDoc(reqRef);
  if (!snap.exists()) return false;
  const req = snap.data() as FriendRequest;
  if (req.toUid !== uid || req.status !== "pending") return false;

  // Mark accepted (recipient may update status).
  await setDoc(reqRef, { ...req, status: "accepted" }, { merge: true });

  // Only write our own friend list.
  const meRef = doc(db, "social", uid);
  const meSnap = await getDoc(meRef);
  if (!meSnap.exists()) return false;
  const me = meSnap.data() as SocialProfile;
  await setDoc(
    meRef,
    {
      ...me,
      friendUids: [...new Set([...me.friendUids, req.fromUid])],
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );

  // Mirror accept doc so the sender can pick it up and add us.
  const mirrorId = `accept_${requestId}`;
  await setDoc(doc(db, "friendRequests", mirrorId), {
    fromUid: uid,
    toUid: req.fromUid,
    fromName: me.displayName,
    createdAt: new Date().toISOString(),
    status: "accepted",
    mirrors: requestId,
  });

  return true;
}

/** Sender polls accepted mirrors and adds the friend on their own doc. */
export async function syncAcceptedOutgoing(userId: string): Promise<void> {
  if (!cloudConfigured()) return;
  const db = getFirebaseDb();
  if (!db) return;
  await waitForFirebaseAuth();
  const uid = firestoreUserDocId(userId);
  if (!uid) return;

  try {
    const q = query(
      collection(db, "friendRequests"),
      where("toUid", "==", uid),
      where("status", "==", "accepted"),
    );
    const snap = await getDocs(q);
    if (snap.empty) return;

    const meRef = doc(db, "social", uid);
    const meSnap = await getDoc(meRef);
    if (!meSnap.exists()) return;
    const me = meSnap.data() as SocialProfile;
    let changed = false;
    const friendUids = [...me.friendUids];
    for (const d of snap.docs) {
      const req = d.data() as FriendRequest & { mirrors?: string };
      if (!req.mirrors) continue;
      if (!friendUids.includes(req.fromUid)) {
        friendUids.push(req.fromUid);
        changed = true;
      }
    }
    if (changed) {
      await setDoc(
        meRef,
        { ...me, friendUids, updatedAt: new Date().toISOString() },
        { merge: true },
      );
    }
  } catch (e) {
    console.warn("syncAcceptedOutgoing failed", e);
  }
}

export function buildPublicStats(
  userId: string,
  data: AppData,
  displayName: string,
): PublicStats | null {
  const uid = firestoreUserDocId(userId);
  if (!uid) return null;
  const today = todayKey();
  let bestStreak = 0;
  for (const r of data.routines.filter((x) => !x.archived)) {
    bestStreak = Math.max(bestStreak, computeRoutineStats(data, r).bestStreak);
  }

  const weekStart = new Date();
  const dow = (weekStart.getDay() + 6) % 7;
  weekStart.setDate(weekStart.getDate() - dow);
  let daysActive = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const key = `${y}-${m}-${day}`;
    const log = data.logs[key];
    if (log && Object.values(log.entries).some((e) => e.completed)) daysActive++;
  }

  const scheduled = data.routines.filter(
    (r) => !r.archived && isScheduledOn(r, today),
  );
  const completedToday =
    scheduled.length > 0 &&
    scheduled.every((r) => data.logs[today]?.entries[r.id]?.completed);

  return {
    uid,
    displayName: displayName.slice(0, 24) || "Player",
    bestStreak,
    daysActiveThisWeek: daysActive,
    completedToday,
    updatedAt: new Date().toISOString(),
  };
}

export async function publishPublicStats(
  userId: string,
  data: AppData,
  displayName: string,
): Promise<void> {
  if (!cloudConfigured()) return;
  const db = getFirebaseDb();
  if (!db) return;
  const stats = buildPublicStats(userId, data, displayName);
  if (!stats) return;
  try {
    await setDoc(doc(db, "publicStats", stats.uid), stats);
  } catch (e) {
    console.warn("publicStats write failed", e);
  }
}

export async function loadFriendStats(
  friendUids: string[],
): Promise<PublicStats[]> {
  if (!cloudConfigured() || friendUids.length === 0) return [];
  const db = getFirebaseDb();
  if (!db) return [];
  await waitForFirebaseAuth();
  const out: PublicStats[] = [];
  for (const uid of friendUids) {
    try {
      const snap = await getDoc(doc(db, "publicStats", uid));
      if (snap.exists()) out.push(snap.data() as PublicStats);
    } catch {
      // skip
    }
  }
  return out;
}

export async function sendKudos(
  fromUserId: string,
  fromName: string,
  toUid: string,
  day: string = todayKey(),
): Promise<{ ok: boolean; reason?: string }> {
  if (!cloudConfigured()) return { ok: false, reason: "cloud_unavailable" };
  const db = getFirebaseDb();
  if (!db) return { ok: false, reason: "cloud_unavailable" };
  await waitForFirebaseAuth();
  const fromUid = firestoreUserDocId(fromUserId);
  if (!fromUid) return { ok: false, reason: "guest" };
  if (fromUid === toUid) return { ok: false, reason: "self" };

  const ref = doc(db, "kudos", toUid, "days", day, "from", fromUid);
  const existing = await getDoc(ref);
  if (existing.exists()) return { ok: false, reason: "exists" };

  await setDoc(ref, {
    fromUid,
    fromName: fromName.slice(0, 24),
    day,
    createdAt: new Date().toISOString(),
  });
  return { ok: true };
}

export async function listKudosForDay(
  userId: string,
  day: string = todayKey(),
): Promise<KudosEntry[]> {
  if (!cloudConfigured()) return [];
  const db = getFirebaseDb();
  if (!db) return [];
  await waitForFirebaseAuth();
  const uid = firestoreUserDocId(userId);
  if (!uid) return [];
  try {
    const col = collection(db, "kudos", uid, "days", day, "from");
    const snap = await getDocs(col);
    return snap.docs.map((d) => d.data() as KudosEntry);
  } catch {
    return [];
  }
}
