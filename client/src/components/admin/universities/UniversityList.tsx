"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Download, Globe2, Pencil, Plus, Sparkles, Trash2, Upload } from "lucide-react";
import { CountryCount, LoadPart, University, universityService } from "@/services/universityService";
import { csvToUniversityRows, universityTemplateCsv } from "@/utils/universityCsv";
import { EmptyRow, Pill, SheetButton, SheetMessage, SheetTable, SheetToolbar, Td, Th, Thead, Tr, sheetInput } from "@/components/admin/Sheet";
import UniversityFormModal from "./UniversityFormModal";

const PAGE_SIZE = 50;
const dash = (value: number | null) => (value ? String(value) : "-");

export default function UniversityList({ universities, countries, onChanged }: { universities: University[]; countries: CountryCount[]; onChanged: () => void }) {
  const [mode, setMode] = useState<"mine" | "world">("mine");
  const [worldRows, setWorldRows] = useState<University[]>([]);
  const [worldFound, setWorldFound] = useState(0);
  const [worldLoading, setWorldLoading] = useState(false);
  const worldTotal = useMemo(() => countries.reduce((sum, c) => sum + (c.total - c.ready), 0), [countries]);
  const [search, setSearch] = useState("");
  const [country, setCountry] = useState("");
  const [editing, setEditing] = useState<University | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const [report, setReport] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const fileInput = useRef<HTMLInputElement>(null);

  const world = mode === "world";
  const mine = universities.filter(
    (u) => (!country || u.country === country) && (!search.trim() || `${u.name} ${u.city} ${u.country}`.toLowerCase().includes(search.trim().toLowerCase())),
  );
  // My list is cut into pages here; the world list is too big, so the server sends one page at a time.
  const total = world ? worldFound : mine.length;

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const start = (current - 1) * PAGE_SIZE;
  const visible = world ? worldRows : mine.slice(start, start + PAGE_SIZE);
  // Back to the first page whenever the search, the country or the list changes.
  useEffect(() => setPage(1), [search, country, mode]);

  const token = () => {
    const value = localStorage.getItem("token");
    if (!value) toast.error("Please log in again");
    return value;
  };

  const remove = async (u: University) => {
    if (!window.confirm(`Delete ${u.name}?`)) return;
    const t = token();
    if (!t) return;
    try {
      await universityService.remove(u._id, t);
      toast.success("University deleted");
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete");
    }
  };

  /** Runs a loader one part at a time and shows how far it has got. */
  const loadInParts = async (kind: "starter" | "world", part: (t: string, offset: number) => Promise<LoadPart>, label: string) => {
    const t = token();
    if (!t) return;
    setBusy(kind);
    setProgress(0);
    try {
      let offset = 0;
      let added = 0;
      let skipped = 0;
      for (;;) {
        const result = await part(t, offset);
        added += result.added;
        skipped += result.skipped;
        offset = result.next;
        setProgress(result.total ? Math.min(100, Math.round((offset / result.total) * 100)) : 100);
        if (result.done) break;
      }
      setProgress(100);
      await new Promise((resolve) => setTimeout(resolve, 400));
      toast.success(`${added} ${label} added${skipped ? `, ${skipped} were already in the list` : ""}`);
      onChanged();
      if (kind === "world") setMode("world");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load the list");
    } finally {
      setBusy("");
      setProgress(null);
    }
  };

  const loadStarter = () => loadInParts("starter", (t, offset) => universityService.loadStarter(t, offset), "universities");
  const loadWorld = () => {
    if (!window.confirm("Load the world list of 10,000+ universities (name and website only, no requirements)? This takes about a minute.")) return;
    return loadInParts("world", (t, offset) => universityService.loadWorld(t, offset), "world-list universities");
  };

  // The world list is too big to load whole: the server sends one page of it at a time, narrowed by country and name.
  useEffect(() => {
    if (!world) return;
    const t = localStorage.getItem("token");
    if (!t) return;
    let stale = false;
    setWorldLoading(true);
    const timer = setTimeout(() => {
      universityService
        .getWorld(t, { country, q: search.trim(), page: current, pageSize: PAGE_SIZE })
        .then((result) => {
          if (stale) return;
          setWorldRows(result.rows);
          setWorldFound(result.total);
        })
        .catch((error) => !stale && toast.error(error instanceof Error ? error.message : "Could not load the world list"))
        .finally(() => !stale && setWorldLoading(false));
    }, 250);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [world, country, search, current, universities]);

  const importFile = async (file: File) => {
    const t = token();
    if (!t) return;
    setBusy("import");
    setReport("");
    try {
      const { rows, ignored } = csvToUniversityRows(await file.text());
      if (rows.length === 0) throw new Error("The file has no rows. Use the template: first row is the column names.");
      let added = 0;
      let updated = 0;
      for (let i = 0; i < rows.length; i += 100) {
        const result = await universityService.importRows(rows.slice(i, i + 100), t);
        added += result.added;
        updated += result.updated;
      }
      toast.success(`Import finished: ${added} added, ${updated} updated`);
      setReport(ignored.length ? `Columns not used: ${ignored.join(", ")}` : "");
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import failed");
    } finally {
      setBusy("");
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob(["﻿" + universityTemplateCsv()], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "universities-template.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      {universities.length === 0 && (
        <SheetMessage kind="info">
          The list is empty, so the finder has nothing to match. Add universities one by one, import your own sheet, or load the starter list (about 30 universities in the UK, Canada, Europe and China,
          marked &quot;to verify&quot;).
        </SheetMessage>
      )}
      {report && <SheetMessage kind="info">{report}</SheetMessage>}

      <div className="mb-2 inline-flex rounded-md border border-slate-300 bg-white p-0.5 text-xs font-semibold">
        <button type="button" onClick={() => setMode("mine")} className={`rounded px-3 py-1 ${!world ? "bg-emerald-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
          My list ({universities.length})
        </button>
        <button type="button" onClick={() => setMode("world")} className={`rounded px-3 py-1 ${world ? "bg-emerald-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
          World list ({worldTotal.toLocaleString()})
        </button>
      </div>

      <SheetToolbar>
        <input className={`${sheetInput} w-48`} placeholder="Search university..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className={sheetInput} value={country} onChange={(e) => setCountry(e.target.value)} aria-label="Country">
          <option value="">All countries</option>
          {countries
            .filter((c) => (world ? c.total - c.ready > 0 : c.ready > 0))
            .map((c) => (
              <option key={c.country} value={c.country}>
                {c.country} ({world ? c.total - c.ready : c.ready})
              </option>
            ))}
        </select>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <SheetButton onClick={loadStarter} disabled={busy !== ""}>
            <Sparkles className="h-3.5 w-3.5" /> Load starter list
          </SheetButton>
          <SheetButton onClick={loadWorld} disabled={busy !== ""}>
            <Globe2 className="h-3.5 w-3.5" /> Load world list
          </SheetButton>
          <SheetButton onClick={downloadTemplate}>
            <Download className="h-3.5 w-3.5" /> CSV template
          </SheetButton>
          <SheetButton onClick={() => fileInput.current?.click()} disabled={busy !== ""}>
            <Upload className="h-3.5 w-3.5" /> {busy === "import" ? "Importing..." : "Import CSV"}
          </SheetButton>
          <SheetButton
            tone="success"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="h-3.5 w-3.5" /> Add university
          </SheetButton>
          <input ref={fileInput} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
        </div>
      </SheetToolbar>

      <SheetTable
        toolbar
        count={total}
        unit="universities"
        minWidth={900}
        footer={
          <div className="flex flex-wrap items-center gap-3">
            {total > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <span>
                  {start + 1}-{Math.min(start + PAGE_SIZE, total)} of {total.toLocaleString()}
                </span>
                <button type="button" onClick={() => setPage(current - 1)} disabled={current <= 1} aria-label="Previous page" className="rounded border border-slate-300 bg-white p-0.5 hover:bg-slate-100 disabled:opacity-40">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="font-semibold">
                  Page {current} / {pageCount}
                </span>
                <button type="button" onClick={() => setPage(current + 1)} disabled={current >= pageCount} aria-label="Next page" className="rounded border border-slate-300 bg-white p-0.5 hover:bg-slate-100 disabled:opacity-40">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </span>
            )}
          </div>
        }
      >
        <Thead>
          <Th>University</Th>
          <Th>Country</Th>
          <Th>FSc %</Th>
          <Th>IELTS</Th>
          <Th>TOEFL</Th>
          <Th>Scholarship</Th>
          <Th>Status</Th>
          <Th>Actions</Th>
        </Thead>
        <tbody>
          {visible.length === 0 ? (
            <EmptyRow colSpan={8}>{world ? (worldLoading ? "Loading..." : worldTotal === 0 ? "The world list is not loaded yet. Press “Load world list”." : "No universities match this search.") : "No universities to show."}</EmptyRow>
          ) : (
            visible.map((u, index) => (
              <Tr key={u._id} n={start + index + 1} muted={!u.isActive}>
                <Td>
                  <div className="font-semibold">{u.name}</div>
                  {u.city && <div className="text-xs text-slate-500">{u.city}</div>}
                </Td>
                <Td>{u.country}</Td>
                <Td>{dash(u.minFscPercent)}</Td>
                <Td>{dash(u.minIelts)}</Td>
                <Td>{dash(u.minToefl)}</Td>
                <Td>{u.scholarshipAvailable ? <Pill tone="green">{u.scholarshipPercent ? `${u.scholarshipPercent}%` : "Yes"}</Pill> : <span className="text-slate-400">-</span>}</Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    {!u.isActive && <Pill tone="gray">Hidden</Pill>}
                    {u.requirementsUnknown && <Pill tone="gray">No requirements</Pill>}
                    {!u.requirementsUnknown && u.needsVerification && <Pill tone="yellow">To verify</Pill>}
                    {u.isActive && !u.needsVerification && !u.requirementsUnknown && <Pill tone="green">Ready</Pill>}
                  </div>
                </Td>
                <Td>
                  <div className="flex gap-1.5">
                    <SheetButton
                      onClick={() => {
                        setEditing(u);
                        setFormOpen(true);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </SheetButton>
                    <SheetButton tone="danger" onClick={() => remove(u)} aria-label={`Delete ${u.name}`}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </SheetButton>
                  </div>
                </Td>
              </Tr>
            ))
          )}
        </tbody>
      </SheetTable>

      {progress !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" role="status" aria-live="polite">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 text-center shadow-2xl">
            <p className="text-4xl font-bold tabular-nums text-emerald-600">{progress}%</p>
            <p className="mt-1 text-sm font-semibold text-slate-800">Loading universities...</p>
            <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
              <div className="h-full rounded-full bg-emerald-500 transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
            <p className="mt-3 text-xs text-slate-500">Please wait, do not close this page.</p>
          </div>
        </div>
      )}

      {formOpen && <UniversityFormModal university={editing} onClose={() => setFormOpen(false)} onSaved={onChanged} />}
    </>
  );
}
