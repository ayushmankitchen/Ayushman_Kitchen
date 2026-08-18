import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../ui/dialog";
import { Button } from "../ui/button";
import WorkerAvatar from "../ui/WorkerAvatar";
import { downloadSalarySlipPdf } from "../../lib/salarySlip";
import {
  FileText,
  Download,
  Calendar,
  Loader2,
  CheckCircle2,
  Sparkles,
  Printer,
} from "lucide-react";

const MONTH_OPTIONS = [
  { value: 1, label: "January)" },
  { value: 2, label: "February)" },
  { value: 3, label: "March)" },
  { value: 4, label: "April)" },
  { value: 5, label: "May)" },
  { value: 6, label: "June)" },
  { value: 7, label: "July)" },
  { value: 8, label: "August)" },
  { value: 9, label: "September)" },
  { value: 10, label: "October)" },
  { value: 11, label: "November)" },
  { value: 12, label: "December)" },
];

export default function SalarySlipModal({
  open,
  onClose,
  workerId,
  workerName = "Worker",
  worker = null,
  isAdmin = false,
}) {
  const today = new Date();
  const currentYear = today.getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth() + 1);
  const [downloading, setDownloading] = useState(false);

  const yearOptions = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1];

  const handleDownload = async () => {
    const targetWorkerId = workerId || worker?.id;
    if (!targetWorkerId) return;
    setDownloading(true);
    try {
      await downloadSalarySlipPdf({
        workerId: targetWorkerId,
        workerName: worker?.name || workerName,
        year: selectedYear,
        month: selectedMonth,
        isAdmin,
      });
      if (onClose) onClose();
    } finally {
      setDownloading(false);
    }
  };

  // A stale modal state must never mount a dialog that cannot generate a slip.
  if (!open || !(workerId || worker?.id)) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose && onClose()}>
      <DialogContent
        data-testid="salary-slip-modal-content"
        className="w-[calc(100%_-_1.5rem)] max-w-md rounded-3xl p-6 bg-white border border-stone-200 shadow-2xl"
      >
        <DialogHeader className="text-left">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-teal-800 text-white flex items-center justify-center font-bold shadow-sm shrink-0">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="font-display text-lg font-bold text-slate-900 leading-tight">
                Salary Slip PDF
              </DialogTitle>
              <p className="text-xs text-slate-500 mt-0.5">
                Generate and download verified workforce payment statement
              </p>
            </div>
          </div>
        </DialogHeader>

        {/* Worker Badge Preview */}
        <div className="bg-stone-50 rounded-2xl p-3.5 border border-stone-200 mt-2 flex items-center gap-3">
          <WorkerAvatar
            name={worker?.name || workerName}
            photoUrl={worker?.profile_photo_url}
            size="md"
            className="border border-stone-200 shrink-0"
          />
          <div className="min-w-0">
            <p className="font-bold text-sm text-slate-900 truncate">{worker?.name || workerName}</p>
            <p className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
              <span>{worker?.work_type || "Worker"}</span>
              {worker?.login_id && (
                <span className="font-mono text-amber-700 bg-amber-100/70 px-1.5 py-0.2 rounded font-bold text-[10px]">
                  {worker.login_id}
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Month and Year Selection */}
        <div className="space-y-3 mt-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Month)
              </label>
              <select
                data-testid="salary-slip-month-select"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="w-full h-10 px-3 rounded-xl border border-stone-200 text-xs font-semibold bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-700"
              >
                {MONTH_OPTIONS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Year)
              </label>
              <select
                data-testid="salary-slip-year-select"
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="w-full h-10 px-3 rounded-xl border border-stone-200 text-xs font-semibold bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-700"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* PDF Inclusions Notice */}
        <div className="bg-teal-50/60 border border-teal-200/80 rounded-2xl p-3 text-xs text-teal-900 space-y-1 mt-1">
          <div className="flex items-center gap-1.5 font-bold text-teal-950">
            <Sparkles className="h-3.5 w-3.5 text-teal-700" />
            <span>PDF :</span>
          </div>
          <p className="text-[11px] text-teal-800 leading-relaxed">
            &bull; Present, Half Day, Absent)<br />
            &bull; Advance) <br />
            &bull; WorkForce </p>
        </div>

        <DialogFooter className="mt-4 gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={downloading || !(workerId || worker?.id)}
            className="w-full sm:w-auto rounded-xl text-xs"
          >
            Cancel
          </Button>
          <Button
            type="button"
            data-testid="confirm-download-salary-slip-btn"
            onClick={handleDownload}
            disabled={downloading}
            className="w-full sm:w-auto bg-teal-800 hover:bg-teal-900 text-white rounded-xl text-xs font-bold shadow-md h-10 px-5"
          >
            {downloading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-1.5" />
                PDF)
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
