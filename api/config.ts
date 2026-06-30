import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPublicConfig } from "../server/publicConfig";

/** Serves public app config from server-side environment variables. */
export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
  res.status(200).json(getPublicConfig());
}
