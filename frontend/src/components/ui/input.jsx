import React from "react";

export function Input({ className = "", ...props }) {
  return <input className={`border border-slate-200 rounded-lg px-3 py-2 ${className}`} {...props} />;
}

export default Input;
