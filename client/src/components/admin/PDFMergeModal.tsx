// PDF Merge Modal - Premium Design
'use client';

import { useState, useMemo } from 'react';
import { useAppDispatch } from '@/redux/hooks';
import { mergePDFDocuments } from '@/redux/slices/admin/adminSlice';
import { downloadBlob } from '@/utils/fileDownload';
import { FormSubmission } from '@/services/adminService';
import ProgressBar from '@/components/ui/ProgressBar';
import { motion, AnimatePresence } from 'framer-motion';

interface PDFMergeModalProps {
  isOpen: boolean;
  onClose: () => void;
  submission: FormSubmission | null;
}

const PDFMergeModal: React.FC<PDFMergeModalProps> = ({ isOpen, onClose, submission }) => {
  const dispatch = useAppDispatch();
  const [selectedDocuments, setSelectedDocuments] = useState<string[]>([]);
  const [mergeLoading, setMergeLoading] = useState(false);
  const [mergeProgress, setMergeProgress] = useState(0);
  const [previewFile, setPreviewFile] = useState<{ url: string, type: string } | null>(null);

  const uploadedDocuments = useMemo(
    () => submission?.documents.filter(doc => doc.cloudinaryUrl) || [],
    [submission]
  );

  const handleDocumentToggle = (documentId: string) => {
    setSelectedDocuments(prev => 
      prev.includes(documentId) 
        ? prev.filter(id => id !== documentId)
        : [...prev, documentId]
    );
  };

  const handleMergePDFs = async () => {
    if (!submission || selectedDocuments.length === 0) {
      alert('Please select at least one document to merge.');
      return;
    }

    setMergeLoading(true);
    setMergeProgress(0);

    try {
      const result = await dispatch(mergePDFDocuments({
        submissionId: submission._id,
        documentIds: selectedDocuments,
        customerName: submission.name,
        customerEmail: submission.email
      })).unwrap();

      downloadBlob(result, `${submission.name.replace(/\s+/g, '_')}_merged_report.pdf`);
      alert('Documents merged into PDF successfully!');
      onClose();
    } catch (error) {
      console.error('Error merging documents:', error);
      alert('Failed to merge documents. Please try again.');
    } finally {
      setMergeLoading(false);
      setMergeProgress(0);
    }
  };

  if (!isOpen || !submission) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
          onClick={onClose}
        />
        
        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          className="relative bg-white rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh]"
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white">
            <div>
              <h2 className="text-xl font-bold text-slate-800 uppercase tracking-tight">Merge to PDF</h2>
              <p className="text-xs text-slate-500 mt-0.5">Combine multiple files into one professional PDF</p>
            </div>
            <button
              onClick={onClose}
              className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-all"
            >
              <span className="text-2xl font-light">✕</span>
            </button>
          </div>

          <div className="p-6 overflow-y-auto space-y-4 flex-1">
            <div className="mb-2">
              <p className="text-sm text-slate-600">
                Customer: <span className="font-bold text-slate-900">{submission.name}</span>
              </p>
            </div>

            {uploadedDocuments.length === 0 ? (
              <div className="text-center py-12 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                <div className="text-slate-300 text-4xl mb-3">📄</div>
                <p className="text-slate-500 font-medium">No documents available to merge.</p>
              </div>
            ) : (
              <div className="grid gap-3">
                {uploadedDocuments.map((doc) => (
                  <div
                    key={doc._id}
                    onClick={() => handleDocumentToggle(doc._id)}
                    className={`flex items-center gap-4 p-4 rounded-xl border transition-all cursor-pointer group ${
                      selectedDocuments.includes(doc._id)
                        ? 'bg-slate-50 border-blue-500 shadow-sm'
                        : 'bg-white border-slate-100 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className={`w-6 h-6 rounded-md flex items-center justify-center border transition-colors ${
                      selectedDocuments.includes(doc._id)
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : 'bg-slate-100 border-slate-200 text-transparent group-hover:border-slate-400'
                    }`}>
                      <span className="text-xs font-bold">✓</span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-bold truncate text-slate-800`}>
                        {doc.fieldName}
                      </p>
                      <p className={`text-[11px] truncate text-slate-500`}>
                        {doc.originalname} • {(doc.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                       <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setPreviewFile({ url: doc.cloudinaryUrl!, type: doc.mimetype });
                        }}
                        className={`text-[10px] font-bold px-2 py-1 rounded border transition-all border-slate-200 text-slate-500 hover:border-slate-900 hover:text-slate-900`}
                      >
                        VIEW
                      </button>
                      <span className={`text-xl opacity-40 group-hover:opacity-100 transition-opacity`}>
                        {doc.mimetype === 'application/pdf' ? '📄' : '🖼️'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {mergeLoading && (
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                <ProgressBar progress={mergeProgress} />
                <p className="text-[11px] font-bold text-slate-700 mt-2 uppercase tracking-wider text-center">Processing Documents... {mergeProgress}%</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-white border-t border-slate-100 flex items-center justify-between">
            <p className="text-xs text-slate-500 font-bold uppercase tracking-tight">
              {selectedDocuments.length} SELECTED
            </p>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="px-5 py-2 text-sm font-bold text-slate-500 hover:text-slate-900 transition"
                disabled={mergeLoading}
              >
                Cancel
              </button>
              <button
                onClick={handleMergePDFs}
                disabled={selectedDocuments.length === 0 || mergeLoading}
                className="px-6 py-2 bg-slate-900 text-white rounded-xl text-sm font-bold hover:bg-black transition disabled:opacity-50 disabled:cursor-not-allowed shadow-md flex items-center gap-2"
              >
                {mergeLoading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    Merging...
                  </>
                ) : (
                  `Merge & Download`
                )}
              </button>
            </div>
          </div>
        </motion.div>

        {/* Inner Preview Overlay */}
        <AnimatePresence>
          {previewFile && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-[70] bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-4 cursor-pointer"
              onClick={() => setPreviewFile(null)}
            >
              <div className="relative w-full max-w-lg aspect-[3/4] bg-white rounded-lg shadow-2xl overflow-hidden cursor-default" onClick={e => e.stopPropagation()}>
                 <button
                  onClick={() => setPreviewFile(null)}
                  className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full bg-black/50 text-white hover:bg-black transition z-10"
                >
                  <span className="text-2xl">✕</span>
                </button>
                {previewFile.type === 'application/pdf' ? (
                  <iframe src={previewFile.url} className="w-full h-full" />
                ) : (
                  <img src={previewFile.url} alt="Preview" className="w-full h-full object-contain bg-slate-100" />
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </AnimatePresence>

  );
};

export default PDFMergeModal;

