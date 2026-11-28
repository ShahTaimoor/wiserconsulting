'use client';

import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import { fetchSubmissions } from '@/redux/slices/admin/adminSlice';
import PDFMergeModal from '@/components/admin/PDFMergeModal';
import { FormSubmission } from '@/services/adminService';
import { useState } from 'react';
import { SheetPage, SheetToolbar, SheetTable, SheetMessage, SheetLoading, SheetButton, Thead, Th, Tr, Td, EmptyRow, Pill, sheetInput } from '@/components/admin/Sheet';

const AdminOrders = () => {
  const dispatch = useAppDispatch();
  const { submissions, loading } = useAppSelector((state) => state.admin);
  const [showPDFMergeModal, setShowPDFMergeModal] = useState(false);
  const [selectedSubmission, setSelectedSubmission] = useState<FormSubmission | null>(null);

  useEffect(() => {
    dispatch(fetchSubmissions());
  }, [dispatch]);

  const handleOpenPDFMerge = (submission: FormSubmission) => {
    setSelectedSubmission(submission);
    setShowPDFMergeModal(true);
  };

  const handleCloseModals = () => {
    setShowPDFMergeModal(false);
    setSelectedSubmission(null);
  };

  return (
    <>
      <SheetPage title="Merge PDFs" subtitle="Pick a customer, then merge the documents they uploaded">
        {loading ? (
          <SheetLoading />
        ) : (
          <SheetTable count={submissions.length} unit="submissions" minWidth={760}>
            <Thead>
              <Th>Customer</Th>
              <Th>Email</Th>
              <Th className="w-28">Documents</Th>
              <Th className="w-32">Date</Th>
              <Th className="w-56 text-center">Actions</Th>
            </Thead>
            <tbody>
              {submissions.length === 0 ? (
                <EmptyRow colSpan={5}>No submissions yet</EmptyRow>
              ) : (
                submissions.map((submission, index) => (
                  <Tr key={submission._id} n={index + 1}>
                    <Td className="font-medium">{submission.name}</Td>
                    <Td className="text-slate-600">{submission.email}</Td>
                    <Td><Pill tone="blue">{submission.documents.length} docs</Pill></Td>
                    <Td className="whitespace-nowrap text-slate-600">{new Date(submission.createdAt).toLocaleDateString()}</Td>
                    <Td>
                      <div className="flex items-center justify-center gap-1.5">
                        <SheetButton tone="success" onClick={() => handleOpenPDFMerge(submission)}>Merge PDFs</SheetButton>
                      </div>
                    </Td>
                  </Tr>
                ))
              )}
            </tbody>
          </SheetTable>
        )}
      </SheetPage>

      {/* PDF Merge Modal */}
      <PDFMergeModal
        isOpen={showPDFMergeModal}
        onClose={handleCloseModals}
        submission={selectedSubmission}
      />
    </>
  );
};

export default AdminOrders;
