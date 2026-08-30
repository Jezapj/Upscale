import { Coins } from "lucide-react";
import { useStore } from "@/store/useStore";
import { tokenBalance } from "@/lib/economy";

interface Props {
  className?: string;
  onClick?: () => void;
  /** Tighter capsule for a 4-across toolbar. */
  compact?: boolean;
}

/** Compact token balance capsule for Games / check-in. */
export function TokenBalanceCapsule({
  className = "",
  onClick,
  compact = false,
}: Props) {
  const data = useStore((s) => s.data);
  const balance = tokenBalance(data.wallet);
  const Tag = onClick ? "button" : "div";

  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={
        compact
          ? `arcade-hub-btn ${className}`
          : `capsule inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-800 text-ink ${
              onClick ? "active:scale-95" : ""
            } ${className}`
      }
    >
      <Coins
        size={compact ? 14 : 16}
        className="shrink-0 text-cat-project"
      />
      <span>{balance}</span>
      <span
        className={
          compact
            ? "font-700 text-ink-faint"
            : "text-xs font-700 text-ink-faint"
        }
      >
        tokens
      </span>
    </Tag>
  );
}
