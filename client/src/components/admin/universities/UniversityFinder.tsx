"use client";

import { Fragment, useMemo, useState } from "react";
import { toast } from "sonner";
import { ExternalLink, Loader2, Search } from "lucide-react";
import { CountryCount, MatchResult, MatchStatus, TestKey, University, universityService } from "@/services/universityService";
import { EmptyRow, Pill, SheetButton, SheetTable, Td, Th, Thead, Tr, sheetInput } from "@/components/admin/Sheet";

const TESTS: { key: TestKey; label: string; hint: string }[] = [
  { key: "ielts", label: "IELTS", hint: "overall, e.g. 6.5" },
  { key: "toefl", label: "TOEFL iBT", hint: "e.g. 90" },
  { key: "pte", label: "PTE", hint: "e.g. 58" },
  { key: "duolingo", label: "Duolingo", hint: "e.g. 115" },
  { key: "oxford", label: "Oxford test", hint: "score" },
];

const SECTIONS: { status: MatchStatus; title: string; note: string }[] = [
  { status: "eligible", title: "Can apply now", note: "Meets the FSc and English requirements." },
  { status: "needs_test", title: "FSc is enough, English test needed", note: "The student has no score in a test this university accepts yet." },
  { status: "close", title: "Close, a little short", note: "A small shortfall. A retake or a better foundation could fix it." },
  { status: "check_official", title: "Requirements not added yet: check the official site", note: "From the world list. Nothing is known about their entry requirements, so they are not counted as eligible." },
  { status: "not_eligible", title: "Cannot apply", note: "Does not meet the requirements." },
];

function requirements(u: University) {
  const parts = [
    u.minFscPercent ? `FSc ${u.minFscPercent}%` : "",
    u.minIelts ? `IELTS ${u.minIelts}` : "",
    u.minToefl ? `TOEFL ${u.minToefl}` : "",
    u.minPte ? `PTE ${u.minPte}` : "",
    u.minDuolingo ? `Duolingo ${u.minDuolingo}` : "",
    u.minOxford ? `Oxford ${u.minOxford}` : "",
  ].filter(Boolean);
  if (u.requirementsUnknown) return "Not added yet";
  return parts.length ? parts.join(" · ") : "No set requirement";
}

function ApplyFlow({ result }: { result: MatchResult }) {
  const u = result.university;
  const s = result.scholarship;
  const link = u.applyUrl || u.website;
  return (
    <div className="grid gap-4 text-sm md:grid-cols-3">
      <div>
        <p className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-500">Without scholarship</p>
        {result.options.withoutScholarship ? <p className="text-slate-700">Can apply and pay the full fee{u.tuitionPerYear ? ` (${u.tuitionPerYear} per year)` : ""}.</p> : <p className="text-slate-500">Not possible yet: {result.reasons.join("; ") || "requirements not met"}.</p>}
      </div>
      <div>
        <p className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-500">With scholarship</p>
        {!s.available ? (
          <p className="text-slate-500">This university has no scholarship in the list.</p>
        ) : (
          <div className="space-y-1 text-slate-700">
            <p>
              {s.name || "Scholarship"}
              {s.percent ? ` covers ${s.percent}% of tuition` : ""}.
            </p>
            <p className={s.qualifies ? "font-semibold text-emerald-700" : "text-amber-700"}>
              {s.qualifies
                ? "The student qualifies on the marks entered."
                : s.needsIelts
                  ? `Needs an IELTS score of ${s.minIelts} or more to check.`
                  : `Does not qualify${s.minFscPercent ? `: needs FSc ${s.minFscPercent}%` : ""}${s.minIelts ? `${s.minFscPercent ? " and" : ": needs"} IELTS ${s.minIelts}` : ""}.`}
            </p>
            {s.details && <p className="text-xs text-slate-500">{s.details}</p>}
            {s.url && (
              <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline">
                Scholarship page <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        )}
      </div>
      <div>
        <p className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-500">How to apply</p>
        <div className="space-y-1 text-slate-700">
          {u.applyDeadline && <p>Deadline: {u.applyDeadline}</p>}
          {u.applyDocuments.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500">Documents</p>
              <ul className="list-disc pl-5">{u.applyDocuments.map((d) => <li key={d}>{d}</li>)}</ul>
            </div>
          )}
          {u.applySteps.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500">Steps</p>
              <ol className="list-decimal pl-5">{u.applySteps.map((d) => <li key={d}>{d}</li>)}</ol>
            </div>
          )}
          {!u.applyDeadline && u.applyDocuments.length === 0 && u.applySteps.length === 0 && <p className="text-slate-500">No steps added yet. Use the official link.</p>}
          {link && (
            <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline">
              Official apply page <ExternalLink className="h-3 w-3" />
            </a>
          )}
          {u.notes && <p className="text-xs text-slate-500">{u.notes}</p>}
        </div>
      </div>
    </div>
  );
}

export default function UniversityFinder({ countries }: { countries: CountryCount[] }) {
  const [studentName, setStudentName] = useState("");
  const [fsc, setFsc] = useState("");
  const [scores, setScores] = useState<Record<TestKey, string>>({ ielts: "", toefl: "", pte: "", duolingo: "", oxford: "" });
  const [country, setCountry] = useState("");
  const [field, setField] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [showUnknown, setShowUnknown] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<MatchResult[] | null>(null);
  const [asked, setAsked] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const readyTotal = useMemo(() => countries.reduce((sum, c) => sum + c.ready, 0), [countries]);

  const find = async (event: React.FormEvent) => {
    event.preventDefault();
    const token = localStorage.getItem("token");
    if (!token) return toast.error("Please log in again");
    const percentage = Number(fsc);
    if (fsc.trim() === "" || !Number.isFinite(percentage) || percentage < 0 || percentage > 100) return toast.error("Enter the FSc percentage (0 to 100)");
    const tests: Partial<Record<TestKey, number | null>> = {};
    for (const { key, label } of TESTS) {
      const raw = scores[key].trim();
      if (!raw) continue;
      const value = Number(raw);
      if (!Number.isFinite(value) || value < 0) return toast.error(`${label} score is not a number`);
      tests[key] = value;
    }
    setLoading(true);
    try {
      setResults(await universityService.match({ fscPercent: percentage, tests, country, field, includeNotEligible: showAll, includeUnknown: showUnknown }, token));
      setAsked(studentName.trim());
      setOpen(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not search");
    } finally {
      setLoading(false);
    }
  };

  const counts = (status: MatchStatus) => results?.filter((r) => r.status === status).length ?? 0;

  return (
    <>
      <form onSubmit={find} className="mb-5 rounded-lg border border-slate-300 bg-white">
        <div className="border-b border-slate-300 bg-slate-100 px-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-600">Student marks</div>
        <div className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Student name (optional)</span>
            <input className={`${sheetInput} w-full`} value={studentName} onChange={(e) => setStudentName(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">FSc percentage *</span>
            <input className={`${sheetInput} w-full`} type="number" min={0} max={100} step="any" inputMode="decimal" placeholder="e.g. 78.5" value={fsc} onChange={(e) => setFsc(e.target.value)} required />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Country (optional)</span>
            <select className={`${sheetInput} w-full`} value={country} onChange={(e) => setCountry(e.target.value)}>
              <option value="">Any country</option>
              {countries.map((c) => (
                <option key={c.country} value={c.country}>
                  {c.country} ({c.total})
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Field of study (optional)</span>
            <input className={`${sheetInput} w-full`} placeholder="e.g. Engineering" value={field} onChange={(e) => setField(e.target.value)} />
          </label>
        </div>
        <div className="border-y border-slate-300 bg-slate-100 px-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-600">English test scores (fill the ones the student has taken)</div>
        <div className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-3 lg:grid-cols-5">
          {TESTS.map(({ key, label, hint }) => (
            <label key={key} className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-600">{label}</span>
              <input className={`${sheetInput} w-full`} type="number" min={0} step="any" inputMode="decimal" placeholder={hint} value={scores[key]} onChange={(e) => setScores((prev) => ({ ...prev, [key]: e.target.value }))} />
            </label>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-300 bg-slate-50 px-3 py-2.5">
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} className="h-4 w-4 accent-emerald-600" />
              Also show universities the student cannot apply to
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={showUnknown} onChange={(e) => setShowUnknown(e.target.checked)} className="h-4 w-4 accent-emerald-600" />
              Also show world-list universities with no requirements added (links only; pick a country)
            </label>
          </div>
          <SheetButton type="submit" tone="success" disabled={loading} className="px-4 py-1.5 text-sm">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Find universities
          </SheetButton>
        </div>
      </form>

      {results && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold text-slate-800">{asked ? `Results for ${asked}` : "Results"}:</span>
            <Pill tone="green">{counts("eligible")} can apply</Pill>
            <Pill tone="blue">{results.filter((r) => r.options.withScholarship).length} with scholarship</Pill>
            <Pill tone="yellow">{counts("needs_test")} need an English test</Pill>
            <Pill tone="purple">{counts("close")} close</Pill>
            {showUnknown && <Pill tone="gray">{counts("check_official")} to check on their site</Pill>}
          </div>

          {results.length === 0 ? (
            <SheetTable count={0} unit="universities">
              <Thead>
                <Th>University</Th>
              </Thead>
              <tbody>
                <EmptyRow colSpan={1}>{readyTotal === 0 ? "The list is empty. Open the University list tab and add or load universities first." : "No university matches these marks. Try another country or tick “also show universities the student cannot apply to”."}</EmptyRow>
              </tbody>
            </SheetTable>
          ) : (
            SECTIONS.map(({ status, title, note }) => {
              const rows = results.filter((r) => r.status === status);
              if (rows.length === 0) return null;
              return (
                <div key={status} className="mb-5">
                  <h3 className="text-sm font-bold text-slate-800">
                    {title} <span className="font-normal text-slate-500">({rows.length})</span>
                  </h3>
                  <p className="mb-1.5 text-xs text-slate-500">{note}</p>
                  <SheetTable count={rows.length} unit="universities" minWidth={860}>
                    <Thead>
                      <Th>University</Th>
                      <Th>Country</Th>
                      <Th>Requirements</Th>
                      <Th>Without scholarship</Th>
                      <Th>With scholarship</Th>
                      <Th>Details</Th>
                    </Thead>
                    <tbody>
                      {rows.map((r, index) => {
                        const id = r.university._id;
                        return (
                          <Fragment key={id}>
                            <Tr n={index + 1}>
                              <Td>
                                <div className="font-semibold">{r.university.name}</div>
                                {r.university.website && (
                                  <a href={r.university.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-emerald-700 hover:underline">
                                    Website <ExternalLink className="h-3 w-3" />
                                  </a>
                                )}
                                {r.university.needsVerification && <div className="mt-0.5"><Pill tone="yellow">Verify on official site</Pill></div>}
                              </Td>
                              <Td>{r.university.country}</Td>
                              <Td className="text-xs">{requirements(r.university)}</Td>
                              <Td>{r.status === "check_official" ? <Pill tone="gray">Unknown</Pill> : r.options.withoutScholarship ? <Pill tone="green">Yes</Pill> : <Pill tone="gray">No</Pill>}</Td>
                              <Td>
                                {r.status === "check_official" || !r.scholarship.available ? <span className="text-slate-400">-</span> : r.options.withScholarship ? <Pill tone="green">{r.scholarship.percent ? `Yes, ${r.scholarship.percent}%` : "Yes"}</Pill> : <Pill tone="yellow">{r.scholarship.needsIelts ? "Needs IELTS" : "Not qualified"}</Pill>}
                              </Td>
                              <Td>
                                <SheetButton onClick={() => setOpen(open === id ? null : id)}>{open === id ? "Hide" : "Apply flow"}</SheetButton>
                              </Td>
                            </Tr>
                            {open === id && (
                              <tr>
                                <td colSpan={7} className="border border-slate-300 bg-emerald-50/40 px-4 py-3">
                                  <ApplyFlow result={r} />
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </SheetTable>
                </div>
              );
            })
          )}
          <p className="text-xs text-slate-500">This is an estimate from the list kept here. The university makes the final decision, so always check the official site.</p>
        </>
      )}
    </>
  );
}
