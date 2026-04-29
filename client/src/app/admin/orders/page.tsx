'use client';

import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import { fetchSubmissions } from '@/redux/slices/admin/adminSlice';
import PDFMergeModal from '@/components/admin/PDFMergeModal';
import CompressPDFModal from '@/components/admin/CompressPDFModal';
import { FormSubmission } from '@/services/adminService';
import { useState } from 'react';

const AdminOrders = () => {
  const dispatch = useAppDispatch();
  const { submissions, loading } = useAppSelector((state) => state.admin);
  const [showPDFMergeModal, setShowPDFMergeModal] = useState(false);
  const [showCompressModal, setShowCompressModal] = useState(false);
  const [selectedSubmission, setSelectedSubmission] = useState<FormSubmission | null>(null);

  useEffect(() => {
    dispatch(fetchSubmissions());
  }, [dispatch]);

  const handleOpenPDFMerge = (submission: FormSubmission) => {
    setSelectedSubmission(submission);
    setShowPDFMergeModal(true);
  };

  const handleOpenCompress = (submission: FormSubmission) => {
    setSelectedSubmission(submission);
    setShowCompressModal(true);
  };

  const handleCloseModals = () => {
    setShowPDFMergeModal(false);
    setShowCompressModal(false);
    setSelectedSubmission(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Form Submissions</h1>
          <p className="text-gray-600">Manage visa assessment submissions and merge documents</p>
        </div>
      </div>

      {/* Form Submissions Section */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Submissions</h2>
          <p className="text-gray-600">Manage visa assessment submissions and merge documents</p>
        </div>

        <div className="w-full overflow-x-auto">
          <table className="w-full text-left bg-white border border-gray-200 table-fixed">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider w-1/4">
                  Customer
                </th>
                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider hidden sm:table-cell">
                  Destination
                </th>
                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">
                  Visa Type
                </th>
                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">
                  Documents
                </th>
                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider hidden sm:table-cell">
                  Date
                </th>
                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider w-32">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {submissions.map((submission) => (
                <tr key={submission._id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-gray-900 truncate max-w-[150px]">{submission.name}</div>
                    <div className="text-sm text-gray-500 truncate max-w-[150px]">{submission.email}</div>
                  </td>
                  <td className="px-6 py-4 hidden sm:table-cell text-sm text-gray-900 truncate max-w-[150px]">
                    {submission.destinationCountry}
                  </td>
                  <td className="px-6 py-4 hidden md:table-cell text-sm text-gray-900 whitespace-nowrap">
                    {submission.visaType}
                  </td>
                  <td className="px-6 py-4 hidden lg:table-cell text-sm text-gray-900 whitespace-nowrap">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {submission.documents.length} docs
                    </span>
                  </td>
                  <td className="px-6 py-4 hidden sm:table-cell text-sm text-gray-900 whitespace-nowrap">
                    {new Date(submission.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-sm font-medium">
                    <div className="flex flex-col space-y-2">
                      <button
                        onClick={() => handleOpenPDFMerge(submission)}
                        className="text-green-600 hover:text-green-900 bg-green-50 hover:bg-green-100 px-3 py-1.5 rounded-md text-xs font-medium transition text-center w-full max-w-[120px]"
                      >
                        📄 Merge PDFs
                      </button>
                      <button
                        onClick={() => handleOpenCompress(submission)}
                        className="text-blue-600 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-md text-xs font-medium transition text-center w-full max-w-[120px]"
                      >
                        🗜️ Compress PDFs
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* PDF Merge Modal */}
      <PDFMergeModal
        isOpen={showPDFMergeModal}
        onClose={handleCloseModals}
        submission={selectedSubmission}
      />

      {/* Compress PDF Modal */}
      <CompressPDFModal
        isOpen={showCompressModal}
        onClose={handleCloseModals}
        submission={selectedSubmission}
      />
    </div>
  );
};

export default AdminOrders;
