// PDF Merge Modal - Presentation component only
'use client';

import { useState, useMemo } from 'react';
import { useAppDispatch } from '@/redux/hooks';
import { mergePDFDocuments } from '@/redux/slices/admin/adminSlice';
import { downloadBlob } from '@/utils/fileDownload';
import { FormSubmission } from '@/services/adminService';
import ProgressBar from '@/components/ui/ProgressBar';

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

      downloadBlob(result, `${submission.name}_merged_documents.pdf`);
      alert('PDF merged successfully!');
      onClose();
    } catch (error) {
      console.error('Error merging PDFs:', error);
      alert('Failed to merge PDFs. Please try again.');
    } finally {
      setMergeLoading(false);
      setMergeProgress(0);
    }
  };

  if (!isOpen || !submission) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Merge PDF Documents</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl"
          >
            ×
          </button>
        </div>

        <div className="mb-4">
          <p className="text-gray-600 mb-2">
            Customer: <strong>{submission.name}</strong> ({submission.email})
          </p>
          <p className="text-sm text-gray-500">
            Select uploaded documents to merge into a single PDF file
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Showing {uploadedDocuments.length} uploaded document{uploadedDocuments.length !== 1 ? 's' : ''}
          </p>
        </div>

        {uploadedDocuments.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-gray-400 text-4xl mb-4">📄</div>
            <p className="text-gray-600">No documents have been uploaded yet.</p>
            <p className="text-sm text-gray-500 mt-2">Documents will appear here once they are uploaded.</p>
          </div>
        ) : (
          <div className="space-y-3 mb-6">
            {uploadedDocuments.map((doc) => (
              <div key={doc._id} className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-gray-50">
                <input
                  type="checkbox"
                  id={doc._id}
                  checked={selectedDocuments.includes(doc._id)}
                  onChange={() => handleDocumentToggle(doc._id)}
                  className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
                />
                <label htmlFor={doc._id} className="flex-1 cursor-pointer">
                  <div className="flex items-center space-x-2">
                    <span className="text-lg">
                      {doc.mimetype === 'application/pdf' ? '📄' : '🖼️'}
                    </span>
                    <div>
                      <p className="font-medium text-gray-900">{doc.fieldName}</p>
                      <p className="text-sm text-gray-500">{doc.originalname}</p>
                      <p className="text-xs text-gray-400">
                        Size: {(doc.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                  </div>
                </label>
                <a
                  href={doc.cloudinaryUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 text-sm bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded transition"
                >
                  View
                </a>
              </div>
            ))}
          </div>
        )}

        {mergeLoading && (
          <div className="mb-4">
            <ProgressBar progress={mergeProgress} />
            <p className="text-sm text-gray-600 mt-2">Merging documents... {mergeProgress}%</p>
          </div>
        )}

        <div className="flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition"
            disabled={mergeLoading}
          >
            Cancel
          </button>
          <button
            onClick={handleMergePDFs}
            disabled={selectedDocuments.length === 0 || mergeLoading || uploadedDocuments.length === 0}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50"
          >
            {mergeLoading ? 'Merging...' : `Merge ${selectedDocuments.length} Document${selectedDocuments.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PDFMergeModal;

