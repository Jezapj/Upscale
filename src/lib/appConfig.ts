import type { PublicAppConfig } from "../../api/publicConfig";

let cached: PublicAppConfig | null = null;
let loading: Promise<PublicAppConfig> | null = null;

const emptyConfig = (): PublicAppConfig => ({});

/** Fetch public config from the server (must run before auth / Firebase init). */
export async function loadAppConfig(): Promise<PublicAppConfig> {
  if (cached) return cached;
  if (!loading) {
    loading = fetch("/api/config")
      .then(async (res) => {
        if (!res.ok) {
          console.warn(`Config endpoint returned ${res.status}`);
          return emptyConfig();
        }
        const contentType = res.headers.get("content-type") ?? "";
        if (!contentType.includes("application/json")) {
          console.warn("Config endpoint did not return JSON");
          return emptyConfig();
        }
        return (await res.json()) as PublicAppConfig;
      })
      .then((data) => {
        cached = data ?? emptyConfig();
        return cached;
      })
      .catch((err) => {
        console.warn("Failed to load app config", err);
        cached = emptyConfig();
        return cached;
      });
  }
  return loading;
}

export function getAppConfig(): PublicAppConfig {
  return cached ?? emptyConfig();
}
