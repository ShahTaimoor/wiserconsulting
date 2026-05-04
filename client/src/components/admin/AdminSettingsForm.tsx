"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Upload, X, Loader2 } from "lucide-react";
import { useAppSelector } from "@/redux/hooks";

interface AdminSettings {
    _id?: string;
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

const AdminSettingsForm = () => {
    const { user, loading: authLoading } = useAppSelector((state) => state.auth);
    const [mounted, setMounted] = useState(false);
    const [settings, setSettings] = useState<AdminSettings>({
        websiteTitle: "",
        email: "",
        phone: "",
        address: "",
        socialLinks: {
            facebook: "",
            twitter: "",
            linkedin: "",
            instagram: "",
        },
    });

    const [loading, setLoading] = useState(false);
    const [initialLoading, setInitialLoading] = useState(true);
    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [logoPreview, setLogoPreview] = useState<string>("");
    const [uploadingLogo, setUploadingLogo] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    // Fetch current settings
    useEffect(() => {
        // Only fetch when component is mounted and user is authenticated
        if (!mounted || authLoading || !user) return;

        const fetchSettings = async () => {
            try {
                const token = localStorage.getItem("token");
                if (!token) {
                    throw new Error("No authentication token found - please log in again");
                }

                const response = await fetch(
                    `${process.env.NEXT_PUBLIC_API_URL}/admin-settings`,
                    {
                        headers: {
                            Authorization: `Bearer ${token}`,
                            "Content-Type": "application/json",
                        },
                    }
                );

                if (!response.ok) {
                    if (response.status === 401) {
                        // Clear invalid token
                        localStorage.removeItem("token");
                        localStorage.removeItem("user");
                        throw new Error("Authentication failed - please log in again");
                    }
                    throw new Error(`Failed to fetch settings: ${response.statusText}`);
                }

                const data = await response.json();
                if (data.success) {
                    setSettings(data.data);
                    if (data.data.siteLogo) {
                        setLogoPreview(data.data.siteLogo);
                    }
                } else {
                    throw new Error(data.message || "Failed to load settings");
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : "Failed to load settings";
                toast.error(errorMessage);
                console.error("Settings fetch error:", error);
            } finally {
                setInitialLoading(false);
            }
        };

        fetchSettings();
    }, [mounted, authLoading, user]);

    const handleInputChange = (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
    ) => {
        const { name, value } = e.target;
        setSettings((prev) => ({
            ...prev,
            [name]: value,
        }));
    };

    const handleSocialLinkChange = (
        e: React.ChangeEvent<HTMLInputElement>,
        platform: string
    ) => {
        const { value } = e.target;
        setSettings((prev) => ({
            ...prev,
            socialLinks: {
                ...prev.socialLinks,
                [platform]: value,
            },
        }));
    };

    const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            // Validate file type
            if (!file.type.startsWith("image/")) {
                toast.error("Please select an image file");
                return;
            }

            // Validate file size (max 5MB)
            if (file.size > 5 * 1024 * 1024) {
                toast.error("File size must be less than 5MB");
                return;
            }

            setLogoFile(file);
            const reader = new FileReader();
            reader.onloadend = () => {
                setLogoPreview(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const uploadLogo = async () => {
        if (!logoFile) return;

        setUploadingLogo(true);
        try {
            const token = localStorage.getItem("token");
            const formData = new FormData();
            formData.append("logo", logoFile);

            const response = await fetch(
                `${process.env.NEXT_PUBLIC_API_URL}/admin-settings/logo/upload`,
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                    body: formData,
                }
            );

            if (!response.ok) throw new Error("Failed to upload logo");

            const data = await response.json();
            if (data.success) {
                setSettings(data.data);
                setLogoFile(null);
                toast.success("Logo uploaded successfully");
            }
        } catch (error) {
            toast.error("Failed to upload logo");
            console.error(error);
        } finally {
            setUploadingLogo(false);
        }
    };

    const deleteLogo = async () => {
        if (!settings.siteLogo) return;

        try {
            const token = localStorage.getItem("token");
            const response = await fetch(
                `${process.env.NEXT_PUBLIC_API_URL}/admin-settings/logo`,
                {
                    method: "DELETE",
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "application/json",
                    },
                }
            );

            if (!response.ok) throw new Error("Failed to delete logo");

            const data = await response.json();
            if (data.success) {
                setSettings(data.data);
                setLogoPreview("");
                toast.success("Logo deleted successfully");
            }
        } catch (error) {
            toast.error("Failed to delete logo");
            console.error(error);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const token = localStorage.getItem("token");
            if (!token) {
                throw new Error("No authentication token found - please log in again");
            }

            const response = await fetch(
                `${process.env.NEXT_PUBLIC_API_URL}/admin-settings`,
                {
                    method: "PUT",
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        websiteTitle: settings.websiteTitle,
                        email: settings.email,
                        phone: settings.phone,
                        address: settings.address,
                        socialLinks: settings.socialLinks,
                    }),
                }
            );

            if (!response.ok) {
                if (response.status === 401) {
                    // Clear invalid token
                    localStorage.removeItem("token");
                    localStorage.removeItem("user");
                    throw new Error("Authentication failed - please log in again");
                }
                throw new Error(`Failed to update settings: ${response.statusText}`);
            }

            const data = await response.json();
            if (data.success) {
                setSettings(data.data);
                toast.success("Settings updated successfully");
            } else {
                throw new Error(data.message || "Failed to update settings");
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Failed to update settings";
            toast.error(errorMessage);
            console.error("Settings update error:", error);
        } finally {
            setLoading(false);
        }
    };

    if (!mounted || authLoading || initialLoading) {
        return (
            <div className="flex items-center justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin" />
            </div>
        );
    }

    return (
        <div className="w-full max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-md">
            <h1 className="text-3xl font-bold mb-6">Admin Settings</h1>

            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Website Title */}
                <div>
                    <label className="block text-sm font-medium mb-2">
                        Website Title
                    </label>
                    <input
                        type="text"
                        name="websiteTitle"
                        value={settings.websiteTitle}
                        onChange={handleInputChange}
                        placeholder="Enter website title"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>

                {/* Email */}
                <div>
                    <label className="block text-sm font-medium mb-2">
                        Email Address
                    </label>
                    <input
                        type="email"
                        name="email"
                        value={settings.email}
                        onChange={handleInputChange}
                        placeholder="Enter email address"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>

                {/* Phone */}
                <div>
                    <label className="block text-sm font-medium mb-2">
                        Phone Number
                    </label>
                    <input
                        type="tel"
                        name="phone"
                        value={settings.phone}
                        onChange={handleInputChange}
                        placeholder="Enter phone number"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>

                {/* Address */}
                <div>
                    <label className="block text-sm font-medium mb-2">
                        Address
                    </label>
                    <textarea
                        name="address"
                        value={settings.address}
                        onChange={handleInputChange}
                        placeholder="Enter address"
                        rows={3}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>

                {/* Logo Upload */}
                <div>
                    <label className="block text-sm font-medium mb-2">
                        Site Logo
                    </label>
                    <div className="flex gap-4">
                        <div className="flex-1">
                            <label className="flex items-center justify-center w-full px-4 py-8 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-500 transition">
                                <div className="text-center">
                                    <Upload className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                                    <span className="text-sm text-gray-600">
                                        Click to upload or drag and drop
                                    </span>
                                </div>
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={handleLogoChange}
                                    className="hidden"
                                />
                            </label>
                        </div>

                        {logoPreview && (
                            <div className="relative w-32 h-32">
                                <img
                                    src={logoPreview}
                                    alt="Logo preview"
                                    className="w-full h-full object-contain rounded-lg border border-gray-300"
                                />
                                <button
                                    type="button"
                                    onClick={() => {
                                        setLogoPreview("");
                                        setLogoFile(null);
                                        if (settings.siteLogo) {
                                            deleteLogo();
                                        }
                                    }}
                                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                        )}
                    </div>

                    {logoFile && !uploadingLogo && (
                        <button
                            type="button"
                            onClick={uploadLogo}
                            className="mt-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition"
                        >
                            Upload Logo
                        </button>
                    )}

                    {uploadingLogo && (
                        <div className="mt-2 flex items-center gap-2 text-blue-500">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Uploading...
                        </div>
                    )}
                </div>

                {/* Social Links */}
                <div>
                    <h3 className="text-lg font-semibold mb-4">Social Links</h3>
                    <div className="space-y-3">
                        {["facebook", "twitter", "linkedin", "instagram"].map(
                            (platform) => (
                                <div key={platform}>
                                    <label className="block text-sm font-medium mb-1 capitalize">
                                        {platform}
                                    </label>
                                    <input
                                        type="url"
                                        value={
                                            settings.socialLinks?.[
                                                platform as keyof typeof settings.socialLinks
                                            ] || ""
                                        }
                                        onChange={(e) =>
                                            handleSocialLinkChange(
                                                e,
                                                platform
                                            )
                                        }
                                        placeholder={`https://${platform}.com/...`}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                            )
                        )}
                    </div>
                </div>

                {/* Submit Button */}
                <button
                    type="submit"
                    disabled={loading || uploadingLogo}
                    className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                    {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                    Save Settings
                </button>
            </form>
        </div>
    );
};

export default AdminSettingsForm;
