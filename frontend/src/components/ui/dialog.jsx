import React from "react";

export function Dialog({ open, onOpenChange, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={() => onOpenChange && onOpenChange(false)} />
      <div className="relative z-50 w-full max-w-2xl p-4">
        {children}
      </div>
    </div>
  );
}

export function DialogContent({ children, className = "", ...props }) {
  return <div className={`bg-white rounded-xl border border-slate-200 shadow p-4 ${className}`} {...props}>{children}</div>;
}
export function DialogHeader({ children }) { return <div className="mb-2">{children}</div>; }
export function DialogTitle({ children }) { return <h3 className="text-lg font-semibold">{children}</h3>; }
export function DialogFooter({ children }) { return <div className="mt-3 flex items-center justify-end gap-2">{children}</div>; }

export default Dialog;
