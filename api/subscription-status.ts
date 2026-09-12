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
  email?: string,
): Promise<boolean> {
  // First try searching by firebaseUid metadata (our direct Stripe customers)
  const customersByUid = await stripe.customers.search({
    query: `metadata['firebaseUid']:'${firebaseUid}'`,
    limit: 1,
  });

  let customer = customersByUid.data[0];

  // If not found, try searching by email (RevenueCat-created customers)
  if (!customer && email) {
    const customersByEmail = await stripe.customers.search({
      query: `email:'${email}'`,
      limit: 1,
    });
    customer = customersByEmail.data[0];
  }

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
  const email = req.query.email as string | undefined;
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
    const active = await hasActiveSubscription(stripe, uid, email);
    res.status(200).json({ active });
  } catch (err) {
    console.error("subscription-status failed", err);
    res.status(500).json({ active: false });
  }
}
