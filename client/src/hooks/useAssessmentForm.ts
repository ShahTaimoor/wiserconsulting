import { useState, useEffect, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from '@/redux/store';
import { 
  submitAssessmentForm, 
  clearError, 
  clearSuccess,
  resetFormSubmission 
} from '@/redux/slices/formSubmission/formSubmissionSlice';
import { z } from 'zod';

export interface FormData {
  name: string;
  email: string;
  phone: string;
  destinationCountry: string;
  otherCountry: string;
  visaType: string;
  fromDate: string;
  toDate: string;
  purpose: string;
  passports: File[];
  businessBankStatement: File[];
  personalBankStatement: File[];
  businessRegistration: File[];
  taxpayerCertificate: File[];
  incomeTaxReturns: File[];
  propertyDocuments: File[];
  frcFamily: File[];
  frcParents: File[];
  marriageCertificate: File[];
  invitationLetter: File[];
  flightReservation: File[];
  hotelReservation: File[];
  anyOtherDocuments: File[];
  coverLetter: File[];
}

const fileValidationSchema = z.object({
  size: z.number().max(10 * 1024 * 1024, 'File size must be less than 10MB'),
  type: z.string().refine(
    (type) => ['image/jpeg', 'image/png', 'image/gif', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(type),
    'File type not supported'
  ),
});

const renameSelectedFile = (field: string, file: File, index: number, totalFiles: number): File => {
  const extensionMatch = file.name.match(/(\.[^\.]+)$/);
  const extension = extensionMatch ? extensionMatch[1] : '';
  const baseName = totalFiles > 1 ? `${field}-${index + 1}` : field;
  return new File([file], `${baseName}${extension}`, { type: file.type, lastModified: file.lastModified });
};

export const useAssessmentForm = (onClose: () => void) => {
  const dispatch = useDispatch<AppDispatch>();
  const { user } = useSelector((state: RootState) => state.auth);
  const { isSubmitting, error, success } = useSelector((state: RootState) => state.formSubmission);

  const [formData, setFormData] = useState<FormData>({
    name: '',
    email: '',
    phone: '',
    destinationCountry: '',
    otherCountry: '',
    visaType: '',
    fromDate: '',
    toDate: '',
    purpose: '',
    passports: [],
    businessBankStatement: [],
    personalBankStatement: [],
    businessRegistration: [],
    taxpayerCertificate: [],
    incomeTaxReturns: [],
    propertyDocuments: [],
    frcFamily: [],
    frcParents: [],
    marriageCertificate: [],
    invitationLetter: [],
    flightReservation: [],
    hotelReservation: [],
    anyOtherDocuments: [],
    coverLetter: [],
  });

  // The form is a single step now (documents only); the step number stays for the components that still read it.
  const [currentStep, setCurrentStep] = useState(3);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (user) {
      setFormData((prev) => ({
        ...prev,
        name: user.name || '',
        email: user.email || '',
        phone: user.phone || '',
      }));
    }
  }, [user]);

  useEffect(() => {
    return () => {
      dispatch(resetFormSubmission());
    };
  }, [dispatch]);

  const validateStep = useCallback((step: number): boolean => {
    setValidationErrors({});
    const errors: Record<string, string> = {};

    if (step === 3) {
      // Every document is optional; only an empty submission (nothing at all to review) is refused.
      const documentFields: Array<keyof FormData> = [
        'passports', 'businessBankStatement', 'personalBankStatement', 'businessRegistration', 'taxpayerCertificate',
        'incomeTaxReturns', 'propertyDocuments', 'frcFamily', 'frcParents', 'marriageCertificate', 'invitationLetter',
        'flightReservation', 'hotelReservation', 'anyOtherDocuments', 'coverLetter',
      ];
      if (documentFields.every((field) => (formData[field] as File[]).length === 0)) {
        errors.passports = 'Please upload at least one document.';
      }
    }

    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return false;
    }

    return true;
  }, [formData]);

  const handleInputChange = useCallback((
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    // Clear validation error for this field
    if (validationErrors[name]) {
      setValidationErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  }, [validationErrors]);

  const handleFileChange = useCallback((field: keyof FormData) => 
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files) return;
      
      const filesArray = Array.from(e.target.files);
      const errors: string[] = [];
      const validFiles: File[] = [];
      
      filesArray.forEach((file) => {
        const validation = fileValidationSchema.safeParse({
          size: file.size,
          type: file.type,
        });
        
        if (!validation.success) {
          errors.push(`${file.name}: ${validation.error.issues[0]?.message || 'Invalid file'}`);
        } else {
          validFiles.push(file);
        }
      });

      if (errors.length > 0) {
        // File validation errors are handled locally, not through Redux
        // The error message will be shown via notification in the component
        return;
      }
      
      if (validFiles.length > 0) {
        setFormData((prev) => {
          const existingFiles = prev[field] as File[];
          const totalFiles = existingFiles.length + validFiles.length;
          const renamedFiles = validFiles.map((file, index) =>
            renameSelectedFile(field.toString(), file, existingFiles.length + index, totalFiles)
          );

          return {
            ...prev,
            [field]: [...existingFiles, ...renamedFiles],
          };
        });
      }
    }, [dispatch]);

  const removeFile = useCallback((field: keyof FormData, index: number) => {
    setFormData((prev) => ({
      ...prev,
      [field]: (prev[field] as File[]).filter((_, i) => i !== index),
    }));
  }, []);

  const handleNextStep = useCallback(() => {
    if (validateStep(currentStep)) {
      setCurrentStep((prev) => Math.min(prev + 1, 3));
    }
  }, [currentStep, validateStep]);

  const handlePreviousStep = useCallback(() => {
    setCurrentStep((prev) => Math.max(1, prev - 1));
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateStep(3)) {
      return;
    }

    await dispatch(submitAssessmentForm(formData));
  }, [currentStep, dispatch, formData, validateStep]);

  return {
    formData,
    currentStep,
    validationErrors,
    isSubmitting,
    error,
    success,
    handleInputChange,
    handleFileChange,
    removeFile,
    handleNextStep,
    handlePreviousStep,
    handleSubmit,
    setCurrentStep,
  };
};

