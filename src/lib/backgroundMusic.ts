/** Background theme tunes (files in /public). */
export const BACKGROUND_TRACKS = [
  {
    id: "breakout",
    label: "Breakout",
    src: "/Breakout_menusong.mp3",
    /** 0 = free, always owned. Others are bought in the Shop. */
    cost: 0,
    /** Record label colours shown in the Shop. */
    colors: ["#3a8ef0", "#8fe6c6"],
  },
  {
    id: "palmtree",
    label: "Palmtree Panic",
    src: encodeURI(
      "/Sonic CD v0.02 Proto - Palmtree Panic_Salad Plain (Past) Music.mp4",
    ),
    cost: 20,
    colors: ["#ffb43d", "#2bc4a8"],
  },
  {
    id: "mii-plaza",
    label: "Mii Plaza",
    src: encodeURI("/Mii Channel - Plaza Theme (HQ).mp4"),
    cost: 30,
    colors: ["#7db8ff", "#f5f6f8"],
  },
  {
    id: "streetpass",
    label: "StreetPass Medley",
    src: encodeURI("/Streetpass Mii Plaza Theme Full Medley.mp4"),
    cost: 40,
    colors: ["#5cd0a8", "#ff77b0"],
  },
] as const;

export type BackgroundTrack = (typeof BACKGROUND_TRACKS)[number];
export type BackgroundTrackId = BackgroundTrack["id"];

/** Free track every player starts with. */
export const DEFAULT_BACKGROUND_TRACK_ID: BackgroundTrackId = "breakout";

export function getBackgroundTrack(id: BackgroundTrackId) {
  return (
    BACKGROUND_TRACKS.find((t) => t.id === id) ??
    BACKGROUND_TRACKS.find((t) => t.id === DEFAULT_BACKGROUND_TRACK_ID) ??
    BACKGROUND_TRACKS[0]
  );
}

export function isTrackOwned(
  id: BackgroundTrackId,
  unlockedTracks: readonly string[] | undefined,
): boolean {
  const track = BACKGROUND_TRACKS.find((t) => t.id === id);
  if (!track) return false;
  return track.cost === 0 || !!unlockedTracks?.includes(id);
}

/** Next owned track after `id` (locked tracks are skipped). */
export function nextBackgroundTrackId(
  id: BackgroundTrackId,
  unlockedTracks?: readonly string[],
): BackgroundTrackId {
  const owned = BACKGROUND_TRACKS.filter((t) => isTrackOwned(t.id, unlockedTracks));
  const idx = owned.findIndex((t) => t.id === id);
  return owned[(idx + 1) % owned.length].id;
}
