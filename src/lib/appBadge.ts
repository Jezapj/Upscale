/** App Badge API: show count of due routines on the home-screen icon. */

export function setAppBadgeCount(count: number): void {
  try {
    const nav = navigator as Navigator & {
      setAppBadge?: (n?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (count <= 0) {
      void nav.clearAppBadge?.();
      return;
    }
    void nav.setAppBadge?.(count);
  } catch {
    // Unsupported browsers fail silently.
  }
}

export function clearAppBadge(): void {
  setAppBadgeCount(0);
}
