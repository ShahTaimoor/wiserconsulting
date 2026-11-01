"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, FileText, Mail, Phone, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminFlagChips } from "@/components/tourist-visa/AdminFlags";
import { AdminStatusBadge } from "@/components/tourist-visa/AdminStatusBadge";
import { useAppDispatch } from "@/redux/hooks";
import { logout } from "@/redux/slices/auth/authSlice";
import { config } from "@/shared/tourist-visa/engine";
import { describeError, touristVisaService, TouristVisaApiError } from "@/services/touristVisaService";
import type { AdminFlag, AdminList, AdminStatus } from "@/services/touristVisaAdminTypes";
import { countHeldSections, isFormOpen, isPreviewMode } from "@/utils/touristVisaChecklist";
import { ADMIN_FLAGS, ADMIN_STATUSES, describeAdminError, emptyListText, flagLabel, formatWhen, listSummaryText, pagerState, statusLabel } from "@/utils/touristVisaAdmin";

const PAGE_SIZE = 20;

function readToken(): string | null {
  try {
    return localStorage.getItem("token");
  } catch {
    return null;
  }
}

/**
 * Tourist Visa applications (/admin/tourist-visa): every submitted application, newest first. A draft is never listed.
 * Search by reference, name or email; filter by status or by flag. The server decides what is listed, so a search never
 * reveals anything the admin could not already open.
 */
export default function AdminTouristVisaListPage() {
  const dispatch = useAppDispatch();
  const [draftQ, setDraftQ] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<AdminStatus | "">("");
  const [flag, setFlag] = useState<AdminFlag | "">("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AdminList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const latest = useRef(0);
  const lastKey = useRef("");
  const resultsHeading = useRef<HTMLHeadingElement | null>(null);

  const notOpen = !isFormOpen(countHeldSections(config), isPreviewMode());

  useEffect(() => {
    if (notOpen) return;
    // The server records each list view, so one set of choices is asked for once (React strict mode runs effects twice in development).
    const key = JSON.stringify([q, status, flag, page, attempt]);
    if (lastKey.current === key) return;
    lastKey.current = key;
    const token = readToken();
    if (!token) {
      dispatch(logout());
      return;
    }
    const run = ++latest.current;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const result = await touristVisaService.adminList(token, { q, status, flag, page, pageSize: PAGE_SIZE });
        if (run !== latest.current) return;
        setData(result);
      } catch (e) {
        if (run !== latest.current) return;
        if (e instanceof TouristVisaApiError && e.status === 401) {
          dispatch(logout());
          return;
        }
        setError(e instanceof TouristVisaApiError ? describeAdminError({ status: e.status, code: e.code, closed: e.closed }) : describeError(e));
      } finally {
        if (run === latest.current) setLoading(false);
      }
    })();
  }, [q, status, flag, page, attempt, notOpen, dispatch]);

  const search = (event: React.FormEvent) => {
    event.preventDefault();
    setPage(1);
    setQ(draftQ.trim());
  };

  const goTo = (next: number) => {
    setPage(next);
    resultsHeading.current?.focus();
  };

  const clear = () => {
    setDraftQ("");
    setQ("");
    setStatus("");
    setFlag("");
    setPage(1);
  };

  const pager = data ? pagerState(data.page, data.totalPages) : { hasPrevious: false, hasNext: false };
  const filtered = q !== "" || status !== "" || flag !== "";

  return (
    <div className="mx-auto w-full max-w-6xl px-2 py-4 sm:px-4 sm:py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Tourist Visa applications</h1>
        <p className="mt-1 text-sm text-muted-foreground">Submitted applications, newest first. Opening one is recorded in its activity log.</p>
      </header>

      {notOpen ? (
        <div role="status" className="rounded-lg border border-border bg-card p-6 text-sm text-card-foreground">
          The Tourist Visa application isn&apos;t open yet, so there is nothing to show here.
        </div>
      ) : (
        <>
          <form onSubmit={search} role="search" aria-label="Search applications" className="mb-5 flex flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <label htmlFor="tv-admin-q" className="mb-1 block text-sm font-medium text-foreground">
                Reference, name or email
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <input
                  id="tv-admin-q"
                  type="search"
                  value={draftQ}
                  maxLength={100}
                  autoComplete="off"
                  onChange={(event) => setDraftQ(event.target.value)}
                  placeholder="TV-ABCD2345, Maria, maria@example.com"
                  className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
            </div>
            <div className="sm:w-48">
              <label htmlFor="tv-admin-status" className="mb-1 block text-sm font-medium text-foreground">
                Status
              </label>
              <select
                id="tv-admin-status"
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value as AdminStatus | "");
                  setPage(1);
                }}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">All statuses</option>
                {ADMIN_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {statusLabel(value)}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:w-52">
              <label htmlFor="tv-admin-flag" className="mb-1 block text-sm font-medium text-foreground">
                Flag
              </label>
              <select
                id="tv-admin-flag"
                value={flag}
                onChange={(event) => {
                  setFlag(event.target.value as AdminFlag | "");
                  setPage(1);
                }}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">All flags</option>
                {ADMIN_FLAGS.map((value) => (
                  <option key={value} value={value}>
                    {flagLabel(value)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <Button type="submit" className="flex-1 sm:flex-none">
                Search
              </Button>
              {filtered && (
                <Button type="button" variant="outline" onClick={clear} className="flex-1 sm:flex-none">
                  Clear
                </Button>
              )}
            </div>
          </form>

          <h2 ref={resultsHeading} tabIndex={-1} className="sr-only outline-none">
            Results
          </h2>
          <p role="status" aria-live="polite" className="mb-3 text-sm text-muted-foreground">
            {loading ? "Loading applications" : data && !error ? listSummaryText(data.page, data.pageSize, data.total) : ""}
          </p>

          {error ? (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
              <p>{error}</p>
              <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => setAttempt((n) => n + 1)}>
                Try again
              </Button>
            </div>
          ) : loading && !data ? (
            <div className="space-y-3" aria-busy="true" aria-label="Loading applications">
              <Skeleton className="h-16 w-full rounded-lg" />
              <Skeleton className="h-16 w-full rounded-lg" />
              <Skeleton className="h-16 w-full rounded-lg" />
            </div>
          ) : data && data.applications.length === 0 ? (
            <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">{emptyListText(q, status || flag)}</div>
          ) : data ? (
            <div className={loading ? "opacity-60 transition-opacity" : "transition-opacity"} aria-busy={loading}>
              {/* Wide screens: a table. */}
              <div className="hidden overflow-hidden rounded-lg border border-border bg-card md:block">
                <table className="w-full table-fixed text-left text-sm">
                  <caption className="sr-only">Submitted Tourist Visa applications</caption>
                  <thead className="border-b border-border bg-muted/40 text-xs font-semibold text-muted-foreground">
                    <tr>
                      <th scope="col" className="w-36 px-4 py-3">Reference</th>
                      <th scope="col" className="px-4 py-3">Applicant</th>
                      <th scope="col" className="w-44 px-4 py-3">Phone</th>
                      <th scope="col" className="w-40 px-4 py-3">Submitted</th>
                      <th scope="col" className="w-28 px-4 py-3">Status</th>
                      <th scope="col" className="w-16 px-4 py-3 text-right">Files</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.applications.map((item) => (
                      <tr key={item.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3 font-mono text-xs">
                          <Link href={`/admin/tourist-visa/${item.id}`} className="font-semibold text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                            {item.reference ?? "No reference"}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <p className="truncate font-medium text-foreground">{item.name || "No name"}</p>
                          <p className="truncate text-xs text-muted-foreground">{item.email}</p>
                          {item.flags.length > 0 && (
                            <div className="mt-1">
                              <AdminFlagChips flags={item.flags} />
                            </div>
                          )}
                        </td>
                        <td className="truncate px-4 py-3 text-foreground">{item.phone}</td>
                        <td className="px-4 py-3 text-foreground">{formatWhen(item.submittedAt)}</td>
                        <td className="px-4 py-3">
                          <AdminStatusBadge status={item.status} />
                        </td>
                        <td className="px-4 py-3 text-right text-foreground">{item.documentCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Phones: one card for each application. */}
              <ul className="space-y-3 md:hidden">
                {data.applications.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={`/admin/tourist-visa/${item.id}`}
                      className="block rounded-lg border border-border bg-card p-4 text-card-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="break-words font-medium text-foreground">{item.name || "No name"}</p>
                          <p className="font-mono text-xs text-muted-foreground">{item.reference ?? "No reference"}</p>
                        </div>
                        <AdminStatusBadge status={item.status} />
                      </div>
                      {item.flags.length > 0 && (
                        <div className="mt-2">
                          <AdminFlagChips flags={item.flags} />
                        </div>
                      )}
                      <dl className="mt-3 space-y-1 text-sm">
                        <div className="flex items-center gap-2">
                          <dt className="sr-only">Phone</dt>
                          <Phone className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                          <dd className="min-w-0 break-all">{item.phone}</dd>
                        </div>
                        <div className="flex items-center gap-2">
                          <dt className="sr-only">Email</dt>
                          <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                          <dd className="min-w-0 break-all">{item.email}</dd>
                        </div>
                        <div className="flex items-center gap-2">
                          <dt className="sr-only">Files</dt>
                          <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                          <dd>
                            {item.documentCount} file{item.documentCount === 1 ? "" : "s"}
                          </dd>
                        </div>
                      </dl>
                      <p className="mt-2 text-xs text-muted-foreground">Submitted {formatWhen(item.submittedAt)}</p>
                    </Link>
                  </li>
                ))}
              </ul>

              {data.totalPages > 1 && (
                <nav aria-label="Pages" className="mt-4 flex items-center justify-between gap-3">
                  <Button type="button" variant="outline" size="sm" disabled={!pager.hasPrevious || loading} onClick={() => goTo(data.page - 1)}>
                    <ChevronLeft className="mr-1 h-4 w-4" aria-hidden />
                    Previous
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Page {data.page} of {data.totalPages}
                  </span>
                  <Button type="button" variant="outline" size="sm" disabled={!pager.hasNext || loading} onClick={() => goTo(data.page + 1)}>
                    Next
                    <ChevronRight className="ml-1 h-4 w-4" aria-hidden />
                  </Button>
                </nav>
              )}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
