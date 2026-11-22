"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, X, ZoomIn, ZoomOut } from "lucide-react";

export interface BannerTarget {
    title: string;
    /** The size the picture is saved at (pixels). */
    width: number;
    height: number;
}

/** What the admin chose: the adjusted picture, the picture as it is, or nothing (cancel). */
export type AdjustResult = { kind: "adjusted"; file: File } | { kind: "original" } | { kind: "cancel" };

const MAX_FRAME_WIDTH = 560;
const MAX_FRAME_HEIGHT = 440;
const MAX_ZOOM = 4;

/**
 * Lets the admin place a picture inside the banner frame of one screen size before it is uploaded: drag to move, slide (or
 * scroll) to zoom. "Crop and upload" saves exactly what is inside the frame at the size of that screen (e.g. 1920 x 1080),
 * "Upload as it is" skips this step.
 */
const BannerAdjustDialog = ({ file, target, onDone }: { file: File; target: BannerTarget; onDone: (result: AdjustResult) => void }) => {
    const [url, setUrl] = useState<string | null>(null);
    const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
    const [zoom, setZoom] = useState(1);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const [saving, setSaving] = useState(false);
    const [frameScale, setFrameScale] = useState(1);
    const imageRef = useRef<HTMLImageElement | null>(null);
    const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

    // The frame has the shape of the banner and fits the window.
    const frameW = Math.round(target.width * frameScale);
    const frameH = Math.round(target.height * frameScale);

    useEffect(() => {
        const compute = () => {
            const room = Math.min(MAX_FRAME_WIDTH, window.innerWidth - 64);
            setFrameScale(Math.min(room / target.width, MAX_FRAME_HEIGHT / target.height));
        };
        compute();
        window.addEventListener("resize", compute);
        return () => window.removeEventListener("resize", compute);
    }, [target.width, target.height]);

    useEffect(() => {
        const objectUrl = URL.createObjectURL(file);
        setUrl(objectUrl);
        const probe = new Image();
        probe.onload = () => setNatural({ w: probe.naturalWidth, h: probe.naturalHeight });
        probe.src = objectUrl;
        return () => URL.revokeObjectURL(objectUrl);
    }, [file]);

    // Scale at which the picture just covers the frame; zoom multiplies it.
    const coverScale = natural ? Math.max(frameW / natural.w, frameH / natural.h) : 1;
    const scale = coverScale * zoom;

    const clamp = useCallback(
        (x: number, y: number, s: number) => {
            if (!natural) return { x: 0, y: 0 };
            const dw = natural.w * s;
            const dh = natural.h * s;
            return { x: Math.min(0, Math.max(frameW - dw, x)), y: Math.min(0, Math.max(frameH - dh, y)) };
        },
        [natural, frameW, frameH],
    );

    // Centre the picture when it (or the frame) changes.
    useEffect(() => {
        if (!natural) return;
        const s = coverScale;
        setZoom(1);
        setOffset(clamp((frameW - natural.w * s) / 2, (frameH - natural.h * s) / 2, s));
    }, [natural, coverScale, frameW, frameH, clamp]);

    const changeZoom = (next: number) => {
        if (!natural) return;
        const z = Math.min(MAX_ZOOM, Math.max(1, next));
        const s = coverScale * z;
        // keep the middle of the frame where it is
        const cx = (frameW / 2 - offset.x) / scale;
        const cy = (frameH / 2 - offset.y) / scale;
        setZoom(z);
        setOffset(clamp(frameW / 2 - cx * s, frameH / 2 - cy * s, s));
    };

    const lowResolution = natural ? natural.w < target.width * 0.5 || natural.h < target.height * 0.5 : false;
    const visibleW = natural ? Math.round(frameW / scale) : 0;
    const visibleH = natural ? Math.round(frameH / scale) : 0;
    const blurry = natural ? visibleW < target.width * 0.6 : false;

    const save = async () => {
        const img = imageRef.current;
        if (!img || !natural) return;
        setSaving(true);
        try {
            const canvas = document.createElement("canvas");
            canvas.width = target.width;
            canvas.height = target.height;
            const ctx = canvas.getContext("2d");
            if (!ctx) throw new Error("no canvas");
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.imageSmoothingQuality = "high";
            ctx.drawImage(img, -offset.x / scale, -offset.y / scale, frameW / scale, frameH / scale, 0, 0, target.width, target.height);
            const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
            if (!blob) throw new Error("no blob");
            const base = file.name.replace(/\.[^.]+$/, "") || "banner";
            onDone({ kind: "adjusted", file: new File([blob], `${base}.jpg`, { type: "image/jpeg" }) });
        } catch {
            // The picture could not be cut here: upload it as it is instead.
            onDone({ kind: "original" });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/70 p-4" role="dialog" aria-modal="true" aria-label={`Adjust ${target.title} banner`}>
            <div className="max-h-[95vh] w-full max-w-[640px] overflow-y-auto rounded-xl bg-white p-4 shadow-2xl sm:p-5">
                <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                        <h4 className="text-base font-semibold text-slate-900">Adjust {target.title} banner</h4>
                        <p className="text-xs text-slate-500">
                            Drag the picture to move it, use the slider to zoom. It is saved at {target.width} x {target.height} px.
                        </p>
                    </div>
                    <button type="button" onClick={() => onDone({ kind: "cancel" })} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Cancel">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="flex justify-center">
                    <div
                        className="relative touch-none select-none overflow-hidden rounded-lg border border-slate-300 bg-slate-100"
                        style={{ width: frameW, height: frameH, cursor: drag.current ? "grabbing" : "grab" }}
                        onPointerDown={(e) => {
                            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                            drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
                        }}
                        onPointerMove={(e) => {
                            if (!drag.current) return;
                            setOffset(clamp(drag.current.ox + (e.clientX - drag.current.x), drag.current.oy + (e.clientY - drag.current.y), scale));
                        }}
                        onPointerUp={() => (drag.current = null)}
                        onPointerCancel={() => (drag.current = null)}
                        onWheel={(e) => changeZoom(zoom - e.deltaY * 0.002)}
                    >
                        {url && natural ? (
                            // eslint-disable-next-line @next/next/no-img-element -- a local preview of the chosen file
                            <img
                                ref={imageRef}
                                src={url}
                                alt="Banner preview"
                                draggable={false}
                                className="pointer-events-none absolute left-0 top-0 max-w-none"
                                style={{ width: natural.w * scale, height: natural.h * scale, transform: `translate(${offset.x}px, ${offset.y}px)` }}
                            />
                        ) : (
                            <div className="absolute inset-0 flex items-center justify-center">
                                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                            </div>
                        )}
                        {/* thirds, to help place the subject */}
                        <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(to_right,rgba(255,255,255,.7)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,.7)_1px,transparent_1px)] [background-size:33.333%_33.333%]" />
                    </div>
                </div>

                <div className="mt-4 flex items-center gap-3">
                    <ZoomOut className="h-4 w-4 text-slate-500" />
                    <input
                        type="range"
                        min={1}
                        max={MAX_ZOOM}
                        step={0.01}
                        value={zoom}
                        onChange={(e) => changeZoom(Number(e.target.value))}
                        className="flex-1 accent-emerald-600"
                        aria-label="Zoom"
                    />
                    <ZoomIn className="h-4 w-4 text-slate-500" />
                </div>

                {natural && (
                    <p className={`mt-2 text-xs ${lowResolution || blurry ? "text-amber-700" : "text-slate-500"}`}>
                        Original: {natural.w} x {natural.h} px.
                        {lowResolution || blurry ? " This picture is small for this banner and may look blurry. A larger picture is better." : ""}
                    </p>
                )}

                <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                    <button type="button" onClick={() => onDone({ kind: "cancel" })} className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                        Cancel
                    </button>
                    <button type="button" onClick={() => onDone({ kind: "original" })} className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                        Upload as it is
                    </button>
                    <button
                        type="button"
                        onClick={save}
                        disabled={!natural || saving}
                        className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                        {saving && <Loader2 className="h-4 w-4 animate-spin" />} Crop and upload
                    </button>
                </div>
            </div>
        </div>
    );
};

export default BannerAdjustDialog;
