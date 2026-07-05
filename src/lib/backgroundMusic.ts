/** Background theme tunes (audio from MP4 files in /public). */
export const BACKGROUND_TRACKS = [
  {
    id: "mii-plaza",
    label: "Mii Plaza",
    src: encodeURI("/Mii Channel - Plaza Theme (HQ).mp4"),
  },
  {
    id: "streetpass",
    label: "StreetPass Medley",
    src: encodeURI("/Streetpass Mii Plaza Theme Full Medley.mp4"),
  },
  {
    id: "palmtree",
    label: "Palmtree Panic",
    src: encodeURI(
      "/Sonic CD v0.02 Proto - Palmtree Panic_Salad Plain (Past) Music.mp4",
    ),
  },
] as const;

export type BackgroundTrackId = (typeof BACKGROUND_TRACKS)[number]["id"];

export function getBackgroundTrack(id: BackgroundTrackId) {
  return BACKGROUND_TRACKS.find((t) => t.id === id) ?? BACKGROUND_TRACKS[0];
}

export function nextBackgroundTrackId(id: BackgroundTrackId): BackgroundTrackId {
  const idx = BACKGROUND_TRACKS.findIndex((t) => t.id === id);
  const next = (idx + 1) % BACKGROUND_TRACKS.length;
  return BACKGROUND_TRACKS[next].id;
}
