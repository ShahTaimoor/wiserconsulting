"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Upload, X, Loader2 } from "lucide-react";
import { useAppSelector } from "@/redux/hooks";
import { siteSettingsService } from "@/services/siteSettingsService";
import HeroBannerUploader from "./HeroBannerUploader";

interface AdminSettings {
    _id?: string;
    websiteTitle: string;
    emailAddress: string;
    phoneNumber: string;
    address: string;
    logoUrl?: string;
    socialLinks?: {
        facebook?: string;
        twitter?: string;
        linkedin?: string;
        instagram?: string;
    };
    stat1Value?: string;
    stat1Label?: string;
    stat2Value?: string;
    stat2Label?: string;
    stat3Value?: string;
    stat3Label?: string;
    stat4Value?: string;
    stat4Label?: string;
    aboutStat1Value?: string;
    aboutStat1Label?: string;
    aboutStat2Value?: string;
    aboutStat2Label?: string;
}

type StatValueKey = "stat1Value" | "stat2Value" | "stat3Value" | "stat4Value";
type StatLabelKey = "stat1Label" | "stat2Label" | "stat3Label" | "stat4Label";

const STAT_FIELD_ROWS: Array<{ valueKey: StatValueKey; labelKey: StatLabelKey; title: string }> = [
    { valueKey: "stat1Value", labelKey: "stat1Label", title: "Stat 1" },
    { valueKey: "stat2Value", labelKey: "stat2Label", title: "Stat 2" },
    { valueKey: "stat3Value", labelKey: "stat3Label", title: "Stat 3" },
    { valueKey: "stat4Value", labelKey: "stat4Label", title: "Stat 4" },
];

type AboutStatValueKey = "aboutStat1Value" | "aboutStat2Value";
type AboutStatLabelKey = "aboutStat1Label" | "aboutStat2Label";

const ABOUT_STAT_FIELD_ROWS: Array<{ valueKey: AboutStatValueKey; labelKey: AboutStatLabelKey; title: string }> = [
    { valueKey: "aboutStat1Value", labelKey: "aboutStat1Label", title: "About Stat 1" },
    { valueKey: "aboutStat2Value", labelKey: "aboutStat2Label", title: "About Stat 2" },
];

const AdminSettingsForm = () => {
    const { user, loading: authLoading } = useAppSelector((state) => state.auth);
    const [mounted, setMounted] = useState(false);
    const [settings, setSettings] = useState<AdminSettings>({
        websiteTitle: "",
        emailAddress: "",
        phoneNumber: "",
        address: "",
        logoUrl: "",
        socialLinks: {
            facebook: "",
            twitter: "",
            linkedin: "",
            instagram: "",
        },
        stat1Value: "",
        stat1Label: "",
        stat2Value: "",
        stat2Label: "",
        stat3Value: "",
        stat3Label: "",
        stat4Value: "",
        stat4Label: "",
        aboutStat1Value: "",
        aboutStat1Label: "",
        aboutStat2Value: "",
        aboutStat2Label: "",
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
        if (!mounted || authLoading || !user) return;

        const fetchSettings = async () => {
            try {
                const response = await siteSettingsService.getSettings();
                setSettings(response);
                if (response.logoUrl) {
                    setLogoPreview(response.logoUrl);
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
            if (!["image/png", "image/jpeg"].includes(file.type)) {
                toast.error("Logo must be a JPG or PNG image");
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
        if (!logoFile) return null;

        setUploadingLogo(true);
        try {
            const token = localStorage.getItem("token");
            if (!token) {
                throw new Error("No authentication token found - please log in again");
            }

            const response = await siteSettingsService.uploadLogo(logoFile, token);
            setLogoFile(null);
            setLogoPreview(response.logoUrl || "");
            setSettings((prev) => ({
                ...prev,
                logoUrl: response.logoUrl || prev.logoUrl,
            }));
            toast.success("Logo uploaded successfully");
            return response.logoUrl;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Failed to upload logo";
            toast.error(errorMessage);
            console.error(error);
            return null;
        } finally {
            setUploadingLogo(false);
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

            let logoUrl = settings.logoUrl || "";
            if (logoFile) {
                const uploadedLogoUrl = await uploadLogo();
                if (uploadedLogoUrl) {
                    logoUrl = uploadedLogoUrl;
                }
            }

            const updatedSettings = await siteSettingsService.updateSettings(
                {
                    websiteTitle: settings.websiteTitle,
                    emailAddress: settings.emailAddress,
                    phoneNumber: settings.phoneNumber,
                    address: settings.address,
                    logoUrl,
                    socialLinks: settings.socialLinks,
                    stat1Value: settings.stat1Value,
                    stat1Label: settings.stat1Label,
                    stat2Value: settings.stat2Value,
                    stat2Label: settings.stat2Label,
                    stat3Value: settings.stat3Value,
                    stat3Label: settings.stat3Label,
                    stat4Value: settings.stat4Value,
                    stat4Label: settings.stat4Label,
                    aboutStat1Value: settings.aboutStat1Value,
                    aboutStat1Label: settings.aboutStat1Label,
                    aboutStat2Value: settings.aboutStat2Value,
                    aboutStat2Label: settings.aboutStat2Label,
                },
                token,
            );

            setSettings(updatedSettings);
            if (updatedSettings.logoUrl) {
                setLogoPreview(updatedSettings.logoUrl);
            }
            toast.success("Settings updated successfully");
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
        <div className="w-full max-w-4xl mx-auto rounded-xl bg-white p-3 sm:p-5">
            <div className="mb-4">
                <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">Admin Settings</h1>
                <p className="mt-0.5 text-sm text-slate-500">Website details shown to visitors. Click a cell to edit it, then press Save at the bottom.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Website details: a two-column sheet (setting | value) */}
                <div className="overflow-hidden rounded-lg border border-slate-300">
                    <table className="w-full border-collapse text-left text-sm">
                        <thead>
                            <tr>
                                <th className="w-44 border border-slate-300 bg-slate-100 px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-600">Setting</th>
                                <th className="border border-slate-300 bg-slate-100 px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-600">Value</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td className="border border-slate-300 bg-slate-50 px-3 py-2 font-medium text-slate-700">Website Title</td>
                                <td className="border border-slate-300 p-0">
                                    <input type="text" name="websiteTitle" value={settings.websiteTitle} onChange={handleInputChange} placeholder="Enter website title" className="w-full bg-transparent px-3 py-2 text-sm text-slate-800 focus:bg-emerald-50/60 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-emerald-500" />
                                </td>
                            </tr>
                            <tr>
                                <td className="border border-slate-300 bg-slate-50 px-3 py-2 font-medium text-slate-700">Email Address</td>
                                <td className="border border-slate-300 p-0">
                                    <input type="email" name="emailAddress" value={settings.emailAddress} onChange={handleInputChange} placeholder="Enter email address" className="w-full bg-transparent px-3 py-2 text-sm text-slate-800 focus:bg-emerald-50/60 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-emerald-500" />
                                </td>
                            </tr>
                            <tr>
                                <td className="border border-slate-300 bg-slate-50 px-3 py-2 font-medium text-slate-700">Phone Number</td>
                                <td className="border border-slate-300 p-0">
                                    <input type="tel" name="phoneNumber" value={settings.phoneNumber} onChange={handleInputChange} placeholder="Enter phone number" className="w-full bg-transparent px-3 py-2 text-sm text-slate-800 focus:bg-emerald-50/60 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-emerald-500" />
                                </td>
                            </tr>
                            <tr>
                                <td className="border border-slate-300 bg-slate-50 px-3 py-2 align-top font-medium text-slate-700">Address</td>
                                <td className="border border-slate-300 p-0">
                                    <textarea name="address" value={settings.address} onChange={handleInputChange} placeholder="Enter address" rows={3} className="w-full bg-transparent px-3 py-2 text-sm text-slate-800 focus:bg-emerald-50/60 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-emerald-500" />
                                </td>
                            </tr>
                        </tbody>
                    </table>
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
                                    <span className="mt-1 block text-xs text-gray-400">
                                        JPG or PNG, up to 5MB. Also used as the browser-tab icon.
                                    </span>
                                </div>
                                <input
                                    type="file"
                                    accept="image/png,image/jpeg"
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

                {/* Homepage banner pictures (mobile / tablet / desktop) */}
                <HeroBannerUploader />

                {/* Homepage Statistics */}
                <div>
                    <h3 className="text-lg font-semibold mb-1">Homepage Statistics</h3>
                    <p className="text-sm text-gray-500 mb-4">
                        Text shown in the 4 stat cards below the homepage hero. Icons are fixed in code.
                    </p>
                    <div className="space-y-4">
                        {STAT_FIELD_ROWS.map((row) => (
                            <div key={row.valueKey} className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 border border-gray-200 rounded-lg">
                                <div>
                                    <label className="block text-xs font-medium mb-1 text-gray-600">
                                        {row.title} Value
                                    </label>
                                    <input
                                        type="text"
                                        name={row.valueKey}
                                        value={settings[row.valueKey] || ""}
                                        onChange={handleInputChange}
                                        placeholder="e.g. 10,000+"
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium mb-1 text-gray-600">
                                        {row.title} Label
                                    </label>
                                    <input
                                        type="text"
                                        name={row.labelKey}
                                        value={settings[row.labelKey] || ""}
                                        onChange={handleInputChange}
                                        placeholder="e.g. Successful Applications"
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* About Section Statistics */}
                <div>
                    <h3 className="text-lg font-semibold mb-1">About Section Statistics</h3>
                    <p className="text-sm text-gray-500 mb-4">
                        Text shown in the two &quot;Our Story&quot; stat cards on the About section. Captions (&quot;Trusted by&quot;, &quot;Success rate&quot;) and icons are fixed in code.
                    </p>
                    <div className="space-y-4">
                        {ABOUT_STAT_FIELD_ROWS.map((row) => (
                            <div key={row.valueKey} className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 border border-gray-200 rounded-lg">
                                <div>
                                    <label className="block text-xs font-medium mb-1 text-gray-600">
                                        {row.title} Value
                                    </label>
                                    <input
                                        type="text"
                                        name={row.valueKey}
                                        value={settings[row.valueKey] || ""}
                                        onChange={handleInputChange}
                                        placeholder="e.g. 10,000+"
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium mb-1 text-gray-600">
                                        {row.title} Label
                                    </label>
                                    <input
                                        type="text"
                                        name={row.labelKey}
                                        value={settings[row.labelKey] || ""}
                                        onChange={handleInputChange}
                                        placeholder="e.g. clients worldwide"
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
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
