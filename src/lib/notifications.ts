import type { Routine } from "./types";

export type NotificationPermissionState = NotificationPermission | "unsupported";

const SW_READY_TIMEOUT_MS = 2_000;

export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function getNotificationPermission(): NotificationPermissionState {
  if (!notificationsSupported()) return "unsupported";
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (!notificationsSupported()) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  return Notification.requestPermission();
}

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    const ready = navigator.serviceWorker.ready;
    const timeout = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), SW_READY_TIMEOUT_MS),
    );
    return (await Promise.race([ready, timeout])) ?? null;
  } catch {
    return null;
  }
}

export async function showRoutineReminder(routine: Routine): Promise<void> {
  if (!notificationsSupported() || Notification.permission !== "granted") return;

  const title = `${routine.icon} ${routine.title}`;
  const body = routine.note?.trim() || "Time for your routine. Open Upscale to check in.";

  const options: NotificationOptions = {
    body,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: `routine-${routine.id}`,
    data: { url: "/checkin", routineId: routine.id },
  };

  try {
    const registration = await getRegistration();
    if (registration?.showNotification) {
      await registration.showNotification(title, options);
      return;
    }
  } catch (e) {
    console.warn("Service worker notification failed, using Notification API", e);
  }

  new Notification(title, options);
}
