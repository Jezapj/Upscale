/** Dock tab order — matches the bottom nav left → right. */
export const DOCK_ROUTES = [
  "/",
  "/checkin",
  "/goals",
  "/progress",
  "/library",
] as const;

export type DockRoute = (typeof DOCK_ROUTES)[number];

export function dockIndex(pathname: string): number {
  const i = DOCK_ROUTES.findIndex(
    (r) => r === pathname || (r !== "/" && pathname.startsWith(r)),
  );
  return i >= 0 ? i : 0;
}

export function dockPrev(pathname: string): DockRoute {
  const i = dockIndex(pathname);
  return DOCK_ROUTES[(i - 1 + DOCK_ROUTES.length) % DOCK_ROUTES.length];
}

export function dockNext(pathname: string): DockRoute {
  const i = dockIndex(pathname);
  return DOCK_ROUTES[(i + 1) % DOCK_ROUTES.length];
}
