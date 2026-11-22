import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, FileText, Image as ImageIcon, Upload, X } from 'lucide-react';
import { FormData } from '@/hooks/useAssessmentForm';

interface DocumentsStepProps {
  formData: FormData;
  validationErrors: Record<string, string>;
  onFileChange: (field: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveFile: (field: keyof FormData, index: number) => void;
  onPreviewImage: (url: string) => void;
}

type Requirement = 'optional';

// Every document is optional (at least one file overall is needed to submit).
const documentFields: Array<{ label: string; field: keyof FormData; requirement: Requirement }> = [
  { label: 'Passports (New & Old)', field: 'passports', requirement: 'optional' },
  { label: 'Business Bank Statement', field: 'businessBankStatement', requirement: 'optional' },
  { label: 'Personal Bank Statement', field: 'personalBankStatement', requirement: 'optional' },
  { label: 'Business Registration', field: 'businessRegistration', requirement: 'optional' },
  { label: 'Taxpayer Certificate', field: 'taxpayerCertificate', requirement: 'optional' },
  { label: 'Income Tax Returns', field: 'incomeTaxReturns', requirement: 'optional' },
  { label: 'Property Documents', field: 'propertyDocuments', requirement: 'optional' },
  { label: 'FRC (Family)', field: 'frcFamily', requirement: 'optional' },
  { label: 'FRC (Parents)', field: 'frcParents', requirement: 'optional' },
  { label: 'Marriage Certificate', field: 'marriageCertificate', requirement: 'optional' },
  { label: 'Invitation Letter', field: 'invitationLetter', requirement: 'optional' },
  { label: 'Flight Reservation', field: 'flightReservation', requirement: 'optional' },
  { label: 'Hotel Reservation', field: 'hotelReservation', requirement: 'optional' },
  { label: 'Other Documents', field: 'anyOtherDocuments', requirement: 'optional' },
  { label: 'Cover Letter', field: 'coverLetter', requirement: 'optional' },
];

const REQUIREMENT_BADGE: Record<Requirement, { text: string; className: string }> = {
  optional: { text: 'Optional', className: 'bg-slate-100 text-slate-500 ring-slate-200' },
};

const sizeText = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

const CELL = 'border border-slate-200 px-3 py-2 align-middle';

export const DocumentsStep: React.FC<DocumentsStepProps> = ({
  formData,
  validationErrors,
  onFileChange,
  onRemoveFile,
  onPreviewImage,
}) => {
  const [dragOver, setDragOver] = useState<string | null>(null);
  const uploadedCount = documentFields.filter(({ field }) => (formData[field] as File[]).length > 0).length;

  // The upload handler only reads e.target.files, so a dropped list of files is handed to it the same way.
  const handleDrop = (field: keyof FormData) => (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(null);
    if (e.dataTransfer.files.length > 0) {
      onFileChange(field)({ target: { files: e.dataTransfer.files } } as unknown as React.ChangeEvent<HTMLInputElement>);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
        <p className="text-sm text-slate-600">
          PDF, images (JPG, PNG) or Word files, up to 10&nbsp;MB each. You can drop files onto a row.
        </p>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
          {uploadedCount} of {documentFields.length} rows filled
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-300 shadow-sm">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-100 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
              <th className={`${CELL} w-12 text-center`}>#</th>
              <th className={`${CELL} w-[26%]`}>Document</th>
              <th className={`${CELL} w-[14%]`}>Requirement</th>
              <th className={CELL}>Files</th>
              <th className={`${CELL} w-[130px] text-center`}>Action</th>
            </tr>
          </thead>
          <tbody>
            {documentFields.map(({ label, field, requirement }, row) => {
              const files = formData[field] as File[];
              const badge = REQUIREMENT_BADGE[requirement];
              const hasError = Boolean(validationErrors[field]);
              return (
                <tr
                  key={field}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(field); }}
                  onDragLeave={() => setDragOver((current) => (current === field ? null : current))}
                  onDrop={handleDrop(field)}
                  className={`transition-colors ${
                    dragOver === field ? 'bg-sky-50' : hasError ? 'bg-red-50/60' : row % 2 ? 'bg-slate-50/60' : 'bg-white'
                  }`}
                >
                  <td className={`${CELL} bg-slate-100 text-center text-xs font-medium text-slate-500`}>{row + 1}</td>
                  <td className={`${CELL} font-medium text-slate-800`}>
                    <span className="flex items-center gap-2">
                      {files.length > 0 ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                      ) : (
                        <span className="h-4 w-4 shrink-0 rounded-full border border-slate-300" />
                      )}
                      {label}
                    </span>
                    {hasError && <p className="mt-1 pl-6 text-xs font-normal text-red-600">{validationErrors[field]}</p>}
                  </td>
                  <td className={CELL}>
                    <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${badge.className}`}>
                      {badge.text}
                    </span>
                  </td>
                  <td className={CELL}>
                    {files.length === 0 ? (
                      <span className="text-xs text-slate-400">No file yet</span>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {files.map((file, index) => {
                          const isImage = file.type.startsWith('image/');
                          return (
                            <span key={`${file.name}-${index}`} className="inline-flex max-w-[220px] items-center gap-1.5 rounded-md border border-slate-200 bg-white py-1 pl-2 pr-1 text-xs text-slate-700">
                              {isImage ? <ImageIcon className="h-3.5 w-3.5 shrink-0 text-sky-600" /> : <FileText className="h-3.5 w-3.5 shrink-0 text-slate-500" />}
                              {isImage ? (
                                <button type="button" onClick={() => onPreviewImage(URL.createObjectURL(file))} className="truncate text-left hover:underline" title="Preview">
                                  {file.name}
                                </button>
                              ) : (
                                <span className="truncate" title={file.name}>{file.name}</span>
                              )}
                              <span className="shrink-0 text-[10px] text-slate-400">{sizeText(file.size)}</span>
                              <button
                                type="button"
                                onClick={() => onRemoveFile(field, index)}
                                aria-label={`Remove ${file.name}`}
                                className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-red-50 hover:text-red-600"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </td>
                  <td className={`${CELL} text-center`}>
                    <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-500 hover:bg-slate-50">
                      <Upload className="h-3.5 w-3.5" />
                      {files.length > 0 ? 'Add more' : 'Upload'}
                      <input type="file" multiple className="hidden" onChange={onFileChange(field)} />
                    </label>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
};
