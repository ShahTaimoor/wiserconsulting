"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Pencil, Trash2, Plus, Star } from "lucide-react";
import { testimonialService, Testimonial } from "@/services/testimonialService";
import { SheetPage, SheetToolbar, SheetTable, SheetMessage, SheetLoading, SheetButton, Thead, Th, Tr, Td, EmptyRow, Pill, sheetInput } from "@/components/admin/Sheet";
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
      <SheetPage title="Client Testimonials">
        <SheetLoading label="Loading testimonials..." />
      </SheetPage>
    );
  }

  if (error) {
    return (
      <SheetPage title="Client Testimonials">
        <SheetMessage>{error}</SheetMessage>
      </SheetPage>
    );
  }

  return (
    <>
      <SheetPage
        title="Client Testimonials"
        subtitle="Reviews shown on the public website. Hidden rows are not shown to visitors."
        actions={
          <SheetButton tone="primary" onClick={openAddModal} className="px-3 py-1.5">
            <Plus className="h-4 w-4" /> Add Testimonial
          </SheetButton>
        }
      >
        <SheetTable count={testimonials.length} unit="testimonials" minWidth={900}>
          <Thead>
            <Th className="w-16">Photo</Th>
            <Th>Client</Th>
            <Th>Role</Th>
            <Th className="w-20">Rating</Th>
            <Th>Review</Th>
            <Th className="w-28">Website</Th>
            <Th className="w-44 text-center">Actions</Th>
          </Thead>
          <tbody>
            {testimonials.length === 0 ? (
              <EmptyRow colSpan={7}>No testimonials yet. Click &quot;Add Testimonial&quot; to create the first one.</EmptyRow>
            ) : (
              testimonials.map((testimonial, index) => (
                <Tr key={testimonial._id} n={index + 1} muted={!testimonial.isActive}>
                  <Td>
                    {testimonial.clientPhotoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={testimonial.clientPhotoUrl} alt={testimonial.clientName} className="h-10 w-10 rounded object-cover" />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded bg-slate-200 text-xs font-bold text-slate-500">
                        {getInitials(testimonial.clientName)}
                      </div>
                    )}
                  </Td>
                  <Td className="font-medium">{testimonial.clientName}</Td>
                  <Td className="text-slate-600">{testimonial.roleOrCaption || "-"}</Td>
                  <Td>
                    <span className="inline-flex items-center gap-1 font-semibold">
                      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                      {testimonial.rating}
                    </span>
                  </Td>
                  <Td className="max-w-[320px]">
                    <span className="line-clamp-2 text-slate-600">{testimonial.reviewText}</span>
                  </Td>
                  <Td>{testimonial.isActive ? <Pill tone="green">Visible</Pill> : <Pill tone="gray">Hidden</Pill>}</Td>
                  <Td>
                    <div className="flex items-center justify-center gap-1.5">
                      <SheetButton onClick={() => handleToggleActive(testimonial)} disabled={togglingId === testimonial._id} tone={testimonial.isActive ? "neutral" : "success"}>
                        {testimonial.isActive ? "Hide" : "Show"}
                      </SheetButton>
                      <SheetButton tone="dark" onClick={() => openEditModal(testimonial)} aria-label="Edit" title="Edit">
                        <Pencil className="h-3.5 w-3.5" />
                      </SheetButton>
                      <SheetButton
                        tone={pendingDeleteId === testimonial._id ? "primary" : "danger"}
                        className={pendingDeleteId === testimonial._id ? "!bg-red-600 hover:!bg-red-700" : ""}
                        onClick={() => handleDeleteClick(testimonial._id)}
                        onBlur={() => setPendingDeleteId((current) => (current === testimonial._id ? null : current))}
                        aria-label={pendingDeleteId === testimonial._id ? "Confirm delete" : "Delete"}
                        title={pendingDeleteId === testimonial._id ? "Click again to confirm delete" : "Delete"}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {pendingDeleteId === testimonial._id && "Confirm"}
                      </SheetButton>
                    </div>
                  </Td>
                </Tr>
              ))
            )}
          </tbody>
        </SheetTable>
      </SheetPage>

      <TestimonialFormModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSaved={handleSaved}
        editingTestimonial={editingTestimonial}
      />
    </>
  );
};

export default AdminTestimonials;
