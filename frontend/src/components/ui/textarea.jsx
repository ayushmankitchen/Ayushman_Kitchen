import React from "react";

export function Textarea({ className = "", ...props }) {
  return <textarea className={`border border-slate-200 rounded-lg px-3 py-2 ${className}`} {...props} />;
}

export default Textarea;
