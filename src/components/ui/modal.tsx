"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/** Centered overlay dialog. Click-outside and the close button both call
 * `onClose`. Mirrors the modal pattern in CreateProject.tsx. */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className={cn(
          "card-shadow flex max-h-[90vh] w-full flex-col rounded-2xl border border-border bg-surface",
          wide ? "max-w-2xl" : "max-w-md",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
        {footer && (
          <div className="border-t border-border px-5 py-4">{footer}</div>
        )}
      </div>
    </div>
  );
}
