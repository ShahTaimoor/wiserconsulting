"use client";

import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";

/**
 * A small set of building blocks that give the admin pages the look of a spreadsheet:
 * a title bar, a toolbar, a grid with a row-number column, a header row, thin cell borders,
 * alternating rows, and a status bar with the number of rows at the bottom.
 */

export function SheetPage({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="w-full min-w-0 max-w-full">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

/** The bar above the grid: filters, search, counters. */
export function SheetToolbar({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-t-lg border border-b-0 border-slate-300 bg-slate-50 px-3 py-2">
      {children}
    </div>
  );
}

export function SheetMessage({ kind = "error", children }: { kind?: "error" | "info"; children: ReactNode }) {
  const cls = kind === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-slate-200 bg-slate-50 text-slate-600";
  return <div className={`mb-3 rounded-md border px-3 py-2 text-sm ${cls}`}>{children}</div>;
}

export function SheetLoading({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
      <Loader2 className="h-4 w-4 animate-spin" /> {label}
    </div>
  );
}

/**
 * The grid itself. `count` is shown in the status bar; `toolbar` says whether a SheetToolbar sits right above it
 * (so the corners and the top border line up).
 */
export function SheetTable({
  children,
  count,
  unit = "rows",
  toolbar = false,
  footer,
  minWidth = 720,
}: {
  children: ReactNode;
  count?: number;
  unit?: string;
  toolbar?: boolean;
  footer?: ReactNode;
  minWidth?: number;
}) {
  return (
    <div className={`overflow-hidden border border-slate-300 bg-white ${toolbar ? "rounded-b-lg" : "rounded-lg"}`}>
      <div className="max-h-[70vh] w-full max-w-full overflow-x-auto overflow-y-auto">
        <table className="w-full border-collapse text-left text-sm" style={{ minWidth: Math.min(minWidth, 640) }}>
          {children}
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-300 bg-slate-100 px-3 py-1.5 text-xs text-slate-600">
        <span>{typeof count === "number" ? `${count} ${count === 1 ? unit.replace(/s$/, "") : unit}` : ""}</span>
        <span className="text-slate-400 xl:hidden">Scroll sideways to see all columns</span>
        {footer}
      </div>
    </div>
  );
}

export function Thead({ children }: { children: ReactNode }) {
  return (
    <thead className="sticky top-0 z-10">
      <tr>
        <th className="w-10 border border-slate-300 bg-slate-200 px-2 py-2 text-center text-[11px] font-semibold text-slate-500">#</th>
        {children}
      </tr>
    </thead>
  );
}

export function Th({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return (
    <th className={`border border-slate-300 bg-slate-100 px-2.5 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-600 ${className}`}>
      {children}
    </th>
  );
}

export function Tr({ n, children, muted = false }: { n: number; children: ReactNode; muted?: boolean }) {
  return (
    <tr className={`odd:bg-white even:bg-slate-50/70 hover:bg-emerald-50/60 ${muted ? "opacity-60" : ""}`}>
      <td className="border border-slate-300 bg-slate-100 px-2 py-2 text-center text-[11px] font-medium text-slate-500">{n}</td>
      {children}
    </tr>
  );
}

export function Td({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return <td className={`border border-slate-300 px-2.5 py-2 align-middle text-slate-800 ${className}`}>{children}</td>;
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan + 1} className="border border-slate-300 px-3 py-10 text-center text-sm text-slate-500">
        {children}
      </td>
    </tr>
  );
}

type ButtonTone = "primary" | "neutral" | "danger" | "success" | "dark";
const tones: Record<ButtonTone, string> = {
  primary: "bg-blue-600 text-white hover:bg-blue-700",
  neutral: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100",
  danger: "border border-red-200 bg-red-50 text-red-700 hover:bg-red-100",
  success: "bg-emerald-600 text-white hover:bg-emerald-700",
  dark: "bg-slate-800 text-white hover:bg-slate-700",
};

export function SheetButton({
  tone = "neutral",
  children,
  className = "",
  ...rest
}: { tone?: ButtonTone; children: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...rest}
      className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${tones[tone]} ${className}`}
    >
      {children}
    </button>
  );
}

export const sheetInput =
  "rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-800 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30";

export function Pill({ tone, children }: { tone: "green" | "yellow" | "blue" | "purple" | "gray" | "red"; children: ReactNode }) {
  const map = {
    green: "bg-emerald-100 text-emerald-800",
    yellow: "bg-amber-100 text-amber-800",
    blue: "bg-blue-100 text-blue-800",
    purple: "bg-purple-100 text-purple-800",
    gray: "bg-slate-200 text-slate-700",
    red: "bg-red-100 text-red-700",
  } as const;
  return <span className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold ${map[tone]}`}>{children}</span>;
}
