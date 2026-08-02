"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Pencil, Trash2, Plus, BadgeCheck, BadgeX, Star } from "lucide-react";
import { testimonialService, Testimonial } from "@/services/testimonialService";
import TestimonialFormModal from "@/components/admin/TestimonialFormModal";
import { getInitials } from "@/lib/utils";

const AdminTestimonials = () => {
  const [mounted, setMounted] = useState(false);
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingTestimonial, setEditingTestimonial] = useState<Testimonial | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const loadTestimonials = async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      setError("No authentication token found - please log in again");
      setLoading(false);
      return;
    }

    try {
      const data = await testimonialService.getAllForAdmin(token);
      setTestimonials(data);
      setError("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load testimonials";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!mounted) return;
    loadTestimonials();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  const openAddModal = () => {
    setEditingTestimonial(null);
    setShowModal(true);
  };

  const openEditModal = (testimonial: Testimonial) => {
    setEditingTestimonial(testimonial);
    setShowModal(true);
  };

  const handleSaved = () => {
    loadTestimonials();
  };

  const handleToggleActive = async (testimonial: Testimonial) => {
    const token = localStorage.getItem("token");
    if (!token) {
      toast.error("No authentication token found - please log in again");
      return;
    }

    setTogglingId(testimonial._id);
    try {
      await testimonialService.update(testimonial._id, { isActive: !testimonial.isActive }, token);
      toast.success(`Marked as ${!testimonial.isActive ? "visible" : "hidden"} on public site`);
      await loadTestimonials();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update visibility";
      toast.error(message);
    } finally {
      setTogglingId(null);
    }
  };

  // Two-step delete: first click arms confirmation, second click (within the
  // same row) actually deletes — mirrors the pattern used in Approved Visas.
  const handleDeleteClick = (testimonialId: string) => {
    if (pendingDeleteId !== testimonialId) {
      setPendingDeleteId(testimonialId);
      return;
    }
    void confirmDelete(testimonialId);
  };

  const confirmDelete = async (testimonialId: string) => {
    const token = localStorage.getItem("token");
    if (!token) {
      toast.error("No authentication token found - please log in again");
      return;
    }

    try {
      await testimonialService.remove(testimonialId, token);
      toast.success("Testimonial deleted successfully");
      setPendingDeleteId(null);
      await loadTestimonials();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete testimonial";
      toast.error(message);
    }
  };

  if (!mounted || loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading testimonials...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center"><p className="text-red-600">{error}</p></div>
      </div>
    );
  }

  return (
    <div className="h-full bg-gray-100 p-4 sm:p-6 rounded-xl w-full">
      <div className="max-w-7xl mx-auto w-full">
        <div className="bg-white rounded-lg shadow-md p-4 sm:p-6 mb-6 w-full">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-800">Client Testimonials</h1>
            <button
              onClick={openAddModal}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
            >
              <Plus className="h-4 w-4" />
              Add Testimonial
            </button>
          </div>

          {testimonials.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              No testimonials yet. Click &quot;Add Testimonial&quot; to create the first one.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {testimonials.map((testimonial) => (
                <div
                  key={testimonial._id}
                  className={`relative rounded-xl border overflow-hidden bg-white shadow-sm transition ${
                    testimonial.isActive ? "border-slate-200" : "border-slate-200 opacity-60"
                  }`}
                >
                  <div className="relative h-40 w-full bg-slate-100">
                    {testimonial.clientPhotoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={testimonial.clientPhotoUrl}
                        alt={testimonial.clientName}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-slate-200 text-2xl font-bold text-slate-500">
                        {getInitials(testimonial.clientName)}
                      </div>
                    )}
                    <div className="absolute top-2 right-2 flex items-center gap-1 rounded-full bg-white/95 px-2 py-1 text-[11px] font-bold text-slate-800 shadow-md">
                      <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                      {testimonial.rating}
                    </div>
                    <div className="absolute top-2 left-2">
                      {testimonial.isActive ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-800 text-[10px] font-bold uppercase tracking-wide">
                          <BadgeCheck className="h-3 w-3" /> Visible
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-200 text-slate-600 text-[10px] font-bold uppercase tracking-wide">
                          <BadgeX className="h-3 w-3" /> Hidden
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="p-4">
                    <h3 className="font-bold text-gray-900 truncate">{testimonial.clientName}</h3>
                    {testimonial.roleOrCaption && (
                      <p className="text-sm text-gray-500 truncate">{testimonial.roleOrCaption}</p>
                    )}
                    <p className="mt-1 text-xs text-gray-400 line-clamp-2">{testimonial.reviewText}</p>

                    <div className="mt-4 flex items-center gap-2">
                      <button
                        onClick={() => handleToggleActive(testimonial)}
                        disabled={togglingId === testimonial._id}
                        className={`flex-1 px-3 py-1.5 text-xs font-bold rounded-lg transition disabled:opacity-50 ${
                          testimonial.isActive
                            ? "bg-slate-100 text-slate-700 hover:bg-slate-200"
                            : "bg-green-600 text-white hover:bg-green-700"
                        }`}
                      >
                        {testimonial.isActive ? "Hide" : "Show"}
                      </button>
                      <button
                        onClick={() => openEditModal(testimonial)}
                        className="p-1.5 bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition"
                        aria-label="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteClick(testimonial._id)}
                        onBlur={() => setPendingDeleteId((current) => (current === testimonial._id ? null : current))}
                        className={`p-1.5 rounded-lg transition ${
                          pendingDeleteId === testimonial._id
                            ? "bg-red-600 text-white hover:bg-red-700"
                            : "bg-red-50 text-red-600 hover:bg-red-100"
                        }`}
                        aria-label={pendingDeleteId === testimonial._id ? "Confirm delete" : "Delete"}
                        title={pendingDeleteId === testimonial._id ? "Click again to confirm delete" : "Delete"}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {pendingDeleteId === testimonial._id && (
                      <p className="mt-2 text-[11px] text-red-600 font-medium">Click delete again to confirm.</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <TestimonialFormModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSaved={handleSaved}
        editingTestimonial={editingTestimonial}
      />
    </div>
  );
};

export default AdminTestimonials;
