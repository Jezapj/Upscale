import {
  emptyAppData,
  type AppData,
  type DayEntry,
  type DayLog,
  type Goal,
  type Note,
  type Routine,
} from "./types";
import { mergeArcadeDailyStates } from "./dailyChallenge";
import { mergeArcadeUnlocks, mergeWallets } from "./economy";
import { todayKey } from "./dates";

export const BACKUP_FORMAT_VERSION = 1;

export interface BackupEnvelope {
  formatVersion: number;
  exportedAt: string;
  data: AppData;
}

function hasCoreContent(data: AppData): boolean {
  return (
    data.goals.length > 0 ||
    data.routines.length > 0 ||
    Object.keys(data.logs).length > 0 ||
    (data.notes ?? []).some((n) => !n.deletedAt)
  );
}

export function createBackupEnvelope(data: AppData): BackupEnvelope {
  return {
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: data.syncedAt ?? new Date().toISOString(),
    data,
  };
}

/** Same JSON as the Settings → Export download. */
export function serializeBackup(data: AppData): string {
  return JSON.stringify(createBackupEnvelope(data), null, 2);
}

/**
 * Parse an export file or cloud payload. Supports the envelope format and legacy
 * flat AppData JSON from older exports.
 */
export function parseBackupJson(raw: string): AppData {
  const parsed = JSON.parse(raw) as BackupEnvelope | AppData;
  if (
    parsed &&
    typeof parsed === "object" &&
    "data" in parsed &&
    parsed.data &&
    typeof parsed.data === "object"
  ) {
    return { ...emptyAppData(), ...parsed.data };
  }
  return { ...emptyAppData(), ...(parsed as AppData) };
}

function entityStamp(entity: { updatedAt?: string; createdAt: string }): string {
  return entity.updatedAt || entity.createdAt || "";
}

function mergeGoals(a: Goal[], b: Goal[]): Goal[] {
  const map = new Map<string, Goal>();
  for (const g of [...a, ...b]) {
    const existing = map.get(g.id);
    if (!existing || entityStamp(g) >= entityStamp(existing)) {
      map.set(g.id, g);
    }
  }
  return [...map.values()];
}

function mergeRoutines(a: Routine[], b: Routine[]): Routine[] {
  const map = new Map<string, Routine>();
  for (const r of [...a, ...b]) {
    const existing = map.get(r.id);
    if (!existing || entityStamp(r) >= entityStamp(existing)) {
      map.set(r.id, r);
    }
  }
  return [...map.values()];
}

function newerEntry(a: DayEntry, b: DayEntry): DayEntry {
  return (a.ratedAt || "") >= (b.ratedAt || "") ? a : b;
}

function noteStamp(note: Note): string {
  const updated = note.updatedAt || note.createdAt || "";
  const deleted = note.deletedAt || "";
  return deleted > updated ? deleted : updated;
}

/** Union notes by id; newest stamp wins, including delete tombstones. */
export function mergeNotes(a: Note[] | undefined, b: Note[] | undefined): Note[] {
  const map = new Map<string, Note>();
  for (const note of [...(a ?? []), ...(b ?? [])]) {
    const existing = map.get(note.id);
    if (!existing || noteStamp(note) >= noteStamp(existing)) {
      map.set(note.id, note);
    }
  }
  return [...map.values()].sort((x, y) => noteStamp(y).localeCompare(noteStamp(x)));
}

function mergeDayLogs(
  a: Record<string, DayLog>,
  b: Record<string, DayLog>,
): Record<string, DayLog> {
  const dates = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out: Record<string, DayLog> = {};
  for (const date of dates) {
    const left = a[date];
    const right = b[date];
    if (!left) {
      out[date] = right;
      continue;
    }
    if (!right) {
      out[date] = left;
      continue;
    }
    const entries: Record<string, DayEntry> = { ...left.entries };
    for (const [rid, entry] of Object.entries(right.entries)) {
      const cur = entries[rid];
      entries[rid] = cur ? newerEntry(cur, entry) : entry;
    }
    out[date] = { date, entries };
  }
  return out;
}

/**
 * Per-entity merge of two backups. Goals/routines by updatedAt; day entries by
 * ratedAt; notes/wallet/arcade fields are union-merged so neither device drops
 * the other's tokens, palettes, notes, or daily completions.
 */
export function mergeAppDataEntities(local: AppData, cloud: AppData): AppData {
  return {
    ...local,
    ...cloud,
    goals: mergeGoals(local.goals, cloud.goals),
    routines: mergeRoutines(local.routines, cloud.routines),
    logs: mergeDayLogs(local.logs, cloud.logs),
    notes: mergeNotes(local.notes, cloud.notes),
    wallet: mergeWallets(local.wallet, cloud.wallet),
    arcadeUnlocks: mergeArcadeUnlocks(local.arcadeUnlocks, cloud.arcadeUnlocks),
    arcadeDaily: mergeArcadeDailyStates(local.arcadeDaily, cloud.arcadeDaily, todayKey()),
    arcadeProfile: local.arcadeProfile ?? cloud.arcadeProfile,
    gameScores: local.gameScores ?? cloud.gameScores,
    gamePlays: local.gamePlays ?? cloud.gamePlays,
    gamePremium: local.gamePremium || cloud.gamePremium,
    lastGhosts: { ...(cloud.lastGhosts ?? {}), ...(local.lastGhosts ?? {}) },
    lastRecapWeek: local.lastRecapWeek ?? cloud.lastRecapWeek,
    syncedAt:
      (local.syncedAt ?? "") >= (cloud.syncedAt ?? "")
        ? local.syncedAt ?? cloud.syncedAt
        : cloud.syncedAt ?? local.syncedAt,
    version: Math.max(local.version ?? 1, cloud.version ?? 1),
  };
}

/**
 * Resolve local vs cloud on login/sync with per-entity merge when both sides
 * have content. Empty sides still defer to the other.
 */
export function resolveBackupConflict(
  local: AppData,
  cloudData: AppData,
  cloudUpdatedAt: string,
): { data: AppData; source: "local" | "cloud" } {
  const cloud = { ...emptyAppData(), ...cloudData };
  const cloudTs = cloudUpdatedAt || cloud.syncedAt || "";

  if (!hasCoreContent(local)) {
    return {
      data: { ...cloud, syncedAt: cloudTs || cloud.syncedAt },
      source: "cloud",
    };
  }
  if (!hasCoreContent(cloud)) {
    return { data: local, source: "local" };
  }

  const merged = mergeAppDataEntities(local, cloud);
  const localTs = local.syncedAt ?? "";
  const preferCloud = !!cloudTs && (!localTs || cloudTs >= localTs);
  return {
    data: {
      ...merged,
      syncedAt: preferCloud ? cloudTs || localTs : localTs || cloudTs,
    },
    source: preferCloud ? "cloud" : "local",
  };
}
