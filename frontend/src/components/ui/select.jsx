import React, { createContext, useContext, useState, useRef, useEffect } from "react";
import { ChevronDown, Check } from "lucide-react";

const SelectCtx = createContext(null);

export function Select({ children, value, onValueChange, disabled = false }) {
  const [open, setOpen] = useState(false);
  const [labels, setLabels] = useState({});
  const containerRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open]);

  const registerLabel = (val, label) => {
    setLabels((prev) => (prev[val] === label ? prev : { ...prev, [val]: label }));
  };

  return (
    <SelectCtx.Provider value={{ value, onValueChange, open, setOpen, labels, registerLabel, disabled }}>
      <div ref={containerRef} className="relative w-full">{children}</div>
    </SelectCtx.Provider>
  );
}

export function SelectTrigger({ children, className = "", ...props }) {
  const ctx = useContext(SelectCtx);
  const open = ctx?.open;
  const setOpen = ctx?.setOpen;
  const disabled = ctx?.disabled;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => setOpen && setOpen(!open)}
      className={`w-full h-10 px-3 py-2 flex items-center justify-between text-left text-sm bg-white border border-slate-300 rounded-xl shadow-sm text-slate-900 hover:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/20 disabled:opacity-50 transition-colors ${className}`}
      {...props}
    >
      <div className="flex-1 truncate mr-2">{children}</div>
      <ChevronDown className={`h-4 w-4 text-slate-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
    </button>
  );
}

export function SelectValue({ placeholder = "Select" }) {
  const ctx = useContext(SelectCtx);
  const v = ctx?.value;
  const label = v ? ctx?.labels[v] || v : null;

  return (
    <span className={`block truncate ${!label ? "text-slate-400" : "text-slate-900 font-medium"}`}>
      {label || placeholder}
    </span>
  );
}

export function SelectContent({ children, className = "" }) {
  const ctx = useContext(SelectCtx);
  if (!ctx?.open) return null;

  return (
    <div className={`absolute left-0 top-full z-50 mt-1 max-h-60 w-full min-w-[8rem] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl ring-1 ring-black/5 animate-in fade-in-50 duration-100 ${className}`}>
      {children}
    </div>
  );
}

export function SelectItem({ children, value, className = "" }) {
  const ctx = useContext(SelectCtx);
  const isSelected = ctx?.value === value;

  useEffect(() => {
    if (ctx?.registerLabel && typeof children === "string") {
      ctx.registerLabel(value, children);
    }
  }, [ctx, value, children]);

  const handleSelect = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (ctx?.onValueChange) {
      ctx.onValueChange(value);
    }
    if (ctx?.setOpen) {
      ctx.setOpen(false);
    }
  };

  return (
    <div
      role="option"
      aria-selected={isSelected}
      onClick={handleSelect}
      className={`relative flex cursor-pointer select-none items-center justify-between rounded-lg px-3 py-2 text-sm outline-none transition-colors ${
        isSelected ? "bg-teal-50 text-teal-900 font-medium" : "text-slate-700 hover:bg-slate-50 hover:text-slate-900"
      } ${className}`}
    >
      <span className="truncate">{children}</span>
      {isSelected && <Check className="h-4 w-4 text-teal-700 shrink-0 ml-2" />}
    </div>
  );
}

export default Select;
