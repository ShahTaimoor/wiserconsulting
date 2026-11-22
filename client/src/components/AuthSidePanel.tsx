"use client";

import { useSettings } from "@/context/SettingsContext";
import { CheckCircle2, FileCheck2, Plane, ShieldCheck, Headset } from "lucide-react";

type Props = { variant: "login" | "register" };

const COPY = {
  login: {
    eyebrow: "Welcome back",
    title: "Pick up your visa journey where you left off.",
    text: "Track your application, read your consultant's comments and upload documents in one place.",
  },
  register: {
    eyebrow: "Start today",
    title: "Your visa journey, made simple.",
    text: "Create a free account to apply, upload your documents safely and follow every step with our team.",
  },
};

const FEATURES = [
  { icon: FileCheck2, label: "Document review by experts" },
  { icon: ShieldCheck, label: "Your files stored securely" },
  { icon: Headset, label: "Visa consultation support" },
];

/** The decorative right-hand side of the sign-in and sign-up pages (drawn with SVG and CSS, no picture file). */
export function AuthSidePanel({ variant }: Props) {
  const copy = COPY[variant];
  const { settings } = useSettings();
  const logo = settings.logoUrl || "/logo.png";
  const name = settings.websiteTitle || "Wiser Consulting";
  return (
    <div className="relative hidden overflow-hidden bg-gradient-to-br from-[#0b2f4e] via-[#1b5683] to-[#3f8cc0] text-white lg:block">
      {/* world-map style rings and flight routes */}
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 800 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <radialGradient id="glow" cx="75%" cy="20%" r="60%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
          <pattern id="dots" width="26" height="26" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1.6" fill="#ffffff" fillOpacity="0.16" />
          </pattern>
        </defs>
        <rect width="800" height="900" fill="url(#dots)" />
        <rect width="800" height="900" fill="url(#glow)" />
        <g fill="none" stroke="#ffffff" strokeOpacity="0.16">
          <circle cx="640" cy="170" r="150" />
          <circle cx="640" cy="170" r="250" />
          <circle cx="640" cy="170" r="360" />
          <circle cx="120" cy="820" r="200" />
          <circle cx="120" cy="820" r="320" />
        </g>
        <g fill="none" stroke="#ffffff" strokeWidth="2" strokeDasharray="3 9" strokeLinecap="round" strokeOpacity="0.55">
          <path d="M70 700 C 220 520, 420 560, 560 360 S 700 150, 740 110" />
          <path d="M90 330 C 220 260, 330 300, 420 210" />
        </g>
        <g fill="#ffffff">
          <circle cx="70" cy="700" r="6" />
          <circle cx="560" cy="360" r="5" fillOpacity="0.8" />
          <circle cx="740" cy="110" r="6" />
          <circle cx="90" cy="330" r="4" fillOpacity="0.7" />
        </g>
      </svg>

      <Plane className="absolute right-14 top-12 h-16 w-16 rotate-[-18deg] text-white/90" strokeWidth={1.4} />

      <div className="relative z-10 flex h-full flex-col justify-between p-12 xl:p-16">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/95 p-1.5 shadow-lg">
            <img src={logo} alt={name} className="h-full w-full object-contain" />
          </span>
          <span className="text-lg font-semibold tracking-wide">{name}</span>
        </div>

        <div className="max-w-md">
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-sky-200">{copy.eyebrow}</p>
          <h2 className="text-4xl font-bold leading-tight xl:text-5xl">{copy.title}</h2>
          <p className="mt-5 text-base leading-relaxed text-sky-100/90">{copy.text}</p>

          <ul className="mt-9 space-y-3">
            {FEATURES.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-3 rounded-xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur-sm">
                <Icon className="h-5 w-5 shrink-0 text-sky-200" />
                <span className="text-sm font-medium">{label}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="flex items-center gap-2 text-sm text-sky-100/80">
          <CheckCircle2 className="h-4 w-4" />
          Residency applications · Document processing · Immigration support
        </p>
      </div>
    </div>
  );
}
