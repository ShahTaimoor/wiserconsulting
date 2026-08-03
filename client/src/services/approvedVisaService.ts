export interface ApprovedVisa {
  _id: string;
  clientPhotoUrl: string;
  clientPhotoPublicId: string;
  clientName: string;
  countryName: string;
  countryFlagUrl: string;
  countryFlagPublicId: string;
  visaType?: string;
  approvalDate?: string;
  note?: string;
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ApprovedVisaFormInput {
  clientName: string;
  countryName: string;
  visaType?: string;
  approvalDate?: string;
  note?: string;
  displayOrder?: number;
  isActive?: boolean;
  clientPhoto?: File | null;
  countryFlag?: File | null;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

const assertResponse = async (response: Response) => {
  const json = await response.json();
  if (!response.ok) {
    throw new Error(json?.message || "Request failed");
  }
  return json;
};

const buildFormData = (input: Partial<ApprovedVisaFormInput>): FormData => {
  const formData = new FormData();
  if (input.clientName !== undefined) formData.append("clientName", input.clientName);
  if (input.countryName !== undefined) formData.append("countryName", input.countryName);
  if (input.visaType !== undefined) formData.append("visaType", input.visaType);
  if (input.approvalDate !== undefined) formData.append("approvalDate", input.approvalDate);
  if (input.note !== undefined) formData.append("note", input.note);
  if (input.displayOrder !== undefined) formData.append("displayOrder", String(input.displayOrder));
  if (input.isActive !== undefined) formData.append("isActive", String(input.isActive));
  if (input.clientPhoto) formData.append("clientPhoto", input.clientPhoto);
  if (input.countryFlag) formData.append("countryFlag", input.countryFlag);
  return formData;
};

export const approvedVisaService = {
  async getPublicList(): Promise<ApprovedVisa[]> {
    const response = await fetch(`${API_URL}/approved-visas`, { cache: "no-store" });
    const json = await assertResponse(response);
    return json.data;
  },

  async getAllForAdmin(token: string): Promise<ApprovedVisa[]> {
    const response = await fetch(`${API_URL}/approved-visas/all`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await assertResponse(response);
    return json.data;
  },

  async getById(id: string, token: string): Promise<ApprovedVisa> {
    const response = await fetch(`${API_URL}/approved-visas/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await assertResponse(response);
    return json.data;
  },

  async create(input: ApprovedVisaFormInput, token: string): Promise<ApprovedVisa> {
    const response = await fetch(`${API_URL}/approved-visas`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: buildFormData(input),
    });
    const json = await assertResponse(response);
    return json.data;
  },

  async update(id: string, input: Partial<ApprovedVisaFormInput>, token: string): Promise<ApprovedVisa> {
    const response = await fetch(`${API_URL}/approved-visas/${id}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}` },
      body: buildFormData(input),
    });
    const json = await assertResponse(response);
    return json.data;
  },

  async remove(id: string, token: string): Promise<void> {
    const response = await fetch(`${API_URL}/approved-visas/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    await assertResponse(response);
  },
};
