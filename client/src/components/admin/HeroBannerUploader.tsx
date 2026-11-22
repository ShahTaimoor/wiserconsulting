"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Upload, X, Loader2, Smartphone, Tablet, Monitor } from "lucide-react";
import { siteSettingsService, HeroBannerDevice, HeroImage, SiteSettings } from "@/services/siteSettingsService";
import { useSettings } from "@/context/SettingsContext";
import BannerAdjustDialog, { AdjustResult } from "./BannerAdjustDialog";

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_IMAGES = 10;

const SLOTS: Array<{
    device: HeroBannerDevice;
    title: string;
    shows: string;
    size: string;
    /** The size an adjusted picture is saved at. */
    width: number;
    height: number;
    /** The smallest picture that still looks sharp (half of the best size). */
    minWidth: number;
    minHeight: number;
    icon: typeof Smartphone;
    aspect: string;
}> = [
    { device: "mobile", title: "Mobile", shows: "Phones (under 640 px wide)", size: "1080 x 1920 px (tall)", width: 1080, height: 1920, minWidth: 540, minHeight: 960, icon: Smartphone, aspect: "aspect-[9/16]" },
    { device: "tablet", title: "Tablet", shows: "Tablets (640 to 1023 px wide)", size: "1600 x 1200 px", width: 1600, height: 1200, minWidth: 800, minHeight: 600, icon: Tablet, aspect: "aspect-[4/3]" },
    { device: "desktop", title: "Desktop", shows: "Laptops and desktops (1024 px and wider)", size: "1920 x 1080 px (wide)", width: 1920, height: 1080, minWidth: 960, minHeight: 540, icon: Monitor, aspect: "aspect-video" },
];

/** The pictures of one screen size: its list, or (while it has no list) the older single picture, shown with the id "legacy". */
function imagesOf(settings: SiteSettings, device: HeroBannerDevice): HeroImage[] {
    const list = (device === "mobile" ? settings.heroMobileImages : device === "tablet" ? settings.heroTabletImages : settings.heroDesktopImages) ?? [];
    if (list.length > 0) return list;
    const single = device === "mobile" ? settings.heroMobileUrl : device === "tablet" ? settings.heroTabletUrl : settings.heroDesktopUrl;
    return single ? [{ _id: "legacy", url: single }] : [];
}

/**
 * Admin: the homepage banner pictures. Each screen size can have up to 6 pictures (they play as a slideshow on the homepage).
 * Every picture is saved as soon as it is chosen (no need to press "Save Settings"). A size left empty falls back to the nearest
 * size that has pictures.
 */
const HeroBannerUploader = () => {
    const { settings, refreshSettings } = useSettings();
    const [busy, setBusy] = useState<HeroBannerDevice | null>(null);
    // The picture being adjusted (one at a time) and the way back into the upload loop.
    const [adjusting, setAdjusting] = useState<{ device: HeroBannerDevice; file: File } | null>(null);
    const adjustDone = useRef<((result: AdjustResult) => void) | null>(null);

    const askAdjust = (device: HeroBannerDevice, file: File) =>
        new Promise<AdjustResult>((resolve) => {
            adjustDone.current = (result) => {
                adjustDone.current = null;
                setAdjusting(null);
                resolve(result);
            };
            setAdjusting({ device, file });
        });

    const tokenOrFail = () => {
        const token = localStorage.getItem("token");
        if (!token) throw new Error("No authentication token found - please log in again");
        return token;
    };

    const handleFiles = async (device: HeroBannerDevice, picked: FileList | null) => {
        const files = Array.from(picked ?? []);
        if (files.length === 0) return;
        const room = MAX_IMAGES - imagesOf(settings, device).length;
        if (room <= 0) {
            toast.error(`You can have up to ${MAX_IMAGES} pictures per size. Remove one first.`);
            return;
        }
        const chosen = files.slice(0, room);
        if (files.length > room) toast.error(`Only ${room} more picture(s) fit. The rest were skipped.`);

        let saved = 0;
        try {
            const token = tokenOrFail();
            for (const file of chosen) {
                if (!["image/jpeg", "image/png"].includes(file.type)) {
                    toast.error(`${file.name}: please choose a JPG or PNG image`);
                    continue;
                }
                if (file.size > MAX_BYTES) {
                    toast.error(`${file.name}: image must be smaller than 8MB`);
                    continue;
                }
                const choice = await askAdjust(device, file);
                if (choice.kind === "cancel") continue;
                setBusy(device);
                await siteSettingsService.uploadHeroBanner(device, choice.kind === "adjusted" ? choice.file : file, token);
                saved += 1;
                setBusy(null);
            }
            if (saved > 0) toast.success(saved === 1 ? `${device} banner picture saved` : `${saved} ${device} banner pictures saved`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to upload banner");
        } finally {
            await refreshSettings();
            setBusy(null);
        }
    };

    const handleRemove = async (device: HeroBannerDevice, imageId: string) => {
        setBusy(device);
        try {
            await siteSettingsService.removeHeroImage(device, imageId, tokenOrFail());
            await refreshSettings();
            toast.success("Banner picture removed");
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
                The big picture at the top of the homepage. When you choose a picture you can move and zoom it to fit the screen size before it is saved. Add up to {MAX_IMAGES} pictures for each screen size (JPG or PNG, up to 8MB each);
                more than one plays as a slideshow. You can choose several files at once, and each is saved as soon as it is uploaded.
                The 1st mobile picture goes with the 1st tablet and desktop picture, and so on. If a size is empty, the nearest size that
                has pictures is used. With a banner uploaded, the homepage shows only the pictures (no heading on top).
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {SLOTS.map(({ device, title, shows, size, minWidth, minHeight, icon: Icon, aspect }) => {
                    const images = imagesOf(settings, device);
                    const working = busy === device;
                    const full = images.length >= MAX_IMAGES;
                    return (
                        <div key={device} className="p-3 border border-gray-200 rounded-lg">
                            <div className="flex items-center gap-2 mb-1">
                                <Icon className="h-4 w-4 text-gray-600" />
                                <span className="font-medium text-sm">{title}</span>
                                <span className="ml-auto text-xs text-gray-500">{images.length}/{MAX_IMAGES}</span>
                            </div>
                            <p className="text-xs text-gray-500">{shows}</p>
                            <p className="text-xs text-gray-500">Best size: {size}</p>
                            <p className="text-xs text-gray-500 mb-3">At least {minWidth} x {minHeight} px. JPG or PNG, up to 8MB.</p>

                            <div className="grid grid-cols-2 gap-2">
                                {images.length === 0 && (
                                    <div className={`col-span-2 ${aspect} max-h-56 rounded-lg border border-gray-300 bg-gray-50 flex items-center justify-center text-xs text-gray-400`}>
                                        <span className="px-2 text-center">No picture<br />{size}</span>
                                    </div>
                                )}
                                {images.map((image, index) => (
                                    <div key={image._id} className={`relative ${aspect} max-h-48 rounded-lg border border-gray-300 bg-gray-50 overflow-hidden`}>
                                        {/* eslint-disable-next-line @next/next/no-img-element -- storage URLs are not in next.config's image domains */}
                                        <img src={image.url} alt={`${title} banner ${index + 1}`} className="absolute inset-0 w-full h-full object-cover" />
                                        <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 text-[10px] text-white">{index + 1}</span>
                                        {!working && (
                                            <button
                                                type="button"
                                                onClick={() => handleRemove(device, image._id)}
                                                className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-0.5 hover:bg-red-600"
                                                aria-label={`Remove ${title} banner picture ${index + 1}`}
                                            >
                                                <X className="h-3.5 w-3.5" />
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                            {working && (
                                <div className="mt-2 flex items-center justify-center gap-2 text-xs text-gray-500">
                                    <Loader2 className="h-4 w-4 animate-spin text-blue-500" /> Working...
                                </div>
                            )}

                            <label className={`mt-3 flex items-center justify-center gap-2 px-3 py-2 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-600 ${working || full ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:border-blue-500"}`}>
                                <Upload className="h-4 w-4" />
                                {full ? "Limit reached" : images.length ? "Add pictures" : "Upload pictures"}
                                <input
                                    type="file"
                                    accept="image/jpeg,image/png"
                                    multiple
                                    disabled={working || full}
                                    className="hidden"
                                    onChange={(e) => {
                                        handleFiles(device, e.target.files);
                                        e.target.value = "";
                                    }}
                                />
                            </label>
                        </div>
                    );
                })}
            </div>

            {adjusting && (() => {
                const slot = SLOTS.find((entry) => entry.device === adjusting.device)!;
                return (
                    <BannerAdjustDialog
                        key={`${adjusting.device}-${adjusting.file.name}-${adjusting.file.size}`}
                        file={adjusting.file}
                        target={{ title: slot.title, width: slot.width, height: slot.height }}
                        onDone={(result) => adjustDone.current?.(result)}
                    />
                );
            })()}
        </div>
    );
};

export default HeroBannerUploader;
