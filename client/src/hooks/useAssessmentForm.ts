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

const formStep1Schema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email address'),
  phone: z.string().min(1, 'Phone number is required'),
});

const formStep2Schema = z.object({
  destinationCountry: z.string().min(1, 'Destination country is required'),
  visaType: z.string().min(1, 'Visa type is required'),
  fromDate: z.string().min(1, 'From date is required'),
  toDate: z.string().min(1, 'To date is required'),
  purpose: z.string().min(1, 'Purpose is required'),
  otherCountry: z.string().optional(),
}).refine((data) => {
  if (data.destinationCountry === 'Other') {
    return data.otherCountry && data.otherCountry.length > 0;
  }
  return true;
}, {
  message: 'Please specify the country',
  path: ['otherCountry'],
});

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

  const [currentStep, setCurrentStep] = useState(1);
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
    
    if (step === 1) {
      const result = formStep1Schema.safeParse({
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
      });
      
      if (!result.success) {
        const errors: Record<string, string> = {};
        result.error.issues.forEach((issue) => {
          if (issue.path[0]) {
            errors[issue.path[0].toString()] = issue.message;
          }
        });
        setValidationErrors(errors);
        return false;
      }
      return true;
    }
    
    if (step === 2) {
      const result = formStep2Schema.safeParse({
        destinationCountry: formData.destinationCountry,
        visaType: formData.visaType,
        fromDate: formData.fromDate,
        toDate: formData.toDate,
        purpose: formData.purpose,
        otherCountry: formData.otherCountry,
      });
      
      if (!result.success) {
        const errors: Record<string, string> = {};
        result.error.issues.forEach((issue) => {
          if (issue.path[0]) {
            errors[issue.path[0].toString()] = issue.message;
          }
        });
        setValidationErrors(errors);
        return false;
      }
      return true;
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
        setFormData((prev) => ({
          ...prev,
          [field]: [...(prev[field] as File[]), ...validFiles],
        }));
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
      setCurrentStep((prev) => prev + 1);
    }
  }, [currentStep, validateStep]);

  const handlePreviousStep = useCallback(() => {
    setCurrentStep((prev) => Math.max(1, prev - 1));
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateStep(2)) {
      setCurrentStep(2);
      return;
    }
    
    await dispatch(submitAssessmentForm(formData));
  }, [formData, dispatch, validateStep]);

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

