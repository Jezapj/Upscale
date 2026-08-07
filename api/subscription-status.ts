import type { VercelRequest, VercelResponse } from "@vercel/node";
import Stripe from "stripe";

function stripeClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key);
}

async function hasActiveSubscription(
  stripe: Stripe,
  firebaseUid: string,
): Promise<boolean> {
  const customers = await stripe.customers.search({
    query: `metadata['firebaseUid']:'${firebaseUid}'`,
    limit: 1,
  });

  const customer = customers.data[0];
  if (!customer) return false;

  const subs = await stripe.subscriptions.list({
    customer: customer.id,
    status: "active",
    limit: 1,
  });

  return subs.data.length > 0;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const uid = req.query.uid as string | undefined;
  if (!uid) {
    res.status(400).json({ error: "uid is required" });
    return;
  }

  const stripe = stripeClient();
  if (!stripe) {
    res.status(503).json({ active: false });
    return;
  }

  try {
    const active = await hasActiveSubscription(stripe, uid);
    res.status(200).json({ active });
  } catch (err) {
    console.error("subscription-status failed", err);
    res.status(500).json({ active: false });
  }
}
