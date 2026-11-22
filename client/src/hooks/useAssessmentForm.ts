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
import { prepareFile } from '@/utils/touristVisaCompress';
import type { CompressEngine } from '@/utils/touristVisaCompress';

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

const MAX_FILE_BYTES = 10 * 1024 * 1024;

// Pictures and scanned PDFs are made smaller in the browser before they are kept for upload (the heavy libraries load only when needed).
const lazyEngine: CompressEngine = {
  image: async (file, plan, signal) => (await import('@/utils/touristVisaCompressBrowser')).browserEngine.image(file, plan, signal),
  pdf: async (file, plan, signal) => (await import('@/utils/touristVisaCompressBrowser')).browserEngine.pdf(file, plan, signal),
};

/** The line shown under a file that was made smaller ("Reduced from 5.2 MB to 0.9 MB") or kept. */
export const fileNotes = new WeakMap<File, string>();

const fileValidationSchema = z.object({
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
  const [preparing, setPreparing] = useState<{ field: string; name: string } | null>(null);
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
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files) return;

      const filesArray = Array.from(e.target.files);
      const problems: string[] = [];
      const prepared: Array<{ file: File; note: string | null }> = [];

      for (const original of filesArray) {
        const validation = fileValidationSchema.safeParse({ type: original.type });
        if (!validation.success) {
          problems.push(`${original.name}: File type not supported`);
          continue;
        }
        setPreparing({ field: field.toString(), name: original.name });
        const result = await prepareFile(original, { maxFileBytes: MAX_FILE_BYTES, engine: lazyEngine }).catch(() => null);
        const file = result && result.status !== 'too_large' && result.status !== 'original_too_big' && result.status !== 'cancelled' ? result.file : original;
        if (result && (result.status === 'too_large' || result.status === 'original_too_big')) {
          problems.push(`${original.name}: ${result.message}`);
          continue;
        }
        if (file.size > MAX_FILE_BYTES) {
          problems.push(`${original.name}: File size must be less than 10MB`);
          continue;
        }
        prepared.push({ file, note: result?.status === 'reduced' ? result.note : null });
      }
      setPreparing(null);

      setValidationErrors((prev) => {
        const next = { ...prev };
        if (problems.length > 0) next[field.toString()] = problems.join(' ');
        else delete next[field.toString()];
        return next;
      });

      if (prepared.length > 0) {
        setFormData((prev) => {
          const existingFiles = prev[field] as File[];
          const totalFiles = existingFiles.length + prepared.length;
          const renamedFiles = prepared.map(({ file, note }, index) => {
            const renamed = renameSelectedFile(field.toString(), file, existingFiles.length + index, totalFiles);
            if (note) fileNotes.set(renamed, note);
            return renamed;
          });

          return {
            ...prev,
            [field]: [...existingFiles, ...renamedFiles],
          };
        });
      }
    }, []);

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
    preparing,
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

