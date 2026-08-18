import React from "react";

export function Badge({ children, className = "", variant = "" }) {
  const base = "inline-flex items-center px-2 py-1 text-xs font-medium rounded-full border";
  return <span className={`${base} ${className}`}>{children}</span>;
}

export default Badge;
