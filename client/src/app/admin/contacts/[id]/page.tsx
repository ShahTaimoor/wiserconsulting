"use client";

import { useState, useEffect } from "react";
import { ArrowLeft, Mail, Phone, Calendar, User, Send } from "lucide-react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useParams } from "next/navigation";

interface ContactSubmission {
  _id: string;
  name: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
  status: "new" | "read" | "responded" | "archived";
  createdAt: string;
  adminReply?: {
    message: string;
    repliedAt: string;
  };
}

const ContactDetailPage = () => {
  const params = useParams();
  const id = params.id as string;

  const [submission, setSubmission] = useState<ContactSubmission | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [replyMessage, setReplyMessage] = useState("");
  const [replyLoading, setReplyLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("");

  const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5000";

  // Fetch submission details
  useEffect(() => {
    const fetchSubmission = async () => {
      setLoading(true);
      setError("");

      try {
        const response = await fetch(`${API_BASE_URL}/api/contacts/${id}`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`
          }
        });

        if (!response.ok) {
          throw new Error("Failed to fetch submission");
        }

        const data = await response.json();
        setSubmission(data.data);
        setStatusFilter(data.data.status);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchSubmission();
    }
  }, [id]);

  const handleStatusChange = async (newStatus: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/contacts/${id}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify({ status: newStatus })
      });

      if (response.ok) {
        const data = await response.json();
        setSubmission(data.data);
        setStatusFilter(newStatus);
      } else {
        setError("Failed to update status");
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleReplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!replyMessage.trim()) {
      setError("Reply message cannot be empty");
      return;
    }

    setReplyLoading(true);
    setError("");

    try {
      const response = await fetch(`${API_BASE_URL}/api/contacts/${id}/reply`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify({ message: replyMessage })
      });

      if (response.ok) {
        const data = await response.json();
        setSubmission(data.data);
        setReplyMessage("");
        setStatusFilter("responded");
      } else {
        setError("Failed to send reply");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setReplyLoading(false);
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
      <span className={`inline-block px-4 py-2 rounded-lg text-sm font-semibold ${colors.bg} ${colors.text}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-slate-600">Loading submission details...</div>
      </div>
    );
  }

  if (error && !submission) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4">
        <div className="max-w-4xl mx-auto">
          <Link
            href="/admin/contacts"
            className="inline-flex items-center gap-2 text-emerald-600 hover:text-emerald-700 mb-4"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Submissions
          </Link>
          <div className="bg-red-50 text-red-700 p-4 rounded-lg border border-red-200">
            {error}
          </div>
        </div>
      </div>
    );
  }

  if (!submission) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4">
        <div className="max-w-4xl mx-auto">
          <Link
            href="/admin/contacts"
            className="inline-flex items-center gap-2 text-emerald-600 hover:text-emerald-700 mb-4"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Submissions
          </Link>
          <div className="text-slate-600">Submission not found</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <Link
            href="/admin/contacts"
            className="inline-flex items-center gap-2 text-emerald-600 hover:text-emerald-700 mb-4"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Submissions
          </Link>
          <h1 className="text-3xl font-bold text-slate-900">Contact Submission Details</h1>
        </motion.div>

        {/* Error Message */}
        {error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-red-50 text-red-700 p-4 rounded-lg mb-4 border border-red-200"
          >
            {error}
          </motion.div>
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Content */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="lg:col-span-2 space-y-6"
          >
            {/* Contact Info Card */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-bold text-slate-900 mb-4">Contact Information</h2>
              <div className="grid gap-4">
                <div className="flex items-start gap-4">
                  <User className="w-5 h-5 text-slate-400 mt-1 flex-shrink-0" />
                  <div>
                    <p className="text-sm text-slate-600">Name</p>
                    <p className="text-slate-900 font-medium">{submission.name}</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <Mail className="w-5 h-5 text-slate-400 mt-1 flex-shrink-0" />
                  <div>
                    <p className="text-sm text-slate-600">Email</p>
                    <p className="text-slate-900 font-medium">
                      <a href={`mailto:${submission.email}`} className="text-emerald-600 hover:underline">
                        {submission.email}
                      </a>
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <Phone className="w-5 h-5 text-slate-400 mt-1 flex-shrink-0" />
                  <div>
                    <p className="text-sm text-slate-600">Phone</p>
                    <p className="text-slate-900 font-medium">
                      <a href={`tel:${submission.phone}`} className="text-emerald-600 hover:underline">
                        {submission.phone}
                      </a>
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <Calendar className="w-5 h-5 text-slate-400 mt-1 flex-shrink-0" />
                  <div>
                    <p className="text-sm text-slate-600">Submitted</p>
                    <p className="text-slate-900 font-medium">
                      {new Date(submission.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Message Card */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-bold text-slate-900 mb-4">Message</h2>
              <div className="mb-4">
                <p className="text-sm text-slate-600 mb-2">Subject</p>
                <p className="text-slate-900 font-medium text-lg">{submission.subject}</p>
              </div>
              <div>
                <p className="text-sm text-slate-600 mb-2">Message</p>
                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 text-slate-900 whitespace-pre-wrap">
                  {submission.message}
                </div>
              </div>
            </div>

            {/* Admin Reply Card */}
            {submission.adminReply && (
              <div className="bg-green-50 rounded-lg shadow-sm border border-green-200 p-6">
                <h2 className="text-lg font-bold text-green-900 mb-4">Admin Response</h2>
                <div>
                  <p className="text-sm text-green-700 mb-2">
                    Replied on {new Date(submission.adminReply.repliedAt).toLocaleString()}
                  </p>
                  <div className="bg-white p-4 rounded-lg border border-green-200 text-slate-900 whitespace-pre-wrap">
                    {submission.adminReply.message}
                  </div>
                </div>
              </div>
            )}

            {/* Reply Form */}
            {submission.status !== "responded" && (
              <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
                <h2 className="text-lg font-bold text-slate-900 mb-4">Send Reply</h2>
                <form onSubmit={handleReplySubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm text-slate-700 font-medium mb-2">
                      Your Reply
                    </label>
                    <textarea
                      value={replyMessage}
                      onChange={(e) => setReplyMessage(e.target.value)}
                      placeholder="Type your response here..."
                      rows={6}
                      className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={replyLoading}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 disabled:bg-emerald-400 disabled:cursor-not-allowed transition"
                  >
                    <Send className="w-5 h-5" />
                    {replyLoading ? "Sending..." : "Send Reply"}
                  </button>
                </form>
              </div>
            )}
          </motion.div>

          {/* Sidebar */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* Status Card */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">Status</h3>
              <div className="mb-4">
                {getStatusBadge(statusFilter)}
              </div>
              <div className="space-y-2">
                {["new", "read", "responded", "archived"].map(status => (
                  <button
                    key={status}
                    onClick={() => handleStatusChange(status)}
                    className={`w-full px-4 py-2 rounded-lg transition text-sm font-medium ${
                      statusFilter === status
                        ? "bg-emerald-500 text-white"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    Mark as {status.charAt(0).toUpperCase() + status.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">Quick Actions</h3>
              <div className="space-y-2">
                <a
                  href={`mailto:${submission.email}`}
                  className="block px-4 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition text-sm font-medium text-center"
                >
                  Send Email
                </a>
                <a
                  href={`tel:${submission.phone}`}
                  className="block px-4 py-2 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition text-sm font-medium text-center"
                >
                  Call Client
                </a>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default ContactDetailPage;
