import { useCallback, useEffect, useState } from "react";
import { useStore } from "@/store/useStore";
import {
  dueNoteRemindersNow,
  dueRemindersNow,
  getReminderPrefs,
  markNoteRemindersFired,
  markRemindersFired,
  REMINDER_PREFS_EVENT,
} from "@/lib/reminders";
import { showNoteReminder, showRoutineReminder } from "@/lib/notifications";
import { isRemotePushActive, syncRemotePush } from "@/lib/push";
import { todayKey } from "@/lib/dates";

const CHECK_INTERVAL_MS = 10_000;

/** Poll for due reminders locally, and keep FCM registration in sync. */
export function useRoutineReminders() {
  const data = useStore((s) => s.data);
  const today = useStore((s) => s.today);
  const user = useStore((s) => s.user);
  const [prefsTick, setPrefsTick] = useState(0);
  const [pushTick, setPushTick] = useState(0);

  useEffect(() => {
    const onPrefs = () => setPrefsTick((n) => n + 1);
    window.addEventListener(REMINDER_PREFS_EVENT, onPrefs);
    return () => window.removeEventListener(REMINDER_PREFS_EVENT, onPrefs);
  }, []);

  useEffect(() => {
    if (!getReminderPrefs().enabled) return;
    void syncRemotePush().finally(() => setPushTick((n) => n + 1));
  }, [user?.id, prefsTick]);

  const checkReminders = useCallback(() => {
    if (!getReminderPrefs().enabled) return;
    // Signed-in Google users with FCM: the scheduled function fires while closed.
    if (isRemotePushActive()) return;

    const freshData = useStore.getState().data;
    const dateKey = todayKey();
    const due = dueRemindersNow(freshData, dateKey);
    const dueNotes = dueNoteRemindersNow(freshData, dateKey);
    if (due.length === 0 && dueNotes.length === 0) return;

    if (due.length > 0) {
      void Promise.all(due.map((routine) => showRoutineReminder(routine)))
        .then(() => markRemindersFired(due, dateKey))
        .catch((err) => console.warn("Reminder notification failed", err));
    }

    if (dueNotes.length > 0) {
      void Promise.all(dueNotes.map((note) => showNoteReminder(note)))
        .then(() => markNoteRemindersFired(dueNotes, dateKey))
        .catch((err) => console.warn("Note reminder notification failed", err));
    }
  }, []);

  useEffect(() => {
    if (!getReminderPrefs().enabled) return;
    if (isRemotePushActive()) return;

    checkReminders();

    const id = window.setInterval(checkReminders, CHECK_INTERVAL_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible") checkReminders();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", checkReminders);

    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", checkReminders);
    };
  }, [checkReminders, today, prefsTick, data, pushTick]);
}
