export interface Testimonial {
  _id: string;
  clientPhotoUrl: string | null;
  clientPhotoPublicId: string | null;
  clientName: string;
  rating: number;
  reviewText: string;
  roleOrCaption?: string;
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TestimonialFormInput {
  clientName: string;
  rating: number;
  reviewText: string;
  roleOrCaption?: string;
  displayOrder?: number;
  isActive?: boolean;
  clientPhoto?: File | null;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

const assertResponse = async (response: Response) => {
  const json = await response.json();
  if (!response.ok) {
    throw new Error(json?.message || "Request failed");
  }
  return json;
};

const buildFormData = (input: Partial<TestimonialFormInput>): FormData => {
  const formData = new FormData();
  if (input.clientName !== undefined) formData.append("clientName", input.clientName);
  if (input.rating !== undefined) formData.append("rating", String(input.rating));
  if (input.reviewText !== undefined) formData.append("reviewText", input.reviewText);
  if (input.roleOrCaption !== undefined) formData.append("roleOrCaption", input.roleOrCaption);
  if (input.displayOrder !== undefined) formData.append("displayOrder", String(input.displayOrder));
  if (input.isActive !== undefined) formData.append("isActive", String(input.isActive));
  if (input.clientPhoto) formData.append("clientPhoto", input.clientPhoto);
  return formData;
};

export const testimonialService = {
  async getPublicList(): Promise<Testimonial[]> {
    const response = await fetch(`${API_URL}/testimonials`, { cache: "no-store" });
    const json = await assertResponse(response);
    return json.data;
  },

  async getAllForAdmin(token: string): Promise<Testimonial[]> {
    const response = await fetch(`${API_URL}/testimonials/all`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await assertResponse(response);
    return json.data;
  },

  async getById(id: string, token: string): Promise<Testimonial> {
    const response = await fetch(`${API_URL}/testimonials/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await assertResponse(response);
    return json.data;
  },

  async create(input: TestimonialFormInput, token: string): Promise<Testimonial> {
    const response = await fetch(`${API_URL}/testimonials`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: buildFormData(input),
    });
    const json = await assertResponse(response);
    return json.data;
  },

  async update(id: string, input: Partial<TestimonialFormInput>, token: string): Promise<Testimonial> {
    const response = await fetch(`${API_URL}/testimonials/${id}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}` },
      body: buildFormData(input),
    });
    const json = await assertResponse(response);
    return json.data;
  },

  async remove(id: string, token: string): Promise<void> {
    const response = await fetch(`${API_URL}/testimonials/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    await assertResponse(response);
  },
};
