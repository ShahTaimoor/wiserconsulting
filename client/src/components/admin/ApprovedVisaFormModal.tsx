"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Upload, X, Loader2 } from "lucide-react";
import { approvedVisaService, ApprovedVisa } from "@/services/approvedVisaService";

interface ApprovedVisaFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  editingVisa: ApprovedVisa | null;
}

interface FormState {
  clientName: string;
  countryName: string;
  visaType: string;
  approvalDate: string;
  note: string;
  displayOrder: number;
  isActive: boolean;
}

const emptyForm: FormState = {
  clientName: "",
  countryName: "",
  visaType: "",
  approvalDate: "",
  note: "",
  displayOrder: 0,
  isActive: true,
};

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB, matches AdminSettingsForm's logo limit

const ApprovedVisaFormModal = ({ isOpen, onClose, onSaved, editingVisa }: ApprovedVisaFormModalProps) => {
  const [mounted, setMounted] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(false);

  const [clientPhotoFile, setClientPhotoFile] = useState<File | null>(null);
  const [clientPhotoPreview, setClientPhotoPreview] = useState<string>("");
  const [countryFlagFile, setCountryFlagFile] = useState<File | null>(null);
  const [countryFlagPreview, setCountryFlagPreview] = useState<string>("");

  useEffect(() => {
    setMounted(true);
  }, []);

  // Reset/prefill form whenever the modal opens for a different entry
  useEffect(() => {
    if (!isOpen) return;

    if (editingVisa) {
      setForm({
        clientName: editingVisa.clientName,
        countryName: editingVisa.countryName,
        visaType: editingVisa.visaType || "",
        approvalDate: editingVisa.approvalDate ? editingVisa.approvalDate.slice(0, 10) : "",
        note: editingVisa.note || "",
        displayOrder: editingVisa.displayOrder,
        isActive: editingVisa.isActive,
      });
      setClientPhotoPreview(editingVisa.clientPhotoUrl);
      setCountryFlagPreview(editingVisa.countryFlagUrl);
    } else {
      setForm(emptyForm);
      setClientPhotoPreview("");
      setCountryFlagPreview("");
    }
    setClientPhotoFile(null);
    setCountryFlagFile(null);
  }, [isOpen, editingVisa]);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const validateImageFile = (file: File): boolean => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return false;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      toast.error("File size must be less than 5MB");
      return false;
    }
    return true;
  };

  const handleClientPhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!validateImageFile(file)) return;

    setClientPhotoFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setClientPhotoPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleCountryFlagChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!validateImageFile(file)) return;

    setCountryFlagFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setCountryFlagPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!editingVisa && (!clientPhotoFile || !countryFlagFile)) {
      toast.error("Both client photo and country flag images are required");
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        throw new Error("No authentication token found - please log in again");
      }

      const payload = {
        clientName: form.clientName,
        countryName: form.countryName,
        visaType: form.visaType,
        approvalDate: form.approvalDate,
        note: form.note,
        displayOrder: form.displayOrder,
        isActive: form.isActive,
        clientPhoto: clientPhotoFile,
        countryFlag: countryFlagFile,
      };

      if (editingVisa) {
        await approvedVisaService.update(editingVisa._id, payload, token);
        toast.success("Approved visa updated successfully");
      } else {
        await approvedVisaService.create(payload, token);
        toast.success("Approved visa created successfully");
      }

      onSaved();
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save approved visa";
      toast.error(message);
      console.error("Approved visa save error:", error);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !mounted) return null;

  return (
    <div
      className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-hidden"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-xl z-10 shrink-0">
          <h2 className="text-lg font-bold text-gray-800">
            {editingVisa ? "Edit Approved Visa" : "Add Approved Visa"}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium mb-2">Client Name</label>
              <input
                type="text"
                name="clientName"
                value={form.clientName}
                onChange={handleInputChange}
                required
                placeholder="e.g. Jane Doe"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Country Name</label>
              <input
                type="text"
                name="countryName"
                value={form.countryName}
                onChange={handleInputChange}
                required
                placeholder="e.g. Canada"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Visa Type</label>
              <input
                type="text"
                name="visaType"
                value={form.visaType}
                onChange={handleInputChange}
                placeholder="e.g. Student, Work, Family, Tourist"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Approval Date</label>
              <input
                type="date"
                name="approvalDate"
                value={form.approvalDate}
                onChange={handleInputChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Display Order</label>
              <input
                type="number"
                name="displayOrder"
                value={form.displayOrder}
                onChange={(e) => setForm((prev) => ({ ...prev, displayOrder: Number(e.target.value) }))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex items-center gap-3 pt-7">
              <input
                type="checkbox"
                id="isActive"
                checked={form.isActive}
                onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))}
                className="h-4 w-4 rounded border-gray-300"
              />
              <label htmlFor="isActive" className="text-sm font-medium">
                Visible on public site
              </label>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Note</label>
            <textarea
              name="note"
              value={form.note}
              onChange={handleInputChange}
              rows={2}
              placeholder='e.g. "Approved in just 3 weeks!"'
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium mb-2">
                Client Photo {!editingVisa && <span className="text-red-500">*</span>}
              </label>
              <div className="flex gap-3">
                <label className="flex-1 flex items-center justify-center px-4 py-6 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-500 transition">
                  <div className="text-center">
                    <Upload className="h-6 w-6 mx-auto mb-1 text-gray-400" />
                    <span className="text-xs text-gray-600">Click to upload</span>
                  </div>
                  <input type="file" accept="image/*" onChange={handleClientPhotoChange} className="hidden" />
                </label>

                {clientPhotoPreview && (
                  <div className="relative w-20 h-20 shrink-0">
                    <img
                      src={clientPhotoPreview}
                      alt="Client preview"
                      className="w-full h-full object-cover rounded-lg border border-gray-300"
                    />
                    <button
                      type="button"
                      onClick={() => { setClientPhotoPreview(""); setClientPhotoFile(null); }}
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Country Flag {!editingVisa && <span className="text-red-500">*</span>}
              </label>
              <div className="flex gap-3">
                <label className="flex-1 flex items-center justify-center px-4 py-6 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-500 transition">
                  <div className="text-center">
                    <Upload className="h-6 w-6 mx-auto mb-1 text-gray-400" />
                    <span className="text-xs text-gray-600">Click to upload</span>
                  </div>
                  <input type="file" accept="image/*" onChange={handleCountryFlagChange} className="hidden" />
                </label>

                {countryFlagPreview && (
                  <div className="relative w-20 h-20 shrink-0">
                    <img
                      src={countryFlagPreview}
                      alt="Country flag preview"
                      className="w-full h-full object-cover rounded-lg border border-gray-300"
                    />
                    <button
                      type="button"
                      onClick={() => { setCountryFlagPreview(""); setCountryFlagFile(null); }}
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

          <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 shrink-0 bg-white rounded-b-xl">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 transition disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {editingVisa ? "Save Changes" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ApprovedVisaFormModal;
