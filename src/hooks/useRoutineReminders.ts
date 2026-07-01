import { useCallback, useEffect, useState } from "react";
import { useStore } from "@/store/useStore";
import {
  dueRemindersNow,
  getReminderPrefs,
  markRemindersFired,
  REMINDER_PREFS_EVENT,
} from "@/lib/reminders";
import { showRoutineReminder } from "@/lib/notifications";
import { todayKey } from "@/lib/dates";

const CHECK_INTERVAL_MS = 10_000;

/** Poll for due routine reminders and show device notifications. */
export function useRoutineReminders() {
  const data = useStore((s) => s.data);
  const today = useStore((s) => s.today);
  const [prefsTick, setPrefsTick] = useState(0);

  useEffect(() => {
    const onPrefs = () => setPrefsTick((n) => n + 1);
    window.addEventListener(REMINDER_PREFS_EVENT, onPrefs);
    return () => window.removeEventListener(REMINDER_PREFS_EVENT, onPrefs);
  }, []);

  const checkReminders = useCallback(() => {
    if (!getReminderPrefs().enabled) return;

    const freshData = useStore.getState().data;
    const dateKey = todayKey();
    const due = dueRemindersNow(freshData, dateKey);
    if (due.length === 0) return;

    void Promise.all(due.map((routine) => showRoutineReminder(routine)))
      .then(() => markRemindersFired(due, dateKey))
      .catch((err) => console.warn("Reminder notification failed", err));
  }, []);

  useEffect(() => {
    if (!getReminderPrefs().enabled) return;

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
  }, [checkReminders, today, prefsTick, data]);
}
