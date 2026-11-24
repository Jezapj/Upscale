// Shop item artwork: each kind of item is drawn as the thing it is.
// Music = vinyl record, game theme = loaded paint brush, app theme = paint
// bucket whose label shows the look it pours over the app.
import { useId } from "react";
import type { AppThemeId } from "@/lib/appThemes";

interface ArtProps {
  size?: number;
  className?: string;
}

/** Vinyl record; the label takes the track's two colours. */
export function RecordArt({
  colors,
  size = 64,
  className,
}: ArtProps & { colors: readonly string[] }) {
  const id = useId();
  const [a, b] = [colors[0] ?? "#3a8ef0", colors[1] ?? colors[0] ?? "#8fe6c6"];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient id={`${id}-label`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={a} />
          <stop offset="1" stopColor={b} />
        </linearGradient>
        <linearGradient id={`${id}-sheen`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0.3" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.28" />
          <stop offset="0.7" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="29" fill="#17181d" />
      <circle cx="32" cy="32" r="29" fill="none" stroke="#3a3c46" strokeWidth="1.5" />
      {[25, 21.5, 18, 14.5].map((r) => (
        <circle key={r} cx="32" cy="32" r={r} fill="none" stroke="#2c2e37" strokeWidth="1" />
      ))}
      <circle cx="32" cy="32" r="29" fill={`url(#${id}-sheen)`} />
      <circle cx="32" cy="32" r="11" fill={`url(#${id}-label)`} />
      <path d="M24 30.5h16M26 34h12" stroke="#fff" strokeOpacity="0.55" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="32" cy="32" r="2.2" fill="#f2f3f5" stroke="#17181d" strokeWidth="0.8" />
    </svg>
  );
}

/** Paint brush dipped in the palette, with a three-colour stroke behind it. */
export function BrushArt({
  swatches,
  size = 64,
  className,
}: ArtProps & { swatches: readonly string[] }) {
  const [a, b, c] = [
    swatches[0] ?? "#ff9e64",
    swatches[1] ?? swatches[0] ?? "#ff5c5c",
    swatches[2] ?? swatches[0] ?? "#ffd76e",
  ];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      aria-hidden
    >
      {/* Brush strokes left on the canvas */}
      <path d="M6 50c9-7 17 5 27-1s14-4 25-9" stroke={b} strokeWidth="7" strokeLinecap="round" fill="none" />
      <path d="M9 58c8-5 15 3 24-1s13-3 22-6" stroke={c} strokeWidth="5" strokeLinecap="round" fill="none" />
      <g transform="rotate(42 32 32)">
        {/* Handle */}
        <rect x="28.5" y="-4" width="7" height="27" rx="3.5" fill="#c98b4b" />
        <rect x="28.5" y="-4" width="2.6" height="27" rx="1.3" fill="#e3ab6c" />
        {/* Ferrule */}
        <rect x="26.5" y="21" width="11" height="9" rx="1.5" fill="#c9ced8" />
        <path d="M26.5 24h11M26.5 27h11" stroke="#8f96a5" strokeWidth="1" />
        {/* Bristles loaded with paint */}
        <path d="M26.5 30h11v9c0 6-2.5 9-5.5 13-3-4-5.5-7-5.5-13z" fill={a} />
        <path d="M29 31v9c0 3 .6 5 1.6 7" stroke="#fff" strokeOpacity="0.4" strokeWidth="1.4" strokeLinecap="round" fill="none" />
      </g>
    </svg>
  );
}

/** Miniature of each app theme, drawn on the bucket's label (40x22 box). */
function BucketLabel({ theme }: { theme: AppThemeId | "classic" }) {
  switch (theme) {
    case "speed":
      return (
        <>
          <rect width="40" height="22" fill="#eaf5ff" />
          <path d="M0 22L14 0h9L9 22zM20 22L34 0h4L24 22z" fill="#1c6dff" />
          <path d="M11 22L25 0h3L14 22z" fill="#8fd0ff" />
          <circle cx="31" cy="12" r="5" fill="none" stroke="#ffc400" strokeWidth="2.4" />
          <circle cx="31" cy="12" r="5" fill="none" stroke="#fff3a8" strokeWidth="0.7" />
        </>
      );
    case "battle":
      return (
        <>
          <rect width="40" height="22" fill="#1b1b22" />
          <path d="M0 0h17L9 22H0z" fill="#e8222c" />
          <path d="M40 0v22H24l8-22z" fill="#1f63e0" />
          <path d="M17 0h3L12 22H9zM32 0h-3l-8 22h3z" fill="#ffc21a" />
          <path d="M16 11h9" stroke="#fff" strokeWidth="2.6" strokeLinecap="square" />
        </>
      );
    case "aria-midnight":
      return (
        <>
          <rect width="40" height="22" fill="#0b3fd0" />
          <path d="M0 0h40v8C26 5 14 5 0 8z" fill="#5fb8ff" fillOpacity="0.45" />
          <path d="M4 0h5L3 22H0zM17 0h4L13 22H9zM31 0h4L27 22h-4z" fill="#c8f0ff" fillOpacity="0.16" />
          <path d="M11 17l3-6h16l-3 6z" fill="#ff2d55" />
          <path d="M9 15l3-6h16l-3 6z" fill="#fff" />
          <circle cx="34" cy="16" r="1.6" fill="none" stroke="#c8f0ff" strokeWidth="0.7" />
          <circle cx="36" cy="11" r="1" fill="none" stroke="#c8f0ff" strokeWidth="0.6" />
        </>
      );
    case "aria-tv":
      return (
        <>
          <rect width="40" height="22" fill="#fff4a8" />
          <path d="M30 0l8 6-8 6 8 6-8 6" fill="none" stroke="#ff7a1a" strokeWidth="1.6" />
          <path d="M33 0l7 6-7 6 7 6-7 6" fill="none" stroke="#20b4c8" strokeWidth="1.6" />
          <rect x="8" y="3" width="16" height="12" rx="3" fill="#ffd800" stroke="#141414" strokeWidth="1.8" />
          <path d="M13 3l-2-3M19 3l2-3" stroke="#141414" strokeWidth="1.2" />
          <g transform="rotate(-8 20 19)">
            <rect x="-4" y="16.5" width="48" height="5" fill="#ffd800" stroke="#141414" strokeWidth="0.8" />
            {[0, 6, 12, 18, 24, 30, 36].map((x) => (
              <path key={x} d={`M${x} 21.5l3-5h2.4l-3 5z`} fill="#141414" />
            ))}
          </g>
        </>
      );
    case "aria-rebel":
      return (
        <>
          <rect width="40" height="22" fill="#161616" />
          <path d="M0 0h40v6l-5 2-6-2-6 3-6-2-6 3-6-2-5 1z" fill="#d8001c" />
          <path d="M0 22h40v-5l-6-2-6 2-7-3-6 3-7-2-8 2z" fill="#d8001c" />
          <path d="M3 16L37 9" stroke="#f2f2f2" strokeWidth="0.8" />
          <path d="M23 6l1.8 4 4.4.4-3.3 2.9 1 4.3-3.9-2.3-3.9 2.3 1-4.3-3.3-2.9 4.4-.4z" fill="#0d0d0d" stroke="#fff" strokeWidth="0.9" />
        </>
      );
    default:
      return (
        <>
          <rect width="40" height="22" fill="#f2f3f5" />
          {[5, 12, 19, 26, 33].map((x) =>
            [5, 11, 17].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="0.9" fill="#c4c9d2" />),
          )}
          <rect x="6" y="6" width="12" height="10" rx="3.4" fill="#fff" stroke="#d9dbe0" />
          <rect x="22" y="6" width="12" height="10" rx="3.4" fill="#74dcb6" />
        </>
      );
  }
}

const BUCKET_PAINT: Record<AppThemeId | "classic", [string, string]> = {
  classic: ["#74dcb6", "#3a8ef0"],
  speed: ["#1c6dff", "#ffc400"],
  battle: ["#e8222c", "#ffc21a"],
  "aria-midnight": ["#1d7cf2", "#ff2d55"],
  "aria-tv": ["#ffd800", "#141414"],
  "aria-rebel": ["#d8001c", "#ffffff"],
};

/** Paint bucket: label previews the theme, paint spills in its colours. */
export function BucketArt({
  theme,
  size = 64,
  className,
}: ArtProps & { theme: AppThemeId | "classic" }) {
  const id = useId();
  const [paint, accent] = BUCKET_PAINT[theme];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      aria-hidden
    >
      <defs>
        <clipPath id={`${id}-label`}>
          <path d="M13.2 27h37.6l-1.9 22H15.1z" />
        </clipPath>
        <linearGradient id={`${id}-tin`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#aeb4c0" />
          <stop offset="0.3" stopColor="#eef0f4" />
          <stop offset="1" stopColor="#9aa1af" />
        </linearGradient>
      </defs>
      {/* Wire handle */}
      <path d="M11 20C11 2 53 2 53 20" fill="none" stroke="#8f96a5" strokeWidth="2.2" strokeLinecap="round" />
      {/* Tin body */}
      <path d="M10 18h44l-3.6 38a4 4 0 01-4 3.6H17.6a4 4 0 01-4-3.6z" fill={`url(#${id}-tin)`} />
      {/* Label wrapped round the tin */}
      <g clipPath={`url(#${id}-label)`}>
        <g transform="translate(12 27)">
          <BucketLabel theme={theme} />
        </g>
        <path d="M13 27h38v22H13z" fill="none" stroke="#000" strokeOpacity="0.18" />
      </g>
      {/* Paint surface + drips */}
      <ellipse cx="32" cy="18" rx="22" ry="5.5" fill="#7c8392" />
      <ellipse cx="32" cy="18" rx="19.5" ry="4.2" fill={paint} />
      <path d="M40 18.5c0 0 .4 2.2 4 2.6v6.4a2.2 2.2 0 01-4.4 0V22c-1.2-.5-2.2-1.6-2.4-3z" fill={paint} />
      <path d="M17 19.5c1 1 3 1.5 4 1.3v3.4a2 2 0 01-4 0z" fill={paint} />
      <ellipse cx="26" cy="17" rx="6" ry="1.4" fill="#fff" fillOpacity="0.35" />
      <circle cx="41.8" cy="33" r="1.9" fill={accent} />
      {/* Rim */}
      <ellipse cx="32" cy="18" rx="22" ry="5.5" fill="none" stroke="#6d7483" strokeWidth="1.4" />
    </svg>
  );
}
