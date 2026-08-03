"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Pencil, Trash2, Plus, BadgeCheck, BadgeX } from "lucide-react";
import { approvedVisaService, ApprovedVisa } from "@/services/approvedVisaService";
import ApprovedVisaFormModal from "@/components/admin/ApprovedVisaFormModal";

const AdminApprovedVisas = () => {
  const [mounted, setMounted] = useState(false);
  const [visas, setVisas] = useState<ApprovedVisa[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingVisa, setEditingVisa] = useState<ApprovedVisa | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const loadVisas = async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      setError("No authentication token found - please log in again");
      setLoading(false);
      return;
    }

    try {
      const data = await approvedVisaService.getAllForAdmin(token);
      setVisas(data);
      setError("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load approved visas";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!mounted) return;
    loadVisas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  const openAddModal = () => {
    setEditingVisa(null);
    setShowModal(true);
  };

  const openEditModal = (visa: ApprovedVisa) => {
    setEditingVisa(visa);
    setShowModal(true);
  };

  const handleSaved = () => {
    loadVisas();
  };

  const handleToggleActive = async (visa: ApprovedVisa) => {
    const token = localStorage.getItem("token");
    if (!token) {
      toast.error("No authentication token found - please log in again");
      return;
    }

    setTogglingId(visa._id);
    try {
      await approvedVisaService.update(visa._id, { isActive: !visa.isActive }, token);
      toast.success(`Marked as ${!visa.isActive ? "visible" : "hidden"} on public site`);
      await loadVisas();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update visibility";
      toast.error(message);
    } finally {
      setTogglingId(null);
    }
  };

  // Two-step delete: first click arms confirmation, second click (within the
  // same row) actually deletes — mirrors the window.confirm() pattern used
  // elsewhere in the admin panel, just inline instead of a native dialog.
  const handleDeleteClick = (visaId: string) => {
    if (pendingDeleteId !== visaId) {
      setPendingDeleteId(visaId);
      return;
    }
    void confirmDelete(visaId);
  };

  const confirmDelete = async (visaId: string) => {
    const token = localStorage.getItem("token");
    if (!token) {
      toast.error("No authentication token found - please log in again");
      return;
    }

    try {
      await approvedVisaService.remove(visaId, token);
      toast.success("Approved visa deleted successfully");
      setPendingDeleteId(null);
      await loadVisas();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete approved visa";
      toast.error(message);
    }
  };

  if (!mounted || loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading approved visas...</p>
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
            <h1 className="text-xl sm:text-2xl font-bold text-gray-800">Approved Visas</h1>
            <button
              onClick={openAddModal}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
            >
              <Plus className="h-4 w-4" />
              Add Approved Visa
            </button>
          </div>

          {visas.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              No approved visas yet. Click &quot;Add Approved Visa&quot; to create the first one.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {visas.map((visa) => (
                <div
                  key={visa._id}
                  className={`relative rounded-xl border overflow-hidden bg-white shadow-sm transition ${
                    visa.isActive ? "border-slate-200" : "border-slate-200 opacity-60"
                  }`}
                >
                  <div className="relative h-40 w-full bg-slate-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={visa.clientPhotoUrl}
                      alt={visa.clientName}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-2 right-2 h-8 w-8 rounded-full overflow-hidden border-2 border-white shadow-md bg-white">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={visa.countryFlagUrl}
                        alt={visa.countryName}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="absolute top-2 left-2">
                      {visa.isActive ? (
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
                    <h3 className="font-bold text-gray-900 truncate">{visa.clientName}</h3>
                    <p className="text-sm text-gray-500 truncate">{visa.countryName}{visa.visaType ? ` · ${visa.visaType}` : ""}</p>
                    {visa.note && (
                      <p className="mt-1 text-xs text-gray-400 line-clamp-2">{visa.note}</p>
                    )}

                    <div className="mt-4 flex items-center gap-2">
                      <button
                        onClick={() => handleToggleActive(visa)}
                        disabled={togglingId === visa._id}
                        className={`flex-1 px-3 py-1.5 text-xs font-bold rounded-lg transition disabled:opacity-50 ${
                          visa.isActive
                            ? "bg-slate-100 text-slate-700 hover:bg-slate-200"
                            : "bg-green-600 text-white hover:bg-green-700"
                        }`}
                      >
                        {visa.isActive ? "Hide" : "Show"}
                      </button>
                      <button
                        onClick={() => openEditModal(visa)}
                        className="p-1.5 bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition"
                        aria-label="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteClick(visa._id)}
                        onBlur={() => setPendingDeleteId((current) => (current === visa._id ? null : current))}
                        className={`p-1.5 rounded-lg transition ${
                          pendingDeleteId === visa._id
                            ? "bg-red-600 text-white hover:bg-red-700"
                            : "bg-red-50 text-red-600 hover:bg-red-100"
                        }`}
                        aria-label={pendingDeleteId === visa._id ? "Confirm delete" : "Delete"}
                        title={pendingDeleteId === visa._id ? "Click again to confirm delete" : "Delete"}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {pendingDeleteId === visa._id && (
                      <p className="mt-2 text-[11px] text-red-600 font-medium">Click delete again to confirm.</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <ApprovedVisaFormModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSaved={handleSaved}
        editingVisa={editingVisa}
      />
    </div>
  );
};

export default AdminApprovedVisas;
