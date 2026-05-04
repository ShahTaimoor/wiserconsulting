import axios from "axios";

interface AdminSettings {
    websiteTitle: string;
    email: string;
    phone: string;
    address: string;
    siteLogo?: string;
    socialLinks?: {
        facebook?: string;
        twitter?: string;
        linkedin?: string;
        instagram?: string;
    };
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

export const adminSettingsService = {
    /**
     * Get public admin settings (no auth required)
     */
    async getPublicSettings(): Promise<AdminSettings> {
        try {
            const response = await axios.get(`${API_URL}/admin-settings/public`);
            return response.data.data || {
                websiteTitle: "Wiser Consulting",
                email: "",
                phone: "",
                address: "",
                siteLogo: "",
                socialLinks: {},
            };
        } catch (error) {
            console.error("Error fetching public settings:", error);
            return {
                websiteTitle: "Wiser Consulting",
                email: "",
                phone: "",
                address: "",
                siteLogo: "",
                socialLinks: {},
            };
        }
    },

    /**
     * Get admin settings (requires authentication)
     */
    async getSettings(token: string): Promise<AdminSettings> {
        try {
            const response = await axios.get(`${API_URL}/admin-settings`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });
            return response.data.data;
        } catch (error) {
            console.error("Error fetching admin settings:", error);
            throw error;
        }
    },

    /**
     * Update admin settings
     */
    async updateSettings(
        settings: Partial<AdminSettings>,
        token: string
    ): Promise<AdminSettings> {
        try {
            const response = await axios.put(
                `${API_URL}/admin-settings`,
                settings,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                }
            );
            return response.data.data;
        } catch (error) {
            console.error("Error updating admin settings:", error);
            throw error;
        }
    },

    /**
     * Upload logo
     */
    async uploadLogo(
        file: File,
        token: string
    ): Promise<AdminSettings> {
        try {
            const formData = new FormData();
            formData.append("logo", file);

            const response = await axios.post(
                `${API_URL}/admin-settings/logo/upload`,
                formData,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "multipart/form-data",
                    },
                }
            );
            return response.data.data;
        } catch (error) {
            console.error("Error uploading logo:", error);
            throw error;
        }
    },

    /**
     * Delete logo
     */
    async deleteLogo(token: string): Promise<AdminSettings> {
        try {
            const response = await axios.delete(
                `${API_URL}/admin-settings/logo`,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                }
            );
            return response.data.data;
        } catch (error) {
            console.error("Error deleting logo:", error);
            throw error;
        }
    },
};
