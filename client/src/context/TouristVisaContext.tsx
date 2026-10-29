"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAppDispatch } from "@/redux/hooks";
import { logout } from "@/redux/slices/auth/authSlice";
import {
  describeError,
  touristVisaService,
  TouristVisaApiError,
  type TouristVisaApplication,
} from "@/services/touristVisaService";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; application: TouristVisaApplication | null }; // null = not started

/** What the section form needs to know about a save. */
export type SaveResult =
  | { ok: true; needsReview: string[] }
  | { ok: false; status: number; message: string; fieldErrors?: Record<string, string> };

interface TouristVisaContextValue {
  state: LoadState;
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
      if (alive.current) setState({ status: "ready", application });
    } catch (error) {
      if (error instanceof TouristVisaApiError && error.status === 401) {
        handleUnauthorized();
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
        const status = error instanceof TouristVisaApiError ? error.status : 0;
        const fieldErrors = error instanceof TouristVisaApiError ? error.fieldErrors : undefined;
        return { ok: false, status, message: describeError(error), fieldErrors };
      }
    },
    [handleUnauthorized]
  );

  const value = useMemo(
    () => ({ state, reload, start, starting, startError, saveSection }),
    [state, reload, start, starting, startError, saveSection]
  );

  return <TouristVisaContext.Provider value={value}>{children}</TouristVisaContext.Provider>;
}

export function useTouristVisa(): TouristVisaContextValue {
  const value = useContext(TouristVisaContext);
  if (!value) throw new Error("useTouristVisa must be used inside <TouristVisaProvider>");
  return value;
}
