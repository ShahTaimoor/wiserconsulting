// src/store.ts
import { configureStore } from "@reduxjs/toolkit";
// Import your slices
import authReducer from "./slices/auth/authSlice";
import formSubmissionReducer from "./slices/formSubmission/formSubmissionSlice";
import adminReducer from "./slices/admin/adminSlice";

export const store = configureStore({
  reducer: {
    auth: authReducer,
    formSubmission: formSubmissionReducer,
    admin: adminReducer,
  },
});

// ✅ Infer RootState and AppDispatch types
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
