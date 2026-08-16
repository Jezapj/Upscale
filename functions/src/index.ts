import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging, type MulticastMessage } from "firebase-admin/messaging";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { dueItems, type AppData, zonedNow } from "./due.js";

initializeApp();

interface PushSubscriptionDoc {
  enabled?: boolean;
  tokens?: string[];
  timeZone?: string;
  fired?: Record<string, string[]>;
}

const FIRED_KEEP_DAYS = 3;

function trimFired(fired: Record<string, string[]>): Record<string, string[]> {
  const keys = Object.keys(fired).sort().slice(-FIRED_KEEP_DAYS);
  const out: Record<string, string[]> = {};
  for (const key of keys) out[key] = fired[key];
  return out;
}

export const sendReminders = onSchedule(
  {
    schedule: "every 1 minutes",
    timeoutSeconds: 120,
    memory: "256MiB",
  },
  async () => {
    const db = getFirestore();
    const messaging = getMessaging();
    const now = new Date();
    const snap = await db.collection("pushSubscriptions").where("enabled", "==", true).get();

    for (const docSnap of snap.docs) {
      const uid = docSnap.id;
      const sub = docSnap.data() as PushSubscriptionDoc;
      const tokens = (sub.tokens ?? []).filter(Boolean);
      if (tokens.length === 0) continue;

      const timeZone = sub.timeZone || "UTC";
      const { dateKey, minutes } = zonedNow(now, timeZone);
      const fired = new Set(sub.fired?.[dateKey] ?? []);

      const userSnap = await db.collection("userdata").doc(uid).get();
      if (!userSnap.exists) continue;
      const raw = userSnap.data() as { data?: AppData } | undefined;
      const data = raw?.data;
      if (!data) continue;

      const items = dueItems(data, dateKey, minutes, fired);
      if (items.length === 0) continue;

      const invalid = new Set<string>();
      for (const item of items) {
        const message: MulticastMessage = {
          tokens,
          data: {
            title: item.title.slice(0, 200),
            body: item.body.slice(0, 500),
            url: item.url,
            tag: item.tag,
          },
          webpush: {
            headers: { Urgency: "high" },
          },
        };
        try {
          const result = await messaging.sendEachForMulticast(message);
          result.responses.forEach((res, i) => {
            if (res.success) return;
            const code = res.error?.code ?? "";
            if (
              code.includes("registration-token-not-registered") ||
              code.includes("invalid-registration-token")
            ) {
              invalid.add(tokens[i]);
            }
          });
          if (result.successCount > 0) fired.add(item.id);
        } catch (err) {
          console.error(`sendReminders failed for ${uid} ${item.id}`, err);
        }
      }

      const nextTokens = tokens.filter((t) => !invalid.has(t));
      const nextFired = { ...(sub.fired ?? {}), [dateKey]: [...fired] };
      await docSnap.ref.update({
        tokens: nextTokens,
        fired: trimFired(nextFired),
        lastRunAt: now.toISOString(),
      });
    }
  },
);
