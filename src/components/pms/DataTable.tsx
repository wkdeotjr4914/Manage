"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type Column<T> = {
  header: string;
  cell: (row: T) => React.ReactNode;
  className?: string;
  headerClassName?: string;
};

/** Compact, horizontally scrollable table shared by the PMS submenus. */
export function DataTable<T extends { id: string }>({
  columns,
  rows,
  onRowClick,
  indent,
}: {
  columns: Column<T>[];
  rows: T[];
  onRowClick?: (row: T) => void;
  /** Optional left padding (px) per row, e.g. for WBS tree depth. */
  indent?: (row: T) => number;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
      <table className="w-full min-w-max text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-2">
            {columns.map((c, i) => (
              <th
                key={i}
                className={cn(
                  "whitespace-nowrap px-3 py-2.5 font-medium",
                  c.headerClassName,
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              onClick={() => onRowClick?.(row)}
              className={cn(
                "border-b border-border/60 transition-colors last:border-0",
                onRowClick && "cursor-pointer hover:bg-surface-2",
              )}
            >
              {columns.map((c, i) => (
                <td
                  key={i}
                  className={cn(
                    "px-3 py-2.5 align-top text-foreground",
                    c.className,
                  )}
                  style={
                    i === 0 && indent
                      ? { paddingLeft: 12 + indent(row) }
                      : undefined
                  }
                >
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
