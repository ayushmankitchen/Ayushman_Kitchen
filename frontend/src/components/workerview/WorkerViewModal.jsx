import React, { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import WorkerAvatar from "@/components/ui/WorkerAvatar";
import { adminApi, apiError } from "@/lib/api";
import { downloadStudentMealPdf } from "@/lib/mealStatementPdf";
import {
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  ArrowLeft,
  Loader2,
  Phone,
  Calendar,
  Briefcase,
  Sun,
  Moon,
  ChefHat,
  Palmtree,
  CheckCircle2,
  XCircle,
  MapPin,
  Bike,
  Utensils,
  FileText,
  Calendar as CalendarIcon,
} from "lucide-react";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const WEEKDAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function StudentMealCalendarView({ workerId, worker }) {
  const today = new Date();
  const [calMonth, setCalMonth] = useState(() => {
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  });
  const [calData, setCalData] = useState(null);
  const [calLoading, setCalLoading] = useState(true);

  const [yearNum, monthNum] = calMonth.split("-").map(Number);

  const fetchMealCalendar = useCallback(async (mStr) => {
    if (!workerId) return;
    setCalLoading(true);
    try {
      const res = await adminApi.get(`/admin/workers/${workerId}/meal-calendar`, {
        params: { month: mStr },
      });
      setCalData(res.data);
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setCalLoading(false);
    }
  }, [workerId]);

  useEffect(() => {
    fetchMealCalendar(calMonth);
  }, [calMonth, fetchMealCalendar]);

  const handlePrevMonth = () => {
    if (monthNum === 1) {
      setCalMonth(`${yearNum - 1}-12`);
    } else {
      setCalMonth(`${yearNum}-${String(monthNum - 1).padStart(2, "0")}`);
    }
  };

  const handleNextMonth = () => {
    if (monthNum === 12) {
      setCalMonth(`${yearNum + 1}-01`);
    } else {
      setCalMonth(`${yearNum}-${String(monthNum + 1).padStart(2, "0")}`);
    }
  };

  const handleCurrentMonth = () => {
    const d = new Date();
    setCalMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  const summary = calData?.summary;

  return (
    <div className="space-y-5">
      {/* Month Navigation Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-stone-200 shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-teal-50 text-teal-800 flex items-center justify-center">
            <CalendarCheck className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-display font-extrabold text-lg text-slate-900 leading-tight">
              {MONTH_NAMES[monthNum - 1]} {yearNum}
            </h3>
            <p className="text-[11px] text-slate-500 font-medium">Monthly Meal Attendance & Quota Log</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 self-start sm:self-auto">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handlePrevMonth}
            className="rounded-xl h-8 px-2.5 text-xs font-bold border-stone-200"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCurrentMonth}
            className="rounded-xl h-8 px-3 text-xs font-bold border-stone-200 text-teal-800 hover:bg-teal-50"
          >
            Today
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleNextMonth}
            className="rounded-xl h-8 px-2.5 text-xs font-bold border-stone-200"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              downloadStudentMealPdf({
                workerId,
                studentName: worker?.name || "Student",
                month: calMonth,
                isAdmin: true,
              })
            }
            className="rounded-xl h-8 px-3 text-xs font-bold border-teal-200 text-teal-900 bg-teal-50 hover:bg-teal-100 flex items-center gap-1.5 shadow-2xs"
            title="Download Monthly Meal Statement PDF"
          >
            <FileText className="h-3.5 w-3.5 text-teal-800" />
            <span>Meal PDF</span>
          </Button>
        </div>
      </div>

      {/* Top Metrics Cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {/* 1. Start Date */}
          <div className="p-3.5 rounded-2xl bg-white border border-stone-200 shadow-xs space-y-0.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">📅 Start Date</span>
            <p className="font-display text-base font-extrabold text-slate-900 truncate">
              {summary.lunch_start_date || summary.joining_date}
            </p>
            <p className="text-[10px] text-slate-400">Meal active since</p>
          </div>

          {/* 2. Meals Eaten */}
          <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 shadow-xs space-y-0.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 block">🟢 Meals Eaten</span>
            <p className="font-display text-xl font-extrabold text-emerald-950">
              {summary.total_used ?? summary.present}
            </p>
            <p className="text-[10px] text-emerald-700">Plates served</p>
          </div>

          {/* 3. Remaining Meals */}
          <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 shadow-xs space-y-0.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-900 block">🍱 Remaining</span>
              {summary.is_validity_expired ? (
                <span className="text-[9px] font-bold bg-rose-600 text-white px-1.5 py-0.5 rounded">
                  Expired (45d)
                </span>
              ) : (
                <span className="text-[9px] font-bold bg-amber-200 text-amber-950 px-1.5 py-0.5 rounded">
                  {summary.validity_days_left}d left
                </span>
              )}
            </div>
            <p className="font-display text-xl font-extrabold text-amber-950">
              {summary.total_remaining !== null ? summary.total_remaining : "∞"}
              <span className="text-[11px] font-normal text-slate-500 ml-1">
                / {summary.total_quota || (summary.meal_plan_type === "BOTH" ? 60 : 30)}
              </span>
            </p>
            <p className="text-[10px] text-amber-800 truncate">
              {summary.is_validity_expired ? `Ended ${summary.validity_expiry_date}` : `Valid till ${summary.validity_expiry_date}`}
            </p>
          </div>

          {/* 4. Skipped / Cancelled */}
          <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 shadow-xs space-y-0.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-rose-900 block">🔴 Skipped / Cancelled</span>
            <p className="font-display text-xl font-extrabold text-rose-950">
              {summary.total_skipped ?? summary.absent}
            </p>
            <p className="text-[10px] text-rose-700">Skipped meals</p>
          </div>

          {/* 5. Vacation */}
          <div className="p-3.5 rounded-2xl bg-teal-50 border border-teal-200 shadow-xs space-y-0.5 col-span-2 sm:col-span-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-teal-900 block">🏖️ Vacation / Leave</span>
            <p className="font-display text-xl font-extrabold text-teal-950">
              {summary.on_leave || 0}
            </p>
            <p className="text-[10px] text-teal-700">Days paused</p>
          </div>
        </div>
      )}

      {/* Calendar Grid Box */}
      <div className="bg-white border border-stone-200 rounded-3xl p-4 sm:p-6 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between border-b border-stone-100 pb-3 gap-2">
          <h4 className="font-display font-bold text-sm text-slate-900 flex items-center gap-1.5">
            <ChefHat className="h-4 w-4 text-teal-800" />
            <span>Daily Lunch & Dinner Meal History</span>
          </h4>

          <div className="flex flex-wrap items-center gap-2.5 text-[10px] font-bold">
            <span className="flex items-center gap-1 text-sky-700">
              <span className="h-2 w-2 rounded-full bg-sky-500" /> Today
            </span>
            <span className="flex items-center gap-1 text-emerald-700">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> Eaten
            </span>
            <span className="flex items-center gap-1 text-amber-700">
              <span className="h-2 w-2 rounded-full bg-amber-500" /> 1 Meal
            </span>
            <span className="flex items-center gap-1 text-rose-700">
              <span className="h-2 w-2 rounded-full bg-rose-500" /> Skipped
            </span>
            <span className="flex items-center gap-1 text-teal-700">
              <span className="h-2 w-2 rounded-full bg-teal-500" /> Vacation
            </span>
          </div>
        </div>

        {calLoading ? (
          <div className="py-16 text-center text-slate-400 flex items-center justify-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-teal-800" />
            <span className="text-xs font-semibold">Loading student meal calendar records...</span>
          </div>
        ) : !calData?.days?.length ? (
          <div className="py-12 text-center text-slate-400 text-xs">No records found for this month</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2.5">
            {calData.days.map((d) => {
              const dayNum = parseInt(d.date.split("-")[2], 10);
              const dateObj = new Date(d.date + "T00:00:00");
              const weekdayStr = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dateObj.getDay()];

              let bgClass = "bg-stone-50 border-stone-200 text-slate-400";
              let statusText = "Future";
              let badgeColor = "bg-stone-100 text-slate-500";

              if (d.status === "BEFORE_JOIN") {
                bgClass = "bg-stone-50/50 border-dashed border-stone-200 text-slate-300";
                statusText = "Pre-Start";
                badgeColor = "bg-stone-100 text-slate-400";
              } else if (d.status === "TODAY") {
                bgClass = "bg-sky-50/90 border-sky-300 text-sky-950 ring-2 ring-sky-400/40 shadow-xs";
                statusText = "Today";
                badgeColor = "bg-sky-200 text-sky-900 font-extrabold";
              } else if (d.status === "PRESENT") {
                bgClass = "bg-emerald-50/90 border-emerald-300 text-emerald-950";
                statusText = "Eaten";
                badgeColor = "bg-emerald-200 text-emerald-900";
              } else if (d.status === "PARTIAL") {
                bgClass = "bg-amber-50/90 border-amber-300 text-amber-950";
                statusText = "1 Meal";
                badgeColor = "bg-amber-200 text-amber-900";
              } else if (d.status === "ABSENT") {
                bgClass = "bg-rose-50/90 border-rose-300 text-rose-950";
                statusText = "Skipped";
                badgeColor = "bg-rose-200 text-rose-900";
              } else if (d.status === "ON_LEAVE") {
                bgClass = "bg-teal-50/90 border-teal-300 text-teal-950";
                statusText = "Vacation";
                badgeColor = "bg-teal-200 text-teal-900";
              }

              return (
                <div
                  key={d.date}
                  className={`p-3 rounded-2xl border transition-all flex flex-col justify-between min-h-[90px] ${bgClass}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-baseline gap-1">
                      <span className="font-display font-extrabold text-base">
                        {dayNum}
                      </span>
                      <span className="text-[10px] font-bold text-slate-400 uppercase">
                        {weekdayStr}
                      </span>
                    </div>
                    <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded-md ${badgeColor}`}>
                      {statusText}
                    </span>
                  </div>

                  {d.status !== "FUTURE" && d.status !== "BEFORE_JOIN" && (
                    <div className="text-[10px] space-y-0.5 pt-1 border-t border-black/5 mt-1">
                      {d.lunch && d.lunch !== "N_A" && (
                        <div className="flex items-center justify-between leading-none py-0.5">
                          <span className="text-slate-500 font-medium">☀️ Lunch:</span>
                          <span className="font-bold truncate max-w-[65px] text-[9.5px]">
                            {d.lunch === "ATE"
                              ? "✓ Ate"
                              : d.lunch === "SCHEDULED" || d.lunch === "DEFAULT"
                              ? "⏳ Sched"
                              : d.lunch === "CANCELLED"
                              ? "✕ Off"
                              : d.lunch === "LEAVE"
                              ? "🏖️"
                              : "—"}
                          </span>
                        </div>
                      )}
                      {d.dinner && d.dinner !== "N_A" && (
                        <div className="flex items-center justify-between leading-none py-0.5">
                          <span className="text-slate-500 font-medium">🌙 Dinner:</span>
                          <span className="font-bold truncate max-w-[65px] text-[9.5px]">
                            {d.dinner === "ATE"
                              ? "✓ Ate"
                              : d.dinner === "SCHEDULED" || d.dinner === "DEFAULT"
                              ? "⏳ Sched"
                              : d.dinner === "CANCELLED"
                              ? "✕ Off"
                              : d.dinner === "LEAVE"
                              ? "🏖️"
                              : "—"}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function WorkerViewModal({ workerId, open, onClose }) {
  const [data, setData] = useState(null);
  const [mealStats, setMealStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalTab, setModalTab] = useState("meals"); // "meals" or "calendar"

  // Renewal State
  const [renewOpen, setRenewOpen] = useState(false);
  const [renewDate, setRenewDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [renewPlan, setRenewPlan] = useState("BOTH");
  const [renewQuota, setRenewQuota] = useState(60);
  const [renewing, setRenewing] = useState(false);

  const loadData = useCallback(async () => {
    if (!workerId) return;
    try {
      const [detailsRes, statsRes] = await Promise.all([
        adminApi.get(`/workers/${workerId}/details`),
        adminApi.get(`/admin/workers/${workerId}/meal-stats`).catch(() => ({ data: null })),
      ]);
      setData(detailsRes.data);
      setMealStats(statsRes.data);
      if (statsRes.data?.meal_plan_type) {
        setRenewPlan(statsRes.data.meal_plan_type);
        setRenewQuota(statsRes.data.meal_plan_type === "BOTH" ? 60 : 30);
      }
    } catch (err) {
      setError(apiError(err));
    }
  }, [workerId]);

  useEffect(() => {
    if (!open || !workerId) return;
    setLoading(true);
    setError("");
    setRenewOpen(false);

    (async () => {
      await loadData();
      setLoading(false);
    })();
  }, [open, workerId, loadData]);

  const handleRenewSubmit = async () => {
    setRenewing(true);
    try {
      await adminApi.post(`/admin/workers/${workerId}/renew`, {
        renewal_start_date: renewDate,
        meal_plan_type: renewPlan,
        total_quota: parseInt(renewQuota, 10),
      });
      toast.success("Subscription successfully renewed!");
      setRenewOpen(false);
      await loadData();
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setRenewing(false);
    }
  };

  if (!open) return null;

  const deliveryPref = (data?.worker?.delivery_preference || "").toUpperCase();
  const isDelivery = deliveryPref === "DELIVERY";
  const isPickup = deliveryPref === "PICKUP";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[calc(100%_-_1.5rem)] max-w-3xl max-h-[92vh] overflow-y-auto rounded-3xl p-0 gap-0 border-0 shadow-2xl bg-[#f8f7f2]">
        {/* Header */}
        <div className="bg-[#102f2c] text-white p-6 sm:p-8 rounded-t-3xl relative">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <WorkerAvatar
                name={data?.worker?.name || ""}
                photoUrl={data?.worker?.profile_photo_url || ""}
                size="xl"
                className="shadow-lg border-2 border-white/20 ring-2 ring-amber-400/30"
              />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-extrabold uppercase tracking-widest text-teal-300 block">
                    Student Profile
                  </span>
                  {data?.worker?.login_id && (
                    <span className="bg-amber-400/20 text-amber-300 border border-amber-400/40 text-[11px] font-mono font-bold px-2 py-0.5 rounded-md">
                      {data.worker.login_id}
                    </span>
                  )}
                </div>
                <h1 className="font-display text-2xl sm:text-3xl font-extrabold mt-0.5 truncate">
                  {data?.worker?.name || ""}
                </h1>
                <p className="text-xs text-teal-200 mt-0.5 font-medium flex items-center gap-2">
                  <span>{data?.worker?.work_type}</span>
                  {data?.worker?.status && (
                    <span className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full ${data.worker.status === 'INACTIVE' ? 'bg-rose-500/20 text-rose-300' : 'bg-emerald-500/20 text-emerald-300'}`}>
                      {data.worker.status === 'INACTIVE' ? 'Inactive' : 'Active'}
                    </span>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Button
                onClick={onClose}
                variant="outline"
                size="sm"
                className="bg-white/10 hover:bg-white/20 text-white border-white/20 rounded-xl"
              >
                <ArrowLeft className="h-4 w-4 mr-1.5" /> Close
              </Button>
            </div>
          </div>

          {data && (
            <div className="flex flex-wrap gap-2.5 mt-6 text-xs text-teal-100">
              <span className="bg-white/10 px-3 py-1.5 rounded-xl flex items-center gap-1.5">
                <Briefcase className="h-3.5 w-3.5 text-amber-300" /> Plan: <strong>{data.worker.work_type}</strong>
              </span>
              <span className="bg-white/10 px-3 py-1.5 rounded-xl flex items-center gap-1.5">
                <ChefHat className="h-3.5 w-3.5 text-amber-300" /> Service: <strong>
                  {data.worker.meal_plan_type === "LUNCH_ONLY"
                    ? "Lunch Only"
                    : data.worker.meal_plan_type === "DINNER_ONLY"
                    ? "Dinner Only"
                    : "Both (Lunch + Dinner)"}
                </strong>
              </span>
              <span className="bg-white/10 px-3 py-1.5 rounded-xl flex items-center gap-1.5">
                {isDelivery ? <Bike className="h-3.5 w-3.5 text-amber-300" /> : <Utensils className="h-3.5 w-3.5 text-amber-300" />}
                Mode: <strong>{isDelivery ? "🛵 Delivery" : isPickup ? "🧳 Pickup" : "🍽️ Dine-in"}</strong>
              </span>
              {isDelivery && data.worker.delivery_address && (
                <span className="bg-white/10 px-3 py-1.5 rounded-xl flex items-center gap-1.5 max-w-[280px] truncate" title={data.worker.delivery_address}>
                  <MapPin className="h-3.5 w-3.5 text-amber-300 shrink-0" /> Room: <strong className="truncate">{data.worker.delivery_address}</strong>
                </span>
              )}
              <span className="bg-white/10 px-3 py-1.5 rounded-xl flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5 text-amber-300" /> Mobile: <strong className="font-mono">{data.worker.mobile || "—"}</strong>
              </span>
              <span className="bg-white/10 px-3 py-1.5 rounded-xl flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-amber-300" /> Joined: <strong>{data.worker.joining_date}</strong>
              </span>
            </div>
          )}

          {/* Sub-tab navigation: 2 Clean Tabs */}
          <div className="flex flex-wrap items-center justify-between gap-2 mt-5 border-t border-white/10 pt-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setModalTab("meals")}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  modalTab === "meals"
                    ? "bg-amber-400 text-slate-950 shadow-sm"
                    : "bg-white/10 text-teal-200 hover:bg-white/20"
                }`}
              >
                <ChefHat className="h-3.5 w-3.5 inline mr-1.5" />
                Meal Quota & Stats
              </button>
              <button
                type="button"
                onClick={() => setModalTab("calendar")}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  modalTab === "calendar"
                    ? "bg-amber-400 text-slate-950 shadow-sm"
                    : "bg-white/10 text-teal-200 hover:bg-white/20"
                }`}
              >
                <CalendarCheck className="h-3.5 w-3.5 inline mr-1.5" />
                Attendance Calendar
              </button>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                downloadStudentMealPdf({
                  workerId,
                  studentName: data?.worker?.name || "Student",
                  isAdmin: true,
                })
              }
              className="rounded-xl h-8 px-3 text-xs font-bold bg-white/10 hover:bg-white/20 text-amber-300 border-white/20 flex items-center gap-1.5"
              title="Download Student Meal Statement PDF"
            >
              <FileText className="h-3.5 w-3.5 text-amber-300" />
              <span>Download PDF Statement</span>
            </Button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 md:p-8 space-y-6">
          {loading && (
            <div className="py-16 text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-teal-800" />
            </div>
          )}

          {error && (
            <div className="p-6 bg-rose-50 text-rose-700 rounded-2xl text-center">
              <p className="font-semibold">{error}</p>
            </div>
          )}

          {/* 1. MEAL QUOTA & STATS TAB */}
          {mealStats && !loading && modalTab === "meals" && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                {/* Total Balance */}
                <div className="p-4 rounded-2xl bg-[#102f2c] text-white shadow-md space-y-1 col-span-2 sm:col-span-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-amber-300 flex items-center gap-1">
                      <ChefHat className="h-3.5 w-3.5" /> Total Remaining
                    </span>
                    {mealStats.is_validity_expired ? (
                      <span className="text-[9px] font-bold bg-rose-600 text-white px-1.5 py-0.5 rounded">
                        Expired (45d)
                      </span>
                    ) : (
                      <span className="text-[9px] font-bold bg-teal-900 text-teal-200 px-1.5 py-0.5 rounded">
                        {mealStats.validity_days_left}d left
                      </span>
                    )}
                  </div>
                  <p className="font-display text-2xl font-extrabold text-amber-300">
                    {mealStats.total_remaining !== null ? mealStats.total_remaining : "∞"}
                    <span className="text-xs font-normal text-teal-200 ml-1">/ {mealStats.total_quota || 60}</span>
                  </p>
                  <p className="text-[11px] text-teal-200">
                    {mealStats.is_validity_expired
                      ? `45-day validity ended on ${mealStats.validity_expiry_date}`
                      : `45-day validity until ${mealStats.validity_expiry_date}`}
                  </p>
                </div>

                {/* Lunch Stats */}
                <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 space-y-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-900 flex items-center gap-1">
                    <Sun className="h-3.5 w-3.5" /> Lunch Remaining
                  </span>
                  <p className="font-display text-2xl font-extrabold text-amber-950">
                    {mealStats.lunch_remaining !== null ? mealStats.lunch_remaining : "∞"}
                    <span className="text-xs font-normal text-slate-400 ml-1">/ {mealStats.lunch_quota || 30}</span>
                  </p>
                  <p className="text-[11px] text-amber-800">
                    {mealStats.lunch_used} taken · {mealStats.lunch_skipped || 0} skipped
                  </p>
                </div>

                {/* Dinner Stats */}
                <div className="p-4 rounded-2xl bg-teal-50 border border-teal-200 space-y-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-teal-900 flex items-center gap-1">
                    <Moon className="h-3.5 w-3.5" /> Dinner Remaining
                  </span>
                  <p className="font-display text-2xl font-extrabold text-teal-950">
                    {mealStats.dinner_remaining !== null ? mealStats.dinner_remaining : "∞"}
                    <span className="text-xs font-normal text-slate-400 ml-1">/ {mealStats.dinner_quota || 30}</span>
                  </p>
                  <p className="text-[11px] text-teal-800">
                    {mealStats.dinner_used} taken · {mealStats.dinner_skipped || 0} skipped
                  </p>
                </div>

                {/* Total Taken */}
                <div className="p-4 rounded-2xl bg-white border border-stone-200 shadow-sm space-y-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1">
                    <ChefHat className="h-3.5 w-3.5" /> Total Meals Taken
                  </span>
                  <p className="font-display text-2xl font-extrabold text-teal-800">
                    {mealStats.total_used}
                  </p>
                  <p className="text-[11px] text-slate-400">{mealStats.total_skipped || 0} meals skipped</p>
                </div>
              </div>

              {/* Subscription Breakdown & Quick Renew */}
              <div className="bg-white border border-stone-200 rounded-3xl p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-display font-bold text-base text-slate-900">
                      Student Service Configuration & Renewal
                    </h3>
                    <p className="text-xs text-slate-500">Active meal subscription status</p>
                  </div>
                  <Button
                    type="button"
                    onClick={() => setRenewOpen(!renewOpen)}
                    className="bg-teal-800 hover:bg-teal-900 text-white rounded-xl text-xs font-bold shadow-sm"
                  >
                    🔄 Renew Subscription
                  </Button>
                </div>

                {renewOpen && (
                  <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 space-y-3">
                    <span className="text-xs font-extrabold text-slate-800 block">
                      Renew Meal Subscription
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="text-[11px] font-semibold text-slate-600 block mb-1">Renewal Start Date</label>
                        <Input
                          type="date"
                          value={renewDate}
                          onChange={(e) => setRenewDate(e.target.value)}
                          className="bg-white rounded-xl text-xs font-bold"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-slate-600 block mb-1">Service Plan</label>
                        <select
                          value={renewPlan}
                          onChange={(e) => {
                            setRenewPlan(e.target.value);
                            setRenewQuota(e.target.value === "BOTH" ? 60 : 30);
                          }}
                          className="w-full bg-white border border-stone-200 rounded-xl text-xs font-bold px-3 h-10 text-slate-800"
                        >
                          <option value="BOTH">☀️🌙 Both (60 Meals)</option>
                          <option value="LUNCH_ONLY">☀️ Lunch Only (30 Meals)</option>
                          <option value="DINNER_ONLY">🌙 Dinner Only (30 Meals)</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-slate-600 block mb-1">Quota Pool</label>
                        <Input
                          type="number"
                          value={renewQuota}
                          onChange={(e) => setRenewQuota(e.target.value)}
                          className="bg-white rounded-xl text-xs font-bold font-mono"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setRenewOpen(false)}
                        className="rounded-xl text-xs"
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={renewing}
                        onClick={handleRenewSubmit}
                        className="bg-teal-800 hover:bg-teal-900 text-white rounded-xl text-xs font-bold"
                      >
                        {renewing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                        Confirm Renewal
                      </Button>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="p-3 bg-stone-50 rounded-xl border border-stone-100">
                    <span className="text-slate-500 font-medium block">Subscription Tier</span>
                    <strong className="text-sm font-bold text-slate-900">{mealStats.worker?.work_type || "Standard"}</strong>
                  </div>
                  <div className="p-3 bg-stone-50 rounded-xl border border-stone-100">
                    <span className="text-slate-500 font-medium block">Allowed Service</span>
                    <strong className="text-sm font-bold text-slate-900">
                      {mealStats.meal_plan_type === "LUNCH_ONLY"
                        ? "Lunch Only"
                        : mealStats.meal_plan_type === "DINNER_ONLY"
                        ? "Dinner Only"
                        : "Both Lunch & Dinner"}
                    </strong>
                  </div>
                  <div className="p-3 bg-stone-50 rounded-xl border border-stone-100">
                    <span className="text-slate-500 font-medium block">Default Preference</span>
                    <strong className="text-sm font-bold text-slate-900">
                      {mealStats.worker?.diet_preference === "NON_VEG" ? "🍗 Non-Veg" : "🥦 Pure Veg"}
                    </strong>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 2. MEAL ATTENDANCE CALENDAR TAB */}
          {data && !loading && modalTab === "calendar" && (
            <StudentMealCalendarView
              workerId={workerId}
              worker={data.worker}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

