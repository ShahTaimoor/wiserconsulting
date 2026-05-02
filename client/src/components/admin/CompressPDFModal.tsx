// Compress PDF Modal - Premium Design
'use client';

import { useState, useMemo, useEffect } from 'react';
import { useAppDispatch } from '@/redux/hooks';
import { compressPDFDocuments } from '@/redux/slices/admin/adminSlice';
import { downloadBlob } from '@/utils/fileDownload';
import { FormSubmission } from '@/services/adminService';
import { Toast } from '@/components/ui/Toast';
import { motion, AnimatePresence } from 'framer-motion';

interface CompressPDFModalProps {
  isOpen: boolean;
  onClose: () => void;
  submission: FormSubmission | null;
}

const CompressPDFModal: React.FC<CompressPDFModalProps> = ({ isOpen, onClose, submission }) => {
  const dispatch = useAppDispatch();
  const [selectedDocuments, setSelectedDocuments] = useState<string[]>([]);
  const [compressionLevel, setCompressionLevel] = useState<'low' | 'medium' | 'high' | '5mb'>('medium');
  const [compressing, setCompressing] = useState(false);
  const [previewFile, setPreviewFile] = useState<{ url: string, type: string } | null>(null);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const availableDocuments = useMemo(
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

  const handleCloseModal = () => {
    setToastMessage(null);
    setSelectedDocuments([]);
    setPreviewFile(null);
    setCompressionLevel('medium');
    onClose();
  };

  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(null), 2500);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  const handleCompressPDFs = async () => {
    if (!submission || selectedDocuments.length === 0) {
      setToastMessage({ type: 'error', message: 'Please select at least one document to compress.' });
      return;
    }

    setCompressing(true);

    try {
      const result = await dispatch(compressPDFDocuments({
        submissionId: submission._id,
        documentIds: selectedDocuments,
        compressionLevel,
        customerName: submission.name
      })).unwrap();

      downloadBlob(result, `${submission.name.replace(/\s+/g, '_')}_compressed_docs.zip`);
      setToastMessage({ type: 'success', message: 'Documents compressed successfully!' });
      setTimeout(() => {
        handleCloseModal();
      }, 1200);
    } catch (error) {
      console.error('Error compressing documents:', error);
      setToastMessage({ type: 'error', message: 'Failed to compress documents. Please try again.' });
    } finally {
      setCompressing(false);
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
          onClick={handleCloseModal}
        />

        {toastMessage && <Toast type={toastMessage.type} message={toastMessage.message} />}
        
        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          className="relative bg-white rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh]"
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white">
            <div>
              <h2 className="text-xl font-bold text-slate-800 uppercase tracking-tight">Compress Documents</h2>
              <p className="text-xs text-slate-500 mt-0.5">Customer: <span className="font-semibold text-slate-700">{submission.name}</span></p>
            </div>
            <button
              onClick={handleCloseModal}
              className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-all"
            >
              <span className="text-2xl font-light">✕</span>
            </button>
          </div>

          <div className="p-6 overflow-y-auto space-y-6 flex-1">
            {/* Compression Controls */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
              <label className="block text-sm font-bold text-slate-900 mb-3 uppercase tracking-wider text-[10px]">
                Target Compression Level
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(['low', 'medium', 'high', '5mb'] as const).map((level) => (
                  <button
                    key={level}
                    onClick={() => setCompressionLevel(level)}
                    className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-all ${
                      compressionLevel === level
                        ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300'
                    }`}
                  >
                    {level === '5mb' ? 'Max (5MB)' : level.charAt(0).toUpperCase() + level.slice(1)}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-slate-600 mt-3 flex items-center gap-1.5 font-medium">
                <span className="w-1.5 h-1.5 bg-blue-600 rounded-full" />
                {compressionLevel === '5mb' 
                  ? 'Extreme compression: ideal for strict portal limits.' 
                  : `Balanced ${compressionLevel} quality output for professional use.`}
              </p>
            </div>

            {/* Document List */}
            <div>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Available Documents</h3>
              {availableDocuments.length === 0 ? (
                <div className="text-center py-12 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                  <div className="text-slate-300 text-4xl mb-3">📄</div>
                  <p className="text-slate-500 font-medium">No documents found for this user.</p>
                </div>
              ) : (
                <div className="grid gap-3">
                  {availableDocuments.map((doc) => (
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
                        <div className={`text-xl opacity-40 group-hover:opacity-100 transition-opacity`}>
                          {doc.mimetype === 'application/pdf' ? '📄' : '🖼️'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-white border-t border-slate-100 flex items-center justify-between">
            <p className="text-xs text-slate-500 font-bold uppercase tracking-tight">
              {selectedDocuments.length} SELECTED
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleCloseModal}
                className="px-5 py-2 text-sm font-bold text-slate-600 hover:text-slate-900 transition"
                disabled={compressing}
              >
                Cancel
              </button>
              <button
                onClick={handleCompressPDFs}
                disabled={selectedDocuments.length === 0 || compressing}
                className="px-6 py-2 bg-slate-900 text-white rounded-xl text-sm font-bold hover:bg-black transition disabled:opacity-50 disabled:cursor-not-allowed shadow-md flex items-center gap-2"
              >
                {compressing ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    Compressing...
                  </>
                ) : (
                  `Compress & Export`
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

export default CompressPDFModal;

