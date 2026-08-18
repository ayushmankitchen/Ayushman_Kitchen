import React, { useState, useEffect, useMemo } from "react";

const PALETTES = [
  { bg: "bg-teal-900", text: "text-amber-300", border: "border-teal-700" },
  { bg: "bg-emerald-900", text: "text-emerald-200", border: "border-emerald-700" },
  { bg: "bg-indigo-900", text: "text-indigo-200", border: "border-indigo-700" },
  { bg: "bg-amber-900", text: "text-amber-200", border: "border-amber-700" },
  { bg: "bg-slate-800", text: "text-slate-200", border: "border-slate-600" },
  { bg: "bg-cyan-900", text: "text-cyan-200", border: "border-cyan-700" },
  { bg: "bg-rose-950", text: "text-rose-200", border: "border-rose-800" },
  { bg: "bg-blue-950", text: "text-blue-200", border: "border-blue-800" },
];

export function getInitials(name) {
  if (!name || typeof name !== "string") return "W";
  const clean = name.trim().replace(/[^\p{L}\p{N}\s]/gu, "");
  if (!clean) return "W";
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "W";
  if (parts.length === 1) {
    return parts[0].slice(0, Math.min(2, parts[0].length)).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function getColorPalette(str) {
  if (!str) return PALETTES[0];
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % PALETTES.length;
  return PALETTES[index];
}

const SIZE_CLASSES = {
  xs: "h-6 w-6 text-[10px] rounded-lg",
  sm: "h-8 w-8 text-xs rounded-xl",
  md: "h-10 w-10 text-sm rounded-xl",
  lg: "h-12 w-12 text-base rounded-2xl",
  xl: "h-16 w-16 text-xl rounded-2xl",
  "2xl": "h-20 w-20 text-2xl rounded-3xl",
  "3xl": "h-24 w-24 text-3xl rounded-3xl",
};

export default function WorkerAvatar({
  name = "",
  photoUrl = "",
  size = "md",
  className = "",
  alt = "",
}) {
  const [imgError, setImgError] = useState(false);

  // Reset error state if photoUrl changes
  useEffect(() => {
    setImgError(false);
  }, [photoUrl]);

  const initials = useMemo(() => getInitials(name), [name]);
  const palette = useMemo(() => getColorPalette(name), [name]);
  const sizeClass = SIZE_CLASSES[size] || SIZE_CLASSES.md;
  const accessibleAlt = alt || `${name || "Worker"} profile photo`;

  if (photoUrl && !imgError) {
    return (
      <div
        className={`relative inline-flex items-center justify-center shrink-0 overflow-hidden shadow-sm border border-black/5 bg-stone-100 ${sizeClass} ${className}`}
      >
        <img
          src={photoUrl}
          alt={accessibleAlt}
          data-testid="worker-avatar-img"
          className="h-full w-full object-cover object-center"
          onError={() => setImgError(true)}
          loading="lazy"
        />
      </div>
    );
  }

  return (
    <div
      role="img"
      aria-label={accessibleAlt}
      data-testid="worker-avatar-fallback"
      className={`relative inline-flex items-center justify-center shrink-0 font-bold uppercase tracking-wider select-none shadow-sm border ${palette.bg} ${palette.text} ${palette.border} ${sizeClass} ${className}`}
    >
      <span>{initials}</span>
    </div>
  );
}
