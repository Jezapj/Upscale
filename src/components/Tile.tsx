import type { CSSProperties } from "react";
import type { LucideIcon } from "lucide-react";
import { isEmoji } from "@/lib/icons";

export type TileState = "default" | "priority" | "done" | "selected";

interface Props {
  /** emoji or short text */
  glyph?: string;
  /** line-art icon (IISU app-logo style) - takes precedence over glyph when set */
  Icon?: LucideIcon;
  /** accent colour used for the frame + glow */
  color?: string;
  size?: number;
  state?: TileState;
  /** show the coloured frame + soft glow */
  framed?: boolean;
  className?: string;
  style?: CSSProperties;
  onClick?: () => void;
}

/**
 * The signature IISU surface: a glossy light squircle holding a line-art icon
 * or emoji, optionally wrapped in a coloured frame with a soft glow.
 */
export function Tile({
  glyph = "⭐",
  Icon,
  color = "#9aa3b2",
  size = 56,
  state = "default",
  framed = true,
  className = "",
  style,
  onClick,
}: Props) {
  const frame =
    state === "priority" ? "#ff5a5a" : state === "done" ? "#34c79a" : color;

  const glowAlpha =
    state === "priority" ? "cc" : state === "done" || state === "selected" ? "aa" : "55";
  const ringWidth = framed || state !== "default" ? 2.5 : 0;

  const boxShadow = [
    "0 8px 16px -8px rgba(70,80,100,0.3)",
    "inset 0 2px 1px rgba(255,255,255,0.95)",
    "inset 0 -3px 6px rgba(140,150,170,0.18)",
    ringWidth ? `0 0 0 ${ringWidth}px ${frame}` : "",
    ringWidth ? `0 0 18px -2px ${frame}${glowAlpha}` : "",
  ]
    .filter(Boolean)
    .join(", ");

  const iconSize = size * 0.44;
  const showLineArt = Icon && (!glyph || !isEmoji(glyph));

  return (
    <div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      className={`relative flex items-center justify-center no-select ${
        state === "priority" ? "animate-glow-pulse" : ""
      } ${onClick ? "cursor-pointer active:scale-95 transition-transform" : ""} ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: "30%",
        background:
          state === "selected" || state === "done"
            ? "linear-gradient(180deg,#ffffff 0%,#eef0f3 100%)"
            : "linear-gradient(180deg,#f5f6f8 0%,#dde0e6 100%)",
        boxShadow,
        fontSize: size * 0.46,
        lineHeight: 1,
        ...style,
      }}
    >
      {showLineArt ? (
        <Icon
          size={iconSize}
          strokeWidth={2.4}
          color={frame}
          style={{ filter: "drop-shadow(0 1px 1px rgba(80,90,110,0.15))" }}
        />
      ) : (
        <span style={{ filter: "drop-shadow(0 1px 1px rgba(80,90,110,0.18))" }}>
          {glyph}
        </span>
      )}
    </div>
  );
}
