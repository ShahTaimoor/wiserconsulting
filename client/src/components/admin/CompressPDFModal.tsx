// Compress PDF Modal - Presentation component only
'use client';

import { useState, useMemo } from 'react';
import { useAppDispatch } from '@/redux/hooks';
import { compressPDFDocuments } from '@/redux/slices/admin/adminSlice';
import { downloadBlob } from '@/utils/fileDownload';
import { FormSubmission } from '@/services/adminService';

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

  const pdfDocuments = useMemo(
    () => submission?.documents.filter(doc => 
      doc.cloudinaryUrl && doc.mimetype === 'application/pdf'
    ) || [],
    [submission]
  );

  const handleDocumentToggle = (documentId: string) => {
    setSelectedDocuments(prev => 
      prev.includes(documentId) 
        ? prev.filter(id => id !== documentId)
        : [...prev, documentId]
    );
  };

  const handleCompressPDFs = async () => {
    if (!submission || selectedDocuments.length === 0) {
      alert('Please select at least one PDF to compress.');
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

      downloadBlob(result, `${submission.name}_compressed_pdfs.zip`);
      alert('PDFs compressed successfully!');
      onClose();
    } catch (error) {
      console.error('Error compressing PDFs:', error);
      alert('Failed to compress PDFs. Please try again.');
    } finally {
      setCompressing(false);
    }
  };

  if (!isOpen || !submission) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Compress PDF Documents</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-2xl">×</button>
        </div>

        <div className="mb-4">
          <p className="text-gray-600 mb-2">
            Customer: <strong>{submission.name}</strong>
          </p>
          <p className="text-sm text-gray-500">
            Select PDF documents to compress and reduce file size
          </p>
        </div>

        {/* Compression Level Selection */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Compression Level:
          </label>
          <select
            value={compressionLevel}
            onChange={(e) => setCompressionLevel(e.target.value as 'low' | 'medium' | 'high' | '5mb')}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
          >
            <option value="low">Low (Better quality, larger size)</option>
            <option value="medium">Medium (Balanced quality/size)</option>
            <option value="high">High (Smaller size, lower quality)</option>
            <option value="5mb">5MB Target (Maximum compression)</option>
          </select>
          {compressionLevel === '5mb' && (
            <p className="text-xs text-blue-600 mt-1">
              ⚠️ This will compress files to approximately 5MB maximum size
            </p>
          )}
        </div>

        {pdfDocuments.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-gray-400 text-4xl mb-4">📄</div>
            <p className="text-gray-600">No PDF documents found.</p>
          </div>
        ) : (
          <div className="space-y-3 mb-6">
            {pdfDocuments.map((doc) => (
              <div key={doc._id} className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-gray-50">
                <input
                  type="checkbox"
                  id={doc._id}
                  checked={selectedDocuments.includes(doc._id)}
                  onChange={() => handleDocumentToggle(doc._id)}
                  className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
                />
                <label htmlFor={doc._id} className="flex-1 cursor-pointer">
                  <div>
                    <p className="font-medium text-gray-900">{doc.fieldName}</p>
                    <p className="text-sm text-gray-500">{doc.originalname}</p>
                    <p className="text-xs text-gray-400">
                      Size: {(doc.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </label>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition"
            disabled={compressing}
          >
            Cancel
          </button>
          <button
            onClick={handleCompressPDFs}
            disabled={selectedDocuments.length === 0 || compressing || pdfDocuments.length === 0}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50"
          >
            {compressing ? 'Compressing...' : `Compress ${selectedDocuments.length} PDF${selectedDocuments.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CompressPDFModal;

