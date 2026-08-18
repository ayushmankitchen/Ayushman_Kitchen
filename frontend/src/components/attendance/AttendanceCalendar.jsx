import { useState, useEffect, useCallback } from "react";
import { adminApi, workerApi, apiError } from "../../lib/api";
import WorkerAvatar from "../ui/WorkerAvatar";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  CheckCircle2,
  Clock,
  XCircle,
  MinusCircle,
  RotateCcw,
  Sparkles,
  TrendingUp,
  AlertCircle,
  Loader2,
} from "lucide-react";

const MONTH_NAMES_HI = [
  "", "", "", "", "", "",
  "", "", "", "", "", ""
];

const MONTH_NAMES_EN = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const WEEKDAYS = [
  { hi: "", en: "Mon", full: "Monday" },
  { hi: "", en: "Tue", full: "Tuesday" },
  { hi: "", en: "Wed", full: "Wednesday" },
  { hi: "", en: "Thu", full: "Thursday" },
  { hi: "", en: "Fri", full: "Friday" },
  { hi: "", en: "Sat", full: "Saturday" },
  { hi: "", en: "Sun", full: "Sunday" },
];

export default function AttendanceCalendar({
  workerId,
  worker: initialWorker,
  isAdmin = false,
  onDateSelect,
  className = "",
}) {
  const today = new Date();
  const [year, setYear] = useState(() => today.getFullYear());
  const [month, setMonth] = useState(() => today.getMonth() + 1); // 1-12
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedDay, setSelectedDay] = useState(null);
  const [markingDate, setMarkingDate] = useState(null);

  const fetchCalendar = useCallback(async () => {
    if (isAdmin && !workerId) return;
    setLoading(true);
    setError("");
    try {
      let res;
      if (isAdmin) {
        res = await adminApi.get(`/workers/${workerId}/attendance/month`, {
          params: { year, month },
        });
      } else {
        res = await workerApi.get("/worker/me/attendance/month", {
          params: { year, month },
        });
      }
      setData(res.data);
      // If a day was selected, refresh its details
      if (selectedDay) {
        const updatedDay = res.data.days?.find((d) => d.date === selectedDay.date);
        if (updatedDay) setSelectedDay(updatedDay);
      }
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  }, [isAdmin, workerId, year, month]);

  useEffect(() => {
    fetchCalendar();
  }, [fetchCalendar]);

  const handlePrevMonth = () => {
    if (month === 1) {
      setYear((y) => y - 1);
      setMonth(12);
    } else {
      setMonth((m) => m - 1);
    }
    setSelectedDay(null);
  };

  const handleNextMonth = () => {
    if (month === 12) {
      setYear((y) => y + 1);
      setMonth(1);
    } else {
      setMonth((m) => m + 1);
    }
    setSelectedDay(null);
  };

  const handleTodayMonth = () => {
    const now = new Date();
    setYear(now.getFullYear());
    setMonth(now.getMonth() + 1);
    setSelectedDay(null);
  };

  const handleAdminQuickMark = async (status) => {
    if (!isAdmin || !selectedDay || selectedDay.is_future || !workerId) return;
    setMarkingDate(selectedDay.date);
    try {
      await adminApi.post("/attendance", {
        worker_id: workerId,
        date: selectedDay.date,
        status,
      });
      toast.success(`${selectedDay.date}: Marked ${status}`);
      await fetchCalendar();
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setMarkingDate(null);
    }
  };

  const workerInfo = data?.worker || initialWorker;
  const summary = data?.summary || {
    present: 0,
    half_day: 0,
    absent: 0,
    not_marked: 0,
    eligible_days: 0,
    earned_units: 0,
    attendance_rate: 0,
  };

  // Determine empty leading cells (Python calendar monthrange weekday: 0=Mon, 6=Sun)
  const firstWeekday = data?.first_weekday ?? 0;
  const leadingBlanks = Array.from({ length: firstWeekday });

  return (
    <div
      data-testid="attendance-calendar-container"
      className={`bg-white border border-stone-200 rounded-3xl p-4 sm:p-6 shadow-sm ${className}`}
    >
      {/* Header & Worker Info (if Worker is available) */}
      {workerInfo && (
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 mb-4 border-b border-stone-100">
          <div className="flex items-center gap-3">
            <WorkerAvatar
              name={workerInfo.name}
              photoUrl={workerInfo.profile_photo_url}
              size="lg"
              className="shadow-sm border border-stone-200 shrink-0"
            />
            <div>
              <h3 className="font-display font-bold text-base sm:text-lg text-slate-900 leading-tight">
                {workerInfo.name}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {workerInfo.work_type}
                {workerInfo.login_id && (
                  <span className="font-mono ml-2 font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded text-[11px]">
                    {workerInfo.login_id}
                  </span>
                )}
                {workerInfo.joining_date && (
                  <span className="ml-2 text-slate-400">· : {workerInfo.joining_date}</span>
                )}
              </p>
            </div>
          </div>

          <Badge className="bg-teal-50 text-teal-900 border-teal-200 text-xs font-bold px-3 py-1.5 rounded-xl">
            <TrendingUp className="h-3.5 w-3.5 mr-1.5 text-teal-700" />
            : {summary.attendance_rate}%
          </Badge>
        </div>
      )}

      {/* Month Navigation Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-2">
          <CalendarIcon className="h-5 w-5 text-teal-800 shrink-0" />
          <h2 className="font-display font-bold text-lg sm:text-xl text-slate-900" data-testid="calendar-month-title">
            {MONTH_NAMES_HI[month - 1]} ({MONTH_NAMES_EN[month - 1]}) {year}
          </h2>
        </div>

        <div className="flex items-center gap-1.5 self-start sm:self-auto">
          <Button
            type="button"
            data-testid="calendar-prev-month-btn"
            variant="outline"
            size="sm"
            onClick={handlePrevMonth}
            className="h-8 w-8 p-0 rounded-xl border-stone-200 text-slate-700 hover:bg-stone-100"
            aria-label="Previous Month"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <Button
            type="button"
            data-testid="calendar-today-btn"
            variant="outline"
            size="sm"
            onClick={handleTodayMonth}
            className="h-8 px-3 rounded-xl border-stone-200 text-xs font-bold text-teal-900 bg-stone-50 hover:bg-teal-50"
          >
            Current)
          </Button>

          <Button
            type="button"
            data-testid="calendar-next-month-btn"
            variant="outline"
            size="sm"
            onClick={handleNextMonth}
            className="h-8 w-8 p-0 rounded-xl border-stone-200 text-slate-700 hover:bg-stone-100"
            aria-label="Next Month"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Loading & Error States */}
      {loading && (
        <div className="py-16 flex flex-col items-center justify-center text-slate-400 gap-2">
          <Loader2 className="h-8 w-8 animate-spin text-teal-800" />
          <p className="text-xs font-medium">Loading attendance...</p>
        </div>
      )}

      {!loading && error && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6 text-center text-rose-800 my-4 space-y-3">
          <AlertCircle className="h-8 w-8 mx-auto text-rose-600" />
          <p className="text-sm font-semibold">{error}</p>
          <p className="text-xs text-rose-600"></p>
          <Button
            type="button"
            data-testid="calendar-retry-btn"
            onClick={fetchCalendar}
            variant="outline"
            size="sm"
            className="bg-white border-rose-300 text-rose-800 hover:bg-rose-100 rounded-xl"
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1" /> Retry</Button>
        </div>
      )}

      {!loading && !error && data && (
        <>
          {/* Monthly Attendance Summary Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3 mb-5" data-testid="attendance-summary-cards">
            <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-2xl p-3 text-center sm:text-left">
              <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wide block">
                Present)
              </span>
              <p className="font-display text-2xl font-extrabold text-emerald-700 mt-0.5" data-testid="summary-present-count">
                {summary.present}
              </p>
              <span className="text-[10px] text-emerald-600/90 font-medium">x)</span>
            </div>

            <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-3 text-center sm:text-left">
              <span className="text-[11px] font-bold text-amber-800 uppercase tracking-wide block">
                Half Day)
              </span>
              <p className="font-display text-2xl font-extrabold text-amber-700 mt-0.5" data-testid="summary-halfday-count">
                {summary.half_day}
              </p>
              <span className="text-[10px] text-amber-600/90 font-medium">x)</span>
            </div>

            <div className="bg-rose-50/70 border border-rose-200/80 rounded-2xl p-3 text-center sm:text-left">
              <span className="text-[11px] font-bold text-rose-800 uppercase tracking-wide block">
                Absent)
              </span>
              <p className="font-display text-2xl font-extrabold text-rose-700 mt-0.5" data-testid="summary-absent-count">
                {summary.absent}
              </p>
              <span className="text-[10px] text-rose-600/90 font-medium">x)</span>
            </div>

            <div className="bg-stone-50 border border-stone-200 rounded-2xl p-3 text-center sm:text-left">
              <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wide block">
                Unmarked)
              </span>
              <p className="font-display text-2xl font-extrabold text-slate-700 mt-0.5" data-testid="summary-notmarked-count">
                {summary.not_marked}
              </p>
              <span className="text-[10px] text-slate-400 font-medium"></span>
            </div>

            <div className="col-span-2 sm:col-span-1 bg-gradient-to-br from-teal-800 to-[#102f2c] text-white rounded-2xl p-3 text-center sm:text-left shadow-xs flex flex-col justify-between">
              <div>
                <span className="text-[11px] font-bold text-teal-200 uppercase tracking-wide block">
                  Rate)
                </span>
                <p className="font-display text-2xl font-extrabold text-amber-300 mt-0.5" data-testid="summary-attendance-rate">
                  {summary.attendance_rate}%
                </p>
              </div>
              <div className="w-full bg-white/20 h-1.5 rounded-full overflow-hidden mt-1">
                <div
                  className="bg-amber-400 h-full rounded-full transition-all"
                  style={{ width: `${Math.min(100, Math.max(0, summary.attendance_rate))}%` }}
                />
              </div>
            </div>
          </div>

          {/* 7-Column Calendar Grid */}
          <div className="border border-stone-200 rounded-2xl overflow-hidden bg-stone-50/50">
            {/* Weekday Headers */}
            <div className="grid grid-cols-7 bg-stone-100/90 border-b border-stone-200 text-center text-[11px] sm:text-xs font-bold text-slate-700 py-2">
              {WEEKDAYS.map((w, idx) => (
                <div key={idx} className="truncate px-0.5">
                  <span className="hidden sm:inline">{w.hi} ({w.en})</span>
                  <span className="sm:hidden">{w.hi}</span>
                </div>
              ))}
            </div>

            {/* Calendar Days */}
            <div className="grid grid-cols-7 gap-[1px] bg-stone-200" data-testid="calendar-grid">
              {/* Leading Empty Cells */}
              {leadingBlanks.map((_, i) => (
                <div key={`blank-${i}`} className="bg-stone-50/40 min-h-[52px] sm:min-h-[68px] p-1" />
              ))}

              {/* Day Cells */}
              {data.days.map((dayObj) => {
                const { date, day, status, is_future, is_pre_joining, is_today } = dayObj;
                const isSelected = selectedDay?.date === date;

                // Visual styling variants
                let bgClass = "bg-white text-slate-800 hover:bg-stone-50";
                let badgeClass = "bg-stone-100 text-slate-500";
                let statusLabel = "Not Marked";
                let shortLabel = "—";

                if (is_pre_joining) {
                  bgClass = "bg-stone-100/50 text-slate-400 opacity-60 cursor-not-allowed";
                  badgeClass = "bg-stone-200 text-slate-400";
                  statusLabel = "Pre-Employment";
                  shortLabel = "N/A";
                } else if (is_future) {
                  bgClass = "bg-stone-50/40 text-slate-300 opacity-50 cursor-not-allowed";
                  badgeClass = "bg-stone-100 text-slate-300";
                  statusLabel = "Future Date";
                  shortLabel = "—";
                } else if (status === "Present") {
                  bgClass = "bg-emerald-50/90 text-emerald-950 hover:bg-emerald-100/90 border-emerald-200";
                  badgeClass = "bg-emerald-600 text-white font-bold";
                  statusLabel = "Present";
                  shortLabel = "P";
                } else if (status === "Half Day") {
                  bgClass = "bg-amber-50/90 text-amber-950 hover:bg-amber-100/90 border-amber-200";
                  badgeClass = "bg-amber-600 text-white font-bold";
                  statusLabel = "Half Day";
                  shortLabel = "HD";
                } else if (status === "Absent") {
                  bgClass = "bg-rose-50/90 text-rose-950 hover:bg-rose-100/90 border-rose-200";
                  badgeClass = "bg-rose-600 text-white font-bold";
                  statusLabel = "Absent";
                  shortLabel = "A";
                }

                const ariaLabel = `${day} ${MONTH_NAMES_EN[month - 1]} ${year}, ${status || (is_pre_joining ? "Pre-joining" : is_future ? "Future" : "Not Marked")}`;

                return (
                  <button
                    key={date}
                    type="button"
                    data-testid={`calendar-day-${date}`}
                    aria-label={ariaLabel}
                    disabled={is_future && !isAdmin}
                    onClick={() => {
                      setSelectedDay(dayObj);
                      if (onDateSelect) onDateSelect(date, status);
                    }}
                    className={`relative min-h-[54px] sm:min-h-[70px] p-1 sm:p-2 text-left transition-all flex flex-col justify-between focus:outline-none focus:ring-2 focus:ring-teal-700 ${bgClass} ${
                      is_today ? "ring-2 ring-teal-700 ring-inset" : ""
                    } ${isSelected ? "ring-2 ring-amber-500 shadow-sm z-10" : ""}`}
                  >
                    {/* Day number & Today Tag */}
                    <div className="flex items-center justify-between w-full">
                      <span
                        className={`text-xs sm:text-sm font-bold font-mono ${
                          is_today ? "text-teal-800 underline decoration-2 underline-offset-2" : ""
                        }`}
                      >
                        {day}
                      </span>
                      {is_today && (
                        <span className="text-[9px] font-extrabold uppercase tracking-tight bg-teal-800 text-white px-1 rounded sm:hidden">
                          </span>
                      )}
                    </div>

                    {/* Status Badge / Dot indicator */}
                    <div className="mt-1 flex items-center justify-between w-full">
                      {!is_future && !is_pre_joining && status ? (
                        <span
                          className={`text-[9px] sm:text-[10px] px-1 sm:px-1.5 py-0.5 rounded-md leading-none truncate ${badgeClass}`}
                        >
                          <span className="hidden sm:inline">
                            {status === "Present" ? "" : status === "Half Day" ? "" : ""}
                          </span>
                          <span className="sm:hidden">{shortLabel}</span>
                        </span>
                      ) : is_pre_joining ? (
                        <span className="text-[8px] sm:text-[9px] text-slate-400 italic truncate">—</span>
                      ) : is_future ? (
                        <span className="text-[8px] sm:text-[9px] text-slate-300 truncate"></span>
                      ) : (
                        <span className="text-[9px] text-slate-400 font-mono">—</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Status Legend */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600 bg-stone-50 p-3 rounded-2xl border border-stone-200">
            <span className="font-bold text-slate-700 text-[11px] uppercase tracking-wider">Legend:</span>
            <div className="flex flex-wrap items-center gap-3 sm:gap-4">
              <div className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-full bg-emerald-500 border border-emerald-600 shrink-0" />
                <span className="font-semibold text-slate-800">Present)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-full bg-amber-500 border border-amber-600 shrink-0" />
                <span className="font-semibold text-slate-800">Half Day)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-full bg-rose-500 border border-rose-600 shrink-0" />
                <span className="font-semibold text-slate-800">Absent)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-full bg-stone-300 border border-stone-400 shrink-0" />
                <span className="text-slate-600">Unmarked)</span>
              </div>
            </div>
          </div>

          {/* Day Detail Card Popup on Tap */}
          {selectedDay && (
            <div
              data-testid="calendar-day-detail-card"
              className="mt-4 p-4 rounded-2xl bg-gradient-to-r from-teal-900 to-[#102f2c] text-white shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-in fade-in duration-200"
            >
              <div>
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-amber-400" />
                  <span className="text-xs font-bold text-teal-300 uppercase tracking-wider">
                    Day Details
                  </span>
                </div>
                <h4 className="font-display font-extrabold text-lg mt-0.5">
                  {selectedDay.date}
                  {selectedDay.is_today && (
                    <span className="ml-2 text-xs bg-amber-400 text-slate-950 font-bold px-2 py-0.5 rounded-full">
                      Today)
                    </span>
                  )}
                </h4>
                <p className="text-xs text-teal-200 mt-1">
                  Status):{" "}
                  <strong className="text-white font-bold">
                    {selectedDay.status
                      ? selectedDay.status === "Present"
                        ? "Present"
                        : selectedDay.status === "Half Day"
                        ? "Half Day"
                        : "Absent"
                      : selectedDay.is_pre_joining
                      ? "Pre-Employment"
                      : selectedDay.is_future
                      ? "Future Date"
                      : "Not Marked"}
                  </strong>
                </p>
              </div>

              {/* Admin Quick Mark Actions */}
              {isAdmin && !selectedDay.is_future && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    data-testid="quick-mark-present-btn"
                    disabled={markingDate === selectedDay.date}
                    onClick={() => handleAdminQuickMark("Present")}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold h-8 px-3"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> P)
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    data-testid="quick-mark-halfday-btn"
                    disabled={markingDate === selectedDay.date}
                    onClick={() => handleAdminQuickMark("Half Day")}
                    className="bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold h-8 px-3"
                  >
                    <Clock className="h-3.5 w-3.5 mr-1" /> HD)
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    data-testid="quick-mark-absent-btn"
                    disabled={markingDate === selectedDay.date}
                    onClick={() => handleAdminQuickMark("Absent")}
                    className="bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold h-8 px-3"
                  >
                    <XCircle className="h-3.5 w-3.5 mr-1" /> A)
                  </Button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
