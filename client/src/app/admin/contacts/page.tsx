"use client";

import { useState, useEffect } from "react";
import { Search, Eye, Trash2 } from "lucide-react";
import Link from "next/link";
import { motion } from "framer-motion";

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
    } catch (err: any) {
      setError(err.message);
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
    } catch (err: any) {
      setError(err.message);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { bg: string; text: string }> = {
      new: { bg: "bg-blue-100", text: "text-blue-700" },
      read: { bg: "bg-yellow-100", text: "text-yellow-700" },
      responded: { bg: "bg-green-100", text: "text-green-700" },
      archived: { bg: "bg-gray-100", text: "text-gray-700" }
    };
    const colors = statusMap[status] || statusMap.new;
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${colors.bg} ${colors.text}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  return (
    <div className="h-full bg-slate-50 rounded-xl">
      <div className="max-w-6xl mx-auto px-4 py-8 w-full">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Contact Submissions</h1>
          <p className="text-slate-600 mt-1 text-sm">Manage user inquiries easily</p>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 mb-6">
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-emerald-500 text-white text-sm rounded-md hover:bg-emerald-600 transition"
            >
              Search
            </button>
          </form>
        </div>

        {error && (
          <div className="bg-red-50 text-red-700 p-3 rounded-md mb-4 border border-red-200 text-sm">
            {error}
          </div>
        )}

        <div className="bg-white rounded-lg shadow-sm border border-slate-200">
          {loading ? (
            <div className="p-6 text-center text-sm text-slate-600">Loading...</div>
          ) : submissions.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-600">No submissions found</div>
          ) : (
            <div className="w-full overflow-hidden">
              <table className="w-full text-left border-collapse table-fixed">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-700 w-1/4">Name</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-700 w-1/4 hidden sm:table-cell">Email</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-700 w-1/4 hidden md:table-cell">Subject</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-700 w-24">Status</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-700 w-24">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-sm">
                  {submissions.map((submission) => (
                    <tr key={submission._id} className="hover:bg-slate-50 transition">
                      <td className="px-4 py-3 text-slate-900 font-medium truncate">{submission.name}</td>
                      <td className="px-4 py-3 text-slate-600 truncate hidden sm:table-cell">{submission.email}</td>
                      <td className="px-4 py-3 text-slate-600 truncate hidden md:table-cell">{submission.subject}</td>
                      <td className="px-4 py-3">{getStatusBadge(submission.status)}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <Link
                            href={`/admin/contacts/${submission._id}`}
                            className="p-1.5 bg-blue-50 text-blue-600 rounded hover:bg-blue-100 transition"
                            title="View"
                          >
                            <Eye className="w-4 h-4" />
                          </Link>
                          <button
                            onClick={() => deleteSubmission(submission._id)}
                            className="p-1.5 bg-red-50 text-red-600 rounded hover:bg-red-100 transition"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {pagination && pagination.totalPages > 1 && (
                <div className="px-4 py-3 border-t border-slate-200 flex justify-between items-center text-sm">
                  <span className="text-slate-600">
                    Page {pagination.currentPage} of {pagination.totalPages}
                  </span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => handlePageChange(page - 1)}
                      disabled={page === 1}
                      className="px-3 py-1 border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-50"
                    >
                      Prev
                    </button>
                    <button
                      onClick={() => handlePageChange(page + 1)}
                      disabled={page === pagination.totalPages}
                      className="px-3 py-1 border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ContactsPage;

