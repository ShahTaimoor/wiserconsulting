"use client";

import React, { useState, useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { RootState, AppDispatch } from "@/redux/store";
import { clearError, clearSuccess } from "@/redux/slices/formSubmission/formSubmissionSlice";
import { useAssessmentForm } from "@/hooks/useAssessmentForm";
import { useTouristVisaEntry } from "@/hooks/useTouristVisaEntry";
import { shouldOfferFullApplication } from "@/utils/safeRedirect";
import Image from 'next/image';
import { motion } from "framer-motion";
import { X, CheckCircle2, Loader2, LogIn } from "lucide-react";
import Link from "next/link";
import { DocumentsStep } from "./DocumentsStep";
import { FullApplicationPanel } from "./FullApplicationPanel";
import { Notification } from "./Notification";

interface AssessmentFormProps {
  isOpen: boolean;
  onClose: () => void;
}

const AssessmentForm: React.FC<AssessmentFormProps> = ({ isOpen, onClose }) => {
  const dispatch = useDispatch<AppDispatch>();
  const { user } = useSelector((state: RootState) => state.auth);
  const { success, error } = useSelector((state: RootState) => state.formSubmission);
  
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const {
    formData,
    validationErrors,
    isSubmitting,
    handleInputChange,
    handleFileChange,
    removeFile,
    handleSubmit,
  } = useAssessmentForm(onClose);

  // Step 8i: once a tourist visa assessment for the United Kingdom has been sent, and only while the online application is open (the
  // existing status hook), the popup stays on a panel with "Continue to your full application" instead of closing by itself.
  // Otherwise (closed, still loading, failed, or any other visa) nothing here changes: the popup closes after three seconds as it always did.
  const touristVisaEntry = useTouristVisaEntry();
  const offerFullApplication = shouldOfferFullApplication({
    open: touristVisaEntry.open,
    success,
    visaType: formData.visaType,
    destinationCountry: formData.destinationCountry,
  });

  useEffect(() => {
    let successTimeout: NodeJS.Timeout | null = null;
    let errorTimeout: NodeJS.Timeout | null = null;

    if (success) {
      setNotification({ type: 'success', message: success });
      if (!offerFullApplication) {
        successTimeout = setTimeout(() => {
          setNotification(null);
          dispatch(clearSuccess());
          onClose();
        }, 3000);
      }
    }
    if (error) {
      setNotification({ type: 'error', message: error });
      errorTimeout = setTimeout(() => {
        setNotification(null);
        dispatch(clearError());
      }, 5000);
    }

    return () => {
      if (successTimeout) clearTimeout(successTimeout);
      if (errorTimeout) clearTimeout(errorTimeout);
    };
  }, [success, error, dispatch, onClose, offerFullApplication]);

  // An error left over from something else (for example looking up the customer's earlier application) must not greet the person
  // when the form opens: only what happens to THIS form is shown.
  useEffect(() => {
    if (isOpen) {
      dispatch(clearError());
      setNotification(null);
    }
  }, [isOpen, dispatch]);

  // Closing from the panel (or the X) also forgets the success, so the popup opens as a fresh form next time, as it does after the automatic close.
  const handleClose = () => {
    if (offerFullApplication) {
      setNotification(null);
      dispatch(clearSuccess());
    }
    onClose();
  };

  if (!isOpen) return null;

  const handleRemoveFile = (field: keyof typeof formData, index: number) => {
    removeFile(field, index);
  };

  const handleFileChangeWrapper = (field: keyof typeof formData) => {
    return handleFileChange(field);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[95vh] min-h-0 overflow-hidden border border-slate-200 flex flex-col"
      >
        {/* Header */}
        <div className="bg-slate-900 text-white px-8 py-6 flex justify-between items-center border-b border-slate-700">
          <div>
            <h2 className="text-2xl font-bold mb-1">Free Visa Assessment</h2>
            <p className="text-sm text-slate-300">Upload your documents to get started</p>
          </div>
          <button
            onClick={handleClose}
            className="w-10 h-10 rounded-lg hover:bg-slate-800 transition-colors flex items-center justify-center"
            aria-label="Close"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Notification */}
        {notification && (
          <Notification type={notification.type} message={notification.message} />
        )}

        {/* The way on to the full application (only while it is open, after a UK tourist visa assessment was sent) */}
        {offerFullApplication && <FullApplicationPanel href={touristVisaEntry.href} onClose={handleClose} />}

        {/* Signed out: the application is tied to the account (name and e-mail come from it) */}
        {!offerFullApplication && !user && (
          <div className="flex flex-1 flex-col items-center justify-center gap-5 p-10 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-700">
              <LogIn className="h-7 w-7" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-900">Please sign in to continue</h3>
              <p className="mt-2 max-w-md text-sm text-slate-600">
                Sign in or create a free account to upload your documents. You will be able to follow the review and read our comments in your account.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link href="/login" onClick={handleClose} className="rounded-lg bg-slate-900 px-6 py-2.5 font-semibold text-white transition-colors hover:bg-slate-800">
                Sign In
              </Link>
              <Link href="/register" onClick={handleClose} className="rounded-lg border border-slate-300 px-6 py-2.5 font-semibold text-slate-700 transition-colors hover:bg-slate-50">
                Sign Up
              </Link>
            </div>
          </div>
        )}

        {/* Form */}
        {!offerFullApplication && user && (
        <form onSubmit={handleSubmit} id="assessment-form" className="flex flex-col flex-1 min-h-0">
          {/* Form Body - Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-8 space-y-8" style={{ scrollBehavior: 'smooth' }}>
            <DocumentsStep
                formData={formData}
                validationErrors={validationErrors}
                onFileChange={handleFileChangeWrapper}
                onRemoveFile={handleRemoveFile}
                onPreviewImage={setPreviewImage}
            />
          </div>

          {/* Footer Actions */}
          <div className="px-8 py-6 bg-slate-50 border-t border-slate-200 flex justify-between items-center">
            <button
              type="button"
              onClick={handleClose}
              className="px-6 py-2.5 border border-slate-300 rounded-lg text-slate-700 font-semibold hover:bg-white transition-colors"
            >
              Cancel
            </button>
            <div className="flex gap-3">
              <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-2.5 bg-slate-900 text-white rounded-lg font-semibold hover:bg-slate-800 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      Submit Assessment
                      <CheckCircle2 className="w-5 h-5" />
                    </>
                  )}
                </button>
            </div>
          </div>
        </form>
        )}
      </motion.div>

      {/* Preview Modal */}
      {previewImage && (
        <div className="fixed inset-0 bg-slate-900/95 flex items-center justify-center z-[60] p-4">
          <div className="relative max-w-5xl w-full h-full flex items-center">
            <Image
              src={previewImage}
              alt="Preview"
              fill
              className="object-contain rounded-lg"
              unoptimized
            />
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute top-4 right-4 w-12 h-12 bg-white text-slate-900 rounded-full flex items-center justify-center hover:bg-slate-100 transition-colors shadow-xl"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AssessmentForm;

