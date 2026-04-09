'use client';

import { useEffect, useState, useMemo } from 'react';
import Image from 'next/image';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
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
  const [selectedSubmission, setSelectedSubmission] = useState<FormSubmission | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showDocumentPreview, setShowDocumentPreview] = useState(false);
  const [previewDocument, setPreviewDocument] = useState<{ url: string; name: string; type: string } | null>(null);
  const [documentComments, setDocumentComments] = useState<{ [key: string]: string }>({});
  const [renamingDocument, setRenamingDocument] = useState<{ id: string; name: string } | null>(null);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [newDocumentName, setNewDocumentName] = useState('');

  useEffect(() => {
    dispatch(fetchSubmissions());
  }, [dispatch]);

  const filteredSubmissions = useMemo(
    () => filterSubmissionsByStatus(submissions, filterStatus),
    [submissions, filterStatus]
  );

  const handleStatusUpdate = async (submissionId: string, newStatus: string) => {
    await dispatch(updateStatus({ submissionId, status: newStatus }));
  };

  const handlePreviewDocument = (doc: { cloudinaryUrl?: string; originalname: string; mimetype: string }) => {
    const fileUrl = getFileUrl(doc);
    if (fileUrl) {
      setPreviewDocument({
        url: fileUrl,
        name: doc.originalname,
        type: doc.mimetype
      });
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
    if (!selectedSubmission) return;
    
    try {
      await dispatch(saveComment({
        submissionId: selectedSubmission._id,
        documentId,
        comment
      })).unwrap();
      
      setDocumentComments(prev => ({
        ...prev,
        [documentId]: comment
      }));
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
    if (!selectedSubmission || !renamingDocument || !newDocumentName.trim()) {
      return;
    }

    try {
      await dispatch(renameDocumentAction({
        submissionId: selectedSubmission._id,
        documentId: renamingDocument.id,
        newName: newDocumentName.trim()
      })).unwrap();

      // Refetch submissions to get updated data
      await dispatch(fetchSubmissions());
      
      // Update selected submission
      const updated = submissions.find(s => s._id === selectedSubmission._id);
      if (updated) {
        setSelectedSubmission(updated);
      }

      setShowRenameModal(false);
      setRenamingDocument(null);
      setNewDocumentName('');
      alert('Document renamed successfully!');
    } catch (error) {
      alert(`Failed to rename document: ${error}`);
    }
  };

  const handleDeleteDocument = async (documentId: string, documentName: string) => {
    if (!selectedSubmission) return;

    const confirmDelete = window.confirm(`Are you sure you want to delete "${documentName}"? This action cannot be undone.`);
    if (!confirmDelete) return;

    try {
      await dispatch(removeDocument({
        submissionId: selectedSubmission._id,
        documentId
      })).unwrap();

      // Update selected submission
      const updated = submissions.find(s => s._id === selectedSubmission._id);
      if (updated) {
        setSelectedSubmission(updated);
      }
      alert('Document deleted successfully!');
    } catch (error) {
      alert(`Failed to delete document: ${error}`);
    }
  };

  const handleDeleteSubmission = async (submissionId: string, submissionName: string) => {
    const confirmDelete = window.confirm(`Are you sure you want to delete submission for "${submissionName}"? This action cannot be undone.`);
    if (!confirmDelete) return;

    try {
      await dispatch(removeSubmission(submissionId)).unwrap();
      if (selectedSubmission?._id === submissionId) {
        setSelectedSubmission(null);
        setShowDetailsModal(false);
      }
      alert('Submission deleted successfully!');
    } catch (error) {
      alert(`Failed to delete submission: ${error}`);
    }
  };

  if (loading) {
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
        <div className="text-center">
          <p className="text-red-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">Visa Assessment Submissions</h1>

          {/* Filter Controls */}
          <div className="flex flex-wrap gap-4 mb-6">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Submissions</option>
              <option value="pending">Pending</option>
              <option value="reviewed">Reviewed</option>
              <option value="contacted">Contacted</option>
              <option value="completed">Completed</option>
            </select>
          </div>

          {/* Submissions Table */}
          <div className="overflow-x-auto">
            <table className="min-w-full bg-white border border-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Customer
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Destination
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Visa Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredSubmissions.map((submission) => (
                  <tr key={submission._id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{submission.name}</div>
                        <div className="text-sm text-gray-500">{submission.email}</div>
                        <div className="text-sm text-gray-500">{submission.phone}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{submission.destinationCountry}</div>
                      {submission.otherCountry && (
                        <div className="text-sm text-gray-500">({submission.otherCountry})</div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{submission.visaType}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <select
                        value={submission.status}
                        onChange={(e) => handleStatusUpdate(submission._id, e.target.value)}
                        className={`px-2 py-1 text-xs font-medium rounded-full ${
                          submission.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
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
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(submission.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button
                        onClick={() => {
                          setSelectedSubmission(submission);
                          setShowDetailsModal(true);
                        }}
                        className="text-blue-600 hover:text-blue-900 mr-3"
                      >
                        View Details
                      </button>
                      <button
                        onClick={() => handleDeleteSubmission(submission._id, submission.name)}
                        className="text-red-600 hover:text-red-900"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Details Modal */}
        {showDetailsModal && selectedSubmission && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-bold text-gray-800">Submission Details</h2>
                  <button
                    onClick={() => {
                      setShowDetailsModal(false);
                      setSelectedSubmission(null);
                    }}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    ✕
                  </button>
                </div>

                {/* Customer Information */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800 mb-3">Customer Information</h3>
                    <div className="space-y-2">
                      <p><strong>Name:</strong> {selectedSubmission.name}</p>
                      <p><strong>Email:</strong> {selectedSubmission.email}</p>
                      <p><strong>Phone:</strong> {selectedSubmission.phone}</p>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800 mb-3">Travel Information</h3>
                    <div className="space-y-2">
                      <p><strong>Destination:</strong> {selectedSubmission.destinationCountry}</p>
                      {selectedSubmission.otherCountry && (
                        <p><strong>Other Country:</strong> {selectedSubmission.otherCountry}</p>
                      )}
                      <p><strong>Visa Type:</strong> {selectedSubmission.visaType}</p>
                      <p><strong>Travel Period:</strong> {selectedSubmission.fromDate} to {selectedSubmission.toDate}</p>
                    </div>
                  </div>
                </div>

                {/* Purpose */}
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-800 mb-3">Purpose of Travel</h3>
                  <p className="text-gray-700 bg-gray-50 p-3 rounded-lg">{selectedSubmission.purpose}</p>
                </div>

                {/* Documents */}
                {selectedSubmission.documents && selectedSubmission.documents.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-lg font-semibold text-gray-800 mb-3">Uploaded Documents</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {selectedSubmission.documents.map((doc) => {
                        const fileUrl = getFileUrl(doc);
                        return (
                          <div key={doc._id} className="border border-gray-200 rounded-lg p-4">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-medium text-gray-800">{doc.fieldName}</span>
                              <span className="text-xs text-gray-500">
                                {(doc.size / 1024 / 1024).toFixed(2)} MB
                              </span>
                            </div>
                            <div className="text-xs text-gray-600 mb-3">{doc.originalname}</div>

                            <div className="flex space-x-2 mb-2">
                              {fileUrl && (
                                <>
                                  <button
                                    onClick={() => handlePreviewDocument(doc)}
                                    className="flex-1 bg-blue-500 text-white text-xs py-1 px-2 rounded hover:bg-blue-600 transition-colors"
                                  >
                                    Preview
                                  </button>
                                  <button
                                    onClick={() => handleDownloadDocument(doc)}
                                    className="flex-1 bg-green-500 text-white text-xs py-1 px-2 rounded hover:bg-green-600 transition-colors"
                                  >
                                    Download
                                  </button>
                                </>
                              )}
                            </div>

                            <div className="mb-2 flex space-x-2">
                              <button
                                onClick={() => handleRenameDocument(doc._id, doc.originalname)}
                                className="flex-1 bg-orange-500 text-white text-xs py-1 px-2 rounded hover:bg-orange-600 transition-colors"
                              >
                                Rename
                              </button>
                              <button
                                onClick={() => handleDeleteDocument(doc._id, doc.originalname)}
                                className="flex-1 bg-red-500 text-white text-xs py-1 px-2 rounded hover:bg-red-600 transition-colors"
                              >
                                Delete
                              </button>
                            </div>

                            <div className="mt-3">
                              <textarea
                                placeholder="Add a comment for this document..."
                                value={documentComments[doc._id] || ''}
                                onChange={(e) => setDocumentComments(prev => ({
                                  ...prev,
                                  [doc._id]: e.target.value
                                }))}
                                className="w-full text-xs border border-gray-300 rounded p-2 resize-none"
                                rows={2}
                              />
                              <button
                                onClick={() => handleSaveComment(doc._id, documentComments[doc._id] || '')}
                                className="mt-1 w-full bg-purple-500 text-white text-xs py-1 px-2 rounded hover:bg-purple-600 transition-colors"
                              >
                                Save Comment
                              </button>
                            </div>

                            {doc.comment && (
                              <div className="mt-2 p-2 bg-blue-50 rounded text-xs text-blue-800">
                                <strong>Comment:</strong> {doc.comment}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Admin Comments */}
                {selectedSubmission.adminComments && selectedSubmission.adminComments.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-lg font-semibold text-gray-800 mb-3">Admin Comments</h3>
                    <div className="space-y-4">
                      {selectedSubmission.adminComments.map((comment: AdminComment, index: number) => (
                        <div key={index} className="border-l-4 border-blue-500 pl-4">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-gray-800">{comment.documentName}</span>
                            <span className="text-xs text-gray-500">
                              {new Date(comment.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                          <p className="text-gray-700 mt-1">{comment.comment}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Customer Comments */}
                {selectedSubmission.customerComments && selectedSubmission.customerComments.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-lg font-semibold text-gray-800 mb-3">Customer Comments</h3>
                    <div className="space-y-4">
                      {selectedSubmission.customerComments.map((comment: CustomerComment, index: number) => (
                        <div key={index} className="border-l-4 border-green-500 pl-4">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-gray-800">Customer Message</span>
                            <span className="text-xs text-gray-500">
                              {new Date(comment.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                          <p className="text-gray-700 mt-1">{comment.message}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Document Preview Modal */}
        {showDocumentPreview && previewDocument && (
          <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold text-gray-800">{previewDocument.name}</h3>
                  <button
                    onClick={() => {
                      setShowDocumentPreview(false);
                      setPreviewDocument(null);
                    }}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    ✕
                  </button>
                </div>

                <div className="mb-4">
                  {previewDocument.type.startsWith('image/') ? (
                    <div className="relative w-full h-96">
                      <Image
                        src={previewDocument.url}
                        alt={previewDocument.name}
                        fill
                        className="object-contain rounded-lg"
                        unoptimized
                      />
                    </div>
                  ) : previewDocument.type === 'application/pdf' ? (
                    <iframe
                      src={previewDocument.url}
                      className="w-full h-96 rounded-lg"
                      title={previewDocument.name}
                    />
                  ) : (
                    <div className="text-center py-8">
                      <p className="text-gray-600">Preview not available for this file type.</p>
                      <p className="text-sm text-gray-500 mt-2">Please download the file to view it.</p>
                    </div>
                  )}
                </div>

                <div className="mt-4 flex justify-end space-x-3">
                  <button
                    onClick={() => handleDownloadDocument({ cloudinaryUrl: previewDocument.url, originalname: previewDocument.name })}
                    className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
                  >
                    Download
                  </button>
                  <button
                    onClick={() => {
                      setShowDocumentPreview(false);
                      setPreviewDocument(null);
                    }}
                    className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
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
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg max-w-md w-full p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-800">Rename Document</h3>
                <button
                  onClick={() => {
                    setShowRenameModal(false);
                    setRenamingDocument(null);
                    setNewDocumentName('');
                  }}
                  className="text-gray-500 hover:text-gray-700"
                >
                  ✕
                </button>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Current Name: <span className="text-gray-500">{renamingDocument.name}</span>
                </label>
                <input
                  type="text"
                  value={newDocumentName}
                  onChange={(e) => setNewDocumentName(e.target.value)}
                  placeholder="Enter new document name"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  autoFocus
                />
                <p className="text-xs text-gray-500 mt-1">
                  File extension will be preserved automatically
                </p>
              </div>

              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => {
                    setShowRenameModal(false);
                    setRenamingDocument(null);
                    setNewDocumentName('');
                  }}
                  className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={submitRename}
                  disabled={!newDocumentName.trim()}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Rename
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminFormSubmissions;
