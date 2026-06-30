import type { PublicAppConfig } from "../../server/publicConfig";

let cached: PublicAppConfig | null = null;
let loading: Promise<PublicAppConfig> | null = null;

const emptyConfig = (): PublicAppConfig => ({});

/** Fetch public config from the server (must run before auth / Firebase init). */
export async function loadAppConfig(): Promise<PublicAppConfig> {
  if (cached) return cached;
  if (!loading) {
    loading = fetch("/api/config")
      .then((res) => (res.ok ? res.json() : emptyConfig()))
      .then((data: PublicAppConfig) => {
        cached = data ?? emptyConfig();
        return cached;
      })
      .catch(() => {
        cached = emptyConfig();
        return cached;
      });
  }
  return loading;
}

export function getAppConfig(): PublicAppConfig {
  return cached ?? emptyConfig();
}
