


// src/redux/slices/formSubmission/formSubmissionService.ts

export interface FormSubmissionData {
  name: string;
  email: string;
  phone: string;
  destinationCountry: string;
  otherCountry?: string;
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

export interface FormSubmissionResponse {
  success: boolean;
  message: string;
  submissionId?: string;
}

export interface Document {
  _id: string;
  fieldName: string;
  originalname: string;
  mimetype: string;
  size: number;
  cloudinaryUrl?: string;
  cloudinaryPublicId?: string;
  cloudinaryId?: string;
  comment?: string;
}

export interface AdminComment {
  documentId: string;
  documentName: string;
  comment: string;
  createdAt: string;
}

export interface CustomerComment {
  message: string;
  createdAt: string;
}

// Add this interface for merged documents
export interface MergedDocument {
  _id: string;
  filename: string;
  downloadUrl: string;
  documentCount: number;
  createdAt: string;
}

// Update the FormSubmission interface to include mergedDocuments
export interface FormSubmission {
  _id: string;
  name: string;
  email: string;
  phone: string;
  destinationCountry: string;
  otherCountry?: string;
  visaType: string;
  fromDate: string;
  toDate: string;
  purpose: string;
  documents: Document[];
  mergedDocuments?: MergedDocument[]; // Add this line
  status: string;
  adminComments: AdminComment[];
  customerComments: CustomerComment[];
  createdAt: string;
  updatedAt: string;
}

export interface CustomerSubmissionResponse {
  success: boolean;
  data?: {
    submission: FormSubmission;
  };
  message?: string;
}

export interface RenameDocumentResponse {
  success: boolean;
  message: string;
  document?: Document;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

const getRenamedFile = (field: string, file: File, index: number, totalFiles: number): File => {
  const extensionMatch = file.name.match(/(\.[^\.]+)$/);
  const extension = extensionMatch ? extensionMatch[1] : '';
  const baseName = totalFiles > 1 ? `${field}-${index + 1}` : field;
  const newFileName = `${baseName}${extension}`;
  return new File([file], newFileName, { type: file.type, lastModified: file.lastModified });
};

// ✅ Submit assessment form
export const submitAssessment = async (formData: FormSubmissionData): Promise<FormSubmissionResponse> => {
  const formDataToSend = new FormData();
  
  // Add text fields
  Object.entries(formData).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      const files = value as File[];
      files.forEach((file, index) => {
        const renamedFile = getRenamedFile(key, file, index, files.length);
        formDataToSend.append(key, renamedFile);
      });
    } else {
      // Handle text fields
      formDataToSend.append(key, value as string);
    }
  });

  // Use the Cloudinary endpoint (or local if preferred)
  const response = await fetch(`${API_URL}/submit-assessment`, {
    method: 'POST',
    body: formDataToSend,
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || 'Form submission failed');
  }

  const data: FormSubmissionResponse = await response.json();
  return data;
};

// ✅ Get customer submission
export const getCustomerSubmission = async (email: string): Promise<CustomerSubmissionResponse> => {
  const response = await fetch(`${API_URL}/form-submissions/customer-submission/${email}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || 'Failed to fetch submission');
  }

  const data: CustomerSubmissionResponse = await response.json();
  return data;
};

// ✅ Rename document
export const renameDocument = async (
  submissionId: string, 
  documentId: string, 
  newName: string
): Promise<RenameDocumentResponse> => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}/form-submissions/${submissionId}/documents/${documentId}/rename`, {
    method: 'PUT',
    headers,
    credentials: 'include',
    body: JSON.stringify({ newName }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || 'Failed to rename document');
  }

  const data: RenameDocumentResponse = await response.json();
  return data;
};