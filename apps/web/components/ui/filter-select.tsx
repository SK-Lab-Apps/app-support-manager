"use client";

import { cn } from "@/lib/utils";

/** Compact native select for toolbar filters. */
export function FilterSelect<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label: string;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className={cn(
        "h-7 shrink-0 rounded-control border border-border bg-surface pl-2 pr-6 text-xs text-secondary",
        "cursor-pointer appearance-none bg-no-repeat",
        "transition-colors duration-fast hover:border-border-strong hover:text-primary",
        // 16px keeps iOS Safari from zooming the page on focus.
        "coarse:h-[38px] coarse:pl-2.5 coarse:pr-7 coarse:text-input",
      )}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%238b8b93' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
        backgroundPosition: "right 8px center",
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
