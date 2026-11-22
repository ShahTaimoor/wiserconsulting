"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Pencil, Trash2, Plus } from "lucide-react";
import { approvedVisaService, ApprovedVisa } from "@/services/approvedVisaService";
import { SheetPage, SheetToolbar, SheetTable, SheetMessage, SheetLoading, SheetButton, Thead, Th, Tr, Td, EmptyRow, Pill, sheetInput } from "@/components/admin/Sheet";
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
      <SheetPage title="Approved Visas">
        <SheetLoading label="Loading approved visas..." />
      </SheetPage>
    );
  }

  if (error) {
    return (
      <SheetPage title="Approved Visas">
        <SheetMessage>{error}</SheetMessage>
      </SheetPage>
    );
  }

  return (
    <>
      <SheetPage
        title="Approved Visas"
        subtitle="Visas shown on the public website. Hidden rows are not shown to visitors."
        actions={
          <SheetButton tone="primary" onClick={openAddModal} className="px-3 py-1.5">
            <Plus className="h-4 w-4" /> Add Approved Visa
          </SheetButton>
        }
      >
        <SheetTable count={visas.length} unit="visas" minWidth={860}>
          <Thead>
            <Th className="w-16">Photo</Th>
            <Th>Client</Th>
            <Th>Country</Th>
            <Th>Visa type</Th>
            <Th>Approved in</Th>
            <Th className="w-28">Website</Th>
            <Th className="w-44 text-center">Actions</Th>
          </Thead>
          <tbody>
            {visas.length === 0 ? (
              <EmptyRow colSpan={7}>No approved visas yet. Click &quot;Add Approved Visa&quot; to create the first one.</EmptyRow>
            ) : (
              visas.map((visa, index) => (
                <Tr key={visa._id} n={index + 1} muted={!visa.isActive}>
                  <Td>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={visa.clientPhotoUrl} alt={visa.clientName} className="h-10 w-10 rounded object-cover" />
                  </Td>
                  <Td className="font-medium">{visa.clientName}</Td>
                  <Td>
                    <span className="inline-flex items-center gap-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={visa.countryFlagUrl} alt="" className="h-4 w-6 rounded-sm border border-slate-200 object-cover" />
                      {visa.countryName}
                    </span>
                  </Td>
                  <Td>{visa.visaType || "-"}</Td>
                  <Td className="text-slate-600">{visa.note || "-"}</Td>
                  <Td>{visa.isActive ? <Pill tone="green">Visible</Pill> : <Pill tone="gray">Hidden</Pill>}</Td>
                  <Td>
                    <div className="flex items-center justify-center gap-1.5">
                      <SheetButton onClick={() => handleToggleActive(visa)} disabled={togglingId === visa._id} tone={visa.isActive ? "neutral" : "success"}>
                        {visa.isActive ? "Hide" : "Show"}
                      </SheetButton>
                      <SheetButton tone="dark" onClick={() => openEditModal(visa)} aria-label="Edit" title="Edit">
                        <Pencil className="h-3.5 w-3.5" />
                      </SheetButton>
                      <SheetButton
                        tone={pendingDeleteId === visa._id ? "primary" : "danger"}
                        className={pendingDeleteId === visa._id ? "!bg-red-600 hover:!bg-red-700" : ""}
                        onClick={() => handleDeleteClick(visa._id)}
                        onBlur={() => setPendingDeleteId((current) => (current === visa._id ? null : current))}
                        aria-label={pendingDeleteId === visa._id ? "Confirm delete" : "Delete"}
                        title={pendingDeleteId === visa._id ? "Click again to confirm delete" : "Delete"}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {pendingDeleteId === visa._id && "Confirm"}
                      </SheetButton>
                    </div>
                  </Td>
                </Tr>
              ))
            )}
          </tbody>
        </SheetTable>
      </SheetPage>

      <ApprovedVisaFormModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSaved={handleSaved}
        editingVisa={editingVisa}
      />
    </>
  );
};

export default AdminApprovedVisas;
