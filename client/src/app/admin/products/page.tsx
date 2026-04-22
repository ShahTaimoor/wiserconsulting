'use client';

import { useEffect, useState, useMemo } from 'react';
import Image from 'next/image';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import PDFMergeModal from '@/components/admin/PDFMergeModal';
import CompressPDFModal from '@/components/admin/CompressPDFModal';
import {
  fetchSubmissions,
  updateStatus,
  saveComment,
  removeDocument,
  removeSubmission
} from '@/redux/slices/admin/adminSlice';
import { renameDocumentAction } from '@/redux/slices/formSubmission/formSubmissionSlice';
import { filterSubmissionsByStatus, getFileUrl } from '@/utils/filterHelpers';
import { downloadFile } from '@/utils/fileDownload';
import { FormSubmission, AdminComment, CustomerComment } from '@/services/adminService';

const AdminFormSubmissions = () => {
  const dispatch = useAppDispatch();
  const { submissions, loading, error } = useAppSelector((state) => state.admin);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showPDFMergeModal, setShowPDFMergeModal] = useState(false);
  const [showCompressModal, setShowCompressModal] = useState(false);
  const [showDocumentPreview, setShowDocumentPreview] = useState(false);
  const [previewDocument, setPreviewDocument] = useState<{ url: string; name: string; type: string } | null>(null);
  const [documentComments, setDocumentComments] = useState<{ [key: string]: string }>({});
  const [renamingDocument, setRenamingDocument] = useState<{ id: string; name: string } | null>(null);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [newDocumentName, setNewDocumentName] = useState('');

  useEffect(() => {
    dispatch(fetchSubmissions());
  }, [dispatch]);

  // Lock body scroll when modal is open to prevent double scrollbars
  useEffect(() => {
    if (showDetailsModal || showDocumentPreview || showRenameModal) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [showDetailsModal, showDocumentPreview, showRenameModal]);

  const filteredSubmissions = useMemo(
    () => filterSubmissionsByStatus(submissions, filterStatus),
    [submissions, filterStatus]
  );

  const selectedSubmission = useMemo(
    () => submissions.find(s => s._id === selectedSubmissionId) || null,
    [submissions, selectedSubmissionId]
  );

  const handleStatusUpdate = async (submissionId: string, newStatus: string) => {
    await dispatch(updateStatus({ submissionId, status: newStatus }));
  };

  const handlePreviewDocument = (doc: { cloudinaryUrl?: string; originalname: string; mimetype: string }) => {
    const fileUrl = getFileUrl(doc);
    if (fileUrl) {
      setPreviewDocument({ url: fileUrl, name: doc.originalname, type: doc.mimetype });
      setShowDocumentPreview(true);
    } else {
      alert('File URL not available for preview');
    }
  };

  const handleDownloadDocument = async (doc: { cloudinaryUrl?: string; originalname: string }) => {
    const fileUrl = getFileUrl(doc);
    if (fileUrl) {
      try {
        await downloadFile(fileUrl, doc.originalname);
      } catch (error) {
        alert(`Download failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  };

  const handleSaveComment = async (documentId: string, comment: string) => {
    if (!selectedSubmissionId) return;
    try {
      await dispatch(saveComment({ submissionId: selectedSubmissionId, documentId, comment })).unwrap();
      setDocumentComments(prev => ({ ...prev, [documentId]: comment }));
      alert('Comment saved and email sent to customer!');
    } catch (error) {
      alert(`Failed to save comment: ${error}`);
    }
  };

  const handleRenameDocument = (documentId: string, currentName: string) => {
    setRenamingDocument({ id: documentId, name: currentName });
    setNewDocumentName(currentName.replace(/\.[^/.]+$/, ''));
    setShowRenameModal(true);
  };

  const submitRename = async () => {
    if (!selectedSubmissionId || !renamingDocument || !newDocumentName.trim()) return;
    try {
      await dispatch(renameDocumentAction({
        submissionId: selectedSubmissionId,
        documentId: renamingDocument.id,
        newName: newDocumentName.trim()
      })).unwrap();
      await dispatch(fetchSubmissions());
      setShowRenameModal(false);
      setRenamingDocument(null);
      setNewDocumentName('');
      alert('Document renamed successfully!');
    } catch (error) {
      alert(`Failed to rename document: ${error}`);
    }
  };

  const handleDeleteDocument = async (documentId: string, documentName: string) => {
    if (!selectedSubmissionId) return;
    if (!window.confirm(`Are you sure you want to delete "${documentName}"? This action cannot be undone.`)) return;
    try {
      await dispatch(removeDocument({ submissionId: selectedSubmissionId, documentId })).unwrap();
      alert('Document deleted successfully!');
    } catch (error) {
      alert(`Failed to delete document: ${error}`);
    }
  };

  const handleDeleteSubmission = async (submissionId: string, submissionName: string) => {
    if (!window.confirm(`Are you sure you want to delete submission for "${submissionName}"? This action cannot be undone.`)) return;
    try {
      await dispatch(removeSubmission(submissionId)).unwrap();
      if (selectedSubmissionId === submissionId) {
        setSelectedSubmissionId(null);
        setShowDetailsModal(false);
      }
      alert('Submission deleted successfully!');
    } catch (error) {
      alert(`Failed to delete submission: ${error}`);
    }
  };

  const closeDetails = () => { setShowDetailsModal(false); setSelectedSubmissionId(null); };

  if (loading && submissions.length === 0) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading submissions...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center"><p className="text-red-600">{error}</p></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-lg shadow-md p-4 sm:p-6 mb-6">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-800 mb-4">Visa Assessment Submissions</h1>

          {/* Filter Controls */}
          <div className="flex flex-wrap gap-4 mb-6">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            >
              <option value="all">All Submissions</option>
              <option value="pending">Pending</option>
              <option value="reviewed">Reviewed</option>
              <option value="contacted">Contacted</option>
              <option value="completed">Completed</option>
            </select>
          </div>

          {/* Submissions Table */}
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="min-w-full bg-white border border-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden sm:table-cell">Destination</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">Visa Type</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden sm:table-cell">Date</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredSubmissions.map((submission) => (
                  <tr key={submission._id} className="hover:bg-gray-50">
                    <td className="px-4 sm:px-6 py-4">
                      <div className="text-sm font-medium text-gray-900">{submission.name}</div>
                      <div className="text-xs text-gray-500">{submission.email}</div>
                      <div className="text-xs text-gray-500 sm:hidden">{submission.destinationCountry}</div>
                    </td>
                    <td className="px-4 sm:px-6 py-4 hidden sm:table-cell">
                      <div className="text-sm text-gray-900">{submission.destinationCountry}</div>
                      {submission.otherCountry && <div className="text-xs text-gray-500">({submission.otherCountry})</div>}
                    </td>
                    <td className="px-4 sm:px-6 py-4 hidden md:table-cell text-sm text-gray-900">{submission.visaType}</td>
                    <td className="px-4 sm:px-6 py-4">
                      <select
                        value={submission.status}
                        onChange={(e) => handleStatusUpdate(submission._id, e.target.value)}
                        className={`px-2 py-1 text-xs font-medium rounded-full ${submission.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                          submission.status === 'reviewed' ? 'bg-blue-100 text-blue-800' :
                            submission.status === 'contacted' ? 'bg-purple-100 text-purple-800' :
                              'bg-green-100 text-green-800'
                          }`}
                      >
                        <option value="pending">Pending</option>
                        <option value="reviewed">Reviewed</option>
                        <option value="contacted">Contacted</option>
                        <option value="completed">Completed</option>
                      </select>
                    </td>
                    <td className="px-4 sm:px-6 py-4 hidden sm:table-cell text-sm text-gray-500">
                      {new Date(submission.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 sm:px-6 py-4">
                      <div className="flex flex-col sm:flex-row gap-2">
                        <button
                          onClick={() => { setSelectedSubmissionId(submission._id); setShowDetailsModal(true); }}
                          className="px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap shadow-sm"
                        >
                          View Details
                        </button>
                        <button
                          onClick={() => handleDeleteSubmission(submission._id, submission.name)}
                          className="px-3 py-1.5 bg-red-600 text-white text-xs font-bold rounded-lg hover:bg-red-700 transition-colors shadow-sm"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ══════════════════════════════════════════
            SUBMISSION DETAILS MODAL — fully responsive
        ══════════════════════════════════════════ */}
        {showDetailsModal && selectedSubmission && (
          <div 
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-hidden"
            onClick={closeDetails}
          >
            <div 
              className="bg-white rounded-xl w-full max-w-4xl max-h-[90vh] shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200"
              onClick={(e) => e.stopPropagation()}
            >

              {/* Sticky Header */}
              <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-xl z-10 shrink-0">
                <div className="flex items-center gap-4">
                  <h2 className="text-base sm:text-xl font-bold text-gray-800">Submission Details</h2>
                  <div className="hidden sm:flex gap-2">
                    <button
                      onClick={() => setShowPDFMergeModal(true)}
                      className="px-3 py-1 bg-green-600 text-white text-[10px] font-bold rounded-lg hover:bg-green-700 transition shadow-sm uppercase tracking-wider"
                    >
                      Merge PDF
                    </button>
                    <button
                      onClick={() => setShowCompressModal(true)}
                      className="px-3 py-1 bg-slate-700 text-white text-[10px] font-bold rounded-lg hover:bg-slate-800 transition shadow-sm uppercase tracking-wider"
                    >
                      Compress PDF
                    </button>
                  </div>
                </div>
                <button
                  onClick={closeDetails}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 transition"
                >
                  ✕
                </button>
              </div>

              {/* Scrollable Body */}
              <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1">

                {/* Info Cards — 1 col mobile / 2 col tablet / 3 col desktop */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-3">Customer Information</h3>
                    <dl className="space-y-2.5 text-sm">
                      <div>
                        <dt className="text-xs text-slate-400 font-medium">Name</dt>
                        <dd className="text-slate-900 font-semibold break-words">{selectedSubmission.name}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-slate-400 font-medium">Email</dt>
                        <dd className="text-slate-900 font-semibold break-all">{selectedSubmission.email}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-slate-400 font-medium">Phone</dt>
                        <dd className="text-slate-900 font-semibold">{selectedSubmission.phone || '—'}</dd>
                      </div>
                    </dl>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-3">Travel Information</h3>
                    <dl className="space-y-2.5 text-sm">
                      <div>
                        <dt className="text-xs text-slate-400 font-medium">Destination</dt>
                        <dd className="text-slate-900 font-semibold">{selectedSubmission.destinationCountry}{selectedSubmission.otherCountry ? ` (${selectedSubmission.otherCountry})` : ''}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-slate-400 font-medium">Visa Type</dt>
                        <dd className="text-slate-900 font-semibold">{selectedSubmission.visaType}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-slate-400 font-medium">Travel Period</dt>
                        <dd className="text-slate-900 font-semibold text-xs sm:text-sm">{selectedSubmission.fromDate} → {selectedSubmission.toDate}</dd>
                      </div>
                    </dl>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 sm:col-span-2 lg:col-span-1">
                    <h3 className="text-xs font-bold text-slate-600 uppercase tracking-widest mb-3">Purpose of Travel</h3>
                    <p className="text-sm text-slate-700 leading-relaxed break-words">{selectedSubmission.purpose}</p>
                  </div>
                </div>

                {/* Documents */}
                {selectedSubmission.documents && selectedSubmission.documents.length > 0 && (
                  <div>
                    <h3 className="text-sm sm:text-base font-bold text-gray-800 mb-3">
                      Uploaded Documents
                      <span className="ml-2 text-xs font-medium bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                        {selectedSubmission.documents.length}
                      </span>
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {selectedSubmission.documents.map((doc) => {
                        const fileUrl = getFileUrl(doc);
                        return (
                          <div key={doc._id} className="border border-gray-200 rounded-xl p-4 bg-white shadow-sm">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <span className="text-sm font-semibold text-gray-900 break-words leading-tight">{doc.fieldName}</span>
                              <span className="text-xs text-gray-400 whitespace-nowrap shrink-0">{(doc.size / 1024 / 1024).toFixed(2)} MB</span>
                            </div>
                            <p className="text-xs text-gray-500 mb-3 break-all">{doc.originalname}</p>

                            {fileUrl && (
                              <div className="grid grid-cols-2 gap-1.5 mb-1.5">
                                <button onClick={() => handlePreviewDocument(doc)} className="bg-slate-900 text-white text-xs py-2 rounded-lg hover:bg-slate-800 transition font-medium">Preview</button>
                                <button onClick={() => handleDownloadDocument(doc)} className="bg-slate-600 text-white text-xs py-2 rounded-lg hover:bg-slate-500 transition font-medium">Download</button>
                              </div>
                            )}
                            <div className="grid grid-cols-2 gap-1.5 mb-3">
                              <button onClick={() => handleRenameDocument(doc._id, doc.originalname)} className="bg-slate-700 text-white text-xs py-2 rounded-lg hover:bg-slate-800 transition font-medium">Rename</button>
                              <button onClick={() => handleDeleteDocument(doc._id, doc.originalname)} className="bg-red-600 text-white text-xs py-2 rounded-lg hover:bg-red-700 transition font-medium">Delete</button>
                            </div>

                            <textarea
                              placeholder="Add a comment for this document..."
                              value={documentComments[doc._id] || ''}
                              onChange={(e) => setDocumentComments(prev => ({ ...prev, [doc._id]: e.target.value }))}
                              className="w-full text-xs border border-slate-200 rounded-lg p-2 resize-none bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300"
                              rows={2}
                            />
                            <button
                              onClick={() => handleSaveComment(doc._id, documentComments[doc._id] || '')}
                              className="mt-1.5 w-full bg-slate-900 text-white text-xs py-2 rounded-lg hover:bg-slate-800 transition font-medium"
                            >
                              Save Comment
                            </button>

                            {doc.comment && (
                              <div className="mt-2 p-2 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-800 break-all">
                                <strong>Comment:</strong> {doc.comment}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}



                {/* Customer Comments */}
                {selectedSubmission.customerComments && selectedSubmission.customerComments.length > 0 && (
                  <div>
                    <h3 className="text-sm sm:text-base font-bold text-gray-800 mb-3">Customer Comments</h3>
                    <div className="space-y-3">
                      {selectedSubmission.customerComments.map((comment: CustomerComment, index: number) => (
                        <div key={index} className="border-l-4 border-green-400 pl-3 py-1">
                          <div className="flex flex-wrap items-center justify-between gap-1 mb-1">
                            <span className="text-sm font-semibold text-gray-800">Customer Message</span>
                            <span className="text-xs text-gray-400">{new Date(comment.createdAt).toLocaleDateString()}</span>
                          </div>
                          <p className="text-sm text-gray-600 break-all">{comment.message}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-4 sm:px-6 py-3 border-t border-gray-100 bg-gray-50 rounded-b-xl flex justify-end shrink-0">
                <button onClick={closeDetails} className="px-5 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-100 transition">
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Document Preview Modal */}
        {showDocumentPreview && previewDocument && (
          <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 z-50">
            <div className="bg-white rounded-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl">
              <div className="p-4 sm:p-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-base sm:text-lg font-semibold text-gray-800 break-words pr-4">{previewDocument.name}</h3>
                  <button
                    onClick={() => { setShowDocumentPreview(false); setPreviewDocument(null); }}
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 transition shrink-0"
                  >
                    ✕
                  </button>
                </div>

                <div className="mb-4">
                  {previewDocument.type.startsWith('image/') ? (
                    <div className="relative w-full h-64 sm:h-96">
                      <Image src={previewDocument.url} alt={previewDocument.name} fill className="object-contain rounded-lg" unoptimized />
                    </div>
                  ) : previewDocument.type === 'application/pdf' ? (
                    <iframe src={previewDocument.url} className="w-full h-64 sm:h-96 rounded-lg" title={previewDocument.name} />
                  ) : (
                    <div className="text-center py-8">
                      <p className="text-gray-600">Preview not available for this file type.</p>
                      <p className="text-sm text-gray-500 mt-2">Please download the file to view it.</p>
                    </div>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-3">
                  <button
                    onClick={() => handleDownloadDocument({ cloudinaryUrl: previewDocument.url, originalname: previewDocument.name })}
                    className="px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition text-sm font-medium"
                  >
                    Download
                  </button>
                  <button
                    onClick={() => { setShowDocumentPreview(false); setPreviewDocument(null); }}
                    className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition text-sm font-medium"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Rename Document Modal */}
        {showRenameModal && renamingDocument && (
          <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-md flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl w-full max-w-md p-6 shadow-2xl">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-800">Rename Document</h3>
                <button
                  onClick={() => { setShowRenameModal(false); setRenamingDocument(null); setNewDocumentName(''); }}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 transition"
                >
                  ✕
                </button>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Current Name: <span className="text-gray-500">{renamingDocument.name}</span>
                </label>
                <input
                  type="text"
                  value={newDocumentName}
                  onChange={(e) => setNewDocumentName(e.target.value)}
                  placeholder="Enter new document name"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  autoFocus
                />
                <p className="text-xs text-gray-400 mt-1">File extension will be preserved automatically</p>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => { setShowRenameModal(false); setRenamingDocument(null); setNewDocumentName(''); }}
                  className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={submitRename}
                  disabled={!newDocumentName.trim()}
                  className="px-4 py-2 text-sm bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition font-medium"
                >
                  Rename
                </button>
              </div>
            </div>
          </div>
        )}

        {/* PDF Merge Modal */}
        <PDFMergeModal
          isOpen={showPDFMergeModal}
          onClose={() => setShowPDFMergeModal(false)}
          submission={selectedSubmission}
        />

        {/* Compress PDF Modal */}
        <CompressPDFModal
          isOpen={showCompressModal}
          onClose={() => setShowCompressModal(false)}
          submission={selectedSubmission}
        />
      </div>
    </div>
  );
};

export default AdminFormSubmissions;
