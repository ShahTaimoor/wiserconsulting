"use client";

import { AlertTriangle } from "lucide-react";
import type { ErrorItem } from "@/utils/touristVisaForm";

/**
 * Lists everything the server said is wrong, each as a button that moves focus to the
 * control. Announced to screen readers when it appears (role="alert").
 */
export function ErrorSummary({ items, onGo }: { items: ErrorItem[]; onGo: (targetId: string) => void }) {
  if (items.length === 0) return null;
  return (
    <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
      <p className="flex items-center gap-2 font-semibold">
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
        {items.length === 1 ? "1 answer needs attention" : `${items.length} answers need attention`}
      </p>
      <ul className="mt-2 list-inside list-disc space-y-1">
        {items.map((item) => (
          <li key={item.key}>
            <button type="button" onClick={() => onGo(item.targetId)} className="text-left underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500">
              {item.label}
            </button>
            : {item.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
