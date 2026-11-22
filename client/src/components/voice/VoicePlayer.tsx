"use client";

import { useState } from "react";
import { Loader2, Play } from "lucide-react";
import { getVoiceUrl } from "@/services/voiceService";
import type { VoiceKind } from "@/services/voiceService";

type Props = {
  submissionId: string;
  kind: VoiceKind;
  commentId: string;
  seconds?: number;
};

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** A voice note in a comment: the link is asked for only when the person presses Play (it expires after ten minutes). */
export function VoicePlayer({ submissionId, kind, commentId, seconds }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setUrl(await getVoiceUrl(submissionId, kind, commentId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "The voice note could not be opened.");
    } finally {
      setLoading(false);
    }
  };

  if (url) return <audio src={url} controls autoPlay className="h-9 w-full max-w-xs" />;

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={load}
        disabled={loading}
        className="inline-flex w-fit items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-500 hover:bg-slate-50 disabled:opacity-60"
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5 fill-current" />}
        Voice note{typeof seconds === "number" && seconds > 0 ? ` · ${clock(seconds)}` : ""}
      </button>
      {error && <span role="alert" className="text-[11px] text-red-600">{error}</span>}
    </div>
  );
}
