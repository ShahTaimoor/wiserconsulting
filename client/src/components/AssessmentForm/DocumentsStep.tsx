import React from 'react';
import { motion } from 'framer-motion';
import { FileText } from 'lucide-react';
import { FileUpload } from '../FileUpload';
import { FormData } from '@/hooks/useAssessmentForm';

interface DocumentsStepProps {
  formData: FormData;
  onFileChange: (field: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveFile: (field: keyof FormData, index: number) => void;
  onPreviewImage: (url: string) => void;
}

const documentFields: Array<{ label: string; field: keyof FormData }> = [
  { label: 'Passports (New & Old)', field: 'passports' },
  { label: 'Business Bank Statement', field: 'businessBankStatement' },
  { label: 'Personal Bank Statement', field: 'personalBankStatement' },
  { label: 'Business Registration', field: 'businessRegistration' },
  { label: 'Taxpayer Certificate', field: 'taxpayerCertificate' },
  { label: 'Income Tax Returns', field: 'incomeTaxReturns' },
  { label: 'Property Documents', field: 'propertyDocuments' },
  { label: 'FRC (Family)', field: 'frcFamily' },
  { label: 'FRC (Parents)', field: 'frcParents' },
  { label: 'Marriage Certificate', field: 'marriageCertificate' },
  { label: 'Invitation Letter', field: 'invitationLetter' },
  { label: 'Flight Reservation', field: 'flightReservation' },
  { label: 'Hotel Reservation', field: 'hotelReservation' },
  { label: 'Other Documents', field: 'anyOtherDocuments' },
  { label: 'Cover Letter', field: 'coverLetter' },
];

export const DocumentsStep: React.FC<DocumentsStepProps> = ({
  formData,
  onFileChange,
  onRemoveFile,
  onPreviewImage,
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      className="space-y-6"
    >
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm text-blue-800">
          <strong>Note:</strong> Please upload all required documents. Supported formats: PDF, Images (JPG, PNG), Word documents. Maximum file size: 10MB per file.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {documentFields.map(({ label, field }) => (
          <FileUpload
            key={field}
            label={label}
            field={field}
            files={formData[field] as File[]}
            onFileChange={onFileChange(field)}
            onRemoveFile={(index) => onRemoveFile(field, index)}
            onPreviewImage={onPreviewImage}
          />
        ))}
      </div>
    </motion.div>
  );
};

