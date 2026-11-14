"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Upload, X, Loader2, Smartphone, Tablet, Monitor } from "lucide-react";
import { siteSettingsService, HeroBannerDevice, SiteSettings } from "@/services/siteSettingsService";
import { useSettings } from "@/context/SettingsContext";

const MAX_BYTES = 8 * 1024 * 1024;

const SLOTS: Array<{
    device: HeroBannerDevice;
    title: string;
    shows: string;
    size: string;
    icon: typeof Smartphone;
    urlKey: "heroMobileUrl" | "heroTabletUrl" | "heroDesktopUrl";
    aspect: string;
}> = [
    { device: "mobile", title: "Mobile", shows: "Phones (under 640 px wide)", size: "1080 x 1920 px (tall)", icon: Smartphone, urlKey: "heroMobileUrl", aspect: "aspect-[9/16]" },
    { device: "tablet", title: "Tablet", shows: "Tablets (640 to 1023 px wide)", size: "1600 x 1200 px", icon: Tablet, urlKey: "heroTabletUrl", aspect: "aspect-[4/3]" },
    { device: "desktop", title: "Desktop", shows: "Laptops and desktops (1024 px and wider)", size: "1920 x 1080 px (wide)", icon: Monitor, urlKey: "heroDesktopUrl", aspect: "aspect-video" },
];

/**
 * Admin: the homepage banner pictures, one for each screen size. Each box saves on its own (no need to press
 * "Save Settings"). A size left empty falls back to the nearest picture that is set.
 */
const HeroBannerUploader = () => {
    const { settings, refreshSettings } = useSettings();
    const [urls, setUrls] = useState<Partial<SiteSettings>>({});
    const [busy, setBusy] = useState<HeroBannerDevice | null>(null);

    useEffect(() => {
        setUrls({
            heroMobileUrl: settings.heroMobileUrl,
            heroTabletUrl: settings.heroTabletUrl,
            heroDesktopUrl: settings.heroDesktopUrl,
        });
    }, [settings.heroMobileUrl, settings.heroTabletUrl, settings.heroDesktopUrl]);

    const tokenOrFail = () => {
        const token = localStorage.getItem("token");
        if (!token) throw new Error("No authentication token found - please log in again");
        return token;
    };

    const handleFile = async (device: HeroBannerDevice, file: File | undefined) => {
        if (!file) return;
        if (!["image/jpeg", "image/png"].includes(file.type)) {
            toast.error("Please choose a JPG or PNG image");
            return;
        }
        if (file.size > MAX_BYTES) {
            toast.error("Image must be smaller than 8MB");
            return;
        }
        setBusy(device);
        try {
            const updated = await siteSettingsService.uploadHeroBanner(device, file, tokenOrFail());
            setUrls({ heroMobileUrl: updated.heroMobileUrl, heroTabletUrl: updated.heroTabletUrl, heroDesktopUrl: updated.heroDesktopUrl });
            await refreshSettings();
            toast.success(`${device} banner saved`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to upload banner");
        } finally {
            setBusy(null);
        }
    };

    const handleRemove = async (device: HeroBannerDevice) => {
        setBusy(device);
        try {
            const updated = await siteSettingsService.removeHeroBanner(device, tokenOrFail());
            setUrls({ heroMobileUrl: updated.heroMobileUrl, heroTabletUrl: updated.heroTabletUrl, heroDesktopUrl: updated.heroDesktopUrl });
            await refreshSettings();
            toast.success(`${device} banner removed`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to remove banner");
        } finally {
            setBusy(null);
        }
    };

    return (
        <div>
            <h3 className="text-lg font-semibold mb-1">Homepage Banner</h3>
            <p className="text-sm text-gray-500 mb-4">
                The big picture at the top of the homepage. Upload a different picture for each screen size (JPG or PNG, up to 8MB).
                Each one is saved as soon as you choose it. If a size is empty, the nearest picture that is set is used.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {SLOTS.map(({ device, title, shows, size, icon: Icon, urlKey, aspect }) => {
                    const url = urls[urlKey];
                    const working = busy === device;
                    return (
                        <div key={device} className="p-3 border border-gray-200 rounded-lg">
                            <div className="flex items-center gap-2 mb-1">
                                <Icon className="h-4 w-4 text-gray-600" />
                                <span className="font-medium text-sm">{title}</span>
                            </div>
                            <p className="text-xs text-gray-500">{shows}</p>
                            <p className="text-xs text-gray-500 mb-3">Best size: {size}</p>

                            <div className={`relative w-full ${aspect} max-h-72 mx-auto rounded-lg border border-gray-300 bg-gray-50 overflow-hidden`}>
                                {url ? (
                                    // eslint-disable-next-line @next/next/no-img-element -- storage URLs are not in next.config's image domains
                                    <img src={url} alt={`${title} banner`} className="absolute inset-0 w-full h-full object-cover" />
                                ) : (
                                    <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-400">No picture</div>
                                )}
                                {working && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-white/70">
                                        <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                                    </div>
                                )}
                                {url && !working && (
                                    <button
                                        type="button"
                                        onClick={() => handleRemove(device)}
                                        className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                                        aria-label={`Remove ${title} banner`}
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                )}
                            </div>

                            <label className={`mt-3 flex items-center justify-center gap-2 px-3 py-2 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-600 ${working ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:border-blue-500"}`}>
                                <Upload className="h-4 w-4" />
                                {url ? "Replace picture" : "Upload picture"}
                                <input
                                    type="file"
                                    accept="image/jpeg,image/png"
                                    disabled={working}
                                    className="hidden"
                                    onChange={(e) => {
                                        handleFile(device, e.target.files?.[0]);
                                        e.target.value = "";
                                    }}
                                />
                            </label>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default HeroBannerUploader;
