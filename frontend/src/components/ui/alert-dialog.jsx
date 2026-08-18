import React from "react";

export function AlertDialog({ open, onOpenChange, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={() => onOpenChange && onOpenChange(false)} />
      <div className="relative z-50 w-full max-w-md p-4">{children}</div>
    </div>
  );
}

export function AlertDialogContent({ children }) { return <div className="bg-white rounded-xl border border-slate-200 shadow p-4">{children}</div>; }
export function AlertDialogHeader({ children }) { return <div className="mb-2">{children}</div>; }
export function AlertDialogTitle({ children }) { return <h3 className="text-lg font-semibold">{children}</h3>; }
export function AlertDialogDescription({ children }) { return <p className="text-sm text-slate-500">{children}</p>; }
export function AlertDialogFooter({ children }) { return <div className="mt-4 flex justify-end gap-2">{children}</div>; }
export function AlertDialogCancel({ children, ...props }) { return <button className="px-3 py-1.5 bg-slate-100 rounded" {...props}>{children}</button>; }
export function AlertDialogAction({ children, className = "", ...props }) { return <button className={`px-3 py-1.5 rounded text-white ${className}`} {...props}>{children}</button>; }

export default AlertDialog;
