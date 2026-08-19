import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { workerApi, apiError } from "@/lib/api";
import { applyDynamicBranding } from "@/lib/dynamicBranding";
import { useWorkerAuth } from "@/context/WorkerAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import WorkerAvatar from "@/components/ui/WorkerAvatar";
import MessageBubble from "@/components/chat/MessageBubble";
import VoiceRecorder from "@/components/chat/VoiceRecorder";
import AudioPlayer from "@/components/chat/AudioPlayer";
import SpeechTyping from "@/components/chat/SpeechTyping";
import useSmartChatScroll from "@/components/chat/useSmartChatScroll";
import { clearConversationNotifications, enablePushNotifications, pushSupported, updateAppBadge } from "@/lib/notifications";
import {
  Loader2,
  LogOut,
  GraduationCap,
  ChefHat,
  CalendarCheck,
  Sparkles,
  MessageSquare,
  Send,
  Mic,
  Home,
  Lock,
  Eye,
  EyeOff,
  X,
  CheckCircle2,
  RefreshCw,
  Sun,
  Moon,
  Clock,
  CalendarOff,
  XCircle,
  AlertCircle,
  Palmtree,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  ArrowRight,
  Ban,
  Megaphone,
  Building2,
  Image as ImageIcon,
  Mail,
  MapPin,
  Bike,
  Utensils,
} from "lucide-react";

const DEFAULT_SHOWCASE_BOXES = [
  {
    id: 1,
    title: "Special Deluxe Thali",
    subtitle: "Paneer Butter Masala, Dal Makhani, 4 Butter Rotis, Steamed Rice, Salad & Sweet",
    image_url: "https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=500&auto=format&fit=crop&q=60",
    badge: "Popular Thali"
  },
  {
    id: 2,
    title: "Sunday Special Biryani",
    subtitle: "Fragrant Dum Biryani served with spiced Mirchi Ka Salan, Boondi Raita & Gulab Jamun",
    image_url: "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=500&auto=format&fit=crop&q=60",
    badge: "Sunday Feast"
  },
  {
    id: 3,
    title: "High-Protein Diet Bowl",
    subtitle: "Sprouted pulses, boiled eggs, fresh curd, roasted paneer cubes and crunchy green salad",
    image_url: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=500&auto=format&fit=crop&q=60",
    badge: "Healthy Choice"
  },
  {
    id: 4,
    title: "Evening Snacks & Tea",
    subtitle: "Hot crispy Samosas, Poha, Bread Pakoras & steaming hot Ginger Masala Chai daily",
    image_url: "https://images.unsplash.com/photo-1601050690597-df0568f70950?w=500&auto=format&fit=crop&q=60",
    badge: "Snacks & Chai"
  }
];

/* ─────────────────────────────────────────────────────────────
   MealSlotCard – renders one meal slot (lunch OR dinner)
───────────────────────────────────────────────────────────── */
function MealSlotCard({
  slotKey,
  title,
  icon,
  iconBg,
  slotData,
  plan,
  defaultPref,
  defaultPrefDelivery,
  defaultAddress,
  defaultNotes,
  saving,
  onAction,
  onServiceModeChange,
  onEditAddress,
  onEndLeave,
}) {
  if (!slotData) {
    return (
      <div className="bg-white border border-stone-200 rounded-3xl p-6 flex items-center justify-center text-slate-400 text-sm">
        {icon} <span className="ml-2">{title} menu not available</span>
      </div>
    );
  }

  const isPlanIncluded = slotData.is_plan_included !== false;
  const isOnLeave     = slotData.is_on_leave;
  const isHoliday     = slotData.is_holiday;
  const isClosed      = slotData.is_closed;
  const windowOpen    = slotData.window?.is_open;
  const windowStart   = slotData.window?.start_time || "";
  const windowEnd     = slotData.window?.end_time || "";
  const isCancelled   = slotData.is_cancelled;
  const isConfirmed   = slotData.effective_choice && !slotData.is_cancelled && !slotData.is_closed && !isOnLeave;
  const windowLabel   = windowStart && windowEnd
    ? `${windowStart} – ${windowEnd}`
    : slotKey === "lunch" ? "8:00 – 11:00 AM" : "4:00 – 7:00 PM";

  const effectiveDeliveryOption = (slotData.delivery_option || defaultPrefDelivery || "DINE_IN").toUpperCase();
  const effectiveAddress = slotData.delivery_address || defaultAddress || "";
  const effectiveNotes = slotData.delivery_notes || defaultNotes || "";

  /* window status badge */
  let windowBadge;
  if (!isPlanIncluded) {
    windowBadge = (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200 px-2 py-0.5 rounded-full">
        <Ban className="h-3 w-3" /> Not in Plan
      </span>
    );
  } else if (isOnLeave) {
    windowBadge = (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 px-2 py-0.5 rounded-full">
        <Palmtree className="h-3 w-3" /> On Vacation
      </span>
    );
  } else if (isHoliday || isClosed) {
    windowBadge = (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-200 px-2 py-0.5 rounded-full">
        <CalendarOff className="h-3 w-3" /> Kitchen Closed
      </span>
    );
  } else if (windowOpen) {
    windowBadge = (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> Window Open
      </span>
    );
  } else {
    windowBadge = (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200 px-2 py-0.5 rounded-full">
        <Clock className="h-3 w-3" /> Window Closed
      </span>
    );
  }

  return (
    <div className="bg-white border border-stone-200 rounded-3xl p-5 shadow-sm space-y-4 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`h-9 w-9 rounded-2xl ${iconBg} flex items-center justify-center`}>{icon}</div>
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wider text-slate-700">{title}</p>
            <p className="text-[10px] text-slate-400 flex items-center gap-1"><Clock className="h-3 w-3" /> {windowLabel}</p>
          </div>
        </div>
        {windowBadge}
      </div>

      {/* 1. NOT IN PLAN */}
      {!isPlanIncluded && (
        <div className="flex-1 flex flex-col items-center justify-center py-6 text-center gap-2 bg-stone-50 rounded-2xl border border-stone-200">
          <Ban className="h-8 w-8 text-slate-400" />
          <p className="text-sm font-bold text-slate-700">{title} is not in your meal plan</p>
          <p className="text-xs text-slate-500">Contact admin to upgrade to Both (Lunch + Dinner) plan.</p>
        </div>
      )}

      {/* 2. ON LEAVE / VACATION */}
      {isPlanIncluded && isOnLeave && (
        <div className="flex-1 flex flex-col items-center justify-center py-5 text-center gap-3 bg-amber-50/70 border border-amber-200 rounded-2xl p-4">
          <div className="h-10 w-10 rounded-2xl bg-amber-200 text-amber-900 flex items-center justify-center font-bold">
            <Palmtree className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-bold text-amber-950">You are on Vacation / Home Leave</p>
            <p className="text-xs text-amber-800 mt-0.5">Meals are paused for this date so your quota is preserved.</p>
          </div>
          {slotData.leave_info?.id && (
            <Button
              type="button"
              size="sm"
              onClick={() => onEndLeave(slotData.leave_info.id)}
              className="bg-teal-800 hover:bg-teal-900 text-white font-bold text-xs rounded-xl h-8 px-3"
            >
              🏠 Back from Home? End Leave
            </Button>
          )}
        </div>
      )}

      {/* 3. Holiday / Closed state */}
      {isPlanIncluded && !isOnLeave && (isHoliday || isClosed) && (
        <div className="flex-1 flex flex-col items-center justify-center py-6 text-center gap-2">
          <CalendarOff className="h-8 w-8 text-rose-400" />
          <p className="text-sm font-bold text-rose-700">{isHoliday ? "Holiday – Kitchen Closed" : "Kitchen Closed for This Meal"}</p>
          <p className="text-xs text-slate-400">No {title.toLowerCase()} service today.</p>
        </div>
      )}

      {/* 4. Active slot */}
      {isPlanIncluded && !isOnLeave && !isHoliday && !isClosed && (
        <>
          {/* Cancelled state */}
          {isCancelled && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <XCircle className="h-5 w-5 text-rose-500" />
                <p className="text-sm font-bold text-rose-700">You cancelled {title}</p>
              </div>
              <p className="text-xs text-rose-600">You are marked as not eating {title.toLowerCase()} today.</p>
              {windowOpen && (
                <Button
                  type="button"
                  disabled={saving}
                  onClick={() => onAction(slotKey, "CONFIRM", defaultPref === "NON_VEG" ? "NON_VEG" : "VEG")}
                  className="w-full rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
                >
                  🔄 Opt Back In – Eat {title}
                </Button>
              )}
            </div>
          )}

          {/* Service Mode Preference: Dine-in vs Delivery */}
          {!isCancelled && (
            <div className="rounded-2xl border border-stone-200 bg-stone-50/80 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <Utensils className="h-3.5 w-3.5 text-teal-800" /> Meal Service Mode
                </span>
                {!windowOpen && (
                  <span className="text-[10px] font-bold text-slate-500 bg-slate-200/80 px-2 py-0.5 rounded-md flex items-center gap-1">
                    <Lock className="h-3 w-3" /> Cutoff Locked
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={!windowOpen || saving}
                  onClick={() => onServiceModeChange(slotKey, "DINE_IN")}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                    effectiveDeliveryOption === "DINE_IN"
                      ? "bg-teal-800 border-teal-800 text-white shadow-xs"
                      : "bg-white border-stone-200 text-slate-700 hover:bg-stone-100"
                  } ${!windowOpen ? "opacity-60 cursor-not-allowed" : ""}`}
                >
                  🍽️ Dine-in (Mess)
                </button>
                <button
                  type="button"
                  disabled={!windowOpen || saving}
                  onClick={() => onServiceModeChange(slotKey, "DELIVERY")}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                    effectiveDeliveryOption === "DELIVERY"
                      ? "bg-amber-600 border-amber-600 text-white shadow-xs"
                      : "bg-white border-stone-200 text-slate-700 hover:bg-stone-100"
                  } ${!windowOpen ? "opacity-60 cursor-not-allowed" : ""}`}
                >
                  🛵 Delivery (Room)
                </button>
              </div>

              {effectiveDeliveryOption === "DELIVERY" && (
                <div className="pt-2 border-t border-stone-200 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <span className="text-[10px] font-bold text-amber-900 flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> Delivery Room / Address:
                      </span>
                      <p className="text-xs font-semibold text-slate-800 truncate" title={effectiveAddress || "No address set"}>
                        {effectiveAddress || "⚠️ No address set — click Edit Room"}
                      </p>
                      {effectiveNotes && (
                        <p className="text-[10px] text-slate-500 mt-0.5">Note: {effectiveNotes}</p>
                      )}
                    </div>
                    {windowOpen && (
                      <button
                        type="button"
                        onClick={() => onEditAddress(slotKey, effectiveAddress, effectiveNotes)}
                        className="text-[10px] font-bold text-amber-900 hover:text-amber-950 bg-amber-100 hover:bg-amber-200 px-2 py-1 rounded-lg shrink-0 transition-colors"
                      >
                        ✏️ Edit Room
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Premium plan: gourmet dish choices */}
          {!isCancelled && plan === "Premium" && (
            <div className="space-y-3 flex-1">
              <p className="text-xs font-bold text-amber-700 flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5" /> Select Your Gourmet Dish</p>
              <div className="space-y-2">
                {(slotData.menu?.premium_options || []).map((opt) => {
                  const sel = slotData.selected_item_id === opt.id || slotData.selected_item_name === opt.name;
                  return (
                    <div
                      key={opt.id}
                      onClick={() => windowOpen && onAction(slotKey, "CONFIRM", "PREMIUM_ITEM", opt.id, opt.name)}
                      className={`p-3 rounded-2xl border-2 cursor-pointer transition-all ${
                        sel ? `border-amber-500 bg-amber-50` : "border-stone-200 bg-stone-50 hover:border-amber-300"
                      } ${!windowOpen ? "opacity-60 pointer-events-none" : ""}`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full mr-1.5 ${
                            opt.type === "NON_VEG" ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"
                          }`}>{opt.type === "NON_VEG" ? "🍗" : "🥦"}</span>
                          <span className="text-sm font-bold text-slate-900">{opt.name}</span>
                        </div>
                        {sel && <CheckCircle2 className="h-4 w-4 text-amber-600 shrink-0" />}
                      </div>
                      {opt.description && <p className="text-xs text-slate-500 mt-1 ml-7">{opt.description}</p>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Standard plan: Veg-Only day */}
          {!isCancelled && plan !== "Premium" && slotData.menu?.standard_mode === "VEG_ONLY" && (
            <div className="flex-1 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 space-y-2">
              <p className="text-xs font-extrabold text-emerald-800 uppercase tracking-wider">🥦 Pure Veg Day</p>
              <p className="font-bold text-base text-slate-900">{slotData.menu?.standard_veg_title || "Pure Veg Special"}</p>
              <p className="text-xs text-slate-500">{slotData.menu?.standard_veg_desc || "Fresh veg dish, dal, rice, rotis & salad."}</p>
              <p className="text-[10px] text-emerald-600 font-semibold mt-1">✓ Auto-allocated for you</p>
            </div>
          )}

          {/* Standard plan: Veg + Non-Veg day */}
          {!isCancelled && plan !== "Premium" && slotData.menu?.standard_mode !== "VEG_ONLY" && (
            <div className="space-y-2 flex-1">
              <div
                onClick={() => windowOpen && onAction(slotKey, "CONFIRM", "VEG")}
                className={`p-3.5 rounded-2xl border-2 cursor-pointer transition-all ${
                  slotData.effective_choice === "VEG" ? "border-emerald-500 bg-emerald-50" : "border-stone-200 bg-white hover:border-emerald-300"
                } ${!windowOpen ? "opacity-60 pointer-events-none" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-emerald-800">🥦 {slotData.menu?.standard_veg_title || "Pure Veg Meal"}</span>
                  {slotData.effective_choice === "VEG" && <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">{slotData.menu?.standard_veg_desc || "Dal, rice, rotis, sabzi, salad"}</p>
              </div>
              <div
                onClick={() => windowOpen && onAction(slotKey, "CONFIRM", "NON_VEG")}
                className={`p-3.5 rounded-2xl border-2 cursor-pointer transition-all ${
                  slotData.effective_choice === "NON_VEG" ? "border-amber-500 bg-amber-50" : "border-stone-200 bg-white hover:border-amber-300"
                } ${!windowOpen ? "opacity-60 pointer-events-none" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-amber-900">🍗 {slotData.menu?.standard_non_veg_title || "Non-Veg Meal"}</span>
                  {slotData.effective_choice === "NON_VEG" && <CheckCircle2 className="h-4 w-4 text-amber-600 shrink-0" />}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">{slotData.menu?.standard_non_veg_desc || "Chicken curry, rice, rotis, salad"}</p>
              </div>
            </div>
          )}

          {/* Cancel / Skip button – available when window is open and not already cancelled */}
          {!isCancelled && windowOpen && (
            <button
              type="button"
              disabled={saving}
              onClick={() => onAction(slotKey, "CANCEL")}
              className="w-full mt-auto py-2.5 rounded-xl border border-rose-200 bg-rose-50 text-rose-600 text-xs font-bold hover:bg-rose-100 transition-colors flex items-center justify-center gap-1.5"
            >
              <XCircle className="h-4 w-4" /> Skip / Cancel {title} (Not Eating)
            </button>
          )}

          {/* Window closed notice when cutoff has passed */}
          {!windowOpen && !isCancelled && (
            <div className="rounded-xl bg-stone-100 border border-stone-200 px-3 py-2 flex items-center gap-2">
              <Lock className="h-4 w-4 text-slate-400 shrink-0" />
              <p className="text-[11px] text-slate-500">Cutoff time passed for {title}. Service mode & meal choice are locked.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function WorkerDashboard() {
  const navigate = useNavigate();
  const { user, loading: authLoading, logout, changePassword } = useWorkerAuth();
  const [changePwdOpen, setChangePwdOpen] = useState(false);
  const [changePwdForm, setChangePwdForm] = useState({ current: "", next: "", confirm: "" });
  const [changePwdLoading, setChangePwdLoading] = useState(false);
  const [showChangePwd, setShowChangePwd] = useState(false);
  const [studentEmail, setStudentEmail] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("tab")) return params.get("tab");
    if (params.has("conversation")) return "messages";
    return localStorage.getItem("student_active_tab") || "home";
  });

  useEffect(() => {
    if (tab) {
      try {
        localStorage.setItem("student_active_tab", tab);
        const url = new URL(window.location);
        url.searchParams.set("tab", tab);
        window.history.replaceState({}, "", url.toString());
      } catch (_) {}
    }
  }, [tab]);

  // Meal Selection State
  const [todayMeal, setTodayMeal] = useState(null);
  const [todayMealLoading, setTodayMealLoading] = useState(true);
  const [savingSelection, setSavingSelection] = useState(false);

  // Room / Delivery Address Edit Dialog State
  const [addressDialogOpen, setAddressDialogOpen] = useState(false);
  const [addressDialogSlot, setAddressDialogSlot] = useState("lunch"); // "lunch" or "dinner"
  const [addressDialogValue, setAddressDialogValue] = useState("");
  const [addressDialogNotes, setAddressDialogNotes] = useState("");
  const [addressDialogSaving, setAddressDialogSaving] = useState(false);

  // Meal Quotas / Stats State
  const [mealStats, setMealStats] = useState(null);

  // Vacation / Leaves State
  const [leaves, setLeaves] = useState([]);
  const [leaveModalOpen, setLeaveModalOpen] = useState(false);
  const [leaveStart, setLeaveStart] = useState("");
  const [leaveEnd, setLeaveEnd] = useState("");
  const [submittingLeave, setSubmittingLeave] = useState(false);

  // Attendance / Meal Calendar State
  const [calMonth, setCalMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [calData, setCalData] = useState(null);
  const [calLoading, setCalLoading] = useState(false);

  // Chat State
  const [chatConv, setChatConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [firstUnreadId, setFirstUnreadId] = useState(null);
  const [msgText, setMsgText] = useState("");
  const [sendingMsg, setSendingMsg] = useState(false);
  const [showRecorder, setShowRecorder] = useState(false);
  const chatRequestRef = useRef(0);
  const { listRef: messageListRef, onScroll: handleMessageScroll, scrollAfterSend } = useSmartChatScroll(messages, chatConv?.conversation_id);

  const loadData = useCallback(async () => {
    try {
      const res = await workerApi.get("/worker/me/data");
      setData(res.data);
      if (res.data?.business) {
        applyDynamicBranding(res.data.business);
      }
      if (res.data?.worker?.email) {
        setStudentEmail(res.data.worker.email);
      }
    } catch (e) {
      setError(apiError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTodayMeal = useCallback(async () => {
    setTodayMealLoading(true);
    try {
      const res = await workerApi.get("/worker/today-meal");
      setTodayMeal(res.data);
    } catch (e) {
      console.error("Failed to load today meal:", e);
    } finally {
      setTodayMealLoading(false);
    }
  }, []);

  const loadMealStats = useCallback(async () => {
    try {
      const res = await workerApi.get("/worker/meal-stats");
      setMealStats(res.data);
    } catch (e) {
      console.error("Failed to load meal stats:", e);
    }
  }, []);

  const loadLeaves = useCallback(async () => {
    try {
      const res = await workerApi.get("/worker/leaves");
      setLeaves(res.data || []);
    } catch (e) {
      console.error("Failed to load leaves:", e);
    }
  }, []);

  const loadMealCalendar = useCallback(async (monthStr) => {
    setCalLoading(true);
    try {
      const res = await workerApi.get(`/worker/meal-calendar?month=${monthStr}`);
      setCalData(res.data);
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setCalLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTodayMeal();
    loadMealStats();
    loadLeaves();
  }, [loadTodayMeal, loadMealStats, loadLeaves]);

  useEffect(() => {
    if (tab === "attendance") {
      loadMealCalendar(calMonth);
    }
  }, [tab, calMonth, loadMealCalendar]);

  const handleMealAction = async (slotKey, action, selectionType = "VEG", itemId = null, itemName = null) => {
    setSavingSelection(true);
    try {
      const slotData = todayMeal?.[slotKey] || {};
      const currentDeliveryOption = slotData.delivery_option || todayMeal?.default_delivery_preference || data?.worker?.delivery_preference || "DINE_IN";
      const currentDeliveryAddress = slotData.delivery_address || todayMeal?.default_delivery_address || data?.worker?.delivery_address || "";
      const currentDeliveryNotes = slotData.delivery_notes || todayMeal?.default_delivery_notes || data?.worker?.delivery_notes || "";

      const payload = {
        date: todayMeal?.date,
        meal_slot: slotKey,
        action: action, // "CONFIRM" or "CANCEL"
        selection_type: action === "CANCEL" ? "CANCELLED" : selectionType,
        selected_item_id: itemId,
        selected_item_name: itemName,
        delivery_option: currentDeliveryOption,
        delivery_address: currentDeliveryAddress,
        delivery_notes: currentDeliveryNotes,
      };
      await workerApi.post("/worker/select-meal", payload);
      if (action === "CANCEL") {
        toast.info(`❌ ${slotKey.toUpperCase()} cancelled. You are marked as not eating.`);
      } else {
        toast.success(
          selectionType === "NON_VEG"
            ? `🍗 Non-Veg ${slotKey.toUpperCase()} confirmed!`
            : selectionType === "VEG"
            ? `🥦 Pure Veg ${slotKey.toUpperCase()} confirmed!`
            : `⭐ "${itemName}" confirmed for ${slotKey.toUpperCase()}!`
        );
      }
      await Promise.all([loadTodayMeal(), loadMealStats()]);
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSavingSelection(false);
    }
  };

  const handleOpenEditAddress = (slotKey, currentAddr, currentNotes) => {
    setAddressDialogSlot(slotKey);
    setAddressDialogValue(currentAddr || data?.worker?.delivery_address || "");
    setAddressDialogNotes(currentNotes || data?.worker?.delivery_notes || "");
    setAddressDialogOpen(true);
  };

  const handleSaveDeliveryAddress = async () => {
    if (!addressDialogValue.trim()) {
      toast.error("Please enter your hostel name & room number");
      return;
    }
    setAddressDialogSaving(true);
    try {
      const slotData = todayMeal?.[addressDialogSlot] || {};
      const payload = {
        date: todayMeal?.date,
        meal_slot: addressDialogSlot,
        action: slotData.is_cancelled ? "CANCEL" : "CONFIRM",
        selection_type: slotData.is_cancelled ? "CANCELLED" : (slotData.effective_choice || "VEG"),
        selected_item_id: slotData.selected_item_id || null,
        selected_item_name: slotData.selected_item_name || null,
        delivery_option: "DELIVERY",
        delivery_address: addressDialogValue.trim(),
        delivery_notes: addressDialogNotes.trim(),
      };
      await workerApi.post("/worker/select-meal", payload);
      toast.success(`Delivery address saved for ${addressDialogSlot.toUpperCase()}! 🛵`);
      setAddressDialogOpen(false);
      await Promise.all([loadTodayMeal(), loadMealStats(), loadData()]);
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setAddressDialogSaving(false);
    }
  };

  const handleServiceModeChange = async (slotKey, newMode) => {
    const slotData = todayMeal?.[slotKey] || {};
    const currentAddr = slotData.delivery_address || data?.worker?.delivery_address || "";
    const currentNotes = slotData.delivery_notes || data?.worker?.delivery_notes || "";

    // If switching to delivery and no address exists, open modal to input address
    if (newMode === "DELIVERY" && !currentAddr.trim()) {
      setAddressDialogSlot(slotKey);
      setAddressDialogValue("");
      setAddressDialogNotes(currentNotes);
      setAddressDialogOpen(true);
      return;
    }

    setSavingSelection(true);
    try {
      const payload = {
        date: todayMeal?.date,
        meal_slot: slotKey,
        action: slotData.is_cancelled ? "CANCEL" : "CONFIRM",
        selection_type: slotData.is_cancelled ? "CANCELLED" : (slotData.effective_choice || "VEG"),
        selected_item_id: slotData.selected_item_id || null,
        selected_item_name: slotData.selected_item_name || null,
        delivery_option: newMode,
        delivery_address: currentAddr,
        delivery_notes: currentNotes,
      };
      await workerApi.post("/worker/select-meal", payload);
      toast.success(
        newMode === "DELIVERY"
          ? `🛵 ${slotKey.toUpperCase()} set to Room Delivery!`
          : `🍽️ ${slotKey.toUpperCase()} set to Mess Dine-in!`
      );
      await Promise.all([loadTodayMeal(), loadMealStats()]);
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSavingSelection(false);
    }
  };

  const handleStartVacation = async () => {
    setSubmittingLeave(true);
    try {
      const res = await workerApi.post("/worker/leave/start-vacation");
      toast.success(res.data.message || "Vacation mode started! Meals paused.");
      await Promise.all([loadTodayMeal(), loadLeaves(), loadMealStats()]);
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setSubmittingLeave(false);
    }
  };

  const handleEndLeave = async () => {
    setSubmittingLeave(true);
    try {
      const res = await workerApi.post("/worker/leave/resume");
      toast.success(res.data.message || "Welcome back! Meals resumed.");
      await Promise.all([loadTodayMeal(), loadLeaves(), loadMealStats()]);
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setSubmittingLeave(false);
    }
  };

  const loadChat = useCallback(async () => {
    const requestId = ++chatRequestRef.current;
    try {
      const { data: conv } = await workerApi.get("/chat/worker-conversation");
      if (requestId !== chatRequestRef.current) return;
      if (tab === "messages") {
        const { data: readState } = await workerApi.post(`/chat/conversations/${conv.conversation_id}/read`);
        if (requestId !== chatRequestRef.current) return;
        setChatConv({ ...conv, unread_count: readState.unread_count });
        setFirstUnreadId((current) => current || readState.first_unread_message_id);
        updateAppBadge(readState.total_unread_count);
        clearConversationNotifications(conv.conversation_id, readState.total_unread_count);
        const { data: msgs } = await workerApi.get(`/chat/conversations/${conv.conversation_id}/messages`);
        if (requestId !== chatRequestRef.current) return;
        setMessages(msgs);
      } else {
        setChatConv(conv);
        updateAppBadge(conv.unread_count);
      }
    } catch (e) {
      console.error(e);
    }
  }, [tab]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate("/worker/login");
      return;
    }
    loadData();
    loadChat();
  }, [user, authLoading, navigate, loadData, loadChat]);

  useEffect(() => {
    if (!user || !pushSupported()) return;
    enablePushNotifications(false).catch(() => {});
  }, [user]);

  useEffect(() => {
    if (tab === "messages") {
      const interval = setInterval(loadChat, 3500);
      return () => clearInterval(interval);
    }
  }, [tab, loadChat]);

  const handleSendText = async (e) => {
    e?.preventDefault();
    if (!msgText.trim() || !chatConv) return;
    setSendingMsg(true);
    try {
      await workerApi.post("/chat/worker-messages", {
        conversation_id: chatConv.conversation_id,
        worker_id: data?.worker?.id,
        message_type: "text",
        text: msgText.trim(),
      });
      setMsgText("");
      scrollAfterSend();
      loadChat();
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setSendingMsg(false);
    }
  };

  const handleSendAudio = async ({ audioAssetId, duration }) => {
    if (!chatConv) return;
    try {
      await workerApi.post("/chat/worker-messages", {
        conversation_id: chatConv.conversation_id,
        worker_id: data?.worker?.id,
        message_type: "audio",
        audio_asset_id: audioAssetId,
        duration,
      });
      setShowRecorder(false);
      scrollAfterSend();
      loadChat();
      toast.success("Voice message sent");
    } catch (err) {
      toast.error(apiError(err));
    }
  };

  const doLogout = async () => {
    await logout();
    updateAppBadge(0);
    navigate("/worker/login");
  };

  const prevMonth = () => {
    const [y, m] = calMonth.split("-").map(Number);
    const d = new Date(y, m - 2, 1);
    setCalMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  const nextMonth = () => {
    const [y, m] = calMonth.split("-").map(Number);
    const d = new Date(y, m, 1);
    setCalMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-[#f8f7f2] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-teal-800" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f7f2] flex flex-col">
      {/* Top Navbar */}
      <nav className="bg-[#102f2c] text-white sticky top-0 z-20 shadow-md">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            {data?.business?.logo_url ? (
              <div className="h-10 w-10 rounded-xl bg-white/10 border border-white/20 p-0.5 overflow-hidden shrink-0 shadow-sm">
                <img
                  src={data.business.logo_url}
                  alt={data.business.name || "Logo"}
                  className="h-full w-full object-cover rounded-lg"
                />
              </div>
            ) : (
              <WorkerAvatar
                name={data?.worker ? data.worker.name : "Student"}
                photoUrl={data?.worker?.profile_photo_url || ""}
                size="md"
                className="border border-white/20 shadow-sm shrink-0"
              />
            )}
            <div className="min-w-0">
              <span className="font-display font-bold text-base sm:text-lg leading-tight block truncate">
                {data?.worker ? data.worker.name : "My Portal"}
              </span>
              <span className="text-[11px] text-teal-300 font-semibold block truncate">
                {data?.business?.name || "Ayushman Kitchen"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setChangePwdForm({ current: "", next: "", confirm: "" });
                setStudentEmail(data?.worker?.email || "");
                setChangePwdOpen(true);
              }}
              className="bg-white/10 hover:bg-white/20 text-white border-white/20 rounded-xl text-xs font-semibold"
            >
              <ShieldCheck className="h-3.5 w-3.5 mr-1 text-amber-300" /> Security & Email
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={doLogout}
              className="bg-white/10 hover:bg-white/20 text-white border-white/20 rounded-xl text-xs"
            >
              <LogOut className="h-3.5 w-3.5 mr-1" /> Logout
            </Button>
          </div>
        </div>

        {/* Tab Navigation (Home, Meal Calendar, Messages) */}
        <div className="max-w-5xl mx-auto px-4 flex gap-1 border-t border-teal-900/70 overflow-x-auto">
          {[
            { key: "home", label: "Home", icon: Home },
            { key: "attendance", label: "Meal Calendar", icon: CalendarCheck },
            { key: "messages", label: "Messages", icon: MessageSquare },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 py-3 px-4 text-xs font-bold whitespace-nowrap border-b-2 transition-all ${
                tab === t.key
                  ? "border-amber-400 text-amber-300 bg-white/5"
                  : "border-transparent text-teal-200 hover:text-white"
              }`}
            >
              <t.icon className="h-4 w-4" />
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* 📢 Live Moving Notice Announcement Ticker (Right to Left Marquee) */}
      {data?.business?.notice_ticker?.enabled !== false && data?.business?.notice_ticker?.text && (
        <div className="bg-amber-400 text-slate-950 px-4 py-2 flex items-center gap-3 overflow-hidden shadow-xs border-b border-amber-500/30">
          <span className="bg-teal-950 text-amber-300 font-extrabold text-[10px] sm:text-xs px-2.5 py-0.5 rounded-lg uppercase tracking-wider shrink-0 flex items-center gap-1 shadow-xs">
            <Megaphone className="h-3 w-3" />
            <span>{data.business.notice_ticker.badge || "UPDATE"}</span>
          </span>
          <div className="flex-1 overflow-hidden relative">
            <div className="animate-ticker text-xs sm:text-sm font-bold text-slate-950">
              {data.business.notice_ticker.text}
            </div>
          </div>
        </div>
      )}

      {/* Main Container */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 pb-20">
        {error ? (
          <div className="bg-white border border-stone-200 rounded-3xl p-8 text-center max-w-lg mx-auto mt-8 shadow-sm">
            <GraduationCap className="h-12 w-12 text-amber-500 mx-auto mb-3" />
            <h2 className="font-display text-xl font-bold text-slate-900">Not Available</h2>
            <p className="text-slate-600 text-sm mt-2">{error}</p>
            <p className="text-xs text-slate-400 mt-4 leading-relaxed">
              Contact Ayushman Kitchen mess management to enable your student portal.
            </p>
          </div>
        ) : (
          <>
            {/* ──────────────────────────────────────────────────────────
                1. HOME TAB
            ────────────────────────────────────────────────────────── */}
            {tab === "home" && (
              <div className="space-y-6">
                {/* Profile Identity Header */}
                <div className="bg-gradient-to-r from-teal-900 via-[#102f2c] to-[#0d2724] text-white rounded-3xl p-5 sm:p-6 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-4 min-w-0">
                    <WorkerAvatar
                      name={data.worker.name}
                      photoUrl={data.worker.profile_photo_url}
                      size="xl"
                      className="shadow-md border-2 border-white/20 ring-2 ring-amber-400/30 shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] font-extrabold uppercase tracking-widest text-teal-300">
                          Student Portal
                        </span>
                        <span className="bg-emerald-400/20 text-emerald-300 border border-emerald-400/30 text-[10px] font-bold px-2 py-0.5 rounded-full">
                          {data.worker.status === "INACTIVE" ? "Inactive" : "Active"}
                        </span>
                      </div>
                      <h1 className="font-display text-2xl sm:text-3xl font-extrabold mt-0.5 truncate">
                        {data.worker.name}
                      </h1>
                      <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-teal-200">
                        <span className="font-semibold text-white">
                          {data.worker.work_type === "Premium" ? "⭐ Premium Plan" : "Standard Plan"}
                        </span>
                        <span>•</span>
                        <span className="font-semibold text-amber-300">
                          {data.worker.meal_plan_type === "LUNCH_ONLY"
                            ? "☀️ Lunch Only"
                            : data.worker.meal_plan_type === "DINNER_ONLY"
                            ? "🌙 Dinner Only"
                            : "☀️🌙 Both (Lunch + Dinner)"}
                        </span>
                        {data.worker.login_id && (
                          <>
                            <span>•</span>
                            <span className="font-mono bg-white/10 px-2 py-0.5 rounded text-amber-300 font-bold text-[11px]">
                              ID: {data.worker.login_id}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-start sm:self-auto">
                    {leaves.length > 0 ? (
                      <Button
                        type="button"
                        onClick={handleEndLeave}
                        disabled={submittingLeave}
                        className="bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs rounded-2xl h-10 px-4 shadow-sm"
                      >
                        {submittingLeave ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Home className="h-4 w-4 mr-1.5" />}
                        🏠 I'm Back (Resume Meals)
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        onClick={handleStartVacation}
                        disabled={submittingLeave}
                        className="bg-amber-400 hover:bg-amber-500 text-slate-950 font-bold text-xs rounded-2xl h-10 px-4 shadow-sm"
                      >
                        {submittingLeave ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Palmtree className="h-4 w-4 mr-1.5" />}
                        🏖️ Pause Meals (Going on Vacation)
                      </Button>
                    )}
                  </div>
                </div>

                {/* ⚠️ 45-Day Validity Expired Banner */}
                {mealStats?.is_validity_expired && (
                  <div className="p-4 sm:p-5 rounded-3xl bg-rose-50 border-2 border-rose-300 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-start gap-3.5">
                      <div className="h-10 w-10 rounded-2xl bg-rose-200 text-rose-950 flex items-center justify-center font-bold shrink-0 mt-0.5">
                        <AlertCircle className="h-5 w-5 text-rose-700" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-display font-bold text-sm sm:text-base text-rose-950">
                            ⚠️ 45-Day Subscription Expired ({mealStats.validity_expiry_date})
                          </h3>
                          <Badge className="bg-rose-600 text-white border-0 text-[10px] font-bold">
                            Validity Expired
                          </Badge>
                        </div>
                        <p className="text-xs text-rose-800 mt-0.5 leading-snug">
                          Your 45-day subscription validity period ended on <strong>{mealStats.validity_expiry_date}</strong> ({mealStats.days_elapsed} days elapsed).
                          {mealStats.lapsed_meals > 0 ? ` ${mealStats.lapsed_meals} unconsumed meals have lapsed.` : ""} Please contact mess management to renew your subscription.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* ⚠️ Quota Finished (0 meals left) */}
                {!mealStats?.is_validity_expired && mealStats?.total_remaining === 0 && mealStats?.total_quota > 0 && (
                  <div className="p-4 sm:p-5 rounded-3xl bg-rose-50 border-2 border-rose-300 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-start gap-3.5">
                      <div className="h-10 w-10 rounded-2xl bg-rose-200 text-rose-950 flex items-center justify-center font-bold shrink-0 mt-0.5">
                        <AlertCircle className="h-5 w-5 text-rose-700" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-display font-bold text-sm sm:text-base text-rose-950">
                            ⚠️ Subscription Completed (0 Meals Left)
                          </h3>
                          <Badge className="bg-rose-600 text-white border-0 text-[10px] font-bold">
                            Renewal Needed
                          </Badge>
                        </div>
                        <p className="text-xs text-rose-800 mt-0.5 leading-snug">
                          All {mealStats.total_quota} meals in your current subscription pool have been consumed. Please contact mess management to renew your meal plan.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* ⏳ Expiring Soon in <= 5 days */}
                {!mealStats?.is_validity_expired && mealStats?.validity_days_left <= 5 && (mealStats?.total_remaining ?? 0) > 0 && (
                  <div className="p-4 sm:p-5 rounded-3xl bg-amber-50 border-2 border-amber-300 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-start gap-3.5">
                      <div className="h-10 w-10 rounded-2xl bg-amber-200 text-amber-950 flex items-center justify-center font-bold shrink-0 mt-0.5">
                        <Clock className="h-5 w-5 text-amber-800" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-display font-bold text-sm sm:text-base text-amber-950">
                            ⏳ Subscription Validity Expiring in {mealStats.validity_days_left} Days
                          </h3>
                          <Badge className="bg-amber-300 text-amber-950 border-amber-400 text-[10px] font-bold">
                            Exp: {mealStats.validity_expiry_date}
                          </Badge>
                        </div>
                        <p className="text-xs text-amber-800 mt-0.5 leading-snug">
                          Your 45-day validity window ends on <strong>{mealStats.validity_expiry_date}</strong>. You have {mealStats.total_remaining} remaining meals. Any unconsumed meals will expire after 45 days.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* ⚠️ Low Balance Alert Banner (<= 4 meals remaining and > 5 validity days) */}
                {!mealStats?.is_validity_expired && mealStats?.total_remaining !== null && mealStats?.total_remaining > 0 && mealStats?.total_remaining <= 4 && mealStats?.validity_days_left > 5 && (
                  <div className="p-4 sm:p-5 rounded-3xl bg-rose-50 border-2 border-rose-300 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-start gap-3.5">
                      <div className="h-10 w-10 rounded-2xl bg-rose-200 text-rose-950 flex items-center justify-center font-bold shrink-0 mt-0.5">
                        <AlertCircle className="h-5 w-5 text-rose-700" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-display font-bold text-sm sm:text-base text-rose-950">
                            ⚠️ Low Meal Balance ({mealStats.total_remaining} Meals Left)
                          </h3>
                          <Badge className="bg-rose-200 text-rose-900 border-rose-300 text-[10px] font-bold">
                            Renewal Due
                          </Badge>
                        </div>
                        <p className="text-xs text-rose-800 mt-0.5 leading-snug">
                          You only have {mealStats.total_remaining} meals remaining in your pool. Please contact mess administration to renew your meal plan.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* 🏖️ Active Vacation Banner */}
                {leaves.length > 0 && (
                  <div className="p-4 sm:p-5 rounded-3xl bg-amber-50 border-2 border-amber-300/80 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-start gap-3.5">
                      <div className="h-10 w-10 rounded-2xl bg-amber-200 text-amber-950 flex items-center justify-center font-bold shrink-0 mt-0.5">
                        <Palmtree className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-display font-bold text-sm sm:text-base text-amber-950">
                            Vacation Mode Active (Meals Paused)
                          </h3>
                          <Badge className="bg-amber-200 text-amber-900 border-amber-300 text-[10px] font-bold">
                            Paused From {leaves[0].start_date}
                          </Badge>
                        </div>
                        <p className="text-xs text-amber-800 mt-0.5 leading-snug">
                          Your meals are paused and quota is preserved. When you return, click "I'm Back" to resume meals.
                        </p>
                      </div>
                    </div>

                    <Button
                      type="button"
                      onClick={handleEndLeave}
                      disabled={submittingLeave}
                      className="bg-teal-800 hover:bg-teal-900 text-white font-bold text-xs rounded-xl h-10 px-5 shrink-0 shadow-sm"
                    >
                      {submittingLeave ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
                      🏠 I'm Back (Resume Meals)
                    </Button>
                  </div>
                )}

                {/* 🍱 Combined Meal Quota Cards (60 meals for Both, 30 meals for Single) */}
                {mealStats && (mealStats.total_quota > 0) && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                      {/* Total Remaining Quota Card */}
                      <div className="bg-[#102f2c] text-white rounded-3xl p-4 sm:p-5 shadow-md space-y-1 flex flex-col justify-between col-span-2 sm:col-span-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-300 flex items-center gap-1">
                            <ChefHat className="h-3.5 w-3.5" /> Remaining Balance
                          </span>
                          {mealStats.is_validity_expired ? (
                            <span className="text-[9px] font-bold bg-rose-600 text-white px-1.5 py-0.5 rounded-md">
                              Expired (45d)
                            </span>
                          ) : (
                            <span className="text-[9px] font-bold bg-teal-900 text-teal-200 px-1.5 py-0.5 rounded-md">
                              {mealStats.validity_days_left}d left
                            </span>
                          )}
                        </div>
                        <div>
                          <p className="font-display text-2xl sm:text-3xl font-extrabold text-amber-300">
                            {mealStats.total_remaining !== null ? mealStats.total_remaining : "∞"}
                            <span className="text-xs font-normal text-teal-200 ml-1.5">
                              / {mealStats.total_quota || (mealStats.meal_plan_type === "BOTH" ? 60 : 30)}
                            </span>
                          </p>
                          <p className="text-[10px] text-teal-200 mt-0.5 leading-tight">
                            {mealStats.is_validity_expired
                              ? `Validity ended on ${mealStats.validity_expiry_date}`
                              : `45-day validity until ${mealStats.validity_expiry_date}`}
                          </p>
                        </div>
                      </div>

                      {/* Lunch Taken */}
                      {mealStats.meal_plan_type !== "DINNER_ONLY" && (
                        <div className="bg-white border border-stone-200 rounded-3xl p-4 sm:p-5 shadow-sm space-y-1">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700 flex items-center gap-1">
                            <Sun className="h-3.5 w-3.5" /> Lunch Consumed
                          </span>
                          <p className="font-display text-2xl sm:text-3xl font-extrabold text-slate-900">
                            {mealStats.lunch_used}
                            <span className="text-xs font-normal text-slate-400 ml-1.5">meals</span>
                          </p>
                          <p className="text-[10px] text-slate-500 font-semibold">
                            {mealStats.lunch_skipped || 0} skipped / cancelled
                          </p>
                        </div>
                      )}

                      {/* Dinner Taken */}
                      {mealStats.meal_plan_type !== "LUNCH_ONLY" && (
                        <div className="bg-white border border-stone-200 rounded-3xl p-4 sm:p-5 shadow-sm space-y-1">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-teal-700 flex items-center gap-1">
                            <Moon className="h-3.5 w-3.5" /> Dinner Consumed
                          </span>
                          <p className="font-display text-2xl sm:text-3xl font-extrabold text-slate-900">
                            {mealStats.dinner_used}
                            <span className="text-xs font-normal text-slate-400 ml-1.5">meals</span>
                          </p>
                          <p className="text-[10px] text-slate-500 font-semibold">
                            {mealStats.dinner_skipped || 0} skipped / cancelled
                          </p>
                        </div>
                      )}

                      {/* Total Taken */}
                      <div className="bg-white border border-stone-200 rounded-3xl p-4 sm:p-5 shadow-sm space-y-1">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                          <ChefHat className="h-3.5 w-3.5" /> Total Meals Taken
                        </span>
                        <p className="font-display text-2xl sm:text-3xl font-extrabold text-teal-800">
                          {mealStats.total_used}
                          <span className="text-xs font-normal text-slate-400 ml-1.5">eaten</span>
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {mealStats.total_skipped || 0} total cancelled
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* 🍽️ Today's Lunch & Dinner Meal Cards */}
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-stone-200 rounded-3xl p-5 sm:p-6 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-2xl bg-amber-500/10 text-amber-800 flex items-center justify-center font-bold">
                        <ChefHat className="h-5 w-5" />
                      </div>
                      <div>
                        <h2 className="font-display text-lg sm:text-xl font-bold text-slate-900 leading-tight">
                          Today's Meals: Lunch & Dinner
                        </h2>
                        <p className="text-xs text-slate-500">
                          {todayMeal?.day_name || "Today"}, {todayMeal?.date || "Today"} • Customize dish or cancel meal before window closes
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-start sm:self-auto">
                      <Badge
                        variant="secondary"
                        className={`text-xs font-bold px-3 py-1 rounded-xl ${
                          data.worker.work_type === "Premium"
                            ? "bg-amber-100 text-amber-950 border border-amber-300"
                            : "bg-teal-50 text-teal-800 border border-teal-200"
                        }`}
                      >
                        {data.worker.work_type === "Premium" ? "⭐ Premium Plan" : "Standard Plan"}
                      </Badge>
                      <button
                        type="button"
                        onClick={loadTodayMeal}
                        disabled={todayMealLoading}
                        title="Refresh today's menu"
                        className="p-1.5 rounded-xl border border-stone-200 hover:bg-stone-50 text-slate-500"
                      >
                        <RefreshCw className={`h-4 w-4 ${todayMealLoading ? "animate-spin" : ""}`} />
                      </button>
                    </div>
                  </div>

                  {todayMealLoading ? (
                    <div className="bg-white border border-stone-200 rounded-3xl p-10 text-center text-slate-400 flex items-center justify-center gap-2">
                      <Loader2 className="h-5 w-5 animate-spin text-teal-800" />
                      <span>Loading today's kitchen menu and windows...</span>
                    </div>
                  ) : !todayMeal ? (
                    <div className="bg-white border border-stone-200 rounded-3xl p-8 text-center text-slate-400">
                      Menu not available for today
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* ☀️ LUNCH CARD */}
                      <MealSlotCard
                        slotKey="lunch"
                        title="Lunch Service"
                        icon={<Sun className="h-5 w-5 text-amber-700" />}
                        iconBg="bg-amber-100"
                        slotData={todayMeal.lunch}
                        plan={data.worker.work_type}
                        defaultPref={todayMeal.default_diet_preference}
                        defaultPrefDelivery={todayMeal.default_delivery_preference || data?.worker?.delivery_preference}
                        defaultAddress={todayMeal.default_delivery_address || data?.worker?.delivery_address}
                        defaultNotes={todayMeal.default_delivery_notes || data?.worker?.delivery_notes}
                        saving={savingSelection}
                        onAction={handleMealAction}
                        onServiceModeChange={handleServiceModeChange}
                        onEditAddress={handleOpenEditAddress}
                        onEndLeave={handleEndLeave}
                      />

                      {/* 🌙 DINNER CARD */}
                      <MealSlotCard
                        slotKey="dinner"
                        title="Dinner Service"
                        icon={<Moon className="h-5 w-5 text-teal-700" />}
                        iconBg="bg-teal-100"
                        slotData={todayMeal.dinner}
                        plan={data.worker.work_type}
                        defaultPref={todayMeal.default_diet_preference}
                        defaultPrefDelivery={todayMeal.default_delivery_preference || data?.worker?.delivery_preference}
                        defaultAddress={todayMeal.default_delivery_address || data?.worker?.delivery_address}
                        defaultNotes={todayMeal.default_delivery_notes || data?.worker?.delivery_notes}
                        saving={savingSelection}
                        onAction={handleMealAction}
                        onServiceModeChange={handleServiceModeChange}
                        onEditAddress={handleOpenEditAddress}
                        onEndLeave={handleEndLeave}
                      />
                    </div>
                  )}
                </div>

                {/* 🍽️ Home Page 4 Feature & Menu Showcase Boxes */}
                {(() => {
                  const showcase = Array.isArray(data?.business?.showcase_boxes) && data.business.showcase_boxes.length === 4
                    ? data.business.showcase_boxes
                    : DEFAULT_SHOWCASE_BOXES;
                  return (
                    <div className="space-y-3 pt-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <h2 className="font-display font-bold text-base sm:text-lg text-slate-900 flex items-center gap-2">
                            <Sparkles className="h-4 w-4 text-amber-500" />
                            <span>Kitchen Specialties & Daily Highlights</span>
                          </h2>
                          <p className="text-xs text-slate-500">Gourmet variety, fresh hygiene & home-style taste</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                        {showcase.map((box, i) => (
                          <div
                            key={box.id || i}
                            className="group bg-white border border-stone-200 rounded-3xl overflow-hidden shadow-xs hover:shadow-md hover:border-amber-300 transition-all flex flex-col justify-between"
                          >
                            <div className="relative h-36 w-full overflow-hidden bg-stone-100">
                              {box.image_url ? (
                                <img
                                  src={box.image_url}
                                  alt={box.title}
                                  className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                                />
                              ) : (
                                <div className="h-full w-full flex items-center justify-center text-stone-300">
                                  <ChefHat className="h-10 w-10 text-teal-800/40" />
                                </div>
                              )}
                              {box.badge && (
                                <span className="absolute top-2.5 right-2.5 bg-amber-400/95 text-slate-950 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full shadow-sm backdrop-blur-xs">
                                  {box.badge}
                                </span>
                              )}
                            </div>
                            <div className="p-4 flex-1 flex flex-col justify-between space-y-1">
                              <div>
                                <h3 className="font-display font-bold text-sm text-slate-900 line-clamp-1 group-hover:text-teal-900 transition-colors">
                                  {box.title}
                                </h3>
                                <p className="text-xs text-slate-500 line-clamp-2 mt-1 leading-snug">
                                  {box.subtitle}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Quick Action Link to Calendar & Messages */}
                <div className="grid sm:grid-cols-2 gap-4 pt-2">
                  <div
                    onClick={() => setTab("attendance")}
                    className="cursor-pointer bg-white hover:bg-teal-50/50 border border-stone-200 text-slate-900 rounded-3xl p-5 shadow-sm transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-2xl bg-teal-800 text-white flex items-center justify-center font-bold shadow-sm">
                        <CalendarCheck className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="font-display font-bold text-base">Monthly Meal Calendar</h3>
                        <p className="text-xs text-slate-500 mt-0.5">Check present, absent & skipped meals</p>
                      </div>
                    </div>
                  </div>

                  <div
                    onClick={() => setTab("messages")}
                    className="cursor-pointer bg-amber-50 hover:bg-amber-100/70 border border-amber-300/80 text-slate-900 rounded-3xl p-5 shadow-sm transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center font-bold shadow-sm">
                        <MessageSquare className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="font-display font-bold text-base">Message Kitchen</h3>
                        <p className="text-xs text-slate-700 mt-0.5">Send voice or text message to mess</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ──────────────────────────────────────────────────────────
                2. ATTENDANCE & MEAL CONSUMPTION CALENDAR TAB
            ────────────────────────────────────────────────────────── */}
            {tab === "attendance" && (
              <div className="space-y-6">
                {/* Month Navigator Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-stone-200 rounded-3xl p-5 sm:p-6 shadow-sm">
                  <div>
                    <h2 className="font-display text-xl font-bold text-slate-900">
                      Meal Attendance & Consumption Calendar
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Visual history of meals taken, skipped, and vacation days.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 self-start sm:self-auto">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={prevMonth}
                      className="rounded-xl h-9 px-3"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="font-mono text-sm font-bold text-slate-900 bg-stone-100 px-3 py-1.5 rounded-xl">
                      {calMonth}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={nextMonth}
                      className="rounded-xl h-9 px-3"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Top Metrics Box */}
                {calData?.summary && (
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    {/* 1. Start Date Card */}
                    <div className="p-4 rounded-2xl bg-white border border-stone-200 shadow-sm space-y-1">
                      <span className="text-[11px] font-bold text-slate-500 block">📅 Start Date</span>
                      {calData.summary.meal_plan_type === "BOTH" && calData.summary.lunch_start_date !== calData.summary.dinner_start_date ? (
                        <div className="text-[11px] font-bold text-slate-900 leading-tight space-y-0.5 pt-0.5">
                          <p className="truncate">☀️ L: {calData.summary.lunch_start_date}</p>
                          <p className="truncate">🌙 D: {calData.summary.dinner_start_date}</p>
                        </div>
                      ) : (
                        <p className="font-display text-base sm:text-lg font-extrabold text-slate-900 truncate">
                          {calData.summary.lunch_start_date || calData.summary.joining_date}
                        </p>
                      )}
                      <p className="text-[10px] text-slate-400">Meal start date</p>
                    </div>

                    {/* 2. Meals Eaten Card */}
                    <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 shadow-sm space-y-1">
                      <span className="text-[11px] font-bold text-emerald-800 block">🟢 Meals Eaten</span>
                      <p className="font-display text-2xl font-extrabold text-emerald-900">
                        {calData.summary.total_used ?? calData.summary.present}
                      </p>
                      <p className="text-[10px] text-emerald-700">Counted meals</p>
                    </div>

                    {/* 3. Remaining Meals Card (out of 60 or 30 pool) */}
                    <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 shadow-sm space-y-1">
                      <span className="text-[11px] font-bold text-amber-800 block">🍱 Remaining Meals</span>
                      <p className="font-display text-2xl font-extrabold text-amber-950">
                        {calData.summary.total_remaining !== null ? calData.summary.total_remaining : "∞"}
                        <span className="text-xs font-normal text-slate-400 ml-1">
                          / {calData.summary.total_quota || (calData.summary.meal_plan_type === "BOTH" ? 60 : 30)}
                        </span>
                      </p>
                      <p className="text-[10px] text-amber-800">Remaining balance</p>
                    </div>

                    {/* 4. Skipped Meals Card */}
                    <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 shadow-sm space-y-1">
                      <span className="text-[11px] font-bold text-rose-800 block">🔴 Skipped / Absent</span>
                      <p className="font-display text-2xl font-extrabold text-rose-900">
                        {calData.summary.total_skipped ?? calData.summary.absent}
                      </p>
                      <p className="text-[10px] text-rose-700">Cancelled meals</p>
                    </div>

                    {/* 5. Vacation Card */}
                    <div className="p-4 rounded-2xl bg-teal-50 border border-teal-200 shadow-sm space-y-1 col-span-2 sm:col-span-1">
                      <span className="text-[11px] font-bold text-teal-800 block">🏖️ Vacation / Leave</span>
                      <p className="font-display text-2xl font-extrabold text-teal-900">
                        {calData.summary.on_leave}
                      </p>
                      <p className="text-[10px] text-teal-700">Days paused</p>
                    </div>
                  </div>
                )}

                {/* Calendar Grid */}
                <div className="bg-white border border-stone-200 rounded-3xl p-5 sm:p-7 shadow-sm space-y-4">
                  <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                    <h3 className="font-display font-bold text-base text-slate-900">
                      Day-by-Day Meal Log for {calMonth}
                    </h3>
                    <div className="flex flex-wrap items-center gap-3 text-[11px] font-bold">
                      <span className="flex items-center gap-1 text-sky-700">
                        <span className="h-2 w-2 rounded-full bg-sky-500" /> Today
                      </span>
                      <span className="flex items-center gap-1 text-emerald-700">
                        <span className="h-2 w-2 rounded-full bg-emerald-500" /> Eaten
                      </span>
                      <span className="flex items-center gap-1 text-amber-700">
                        <span className="h-2 w-2 rounded-full bg-amber-500" /> Partial
                      </span>
                      <span className="flex items-center gap-1 text-rose-700">
                        <span className="h-2 w-2 rounded-full bg-rose-500" /> Skipped
                      </span>
                      <span className="flex items-center gap-1 text-teal-700">
                        <span className="h-2 w-2 rounded-full bg-teal-500" /> Leave
                      </span>
                    </div>
                  </div>

                  {calLoading ? (
                    <div className="py-12 text-center text-slate-400 flex items-center justify-center gap-2">
                      <Loader2 className="h-5 w-5 animate-spin text-teal-800" />
                      <span>Loading calendar records...</span>
                    </div>
                  ) : !calData?.days?.length ? (
                    <div className="py-12 text-center text-slate-400">No records found for this month</div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2.5">
                      {calData.days.map((d) => {
                        const dayNum = d.date.split("-")[2];
                        let bgClass = "bg-stone-50 border-stone-200 text-slate-400";
                        let statusText = "Future";
                        let badgeColor = "bg-stone-100 text-slate-500";

                        if (d.status === "BEFORE_JOIN") {
                          bgClass = "bg-stone-50/50 border-dashed border-stone-200 text-slate-300";
                          statusText = "Pre-Start";
                          badgeColor = "bg-stone-100 text-slate-400";
                        } else if (d.status === "TODAY") {
                          bgClass = "bg-sky-50/90 border-sky-300 text-sky-950 ring-2 ring-sky-400/40 shadow-sm";
                          statusText = "Today";
                          badgeColor = "bg-sky-200 text-sky-900 font-extrabold";
                        } else if (d.status === "PRESENT") {
                          bgClass = "bg-emerald-50/80 border-emerald-300 text-emerald-950";
                          statusText = "Eaten";
                          badgeColor = "bg-emerald-200/80 text-emerald-900";
                        } else if (d.status === "PARTIAL") {
                          bgClass = "bg-amber-50/80 border-amber-300 text-amber-950";
                          statusText = "1 Meal";
                          badgeColor = "bg-amber-200/80 text-amber-900";
                        } else if (d.status === "ABSENT") {
                          bgClass = "bg-rose-50/80 border-rose-300 text-rose-950";
                          statusText = "Skipped";
                          badgeColor = "bg-rose-200/80 text-rose-900";
                        } else if (d.status === "ON_LEAVE") {
                          bgClass = "bg-teal-50/80 border-teal-300 text-teal-950";
                          statusText = "Vacation";
                          badgeColor = "bg-teal-200/80 text-teal-900";
                        }

                        return (
                          <div
                            key={d.date}
                            className={`p-3 rounded-2xl border transition-all flex flex-col justify-between min-h-[90px] ${bgClass}`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-display font-extrabold text-base">
                                {dayNum}
                              </span>
                              <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded-md ${badgeColor}`}>
                                {statusText}
                              </span>
                            </div>

                            {d.status !== "FUTURE" && d.status !== "BEFORE_JOIN" && (
                              <div className="text-[10px] space-y-0.5 pt-1 border-t border-black/5 mt-1">
                                {d.lunch && (
                                  <div className="flex items-center justify-between">
                                    <span className="text-slate-500">Lunch:</span>
                                    <span className="font-bold">
                                      {d.lunch === "ATE"
                                        ? "✓ Ate"
                                        : d.lunch === "SCHEDULED" || d.lunch === "DEFAULT"
                                        ? "⏳ Scheduled"
                                        : d.lunch === "CANCELLED"
                                        ? "✕ Off"
                                        : d.lunch === "LEAVE"
                                        ? "🏖️"
                                        : "—"}
                                    </span>
                                  </div>
                                )}
                                {d.dinner && (
                                  <div className="flex items-center justify-between">
                                    <span className="text-slate-500">Dinner:</span>
                                    <span className="font-bold">
                                      {d.dinner === "ATE"
                                        ? "✓ Ate"
                                        : d.dinner === "SCHEDULED" || d.dinner === "DEFAULT"
                                        ? "⏳ Scheduled"
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
            )}

            {/* ──────────────────────────────────────────────────────────
                3. MESSAGES / CHAT TAB
            ────────────────────────────────────────────────────────── */}
            {tab === "messages" && (
              <div className="flex flex-col rounded-3xl overflow-hidden shadow-xl border border-stone-200 bg-white"
                style={{ height: "calc(100vh - 180px)", minHeight: 480 }}>
                {/* Chat Header */}
                <div className="bg-[#102f2c] px-4 py-3.5 flex items-center gap-3 shrink-0">
                  <div className="h-9 w-9 rounded-full bg-amber-400 text-slate-950 flex items-center justify-center font-bold shrink-0">
                    <ChefHat className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-white leading-tight">
                      {data?.business?.name || "Ayushman Kitchen"}
                    </p>
                    <p className="text-xs text-teal-300">Kitchen Administration Chat</p>
                  </div>
                  <div className="h-2 w-2 rounded-full bg-emerald-400 shrink-0" title="Online" />
                </div>

                {/* Message Thread — WhatsApp wallpaper background */}
                <div
                  ref={messageListRef}
                  onScroll={handleMessageScroll}
                  className="flex-1 overflow-y-auto px-4 py-4 space-y-1"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23102f2c' fill-opacity='0.03'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
                    backgroundColor: "#f0ece3",
                  }}
                >
                  {messages.length === 0 && (
                    <div className="h-full flex items-center justify-center">
                      <div className="bg-[#102f2c]/80 text-white px-5 py-4 rounded-2xl text-sm text-center max-w-xs shadow-lg">
                        <span className="text-2xl block mb-2">👋</span>
                        <p className="font-bold">Hello! Chat with Kitchen</p>
                        <p className="text-xs text-teal-200 mt-1.5">Send a message to connect with the mess administration.</p>
                      </div>
                    </div>
                  )}

                  {(() => {
                    // Group messages by date
                    const groups = messages.reduce((acc, msg) => {
                      const dk = msg.created_at ? new Date(msg.created_at).toDateString() : "Today";
                      if (!acc[dk]) acc[dk] = [];
                      acc[dk].push(msg);
                      return acc;
                    }, {});

                    const isWorkerMsg = (m) => m.sender_type === "worker";

                    const fmtTime = (ts) => {
                      if (!ts) return "";
                      return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                    };

                    return Object.entries(groups).map(([dateKey, dayMsgs]) => (
                      <div key={dateKey}>
                        {/* Date separator */}
                        <div className="flex items-center justify-center my-4">
                          <span className="bg-[#102f2c]/70 text-teal-100 text-[11px] font-semibold px-3 py-1 rounded-full shadow-sm">
                            {dateKey === new Date().toDateString() ? "Today" : dateKey}
                          </span>
                        </div>

                        {dayMsgs.map((m, idx) => {
                          // Standard WhatsApp: own sent = RIGHT (green), received = LEFT (white)
                          const isMe = isWorkerMsg(m);
                          const prevMsg = dayMsgs[idx - 1];
                          const isFirstInGroup = !prevMsg || isWorkerMsg(prevMsg) !== isMe;
                          const isNew = m.id === firstUnreadId;

                          return (
                            <div key={m.id}>
                              {isNew && (
                                <div className="flex items-center justify-center my-3">
                                  <span className="bg-amber-400/90 text-slate-950 text-[11px] font-bold px-3 py-1 rounded-full shadow-sm">
                                    ↓ New Messages
                                  </span>
                                </div>
                              )}
                              <div className={`flex mb-1 ${isMe ? "justify-end" : "justify-start"}`}>
                                <div
                                  className={`relative max-w-[78%] sm:max-w-[65%] px-3 py-2 shadow-sm
                                    ${isMe
                                      ? "bg-[#dcf8c6] text-slate-900 rounded-tl-2xl rounded-bl-2xl rounded-tr-sm rounded-br-2xl"
                                      : "bg-white text-slate-900 rounded-tr-2xl rounded-br-2xl rounded-tl-sm rounded-bl-2xl"}
                                  `}
                                  style={{ minWidth: 72 }}
                                >
                                  {/* Audio or text */}
                                  {m.message_type === "audio" ? (
                                    <div className="py-1">
                                      <AudioPlayer
                                        audioUrl={m.audio_url || `/api/chat/audio/${m.id}`}
                                        duration={m.duration}
                                        own={isMe}
                                      />
                                    </div>
                                  ) : (
                                    <p className="text-sm leading-snug break-words whitespace-pre-wrap">{m.text}</p>
                                  )}

                                  {/* Timestamp — ticks on own sent messages (right/green) */}
                                  <div className={`flex items-center gap-1 mt-1 ${isMe ? "justify-end" : "justify-start"}`}>
                                    <span className="text-[10px] text-slate-400">{fmtTime(m.created_at)}</span>
                                    {isMe && (
                                      <svg className="h-3 w-3 text-blue-500 shrink-0" viewBox="0 0 16 11" fill="currentColor">
                                        <path d="M11.071.653a.75.75 0 0 1 .176 1.046l-5.5 7.5a.75.75 0 0 1-1.14.074l-3-3a.75.75 0 1 1 1.06-1.06l2.405 2.405 4.953-6.789a.75.75 0 0 1 1.046-.176z" />
                                        <path d="M14.571.653a.75.75 0 0 1 .176 1.046l-5.5 7.5a.75.75 0 0 1-1.046.176.75.75 0 0 0 1.14-.074l5.23-7.648z" />
                                      </svg>
                                    )}
                                  </div>

                                  {/* Bubble tail — isMe (green/right), !isMe (white/left) */}
                                  {isFirstInGroup && (
                                    <div
                                      className={`absolute top-0 w-2 h-3 ${isMe ? "-right-1.5" : "-left-1.5"}`}
                                      style={{
                                        borderTop: isMe ? "12px solid #dcf8c6" : "12px solid white",
                                        borderLeft: isMe ? "8px solid transparent" : "none",
                                        borderRight: isMe ? "none" : "8px solid transparent",
                                      }}
                                    />
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ));
                  })()}
                </div>

                {/* Chat Composer */}
                <div className="bg-[#f0ece3] px-3 py-2.5 border-t border-stone-200 shrink-0">
                  {showRecorder ? (
                    <div className="bg-white rounded-2xl px-3 py-2 shadow-sm border border-stone-200">
                      <VoiceRecorder
                        conversationId={chatConv?.conversation_id}
                        isAdmin={false}
                        onSend={handleSendAudio}
                        onCancel={() => setShowRecorder(false)}
                      />
                    </div>
                  ) : (
                    <form onSubmit={handleSendText} className="flex items-center gap-2">
                      {/* Mic button */}
                      <button
                        type="button"
                        onClick={() => setShowRecorder(true)}
                        className="h-10 w-10 rounded-full bg-white border border-stone-200 shadow-sm flex items-center justify-center text-teal-800 hover:bg-teal-50 transition-colors shrink-0"
                        title="Voice note"
                      >
                        <Mic className="h-4 w-4" />
                      </button>

                      {/* Speech typing */}
                      <SpeechTyping
                        currentText={msgText}
                        onSpeechResult={(transcript) => setMsgText(transcript)}
                        disabled={showRecorder}
                      />

                      {/* Input */}
                      <div className="flex-1 bg-white rounded-2xl border border-stone-200 shadow-sm px-4 py-2.5 flex items-center min-w-0">
                        <input
                          type="text"
                          placeholder="Type a message..."
                          value={msgText}
                          onChange={(e) => setMsgText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              handleSendText();
                            }
                          }}
                          className="w-full text-sm text-slate-800 bg-transparent outline-none placeholder:text-slate-400"
                        />
                      </div>

                      {/* Send button */}
                      <button
                        type="submit"
                        disabled={sendingMsg || !msgText.trim()}
                        className={`h-10 w-10 rounded-full flex items-center justify-center shadow-sm transition-all shrink-0
                          ${msgText.trim() ? "bg-[#102f2c] text-white hover:bg-teal-700" : "bg-stone-300 text-slate-500 cursor-not-allowed"}`}
                      >
                        {sendingMsg ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      </button>
                    </form>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* 🛵 Delivery Room / Address Dialog */}
      <Dialog open={addressDialogOpen} onOpenChange={setAddressDialogOpen}>
        <DialogContent className="w-[calc(100%_-_2rem)] max-w-md rounded-3xl p-6 gap-4">
          <DialogHeader className="p-0 space-y-1.5 text-left">
            <div className="h-11 w-11 rounded-2xl bg-amber-100 text-amber-900 flex items-center justify-center font-bold">
              <Bike className="h-6 w-6" />
            </div>
            <DialogTitle className="font-display text-lg font-bold text-slate-900">
              Delivery Room & Instructions
            </DialogTitle>
            <p className="text-xs text-slate-500">
              Please enter your hostel name, floor, and room number for {addressDialogSlot.toUpperCase()} delivery.
            </p>
          </DialogHeader>

          <div className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700">Hostel & Room Number *</Label>
              <Input
                placeholder="e.g. Boys Hostel 2, Room 304, 3rd Floor"
                value={addressDialogValue}
                onChange={(e) => setAddressDialogValue(e.target.value)}
                className="rounded-xl h-10 text-xs font-medium"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700">Delivery Instructions (Optional)</Label>
              <Input
                placeholder="e.g. Leave at door / Call on arrival"
                value={addressDialogNotes}
                onChange={(e) => setAddressDialogNotes(e.target.value)}
                className="rounded-xl h-10 text-xs"
              />
            </div>

            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-[11px] text-amber-900">
              💡 <strong>Tip:</strong> Kitchen staff will deliver your meal box right outside your room at standard delivery hours.
            </div>
          </div>

          <DialogFooter className="p-0 flex flex-row gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setAddressDialogOpen(false)}
              className="flex-1 rounded-xl text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={addressDialogSaving || !addressDialogValue.trim()}
              onClick={handleSaveDeliveryAddress}
              className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs shadow-xs"
            >
              {addressDialogSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
              Confirm Delivery
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 🏖️ Vacation / Going Home Modal */}
      {leaveModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-6 relative">
            <button
              onClick={() => setLeaveModalOpen(false)}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 rounded-full"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="h-12 w-12 rounded-2xl bg-amber-100 text-amber-900 flex items-center justify-center mb-4">
              <Palmtree className="h-6 w-6" />
            </div>

            <h2 className="font-display text-xl font-bold text-slate-900">
              Going Home / Vacation Leave
            </h2>
            <p className="text-xs text-slate-500 mt-1 mb-5">
              Set your travel dates. All lunch and dinner services will be paused during this period so your meal quota is preserved.
            </p>

            <form onSubmit={handleApplyLeave} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Start Date (Leaving Date)
                </label>
                <Input
                  type="date"
                  required
                  value={leaveStart}
                  onChange={(e) => setLeaveStart(e.target.value)}
                  className="rounded-xl h-10 text-sm font-mono"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  End Date (Return Date)
                </label>
                <Input
                  type="date"
                  required
                  value={leaveEnd}
                  onChange={(e) => setLeaveEnd(e.target.value)}
                  className="rounded-xl h-10 text-sm font-mono"
                />
              </div>

              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-[11px] text-amber-900 space-y-1">
                <p className="font-bold flex items-center gap-1">
                  <ShieldCheck className="h-3.5 w-3.5" /> Return Policy
                </p>
                <p>When you return, click <strong>"End Leave"</strong> on the portal:</p>
                <ul className="list-disc list-inside space-y-0.5 text-[10px] text-amber-800">
                  <li>Before 11:00 AM → Lunch & Dinner available today</li>
                  <li>11:00 AM – 3:00 PM → Dinner available today</li>
                  <li>After 3:00 PM → Meals resume starting tomorrow</li>
                </ul>
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setLeaveModalOpen(false)}
                  className="flex-1 rounded-xl text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={submittingLeave}
                  className="flex-1 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-xl text-xs"
                >
                  {submittingLeave ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  Confirm Vacation
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 🔐 Student Security & Email Settings Modal */}
      {changePwdOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-6 sm:p-7 relative space-y-6 max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setChangePwdOpen(false)}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-stone-100 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-2xl bg-[#102f2c] text-amber-300 flex items-center justify-center shadow-md shrink-0">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div>
                <h2 className="font-display text-lg font-bold text-slate-900 leading-tight">
                  Security & Recovery Email
                </h2>
                <p className="text-xs text-slate-500">
                  Manage your login password and password recovery email
                </p>
              </div>
            </div>

            {/* 1. Recovery Email Section */}
            <div className="bg-stone-50 border border-stone-200/80 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5 text-teal-800" />
                  Recovery Email Address
                </span>
                {data?.worker?.email ? (
                  <Badge className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-bold px-2 py-0.5">
                    Configured
                  </Badge>
                ) : (
                  <Badge className="bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-bold px-2 py-0.5">
                    Not Set
                  </Badge>
                )}
              </div>

              <p className="text-[11px] text-slate-500 leading-relaxed">
                If you forget your student password, the reset link will be sent to this email address.
              </p>

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!studentEmail.trim() || !studentEmail.includes("@")) {
                    toast.error("Please enter a valid email address");
                    return;
                  }
                  setSavingEmail(true);
                  try {
                    await workerApi.put("/worker/me/email", { email: studentEmail.trim() });
                    toast.success("Recovery email saved successfully!");
                    if (data?.worker) {
                      setData({ ...data, worker: { ...data.worker, email: studentEmail.trim() } });
                    }
                  } catch (err) {
                    toast.error(apiError(err));
                  } finally {
                    setSavingEmail(false);
                  }
                }}
                className="flex gap-2"
              >
                <Input
                  type="email"
                  required
                  placeholder="student@example.com"
                  value={studentEmail}
                  onChange={(e) => setStudentEmail(e.target.value)}
                  className="h-10 rounded-xl text-xs sm:text-sm bg-white"
                />
                <Button
                  type="submit"
                  disabled={savingEmail}
                  className="bg-teal-800 hover:bg-teal-900 text-white rounded-xl text-xs font-bold px-4 h-10 shrink-0"
                >
                  {savingEmail ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save Email"}
                </Button>
              </form>
            </div>

            {/* 2. Change Password Section */}
            <div className="border-t border-stone-200 pt-4 space-y-4">
              <div>
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5 text-teal-800" />
                  Change Student Password
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Enter your current password and choose a new one (min 6 characters).
                </p>
              </div>

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (changePwdForm.next.length < 6) {
                    toast.error("New password must be at least 6 characters");
                    return;
                  }
                  if (changePwdForm.next !== changePwdForm.confirm) {
                    toast.error("Passwords do not match");
                    return;
                  }
                  setChangePwdLoading(true);
                  try {
                    await changePassword(changePwdForm.current, changePwdForm.next);
                    toast.success("Password changed successfully!");
                    setChangePwdOpen(false);
                  } catch (err) {
                    toast.error(apiError(err));
                  } finally {
                    setChangePwdLoading(false);
                  }
                }}
                className="space-y-3"
              >
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Current Password
                  </label>
                  <div className="relative">
                    <Input
                      type={showChangePwd ? "text" : "password"}
                      required
                      value={changePwdForm.current}
                      onChange={(e) => setChangePwdForm({ ...changePwdForm, current: e.target.value })}
                      className="pr-10 h-10 rounded-xl text-sm font-mono"
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowChangePwd(!showChangePwd)}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                    >
                      {showChangePwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    New Password
                  </label>
                  <Input
                    type={showChangePwd ? "text" : "password"}
                    required
                    value={changePwdForm.next}
                    onChange={(e) => setChangePwdForm({ ...changePwdForm, next: e.target.value })}
                    className="h-10 rounded-xl text-sm font-mono"
                    placeholder="Min 6 characters"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Confirm New Password
                  </label>
                  <Input
                    type={showChangePwd ? "text" : "password"}
                    required
                    value={changePwdForm.confirm}
                    onChange={(e) => setChangePwdForm({ ...changePwdForm, confirm: e.target.value })}
                    className="h-10 rounded-xl text-sm font-mono"
                    placeholder="Re-enter new password"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setChangePwdOpen(false)}
                    className="flex-1 rounded-xl text-xs h-10 border-stone-300 font-semibold"
                  >
                    Close
                  </Button>
                  <Button
                    type="submit"
                    disabled={changePwdLoading}
                    className="flex-1 bg-teal-800 hover:bg-teal-900 text-white rounded-xl text-xs font-bold h-10"
                  >
                    {changePwdLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                    Update Password
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
