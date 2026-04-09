// src/redux/slices/formSubmission/formSubmissionSlice.ts
import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import {
  submitAssessment,
  getCustomerSubmission,
  renameDocument,
  FormSubmissionData,
  FormSubmissionResponse,
  CustomerSubmissionResponse,
  RenameDocumentResponse,
  FormSubmission,
  AdminComment
} from "./formSubmissionService";

interface FormSubmissionState {
  currentSubmission: FormSubmission | null;
  adminComments: AdminComment[];
  loading: boolean;
  error: string | null;
  success: string | null;
  isSubmitting: boolean;
}

const initialState: FormSubmissionState = {
  currentSubmission: null,
  adminComments: [],
  loading: false,
  error: null,
  success: null,
  isSubmitting: false,
};

// ✅ Thunks
export const submitAssessmentForm = createAsyncThunk<
  FormSubmissionResponse,
  FormSubmissionData,
  { rejectValue: string }
>(
  "formSubmission/submitAssessment",
  async (formData, thunkAPI) => {
    try {
      return await submitAssessment(formData);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred';
      return thunkAPI.rejectWithValue(errorMessage);
    }
  }
);

export const fetchCustomerSubmission = createAsyncThunk<
  CustomerSubmissionResponse,
  string,
  { rejectValue: string }
>(
  "formSubmission/fetchCustomerSubmission",
  async (email, thunkAPI) => {
    try {
      return await getCustomerSubmission(email);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred';
      return thunkAPI.rejectWithValue(errorMessage);
    }
  }
);

// ✅ Rename document thunk
export const renameDocumentAction = createAsyncThunk<
  RenameDocumentResponse,
  { submissionId: string; documentId: string; newName: string },
  { rejectValue: string }
>(
  "formSubmission/renameDocument",
  async ({ submissionId, documentId, newName }, thunkAPI) => {
    try {
      return await renameDocument(submissionId, documentId, newName);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred';
      return thunkAPI.rejectWithValue(errorMessage);
    }
  }
);

export const fetchAdminComments = createAsyncThunk<
  CustomerSubmissionResponse,
  string,
  { rejectValue: string }
>(
  "formSubmission/fetchAdminComments",
  async (email, thunkAPI) => {
    try {
      return await getCustomerSubmission(email);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred';
      return thunkAPI.rejectWithValue(errorMessage);
    }
  }
);

const formSubmissionSlice = createSlice({
  name: "formSubmission",
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    clearSuccess: (state) => {
      state.success = null;
    },
    resetFormSubmission: (state) => {
      state.currentSubmission = null;
      state.loading = false;
      state.error = null;
      state.success = null;
      state.isSubmitting = false;
    },
    updateDocumentName: (state, action) => {
      const { documentId, newName } = action.payload;
      if (state.currentSubmission) {
        const document = state.currentSubmission.documents.find(doc => doc._id === documentId);
        if (document) {
          document.originalname = newName;
        }
      }
    },
  },
  extraReducers: (builder) => {
    // Submit Assessment
    builder
      .addCase(submitAssessmentForm.pending, (state) => {
        state.isSubmitting = true;
        state.error = null;
        state.success = null;
      })
      .addCase(submitAssessmentForm.fulfilled, (state, action) => {
        state.isSubmitting = false;
        state.success = action.payload.message;
        state.error = null;
      })
      .addCase(submitAssessmentForm.rejected, (state, action) => {
        state.isSubmitting = false;
        state.error = action.payload || 'Submission failed';
        state.success = null;
      })

    // Fetch Customer Submission
      .addCase(fetchCustomerSubmission.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchCustomerSubmission.fulfilled, (state, action) => {
        state.loading = false;
        if (action.payload.success && action.payload.submission) {
          state.currentSubmission = action.payload.submission;
        } else {
          state.error = action.payload.message || 'No submission found';
        }
      })
      .addCase(fetchCustomerSubmission.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || 'Failed to fetch submission';
      })

    // Rename Document
      .addCase(renameDocumentAction.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(renameDocumentAction.fulfilled, (state, action) => {
        state.loading = false;
        state.success = action.payload.message;
        if (action.payload.document && state.currentSubmission) {
          const document = state.currentSubmission.documents.find(doc => doc._id === action.payload.document!._id);
          if (document) {
            document.originalname = action.payload.document.originalname;
          }
        }
      })
      .addCase(renameDocumentAction.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || 'Failed to rename document';
      })

    // Fetch Admin Comments
      .addCase(fetchAdminComments.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchAdminComments.fulfilled, (state, action) => {
        state.loading = false;
        if (action.payload.success && action.payload.submission) {
          state.adminComments = action.payload.submission.adminComments || [];
        } else {
          state.adminComments = [];
        }
      })
      .addCase(fetchAdminComments.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || 'Failed to fetch admin comments';
        state.adminComments = [];
      });
  },
});

export const { clearError, clearSuccess, resetFormSubmission, updateDocumentName } = formSubmissionSlice.actions;
export default formSubmissionSlice.reducer;

