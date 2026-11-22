"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Mic, Send, Square, Trash2 } from "lucide-react";

type Props = {
  /** Called with the finished recording; the recorder shows "Sending..." until it settles and clears itself on success. */
  onSend: (blob: Blob, seconds: number) => Promise<void>;
  disabled?: boolean;
  /** The longest recording, in seconds (the server accepts up to 180). */
  maxSeconds?: number;
};

type Phase = "idle" | "recording" | "ready" | "sending";

const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus", "audio/ogg"];
const pickMime = () => (typeof MediaRecorder === "undefined" ? "" : MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) ?? "");
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** Record a voice note with the microphone, listen to it, then send or discard it. */
export function VoiceRecorder({ onSend, disabled = false, maxSeconds = 120 }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ blob: Blob; url: string; seconds: number } | null>(null);
  const [supported, setSupported] = useState(true);

  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsed = useRef(0);

  useEffect(() => {
    setSupported(typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined");
  }, []);

  const releaseMicrophone = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
  }, []);

  // Leaving the page while recording must switch the microphone off.
  useEffect(() => () => {
    releaseMicrophone();
    if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
  }, [releaseMicrophone]);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);

  const stop = useCallback(() => {
    if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
  }, []);

  const start = async () => {
    setError(null);
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("We could not use the microphone. Please allow microphone access in your browser and try again.");
      return;
    }
    const mimeType = pickMime();
    const media = new MediaRecorder(stream.current, mimeType ? { mimeType } : undefined);
    recorder.current = media;
    chunks.current = [];
    elapsed.current = 0;
    setSeconds(0);

    media.ondataavailable = (event) => { if (event.data.size > 0) chunks.current.push(event.data); };
    media.onstop = () => {
      releaseMicrophone();
      const length = elapsed.current;
      const blob = new Blob(chunks.current, { type: media.mimeType || mimeType || "audio/webm" });
      if (length < 1 || blob.size === 0) {
        setPhase("idle");
        setError("The recording was too short. Please hold on a little longer.");
        return;
      }
      setPreview({ blob, url: URL.createObjectURL(blob), seconds: length });
      setPhase("ready");
    };

    media.start();
    setPhase("recording");
    timer.current = setInterval(() => {
      elapsed.current += 1;
      setSeconds(elapsed.current);
      if (elapsed.current >= maxSeconds) stop();
    }, 1000);
  };

  const discard = () => {
    setPreview(null);
    setSeconds(0);
    setPhase("idle");
  };

  const send = async () => {
    if (!preview) return;
    setPhase("sending");
    setError(null);
    try {
      await onSend(preview.blob, preview.seconds);
      discard();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The voice note could not be sent.");
      setPhase("ready");
    }
  };

  if (!supported) {
    return <p className="text-xs text-slate-500">Voice notes need a browser with microphone support (a recent Chrome, Edge, Firefox or Safari).</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {phase === "idle" && (
        <button
          type="button"
          onClick={start}
          disabled={disabled}
          className="inline-flex w-fit items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Mic className="h-4 w-4" />
          Record voice note
        </button>
      )}

      {phase === "recording" && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2">
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-60" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-red-600" />
          </span>
          <span className="text-sm font-semibold tabular-nums text-red-700">{clock(seconds)} / {clock(maxSeconds)}</span>
          <button
            type="button"
            onClick={stop}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
          >
            <Square className="h-3.5 w-3.5 fill-current" />
            Stop
          </button>
        </div>
      )}

      {(phase === "ready" || phase === "sending") && preview && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
          <audio src={preview.url} controls className="h-9 max-w-full" />
          <span className="text-xs tabular-nums text-slate-500">{clock(preview.seconds)}</span>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={discard}
              disabled={phase === "sending"}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Discard
            </button>
            <button
              type="button"
              onClick={send}
              disabled={phase === "sending" || disabled}
              className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {phase === "sending" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              {phase === "sending" ? "Sending..." : "Send voice note"}
            </button>
          </div>
        </div>
      )}

      {error && <p role="alert" className="text-xs font-medium text-red-600">{error}</p>}
    </div>
  );
}
