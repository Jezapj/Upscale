import { forwardRef, type ReactNode } from "react";

interface Props {
  className?: string;
  children?: ReactNode;
}

/** Vertical scroller that dissolves into the paper before the header and dock. */
export const ScrollArea = forwardRef<HTMLDivElement, Props>(
  function ScrollArea({ className = "", children }, ref) {
    return (
      <div className="scroll-fade">
        <div ref={ref} className={`scroll-area ${className}`.trim()}>
          {children}
        </div>
      </div>
    );
  },
);
