import { emptyAppData, type AppData } from "./types";

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
    (data.notes?.length ?? 0) > 0
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

/**
 * Pick the winning full backup on login/sync (export-style import, not field merge).
 * Newer `exportedAt` / cloud `updatedAt` wins when both sides have content.
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

  const localTs = local.syncedAt ?? "";
  if (!localTs && cloudTs) {
    return { data: { ...cloud, syncedAt: cloudTs }, source: "cloud" };
  }
  if (localTs && !cloudTs) {
    return { data: local, source: "local" };
  }

  if (cloudTs >= localTs) {
    return { data: { ...cloud, syncedAt: cloudTs }, source: "cloud" };
  }
  return { data: local, source: "local" };
}
