"use client";

import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** --- Types --- */
export type TableRowData = {
  [key: string]: any;
};

export type TableColumnDef = {
  key: string;
  label: string;
  width?: string;
  sticky?: boolean;
};

interface ReorderableTableProps {
  data: any[];
  columns: TableColumnDef[];
  renderCell: (row: any, key: string) => React.ReactNode;
  showFooter?: boolean;
  totalSumLabel?: string;
  sumColumnKey?: string;
}

/** --- localStorage keys --- */
const LS_ORDER = "reorderable_table_order_v1";
const LS_VISIBLE = "reorderable_table_visible_v1";

/** --- Component --- */
export default function ReorderableTable({
  data,
  columns,
  renderCell,
  showFooter = false,
  totalSumLabel = "Total",
  sumColumnKey,
}: ReorderableTableProps) {
  const columnKeys = columns.map((c) => c.key);

  // load saved order or default order
  const [columnOrder, setColumnOrder] = useState<string[]>(
    () => {
        if (typeof window !== 'undefined') {
            return JSON.parse(localStorage.getItem(LS_ORDER) || "null") || columnKeys;
        }
        return columnKeys;
    }
  );

  // visible columns
  const [visible, setVisible] = useState<Record<string, boolean>>(() => {
    if (typeof window !== 'undefined') {
        const saved = JSON.parse(localStorage.getItem(LS_VISIBLE) || "null");
        if (saved) return saved;
    }
    const initial: Record<string, boolean> = {};
    columnKeys.forEach((k) => (initial[k] = true));
    return initial;
  });

  // simple search (handled externally or internally - here internally for generic use)
  const [query, setQuery] = useState("");

  // ensure columnOrder contains all keys (if columns changed)
  useEffect(() => {
    const all = columnKeys;
    setColumnOrder((prev) => {
      const missing = all.filter((k) => !prev.includes(k));
      const next = [...prev.filter((k) => all.includes(k)), ...missing];
      return next;
    });
  }, [columns]);

  // persist on change
  useEffect(() => {
    localStorage.setItem(LS_ORDER, JSON.stringify(columnOrder));
  }, [columnOrder]);

  useEffect(() => {
    localStorage.setItem(LS_VISIBLE, JSON.stringify(visible));
  }, [visible]);

  // derive visible ordered columns
  const orderedColumns = useMemo(() => {
    return columnOrder
      .map((key) => columns.find((c) => c.key === key))
      .filter(Boolean) as TableColumnDef[];
  }, [columnOrder, columns]);

  // filtered rows
  const filtered = useMemo(() => {
    if (!query) return data;
    const q = query.toLowerCase();
    return data.filter((r) =>
      Object.values(r).some((v) =>
        String(v).toLowerCase().includes(q)
      )
    );
  }, [data, query]);

  /** --- Drag & Drop handlers for header columns --- */
  const dragSrcRef = React.useRef<number | null>(null);

  function onDragStart(e: React.DragEvent, index: number) {
    dragSrcRef.current = index;
    e.dataTransfer.effectAllowed = "move";
    try {
      e.dataTransfer.setData("text/plain", String(index));
    } catch {
      /* some browsers may throw */
    }
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault(); // allow drop
    e.dataTransfer.dropEffect = "move";
  }

  function onDrop(e: React.DragEvent, targetIndex: number) {
    e.preventDefault();
    const srcIndex = dragSrcRef.current ?? parseInt(e.dataTransfer.getData("text/plain"), 10);
    if (isNaN(srcIndex)) return;
    if (srcIndex === targetIndex) return;
    // compute new order array by moving src to target
    setColumnOrder((prev) => {
      const next = [...prev];
      const [moved] = next.splice(srcIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
    dragSrcRef.current = null;
  }

  /** --- Move left / right for accessibility --- */
  function moveColumn(key: string, direction: -1 | 1) {
    setColumnOrder((prev) => {
      const idx = prev.indexOf(key);
      if (idx === -1) return prev;
      const newIndex = idx + direction;
      if (newIndex < 0 || newIndex >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(idx, 1);
      next.splice(newIndex, 0, moved);
      return next;
    });
  }

  /** --- Toggle visibility --- */
  function toggleVisible(key: string) {
    setVisible((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  /** --- Reset layout --- */
  function resetLayout() {
    setColumnOrder(columnKeys);
    const defaultVis: Record<string, boolean> = {};
    columnKeys.forEach((k) => (defaultVis[k] = true));
    setVisible(defaultVis);
    localStorage.removeItem(LS_ORDER);
    localStorage.removeItem(LS_VISIBLE);
  }

  return (
    <div className="w-full">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex gap-2 items-center">
          <Input 
            placeholder="Search..." 
            value={query} 
            onChange={(e) => setQuery(e.target.value)} 
            className="w-[320px] rounded-xl" 
          />
          <Button variant="outline" onClick={() => setQuery("")} className="rounded-xl">
            Clear
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="rounded-xl">Columns</Button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-3 rounded-xl">
              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Visible Columns</p>
                {columns.map((col) => (
                  <label key={col.key} className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-1 rounded-md transition-colors">
                    <Checkbox 
                        checked={!!visible[col.key]} 
                        onCheckedChange={() => toggleVisible(col.key)} 
                    />
                    <span className="text-sm">{col.label}</span>
                  </label>
                ))}
                <div className="flex flex-col gap-1 mt-2 pt-2 border-t">
                  <Button variant="ghost" size="sm" onClick={resetLayout} className="justify-start h-8 px-2 text-xs">Reset Layout</Button>
                  <Button variant="outline" size="sm" onClick={() => {
                    const visKeys = Object.entries(visible).filter(([, v]) => v).map(([k]) => k);
                    setColumnOrder((prev) => [...visKeys, ...prev.filter(k => !visKeys.includes(k))]);
                  }} className="justify-start h-8 px-2 text-xs">Bring visible front</Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="border rounded-xl overflow-hidden bg-background shadow-sm">
        <Table className="min-w-full border-separate border-spacing-0">
          <TableHeader className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm">
            <TableRow className="hover:bg-transparent border-b">
              {orderedColumns.map((colDef, idx) => {
                const key = colDef.key;
                if (!visible[key]) return null;
                return (
                  <TableHead
                    key={key}
                    style={{ width: colDef.width }}
                    className="h-12 border-b whitespace-nowrap"
                  >
                    <div
                      draggable
                      onDragStart={(e) => onDragStart(e, idx)}
                      onDragOver={onDragOver}
                      onDrop={(e) => onDrop(e, idx)}
                      className="flex items-center justify-between gap-2 select-none group"
                    >
                      <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        {colDef.label}
                      </span>

                      <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button 
                            size="icon" 
                            variant="ghost" 
                            onClick={() => moveColumn(key, -1)} 
                            className="h-6 w-6 rounded-md hover:bg-muted"
                        >
                          <ChevronsLeft className="h-3 w-3" />
                        </Button>
                        <Button 
                            size="icon" 
                            variant="ghost" 
                            onClick={() => moveColumn(key, 1)} 
                            className="h-6 w-6 rounded-md hover:bg-muted"
                        >
                          <ChevronsRight className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>

          <TableBody>
            {filtered.length > 0 ? (
              filtered.map((row, rIdx) => (
                <TableRow key={row._id || row.id || rIdx} className="hover:bg-muted/30 transition-colors border-b last:border-0">
                  {orderedColumns.map((colDef) => {
                    const key = colDef.key;
                    if (!visible[key]) return null;
                    return (
                        <TableCell key={key} className="py-4 px-6">
                            {renderCell(row, key)}
                        </TableCell>
                    );
                  })}
                </TableRow>
              ))
            ) : (
                <TableRow>
                    <TableCell colSpan={orderedColumns.length} className="h-32 text-center text-muted-foreground">
                        No results found.
                    </TableCell>
                </TableRow>
            )}
          </TableBody>

          {showFooter && (
            <TableFooter className="bg-muted/20 sticky bottom-0 border-t">
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={orderedColumns.filter(c => visible[c.key]).length - 1} className="font-semibold text-sm py-4">
                  {totalSumLabel} ({filtered.length} items)
                </TableCell>
                {sumColumnKey && orderedColumns.some((c) => c.key === sumColumnKey && visible[c.key]) ? (
                  <TableCell className="text-right font-bold text-sm py-4">
                    {filtered.reduce((acc, r) => acc + (r[sumColumnKey] || 0), 0).toLocaleString()}
                  </TableCell>
                ) : (
                  <TableCell className="text-right font-semibold py-4">—</TableCell>
                )}
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </div>
    </div>
  );
}
