"use client";

import { useCallback, useEffect, useState } from "react";
import { GraduationCap, ListChecks } from "lucide-react";
import { CountryCount, University, universityService } from "@/services/universityService";
import { SheetLoading, SheetMessage, SheetPage } from "@/components/admin/Sheet";
import UniversityFinder from "@/components/admin/universities/UniversityFinder";
import UniversityList from "@/components/admin/universities/UniversityList";

type Tab = "find" | "list";

export default function AdminUniversities() {
  const [tab, setTab] = useState<Tab>("find");
  const [universities, setUniversities] = useState<University[]>([]);
  const [countries, setCountries] = useState<CountryCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      setError("No authentication token found - please log in again");
      setLoading(false);
      return;
    }
    try {
      const [list, countryList] = await Promise.all([universityService.getAll(token), universityService.countries(token)]);
      setUniversities(list);
      setCountries(countryList);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load universities");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const tabClass = (active: boolean) =>
    `inline-flex items-center gap-2 rounded-t-lg border border-b-0 px-4 py-2 text-sm font-semibold transition ${
      active ? "border-slate-300 bg-white text-emerald-700" : "border-transparent text-slate-500 hover:text-slate-800"
    }`;

  return (
    <SheetPage title="University Finder" subtitle="Enter a student's FSc and English test marks to see which universities they can apply to, with or without a scholarship.">
      {error && (
        <SheetMessage>
          <span className="flex flex-wrap items-center justify-between gap-2">
            <span>{error}</span>
            <button type="button" onClick={load} className="rounded-md border border-red-300 bg-white px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-50">
              Try again
            </button>
          </span>
        </SheetMessage>
      )}
      <div className="mb-3 flex gap-1 border-b border-slate-300">
        <button type="button" className={tabClass(tab === "find")} onClick={() => setTab("find")}>
          <GraduationCap className="h-4 w-4" /> Find universities
        </button>
        <button type="button" className={tabClass(tab === "list")} onClick={() => setTab("list")}>
          <ListChecks className="h-4 w-4" /> University list ({universities.length})
        </button>
      </div>
      {loading ? <SheetLoading /> : tab === "find" ? <UniversityFinder countries={countries} /> : <UniversityList universities={universities} countries={countries} onChanged={load} />}
    </SheetPage>
  );
}
