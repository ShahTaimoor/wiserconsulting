// Admin Redux slice - manages admin state
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import {
  fetchAllUsers,
  updateUserRole,
  fetchFormSubmissions,
  updateSubmissionStatus,
  saveDocumentComment,
  deleteDocument,
  deleteSubmission,
  mergePDFs,
  compressPDFs,
  AdminUser,
  FormSubmission,
  MergePDFsRequest,
  CompressPDFsRequest,
} from '@/services/adminService';

interface AdminState {
  users: AdminUser[];
  submissions: FormSubmission[];
  loading: boolean;
  error: string | null;
}

const initialState: AdminState = {
  users: [],
  submissions: [],
  loading: false,
  error: null,
};

// ============ Users Thunks ============
export const fetchUsers = createAsyncThunk<AdminUser[], void, { rejectValue: string }>(
  'admin/fetchUsers',
  async (_, thunkAPI) => {
    try {
      const response = await fetchAllUsers();
      return response.users;
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch users';
      return thunkAPI.rejectWithValue(errorMessage);
    }
  }
);

export const updateRole = createAsyncThunk<void, { userId: string; role: number }, { rejectValue: string }>(
  'admin/updateRole',
  async ({ userId, role }, thunkAPI) => {
    try {
      await updateUserRole(userId, role);
      // Refetch users after update
      thunkAPI.dispatch(fetchUsers());
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update user role';
      return thunkAPI.rejectWithValue(errorMessage);
    }
  }
);

// ============ Submissions Thunks ============
export const fetchSubmissions = createAsyncThunk<FormSubmission[], void, { rejectValue: string }>(
  'admin/fetchSubmissions',
  async (_, thunkAPI) => {
    try {
      const response = await fetchFormSubmissions();
      return response.submissions;
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch submissions';
      return thunkAPI.rejectWithValue(errorMessage);
    }
  }
);

export const updateStatus = createAsyncThunk<void, { submissionId: string; status: string }, { rejectValue: string }>(
  'admin/updateStatus',
  async ({ submissionId, status }, thunkAPI) => {
    try {
      await updateSubmissionStatus(submissionId, status);
      // Refetch submissions after update
      thunkAPI.dispatch(fetchSubmissions());
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update submission status';
      return thunkAPI.rejectWithValue(errorMessage);
    }
  }
);

export const saveComment = createAsyncThunk<void, { submissionId: string; documentId: string; comment: string }, { rejectValue: string }>(
  'admin/saveComment',
  async ({ submissionId, documentId, comment }, thunkAPI) => {
    try {
      await saveDocumentComment(submissionId, documentId, comment);
      // Refetch submissions after update
      thunkAPI.dispatch(fetchSubmissions());
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save comment';
      return thunkAPI.rejectWithValue(errorMessage);
    }
  }
);

export const removeDocument = createAsyncThunk<void, { submissionId: string; documentId: string }, { rejectValue: string }>(
  'admin/removeDocument',
  async ({ submissionId, documentId }, thunkAPI) => {
    try {
      await deleteDocument(submissionId, documentId);
      // Refetch submissions after delete
      thunkAPI.dispatch(fetchSubmissions());
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete document';
      return thunkAPI.rejectWithValue(errorMessage);
    }
  }
);

export const removeSubmission = createAsyncThunk<void, string, { rejectValue: string }>(
  'admin/removeSubmission',
  async (submissionId, thunkAPI) => {
    try {
      await deleteSubmission(submissionId);
      // Refetch submissions after delete
      thunkAPI.dispatch(fetchSubmissions());
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete submission';
      return thunkAPI.rejectWithValue(errorMessage);
    }
  }
);

// ============ PDF Operations Thunks ============
export const mergePDFDocuments = createAsyncThunk<Blob, MergePDFsRequest, { rejectValue: string }>(
  'admin/mergePDFs',
  async (request, thunkAPI) => {
    try {
      return await mergePDFs(request);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to merge PDFs';
      return thunkAPI.rejectWithValue(errorMessage);
    }
  }
);

export const compressPDFDocuments = createAsyncThunk<Blob, CompressPDFsRequest, { rejectValue: string }>(
  'admin/compressPDFs',
  async (request, thunkAPI) => {
    try {
      return await compressPDFs(request);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to compress PDFs';
      return thunkAPI.rejectWithValue(errorMessage);
    }
  }
);

// ============ Slice ============
const adminSlice = createSlice({
  name: 'admin',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    // Fetch Users
    builder
      .addCase(fetchUsers.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchUsers.fulfilled, (state, action) => {
        state.loading = false;
        state.users = action.payload;
      })
      .addCase(fetchUsers.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || 'Failed to fetch users';
      });

    // Fetch Submissions
    builder
      .addCase(fetchSubmissions.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchSubmissions.fulfilled, (state, action) => {
        state.loading = false;
        state.submissions = action.payload;
      })
      .addCase(fetchSubmissions.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || 'Failed to fetch submissions';
      });

    // Update Role
    builder
      .addCase(updateRole.rejected, (state, action) => {
        state.error = action.payload || 'Failed to update user role';
      });

    // Update Status
    builder
      .addCase(updateStatus.rejected, (state, action) => {
        state.error = action.payload || 'Failed to update submission status';
      });

    // Save Comment
    builder
      .addCase(saveComment.rejected, (state, action) => {
        state.error = action.payload || 'Failed to save comment';
      });

    // Remove Document
    builder
      .addCase(removeDocument.rejected, (state, action) => {
        state.error = action.payload || 'Failed to delete document';
      });

    // Remove Submission
    builder
      .addCase(removeSubmission.rejected, (state, action) => {
        state.error = action.payload || 'Failed to delete submission';
      });

    // Merge PDFs
    builder
      .addCase(mergePDFDocuments.rejected, (state, action) => {
        state.error = action.payload || 'Failed to merge PDFs';
      });

    // Compress PDFs
    builder
      .addCase(compressPDFDocuments.rejected, (state, action) => {
        state.error = action.payload || 'Failed to compress PDFs';
      });
  },
});

export const { clearError } = adminSlice.actions;
export default adminSlice.reducer;

