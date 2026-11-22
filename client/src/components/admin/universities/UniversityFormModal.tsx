"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, X } from "lucide-react";
import { University, universityService } from "@/services/universityService";
import { sheetInput } from "@/components/admin/Sheet";

type Form = Record<string, string | boolean>;

const NUMBERS = ["minFscPercent", "minIelts", "minToefl", "minPte", "minDuolingo", "minOxford", "scholarshipPercent", "scholarshipMinFscPercent", "scholarshipMinIelts"] as const;
const LISTS = ["fields", "applyDocuments", "applySteps"] as const;

function toForm(u: University | null): Form {
  const form: Form = {
    name: u?.name ?? "",
    country: u?.country ?? "",
    city: u?.city ?? "",
    website: u?.website ?? "",
    applyUrl: u?.applyUrl ?? "",
    tuitionPerYear: u?.tuitionPerYear ?? "",
    scholarshipAvailable: u?.scholarshipAvailable ?? false,
    scholarshipName: u?.scholarshipName ?? "",
    scholarshipDetails: u?.scholarshipDetails ?? "",
    scholarshipUrl: u?.scholarshipUrl ?? "",
    applyDeadline: u?.applyDeadline ?? "",
    notes: u?.notes ?? "",
    needsVerification: u?.needsVerification ?? false,
    requirementsUnknown: u?.requirementsUnknown ?? false,
    isActive: u?.isActive ?? true,
  };
  NUMBERS.forEach((key) => (form[key] = u?.[key] != null ? String(u[key]) : ""));
  LISTS.forEach((key) => (form[key] = (u?.[key] ?? []).join("\n")));
  return form;
}

function Field({ label, hint, children, wide = false }: { label: string; hint?: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={`block ${wide ? "sm:col-span-2" : ""}`}>
      <span className="mb-1 block text-xs font-semibold text-slate-600">{label}</span>
      {children}
      {hint && <span className="mt-0.5 block text-[11px] text-slate-400">{hint}</span>}
    </label>
  );
}

export default function UniversityFormModal({ university, onClose, onSaved }: { university: University | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<Form>(() => toForm(university));
  const [saving, setSaving] = useState(false);

  useEffect(() => setForm(toForm(university)), [university]);

  const set = (key: string, value: string | boolean) => setForm((prev) => ({ ...prev, [key]: value }));
  const text = (key: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <input className={`${sheetInput} w-full`} value={String(form[key])} onChange={(e) => set(key, e.target.value)} {...props} />
  );
  const num = (key: string) => text(key, { type: "number", min: 0, step: "any", inputMode: "decimal", placeholder: "-" });
  const area = (key: string, rows = 3) => <textarea className={`${sheetInput} w-full`} rows={rows} value={String(form[key])} onChange={(e) => set(key, e.target.value)} />;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const token = localStorage.getItem("token");
    if (!token) return toast.error("Please log in again");
    const body: Record<string, unknown> = { ...form };
    NUMBERS.forEach((key) => (body[key] = String(form[key]).trim() === "" ? null : Number(form[key])));
    LISTS.forEach((key) => (body[key] = String(form[key]).split("\n").map((line) => line.trim()).filter(Boolean)));
    // Once a requirement is filled in, this is no longer a "links only" entry from the world list.
    if (NUMBERS.slice(0, 6).some((key) => body[key] !== null)) body.requirementsUnknown = false;
    setSaving(true);
    try {
      if (university) await universityService.update(university._id, body, token);
      else await universityService.create(body, token);
      toast.success(university ? "University updated" : "University added");
      onSaved();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const section = "mb-2 mt-5 border-b border-slate-200 pb-1 text-xs font-bold uppercase tracking-wider text-emerald-700";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-3 sm:p-6" role="dialog" aria-modal="true">
      <form onSubmit={submit} className="my-4 w-full max-w-3xl rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-lg font-bold text-slate-900">{university ? "Edit university" : "Add university"}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1 text-slate-500 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5 pb-5">
          <p className={section}>University</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name *">{text("name", { required: true })}</Field>
            <Field label="Country *">{text("country", { required: true })}</Field>
            <Field label="City">{text("city")}</Field>
            <Field label="Website">{text("website", { placeholder: "https://" })}</Field>
            <Field label="Apply link">{text("applyUrl", { placeholder: "https://" })}</Field>
            <Field label="Tuition per year">{text("tuitionPerYear", { placeholder: "e.g. GBP 18,000" })}</Field>
            <Field label="Fields offered" hint="One per line. Leave empty if all fields." wide>
              {area("fields", 2)}
            </Field>
          </div>

          <p className={section}>Entry requirements (leave empty if none)</p>
          {Boolean(form.requirementsUnknown) && (
            <p className="mb-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
              This university came from the world list, so its requirements are not known. Fill in at least one requirement below and it will be matched like the others.
            </p>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label="Minimum FSc %">{num("minFscPercent")}</Field>
            <Field label="IELTS">{num("minIelts")}</Field>
            <Field label="TOEFL iBT">{num("minToefl")}</Field>
            <Field label="PTE">{num("minPte")}</Field>
            <Field label="Duolingo">{num("minDuolingo")}</Field>
            <Field label="Oxford test">{num("minOxford")}</Field>
          </div>

          <p className={section}>Scholarship</p>
          <label className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-700">
            <input type="checkbox" checked={Boolean(form.scholarshipAvailable)} onChange={(e) => set("scholarshipAvailable", e.target.checked)} className="h-4 w-4 accent-emerald-600" />
            This university offers a scholarship
          </label>
          {Boolean(form.scholarshipAvailable) && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Scholarship name">{text("scholarshipName")}</Field>
              <Field label="Covers (% of tuition)">{num("scholarshipPercent")}</Field>
              <Field label="Minimum FSc % for it">{num("scholarshipMinFscPercent")}</Field>
              <Field label="Minimum IELTS for it">{num("scholarshipMinIelts")}</Field>
              <Field label="Scholarship link">{text("scholarshipUrl", { placeholder: "https://" })}</Field>
              <Field label="Details" wide>
                {area("scholarshipDetails", 2)}
              </Field>
            </div>
          )}

          <p className={section}>How to apply</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Deadline">{text("applyDeadline", { placeholder: "e.g. 15 January" })}</Field>
            <span className="hidden sm:block" />
            <Field label="Documents needed" hint="One per line">
              {area("applyDocuments", 4)}
            </Field>
            <Field label="Steps" hint="One per line">
              {area("applySteps", 4)}
            </Field>
            <Field label="Notes" wide>
              {area("notes", 2)}
            </Field>
          </div>

          <div className="mt-4 flex flex-wrap gap-5 text-sm font-medium text-slate-700">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={Boolean(form.isActive)} onChange={(e) => set("isActive", e.target.checked)} className="h-4 w-4 accent-emerald-600" />
              Active (shown in the finder)
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={Boolean(form.needsVerification)} onChange={(e) => set("needsVerification", e.target.checked)} className="h-4 w-4 accent-emerald-600" />
              Still to be verified
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-md border border-slate-300 bg-white px-4 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-100">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save
          </button>
        </div>
      </form>
    </div>
  );
}
