import React, { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import WorkerAvatar from "@/components/ui/WorkerAvatar";
import AttendanceCalendar from "@/components/attendance/AttendanceCalendar";
import SalarySlipModal from "@/components/salary/SalarySlipModal";
import { adminApi, apiError, money } from "@/lib/api";
import {
  CalendarCheck,
  Wallet,
  Sparkles,
  ArrowLeft,
  Loader2,
  Phone,
  Calendar,
  Briefcase,
  ShieldCheck,
  FileText,
  Sun,
  Moon,
  ChefHat,
  Palmtree,
  CheckCircle2,
  XCircle,
  X,
  MapPin,
  Bike,
  Utensils,
} from "lucide-react";

export default function WorkerViewModal({ workerId, open, onClose }) {
  const [data, setData] = useState(null);
  const [mealStats, setMealStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalTab, setModalTab] = useState("meals"); // "meals", "calendar", "finance"
  const [salarySlipOpen, setSalarySlipOpen] = useState(false);

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

  const isDelivery = (data?.worker?.delivery_preference || "").toUpperCase() === "DELIVERY";

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
                Mode: <strong>{isDelivery ? "🛵 Delivery" : "🍽️ Dine-in"}</strong>
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

          {/* Sub-tab navigation */}
          <div className="flex items-center gap-2 mt-5 border-t border-white/10 pt-4">
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
            <button
              type="button"
              onClick={() => setModalTab("finance")}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                modalTab === "finance"
                  ? "bg-amber-400 text-slate-950 shadow-sm"
                  : "bg-white/10 text-teal-200 hover:bg-white/20"
              }`}
            >
              <Wallet className="h-3.5 w-3.5 inline mr-1.5" />
              Account & Finance
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 sm:p-8 space-y-6">
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
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-300 flex items-center gap-1">
                    <ChefHat className="h-3.5 w-3.5" /> Total Remaining
                  </span>
                  <p className="font-display text-2xl font-extrabold text-amber-300">
                    {mealStats.total_remaining !== null ? mealStats.total_remaining : "∞"}
                    <span className="text-xs font-normal text-teal-200 ml-1">/ {mealStats.total_quota || 60}</span>
                  </p>
                  <p className="text-[11px] text-teal-200">
                    Started: {mealStats.joining_date}
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

          {data && !loading && modalTab === "calendar" && (
            <AttendanceCalendar
              workerId={workerId}
              worker={data.worker}
              isAdmin={true}
            />
          )}

          {data && !loading && modalTab === "finance" && (
            <>
              {/* Highlight Financial Summary */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
                <div className="bg-white border border-stone-200 rounded-2xl p-4 sm:p-5 shadow-sm">
                  <p className="text-xs sm:text-sm text-slate-500 font-medium">Monthly Fee / Salary</p>
                  <p className="font-display text-xl sm:text-2xl font-extrabold text-slate-900 mt-1">
                    {money(data.summary.monthly_salary)}
                  </p>
                </div>

                <div className="bg-teal-50 border border-teal-200 rounded-2xl p-4 sm:p-5 shadow-sm">
                  <p className="text-xs sm:text-sm text-teal-800 font-semibold">Earned / Charge</p>
                  <p className="font-display text-xl sm:text-2xl font-extrabold text-teal-900 mt-1">
                    {money(data.summary.earned_salary)}
                  </p>
                </div>

                <div className="bg-white border border-stone-200 rounded-2xl p-4 sm:p-5 shadow-sm">
                  <p className="text-xs sm:text-sm text-slate-500 font-medium">Paid This Month</p>
                  <p className="font-display text-xl sm:text-2xl font-extrabold text-emerald-800 mt-1">
                    {money(data.summary.paid_this_month)}
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

