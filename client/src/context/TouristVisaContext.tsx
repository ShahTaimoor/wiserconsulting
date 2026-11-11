"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAppDispatch } from "@/redux/hooks";
import { logout } from "@/redux/slices/auth/authSlice";
import {
  describeError,
  touristVisaService,
  TouristVisaApiError,
  type DocumentLimits,
  type ReviewData,
  type SubmitProblem,
  type TouristVisaApplication,
  type TouristVisaDocument,
} from "@/services/touristVisaService";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; application: TouristVisaApplication | null }; // null = not started

/** What the section form needs to know about a save. */
export type SaveResult =
  | { ok: true; needsReview: string[] }
  | { ok: false; status: number; message: string; fieldErrors?: Record<string, string> };

/** What the documents page needs to know about a call: its result, or why it failed (the server's code and a safe message). */
export type DocumentResult<T> = ({ ok: true } & T) | { ok: false; status: number; code?: string; message: string };

/** What the review page needs to know about a submit. */
export type SubmitResult =
  | { ok: true; reference: string }
  | { ok: false; status: number; code?: string; message: string; sections: SubmitProblem[]; declarationMissing: boolean };

interface TouristVisaContextValue {
  state: LoadState;
  /**
   * True once the server has answered that the Tourist Visa API is switched off (FEATURE_CLOSED).
   * The pages treat it like their own "not open yet" gate: same message, Start disabled.
   */
  serverClosed: boolean;
  /** Fetch the application again (used by the Retry button). */
  reload: () => Promise<void>;
  /** Start an application, or pick up the existing one. Resolves true on success. */
  start: () => Promise<boolean>;
  starting: boolean;
  startError: string | null;
  /**
   * Save one section (the complete new state of it). On success the shared application is
   * replaced with the server's copy, so the dashboard and other sections see the change.
   * The answers go to the server and nowhere else: they are not logged or stored.
   */
  saveSection: (sectionId: string, answers: Record<string, unknown>) => Promise<SaveResult>;
  /** Fetch the application again without showing the loading state (after files were added or removed). */
  refresh: () => Promise<void>;
  /** The applicant's files (metadata only) and the limits the server enforces. */
  listDocuments: () => Promise<DocumentResult<{ documents: TouristVisaDocument[]; limits: DocumentLimits }>>;
  /** Upload one file into a slot. Pass a signal to cancel it. The file goes to the server and nowhere else. */
  uploadDocument: (slot: string, file: File, signal?: AbortSignal) => Promise<DocumentResult<{ document: TouristVisaDocument }>>;
  /** The application as a readable review. */
  getReview: () => Promise<DocumentResult<{ data: ReviewData }>>;
  /** Submit the draft. On success the shared application becomes the submitted one. */
  submitApplication: (declarationAccepted: boolean) => Promise<SubmitResult>;
  /** Delete one uploaded file. */
  deleteDocument: (docId: string) => Promise<DocumentResult<unknown>>;
}

const TouristVisaContext = createContext<TouristVisaContextValue | null>(null);

function readToken(): string | null {
  try {
    return localStorage.getItem("token");
  } catch {
    return null;
  }
}

/**
 * Holds the signed-in user's Tourist Visa application for everything under
 * /tourist-visa. It lives in the layout, so the dashboard and the section pages
 * share one copy, and it is dropped as soon as the user leaves the area. The
 * answers (which can include decrypted passport or ID numbers) are therefore
 * never kept in the global Redux store.
 */
export function TouristVisaProvider({ children }: { children: React.ReactNode }) {
  const dispatch = useAppDispatch();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [serverClosed, setServerClosed] = useState(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /** A missing, expired or rejected token: sign out; the layout then sends the user to /login. */
  const handleUnauthorized = useCallback(() => {
    dispatch(logout());
  }, [dispatch]);

  const fetchApplication = useCallback(async () => {
    const token = readToken();
    if (!token) {
      handleUnauthorized();
      return;
    }
    try {
      const application = await touristVisaService.getMyApplication(token);
      if (alive.current) {
        setServerClosed(false);
        setState({ status: "ready", application });
      }
    } catch (error) {
      if (error instanceof TouristVisaApiError && error.status === 401) {
        handleUnauthorized();
        return;
      }
      if (error instanceof TouristVisaApiError && error.closed) {
        // Switched off on the server: nothing to load, and not an error to show.
        if (alive.current) {
          setServerClosed(true);
          setState({ status: "ready", application: null });
        }
        return;
      }
      if (alive.current) setState({ status: "error", message: describeError(error) });
    }
  }, [handleUnauthorized]);

  useEffect(() => {
    void fetchApplication();
  }, [fetchApplication]);

  const reload = useCallback(async () => {
    setState({ status: "loading" });
    await fetchApplication();
  }, [fetchApplication]);

  const start = useCallback(async () => {
    const token = readToken();
    if (!token) {
      handleUnauthorized();
      return false;
    }
    setStarting(true);
    setStartError(null);
    try {
      const { application } = await touristVisaService.startApplication(token);
      if (alive.current) setState({ status: "ready", application });
      return true;
    } catch (error) {
      if (error instanceof TouristVisaApiError && error.status === 401) {
        handleUnauthorized();
        return false;
      }
      if (error instanceof TouristVisaApiError && error.closed) {
        if (alive.current) setServerClosed(true);
        return false;
      }
      if (alive.current) setStartError(describeError(error));
      return false;
    } finally {
      if (alive.current) setStarting(false);
    }
  }, [handleUnauthorized]);

  const saveSection = useCallback(
    async (sectionId: string, answers: Record<string, unknown>): Promise<SaveResult> => {
      const token = readToken();
      if (!token) {
        handleUnauthorized();
        return { ok: false, status: 401, message: "Please sign in again." };
      }
      try {
        const { application, needsReview } = await touristVisaService.saveSection(token, sectionId, answers);
        if (alive.current) setState({ status: "ready", application });
        return { ok: true, needsReview };
      } catch (error) {
        if (error instanceof TouristVisaApiError && error.status === 401) {
          handleUnauthorized();
          return { ok: false, status: 401, message: "Please sign in again." };
        }
        if (error instanceof TouristVisaApiError && error.closed) {
          // The server was switched off while the form was open: the pages now show "not open yet".
          if (alive.current) setServerClosed(true);
          return { ok: false, status: 404, message: describeError(error) };
        }
        const status = error instanceof TouristVisaApiError ? error.status : 0;
        const fieldErrors = error instanceof TouristVisaApiError ? error.fieldErrors : undefined;
        return { ok: false, status, message: describeError(error), fieldErrors };
      }
    },
    [handleUnauthorized]
  );

  /** Turns a failed document call into the result the page shows; a rejected sign-in or a closed switch is handled here. */
  const documentFailure = useCallback(
    (error: unknown) => {
      if (error instanceof TouristVisaApiError && error.status === 401) {
        handleUnauthorized();
        return { ok: false as const, status: 401, message: "Please sign in again." };
      }
      if (error instanceof TouristVisaApiError && error.closed) {
        if (alive.current) setServerClosed(true);
        return { ok: false as const, status: 404, message: describeError(error) };
      }
      const status = error instanceof TouristVisaApiError ? error.status : 0;
      const code = error instanceof TouristVisaApiError ? error.code : undefined;
      return { ok: false as const, status, code, message: describeError(error) };
    },
    [handleUnauthorized]
  );

  const listDocuments = useCallback(async () => {
    const token = readToken();
    if (!token) return documentFailure(new TouristVisaApiError(401, "Please sign in again."));
    try {
      return { ok: true as const, ...(await touristVisaService.listDocuments(token)) };
    } catch (error) {
      return documentFailure(error);
    }
  }, [documentFailure]);

  const uploadDocument = useCallback(
    async (slot: string, file: File, signal?: AbortSignal) => {
      const token = readToken();
      if (!token) return documentFailure(new TouristVisaApiError(401, "Please sign in again."));
      try {
        return { ok: true as const, document: await touristVisaService.uploadDocument(token, slot, file, signal) };
      } catch (error) {
        return documentFailure(error);
      }
    },
    [documentFailure]
  );

  const deleteDocument = useCallback(
    async (docId: string) => {
      const token = readToken();
      if (!token) return documentFailure(new TouristVisaApiError(401, "Please sign in again."));
      try {
        await touristVisaService.deleteDocument(token, docId);
        return { ok: true as const };
      } catch (error) {
        return documentFailure(error);
      }
    },
    [documentFailure]
  );

  const getReview = useCallback(async () => {
    const token = readToken();
    if (!token) return documentFailure(new TouristVisaApiError(401, "Please sign in again."));
    try {
      return { ok: true as const, data: await touristVisaService.getReview(token) };
    } catch (error) {
      return documentFailure(error);
    }
  }, [documentFailure]);

  const submitApplication = useCallback(
    async (declarationAccepted: boolean): Promise<SubmitResult> => {
      const failed = (status: number, message: string, code?: string, sections: SubmitProblem[] = [], declarationMissing = false): SubmitResult => ({
        ok: false,
        status,
        code,
        message,
        sections,
        declarationMissing,
      });
      const token = readToken();
      if (!token) {
        handleUnauthorized();
        return failed(401, "Please sign in again.");
      }
      try {
        const { application, reference } = await touristVisaService.submitApplication(token, declarationAccepted);
        if (alive.current) setState({ status: "ready", application });
        return { ok: true, reference };
      } catch (error) {
        if (error instanceof TouristVisaApiError && error.status === 401) {
          handleUnauthorized();
          return failed(401, "Please sign in again.");
        }
        if (error instanceof TouristVisaApiError && error.closed) {
          if (alive.current) setServerClosed(true);
          return failed(404, describeError(error));
        }
        if (error instanceof TouristVisaApiError) {
          return failed(error.status, describeError(error), error.code, error.sections ?? [], error.declarationMissing ?? false);
        }
        return failed(0, describeError(error));
      }
    },
    [handleUnauthorized]
  );

  const value = useMemo(
    () => ({
      state, serverClosed, reload, start, starting, startError, saveSection, refresh: fetchApplication,
      listDocuments, uploadDocument, deleteDocument, getReview, submitApplication,
    }),
    [state, serverClosed, reload, start, starting, startError, saveSection, fetchApplication, listDocuments, uploadDocument, deleteDocument, getReview, submitApplication]
  );

  return <TouristVisaContext.Provider value={value}>{children}</TouristVisaContext.Provider>;
}

export function useTouristVisa(): TouristVisaContextValue {
  const value = useContext(TouristVisaContext);
  if (!value) throw new Error("useTouristVisa must be used inside <TouristVisaProvider>");
  return value;
}
