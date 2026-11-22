"use client";

import { useState, useEffect } from "react";
import { Search, Eye, Trash2 } from "lucide-react";
import Link from "next/link";
import { SheetPage, SheetToolbar, SheetTable, SheetMessage, SheetLoading, SheetButton, Thead, Th, Tr, Td, EmptyRow, Pill, sheetInput } from "@/components/admin/Sheet";

interface ContactSubmission {
  _id: string;
  name: string;
  email: string;
  subject: string;
  status: "new" | "read" | "responded" | "archived";
  createdAt: string;
}

interface PaginationData {
  currentPage: number;
  totalPages: number;
  totalItems: number;
}

const ContactsPage = () => {
  const [submissions, setSubmissions] = useState<ContactSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<PaginationData | null>(null);

  const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5000";

  const fetchSubmissions = async (pageNum: number, search: string = "") => {
    setLoading(true);
    setError("");

    try {
      let url = `${API_BASE_URL}/api/contacts?page=${pageNum}&limit=10`;
      if (search) url += `&search=${encodeURIComponent(search)}`;

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
      });

      if (!response.ok) throw new Error("Failed to fetch submissions");

      const data = await response.json();
      setSubmissions(data.data);
      setPagination(data.meta);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubmissions(1);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchSubmissions(1, searchTerm);
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    fetchSubmissions(newPage, searchTerm);
  };

  const deleteSubmission = async (id: string) => {
    if (!confirm("Are you sure you want to delete this submission?")) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/contacts/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
      });

      if (response.ok) {
        setSubmissions(submissions.filter(s => s._id !== id));
      } else {
        setError("Failed to delete submission");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  const statusTone = (status: string) =>
    status === "responded" ? "green" : status === "read" ? "yellow" : status === "archived" ? "gray" : "blue";
  const rowOffset = pagination ? (pagination.currentPage - 1) * 10 : 0;

  return (
    <SheetPage title="Contact Submissions" subtitle="Messages sent from the website contact form">
      {error && <SheetMessage>{error}</SheetMessage>}

      <SheetToolbar>
        <form onSubmit={handleSearch} className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
            <Search className="absolute left-2.5 top-2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search name, email or subject..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`${sheetInput} w-full pl-8`}
            />
          </div>
          <SheetButton type="submit" tone="success">Search</SheetButton>
          {searchTerm && (
            <SheetButton
              onClick={() => {
                setSearchTerm("");
                setPage(1);
                fetchSubmissions(1, "");
              }}
            >
              Clear
            </SheetButton>
          )}
        </form>
      </SheetToolbar>

      {loading ? (
        <SheetTable toolbar count={0}>
          <tbody>
            <tr><td><SheetLoading /></td></tr>
          </tbody>
        </SheetTable>
      ) : (
        <SheetTable
          toolbar
          count={pagination?.totalItems ?? submissions.length}
          footer={
            pagination && pagination.totalPages > 1 ? (
              <span className="flex items-center gap-2">
                Page {pagination.currentPage} of {pagination.totalPages}
                <SheetButton onClick={() => handlePageChange(page - 1)} disabled={page === 1}>Prev</SheetButton>
                <SheetButton onClick={() => handlePageChange(page + 1)} disabled={page === pagination.totalPages}>Next</SheetButton>
              </span>
            ) : null
          }
        >
          <Thead>
            <Th>Name</Th>
            <Th>Email</Th>
            <Th>Subject</Th>
            <Th className="w-28">Status</Th>
            <Th className="w-24 text-center">Actions</Th>
          </Thead>
          <tbody>
            {submissions.length === 0 ? (
              <EmptyRow colSpan={5}>No submissions found</EmptyRow>
            ) : (
              submissions.map((submission, index) => (
                <Tr key={submission._id} n={rowOffset + index + 1}>
                  <Td className="font-medium">{submission.name}</Td>
                  <Td className="text-slate-600">{submission.email}</Td>
                  <Td className="max-w-[260px] truncate text-slate-600" >{submission.subject}</Td>
                  <Td>
                    <Pill tone={statusTone(submission.status)}>
                      {submission.status.charAt(0).toUpperCase() + submission.status.slice(1)}
                    </Pill>
                  </Td>
                  <Td>
                    <div className="flex items-center justify-center gap-1.5">
                      <Link
                        href={`/admin/contacts/${submission._id}`}
                        className="rounded-md border border-slate-300 bg-white p-1.5 text-blue-600 hover:bg-blue-50"
                        title="View"
                      >
                        <Eye className="h-4 w-4" />
                      </Link>
                      <button
                        onClick={() => deleteSubmission(submission._id)}
                        className="rounded-md border border-red-200 bg-red-50 p-1.5 text-red-600 hover:bg-red-100"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </Td>
                </Tr>
              ))
            )}
          </tbody>
        </SheetTable>
      )}
    </SheetPage>
  );
};

export default ContactsPage;
