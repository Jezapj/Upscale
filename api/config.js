import { getPublicConfig } from "./publicConfig";
/** Serves public app config from server-side environment variables. */
export default function handler(_req, res) {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    res.status(200).json(getPublicConfig());
}
