import * as React from "react";
import { cn, tint } from "@/lib/utils";

type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  /** Accent color (hex). Renders a tinted pill with a leading dot. */
  color?: string;
  dot?: boolean;
};

/** Small pill. When `color` is set, tints background/border/text from it. */
export function Badge({
  className,
  color,
  dot = true,
  style,
  children,
  ...props
}: BadgeProps) {
  const colorStyle: React.CSSProperties | undefined = color
    ? { ...tint(color), ...style }
    : style;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        !color && "border-border bg-surface-2 text-muted",
        className,
      )}
      style={colorStyle}
      {...props}
    >
      {color && dot && (
        <span
          className="size-1.5 rounded-full"
          style={{ backgroundColor: color }}
        />
      )}
      {children}
    </span>
  );
}
