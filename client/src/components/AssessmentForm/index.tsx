"use client";

import React, { useState, useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { RootState, AppDispatch } from "@/redux/store";
import { clearError, clearSuccess } from "@/redux/slices/formSubmission/formSubmissionSlice";
import { useAssessmentForm } from "@/hooks/useAssessmentForm";
import Image from 'next/image';
import { motion } from "framer-motion";
import { X, CheckCircle2, Loader2 } from "lucide-react";
import { PersonalInfoStep } from "./PersonalInfoStep";
import { TravelDetailsStep } from "./TravelDetailsStep";
import { DocumentsStep } from "./DocumentsStep";
import { StepIndicator } from "./StepIndicator";
import { Notification } from "./Notification";

const countries = [
  "United Kingdom",
  "United States",
  "Canada",
  "Australia",
  "Germany",
  "France",
  "Italy",
  "Spain",
  "Netherlands",
  "Switzerland",
  "New Zealand",
  "Singapore",
  "Japan",
  "South Korea",
  "Other",
];

const visaTypes = ["Tourist Visa", "Student Visa", "Transit Visa"];

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
    currentStep,
    validationErrors,
    isSubmitting,
    handleInputChange,
    handleFileChange,
    removeFile,
    handleNextStep,
    handlePreviousStep,
    handleSubmit,
    setCurrentStep,
  } = useAssessmentForm(onClose);

  useEffect(() => {
    let successTimeout: NodeJS.Timeout | null = null;
    let errorTimeout: NodeJS.Timeout | null = null;

    if (success) {
      setNotification({ type: 'success', message: success });
      // If guest email is present, save it for the comments drawer
      if (formData.email) {
        localStorage.setItem('guestEmail', formData.email);
        // Dispatch custom event to notify VisaConsultation component
        window.dispatchEvent(new Event('guestEmailUpdated'));
      }
      successTimeout = setTimeout(() => {
        setNotification(null);
        dispatch(clearSuccess());
        onClose();
      }, 3000);
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
  }, [success, error, dispatch, onClose]);

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
            <p className="text-sm text-slate-300">Complete the form to get started</p>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-lg hover:bg-slate-800 transition-colors flex items-center justify-center"
            aria-label="Close"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Step Indicator */}
        <StepIndicator currentStep={currentStep} />

        {/* Notification */}
        {notification && (
          <Notification type={notification.type} message={notification.message} />
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} id="assessment-form" className="flex flex-col flex-1 min-h-0">
          {/* Form Body - Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-8 space-y-8" style={{ scrollBehavior: 'smooth' }}>
            {/* Step 1: Personal Info */}
            {currentStep === 1 && (
              <PersonalInfoStep
                formData={formData}
                user={user}
                validationErrors={validationErrors}
                onInputChange={handleInputChange}
              />
            )}

            {/* Step 2: Travel Info */}
            {currentStep === 2 && (
              <TravelDetailsStep
                formData={formData}
                validationErrors={validationErrors}
                onInputChange={handleInputChange}
                countries={countries}
                visaTypes={visaTypes}
              />
            )}

            {/* Step 3: Documents */}
            {currentStep === 3 && formData.visaType && (
              <DocumentsStep
                formData={formData}
                onFileChange={handleFileChangeWrapper}
                onRemoveFile={handleRemoveFile}
                onPreviewImage={setPreviewImage}
              />
            )}
          </div>

          {/* Footer Actions */}
          <div className="px-8 py-6 bg-slate-50 border-t border-slate-200 flex justify-between items-center">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 border border-slate-300 rounded-lg text-slate-700 font-semibold hover:bg-white transition-colors"
            >
              Cancel
            </button>
            <div className="flex gap-3">
              {currentStep > 1 && (
                <button
                  type="button"
                  onClick={handlePreviousStep}
                  className="px-6 py-2.5 border border-slate-300 rounded-lg text-slate-700 font-semibold hover:bg-white transition-colors"
                >
                  Previous
                </button>
              )}
              {currentStep < 3 ? (
                <button
                  type="button"
                  onClick={handleNextStep}
                  className="px-6 py-2.5 bg-slate-900 text-white rounded-lg font-semibold hover:bg-slate-800 transition-colors shadow-sm"
                >
                  Next Step
                </button>
              ) : (
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
              )}
            </div>
          </div>
        </form>
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

