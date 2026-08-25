import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { adminApi, apiError, money } from "@/lib/api";
import { applyDynamicBranding } from "@/lib/dynamicBranding";
import { useAdminAuth } from "@/context/AdminAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import WorkerViewModal from "@/components/workerview/WorkerViewModal";
import WorkerAvatar from "@/components/ui/WorkerAvatar";
import AttendanceCalendar from "@/components/attendance/AttendanceCalendar";
import SalarySlipModal from "@/components/salary/SalarySlipModal";
import MessageBubble from "@/components/chat/MessageBubble";
import VoiceRecorder from "@/components/chat/VoiceRecorder";
import AudioPlayer from "@/components/chat/AudioPlayer";
import SpeechTyping from "@/components/chat/SpeechTyping";
import useSmartChatScroll from "@/components/chat/useSmartChatScroll";
import { clearConversationNotifications, enablePushNotifications, onPushNotification, pushSupported, sendTestNotification, updateAppBadge } from "@/lib/notifications";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  ChefHat, GraduationCap, HardHat, LayoutDashboard, Users, CalendarCheck, Wallet, Sparkles, LogOut,
  Plus, Pencil, Trash2, Loader2, Menu, X, Search, UserPlus,
  MessageSquare, Eye, Send, Mic, Building2, CheckCircle2, ChevronRight, ChevronLeft,
  KeyRound, RefreshCw, Copy, Power, BarChart3, CircleDollarSign, ClipboardList,
  Camera, Upload, Image as ImageIcon, FileText, Sun, Moon, Clock, Calendar, CalendarOff, AlertTriangle, XCircle, Bike,
  Settings, Megaphone, Lock, ShieldCheck, Mail, Globe, Check, EyeOff
} from "lucide-react";

const WORK_TYPES = ["Standard", "Premium"];
const todayDateStr = () => {
  // Use local (IST) date — toISOString() returns UTC which is 5:30h behind IST
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const NAV = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "workers", label: "Students", icon: GraduationCap },
  { key: "menu", label: "Meal Menu & Kitchen", icon: ChefHat },
  { key: "messages", label: "Messages", icon: MessageSquare },
  { key: "settings", label: "Settings", icon: Settings },
];

const attStyle = {
  Present: "bg-emerald-50 text-emerald-700 border-emerald-300 font-bold",
  Absent: "bg-rose-50 text-rose-700 border-rose-300 font-bold",
  "Half Day": "bg-amber-50 text-amber-800 border-amber-300 font-bold",
};

const VALID_VIEWS = ["overview", "workers", "menu", "messages", "settings"];

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { admin, loading, logout, setAdmin } = useAdminAuth();
  const [view, setView] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    if (tab && VALID_VIEWS.includes(tab)) return tab;
    if (params.has("conversation")) return "messages";
    const stored = localStorage.getItem("admin_active_tab");
    if (stored && VALID_VIEWS.includes(stored)) return stored;
    return "overview";
  });

  useEffect(() => {
    if (view) {
      try {
        localStorage.setItem("admin_active_tab", view);
        const url = new URL(window.location);
        url.searchParams.set("tab", view);
        window.history.replaceState({}, "", url.toString());
      } catch (_) {}
    }
  }, [view]);
  const [workers, setWorkers] = useState([]);
  const [sidebar, setSidebar] = useState(false);
  const [bizEditOpen, setBizEditOpen] = useState(false);
  const [bizName, setBizName] = useState("");
  const [bizSaving, setBizSaving] = useState(false);
  const [activeWorkerForView, setActiveWorkerForView] = useState(null);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const unreadRequestRef = useRef(0);

  const loadWorkers = useCallback(async () => {
    try {
      const res = await adminApi.get("/workers");
      setWorkers(res.data);
    } catch (e) {
      toast.error(apiError(e));
    }
  }, []);

  const loadUnreadMessages = useCallback(async (authoritativeCount) => {
    const requestId = ++unreadRequestRef.current;
    if (Number.isFinite(authoritativeCount)) {
      setUnreadMessages(authoritativeCount);
      updateAppBadge(authoritativeCount);
      return;
    }
    try {
      const { data } = await adminApi.get("/chat/conversations");
      if (requestId !== unreadRequestRef.current) return;
      const count = data.reduce((total, conversation) => total + (conversation.unread_count || 0), 0);
      setUnreadMessages(count);
      updateAppBadge(count);
    } catch (_) {}
  }, []);

  useEffect(() => {
    if (!loading && !admin) navigate("/admin/login");
    if (admin) {
      if (admin.business) applyDynamicBranding(admin.business);
      loadWorkers();
      loadUnreadMessages();
      setBizName(admin.business_name || admin.business?.name || "My Business");
    }
  }, [admin, loading, navigate, loadWorkers, loadUnreadMessages]);

  useEffect(() => {
    if (!admin || !pushSupported()) return;
    enablePushNotifications(true).catch(() => {});
  }, [admin]);

  useEffect(() => {
    if (!admin) return undefined;
    const interval = setInterval(() => {
      loadUnreadMessages();
    }, 4000);

    const unsubscribe = onPushNotification((data) => {
      loadUnreadMessages();
      if (data?.title) {
        toast.info(data.title, { description: data.body });
      }
    });

    return () => {
      clearInterval(interval);
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, [admin, loadUnreadMessages]);

  const doLogout = async () => {
    await logout();
    updateAppBadge(0);
    navigate("/admin/login");
  };

  const handleUpdateBusinessName = async () => {
    if (!bizName.trim()) return;
    setBizSaving(true);
    try {
      const res = await adminApi.put("/admin/business", { name: bizName });
      setAdmin((prev) => ({
        ...prev,
        business_name: res.data.name,
        business: res.data,
      }));
      toast.success("Business name updated");
      setBizEditOpen(false);
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setBizSaving(false);
    }
  };

  if (loading || !admin) {
    return (
      <div className="min-h-screen bg-[#f8f7f2] flex items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-teal-800" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f7f2] flex">
      {/* Sidebar */}
      <aside
        className={`fixed lg:sticky top-0 z-30 h-screen w-72 bg-[#102f2c] text-white flex flex-col transition-transform ${
          sidebar ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="p-5 flex items-center justify-between border-b border-teal-900/60">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-amber-400 to-amber-500 text-slate-950 flex items-center justify-center font-bold shadow-md">
              <ChefHat className="h-5 w-5" />
            </div>
            <div>
              <span className="font-display font-extrabold text-lg text-white block leading-none">Ayushman Kitchen</span>
              <span className="text-[10px] text-teal-300 font-bold uppercase tracking-wider">Admin Portal</span>
            </div>
          </div>
          <button className="lg:hidden p-1 text-teal-200" onClick={() => setSidebar(false)}>
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Business Workspace Box */}
        <div className="p-3 mx-3 my-3 bg-white/5 border border-white/10 rounded-2xl">
          <div className="flex items-center gap-2.5 justify-between">
            <div className="h-9 w-9 rounded-xl bg-white/10 p-0.5 overflow-hidden shrink-0 border border-white/20">
              <img 
                src={admin.business?.logo_url || "/workforce-logo.png"} 
                alt="Logo" 
                className="h-full w-full object-cover rounded-lg"
                onError={(e) => { e.currentTarget.src = "/workforce-logo.png"; }}
              />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[10px] text-teal-300 font-bold uppercase tracking-wider block">Kitchen Mess</span>
              <p className="font-display font-bold text-sm text-white truncate">
                {admin.business_name || admin.business?.name || "Ayushman Kitchen"}
              </p>
            </div>
            <button
              onClick={() => setBizEditOpen(true)}
              title="Edit Business Name"
              className="p-1.5 rounded-lg text-teal-200 hover:text-white hover:bg-white/10"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Navigation items */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {NAV.map((n) => (
            <button
              key={n.key}
              data-testid={`nav-${n.key}`}
              onClick={() => {
                setView(n.key);
                setSidebar(false);
              }}
              className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-semibold transition-all ${
                view === n.key
                  ? "bg-amber-400 text-slate-950 shadow-md"
                  : "text-teal-100 hover:bg-white/10 hover:text-white"
              }`}
            >
              <n.icon className={`h-4 w-4 shrink-0 ${view === n.key ? "text-slate-950" : "text-teal-300"}`} />
              <span className="truncate">{n.label}</span>
            </button>
          ))}
        </nav>

        {/* Admin Footer */}
        <div className="p-4 border-t border-teal-900/60 bg-teal-950/40">
          <div className="flex items-center gap-3 mb-2">
            {admin.picture ? (
              <img src={admin.picture} alt="" className="h-8 w-8 rounded-full border border-teal-600" />
            ) : (
              <div className="h-8 w-8 rounded-full bg-teal-700 text-teal-100 flex items-center justify-center font-bold text-xs">
                {admin.name?.[0] || "A"}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-white truncate">{admin.name || "Owner"}</p>
              <p className="text-[11px] text-teal-300 truncate">{admin.email}</p>
            </div>
          </div>
          <Button
            data-testid="admin-logout-btn"
            variant="ghost"
            onClick={doLogout}
            className="w-full justify-start text-xs text-rose-300 hover:text-rose-100 hover:bg-rose-950/30 h-8 px-2 rounded-lg"
          >
            <LogOut className="h-3.5 w-3.5 mr-2" /> Logout</Button>
        </div>
      </aside>

      {sidebar && <div className="fixed inset-0 bg-black/40 z-20 lg:hidden" onClick={() => setSidebar(false)} />}

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="lg:hidden bg-white border-b border-stone-200 p-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
          <button data-testid="open-sidebar-btn" onClick={() => setSidebar(true)} className="p-1">
            <Menu className="h-6 w-6 text-slate-800" />
          </button>
          <span className="font-display font-bold text-slate-900">Ayushman Kitchen</span>
          <span className="text-xs font-semibold text-teal-800 truncate max-w-[120px]">
            {admin.business_name || "Ayushman Kitchen"}
          </span>
        </header>

        <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
          {view === "overview" && <OverviewSection workers={workers} admin={admin} onNavigate={setView} />}
          {view === "workers" && (
            <WorkersSection
              workers={workers}
              reload={loadWorkers}
              onOpenWorkerView={(wid) => setActiveWorkerForView(wid)}
            />
          )}
          {view === "menu" && <MealMenuSection workers={workers} />}
          {view === "messages" && <MessagesSection workers={workers} admin={admin} onUnreadChange={loadUnreadMessages} />}
          {view === "settings" && <SettingsSection admin={admin} setAdmin={setAdmin} />}
        </main>
      </div>

      {/* Edit Business Name Dialog */}
      <Dialog open={bizEditOpen} onOpenChange={setBizEditOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display">Business Name</DialogTitle>
          </DialogHeader>
          <div className="py-3">
            <Label htmlFor="biz-name-input" className="text-xs text-slate-600">
              Workspace or Business Name
            </Label>
            <Input
              id="biz-name-input"
              value={bizName}
              onChange={(e) => setBizName(e.target.value)}
              placeholder="e.g. Sharma Constructions"
              className="mt-1.5"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setBizEditOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdateBusinessName} disabled={bizSaving} className="bg-teal-800 hover:bg-teal-900">
              {bizSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Name"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Read-Only Worker View Modal */}
      {activeWorkerForView && (
        <WorkerViewModal
          workerId={activeWorkerForView}
          open={!!activeWorkerForView}
          onClose={() => setActiveWorkerForView(null)}
        />
      )}
    </div>
  );
}

/* ---------------- 1. Overview Section ---------------- */
function OverviewSection({ workers, admin, onNavigate }) {
  const todayStr = todayDateStr();
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [headcount, setHeadcount] = useState(null);
  const [headcountLoading, setHeadcountLoading] = useState(true);
  const [activeSlot, setActiveSlot] = useState("lunch"); // "lunch" or "dinner"
  const [activityFeed, setActivityFeed] = useState([]);
  const [lowBalanceList, setLowBalanceList] = useState([]);
  const [renewTargetStudent, setRenewTargetStudent] = useState(null);
  const [renewing, setRenewing] = useState(false);
  const [renewDate, setRenewDate] = useState(todayDateStr);
  const [renewPlan, setRenewPlan] = useState("BOTH");
  const [renewQuota, setRenewQuota] = useState(60);
  const [rosterFilter, setRosterFilter] = useState("ALL"); // ALL | DINE_IN | DELIVERY | CANCELLED
  const [rosterSearch, setRosterSearch] = useState("");

  const getOffsetDateStr = (daysAgo) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good Morning" : hour < 17 ? "Good Afternoon" : "Good Evening";
  const todayLabel = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date());

  const loadOverviewData = useCallback(async () => {
    setHeadcountLoading(true);
    try {
      const [hcRes, actRes, lowRes] = await Promise.all([
        adminApi.get(`/meal-headcount?date=${selectedDate}`),
        adminApi.get("/admin/activity-feed"),
        adminApi.get("/admin/low-balance-students"),
      ]);
      setHeadcount(hcRes.data);
      setActivityFeed(actRes.data || []);
      setLowBalanceList(lowRes.data || []);
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setHeadcountLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    loadOverviewData();
  }, [loadOverviewData, workers.length]);

  const activeSlotData = headcount?.[activeSlot] || {
    summary: { total_students: workers.length, total_eating: 0, cancelled_count: 0, on_leave_count: 0, standard_veg: 0, standard_non_veg: 0, premium_total: 0, premium_breakdown: {} },
    students: [],
  };
  const activeSummary = activeSlotData.summary || {};

  const premiumWorkersCount = workers.filter((w) => (w.work_type || "").toLowerCase() === "premium").length;

  const handleDownloadPDF = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("Please allow popups to download/print PDF roster");
      return;
    }
    const students = activeSlotData.students || [];
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Kitchen Meal Roster - ${selectedDate} (${activeSlot.toUpperCase()})</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding: 24px; color: #111; }
          h1 { margin: 0 0 4px 0; color: #102f2c; font-size: 20px; }
          .sub { color: #555; font-size: 12px; margin-bottom: 16px; }
          .summary-box { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 20px; background: #f4f6f5; padding: 12px; border-radius: 8px; font-size: 12px; border: 1px solid #dcdfdc; }
          .summary-item { font-weight: bold; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11px; }
          th, td { border: 1px solid #ddd; padding: 7px 9px; text-align: left; }
          th { background-color: #102f2c; color: white; text-transform: uppercase; font-size: 10px; }
          tr:nth-child(even) { background-color: #fafafa; }
          .badge-eat { color: #047857; font-weight: bold; }
          .badge-cancel { color: #b91c1c; font-weight: bold; }
          .badge-leave { color: #0d9488; font-weight: bold; }
          .badge-deliv { color: #b45309; font-weight: bold; }
          .badge-dine { color: #0f766e; font-weight: bold; }
          .badge-pickup { color: #6d28d9; font-weight: bold; }
          @media print { body { padding: 0; } button { display: none; } }
        </style>
      </head>
      <body>
        <h1>Ayushman Kitchen — Kitchen Preparation Roster</h1>
        <div class="sub">Date: <strong>${selectedDate}</strong> | Slot: <strong>${activeSlot.toUpperCase()}</strong> | Printed: ${new Date().toLocaleTimeString()}</div>
        
        <div class="summary-box">
          <div class="summary-item">🍽️ Total Eating: ${activeSummary.total_eating || 0}</div>
          <div class="summary-item">🍽️ Dine-in (Mess): ${activeSummary.total_dine_in || 0}</div>
          <div class="summary-item">🧳 Pickup: ${activeSummary.total_pickup || 0}</div>
          <div class="summary-item">🛵 Delivery (Room): ${activeSummary.total_delivery || 0}</div>
          <div class="summary-item">🥦 Pure Veg: ${activeSummary.standard_veg || 0}</div>
          <div class="summary-item">🍗 Non-Veg: ${activeSummary.standard_non_veg || 0}</div>
          <div class="summary-item">⭐ Premium Dishes: ${activeSummary.premium_total || 0}</div>
          <div class="summary-item">❌ Cancelled: ${activeSummary.cancelled_count || 0}</div>
          <div class="summary-item">🏖️ On Leave: ${activeSummary.on_leave_count || 0}</div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 30px;">#</th>
              <th>Student Name</th>
              <th>Mobile / ID</th>
              <th>Subscription</th>
              <th>Service Mode</th>
              <th>Delivery Address / Room</th>
              <th>Diet / Dish Choice</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${students.map((s, idx) => `
              <tr>
                <td>${idx + 1}</td>
                <td><strong>${s.name}</strong></td>
                <td>${s.mobile || "—"}</td>
                <td>${s.plan} (${s.meal_plan_type || "BOTH"})</td>
                <td>
                  ${s.is_cancelled || s.is_on_leave ? '—' : s.delivery_option === "DELIVERY" ? '<span class="badge-deliv">🛵 Delivery</span>' : s.delivery_option === "PICKUP" ? '<span class="badge-pickup">🧳 Pickup</span>' : '<span class="badge-dine">🍽️ Dine-in</span>'}
                </td>
                <td>
                  ${s.delivery_option === "DELIVERY" && !s.is_cancelled && !s.is_on_leave ? (s.delivery_address || "—") : "—"}
                </td>
                <td>${s.choice_detail || s.effective_choice || "Standard"}</td>
                <td>
                  ${s.is_on_leave ? '<span class="badge-leave">🏖️ On Vacation</span>' : s.is_cancelled ? '<span class="badge-cancel">❌ Cancelled / Off</span>' : '<span class="badge-eat">✓ Eating</span>'}
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
        <script>
          window.onload = function() { window.print(); }
        </script>
      </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
  };

  const handleExportCSV = () => {
    const students = activeSlotData.students || [];
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Index,Student Name,Mobile,Subscription Plan,Meal Slot,Service Mode,Delivery Address,Diet / Dish Choice,Status,Date\n";
    students.forEach((s, idx) => {
      const statusText = s.is_on_leave ? "On Vacation" : s.is_cancelled ? "Cancelled" : "Eating";
      const serviceMode = s.is_cancelled || s.is_on_leave ? "N/A" : s.delivery_option === "DELIVERY" ? "Delivery" : s.delivery_option === "PICKUP" ? "Pickup" : "Dine-in";
      const deliveryAddress = s.delivery_option === "DELIVERY" && !s.is_cancelled && !s.is_on_leave ? (s.delivery_address || "") : "";
      const row = [
        idx + 1,
        `"${(s.name || "").replace(/"/g, '""')}"`,
        `"${(s.mobile || "").replace(/"/g, '""')}"`,
        `"${s.plan} (${s.meal_plan_type || "BOTH"})"`,
        activeSlot.toUpperCase(),
        `"${serviceMode}"`,
        `"${deliveryAddress.replace(/"/g, '""')}"`,
        `"${(s.choice_detail || s.effective_choice || "Standard").replace(/"/g, '""')}"`,
        statusText,
        selectedDate,
      ].join(",");
      csvContent += row + "\n";
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Kitchen_Roster_${selectedDate}_${activeSlot}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(`Exported ${activeSlot.toUpperCase()} roster for ${selectedDate} to CSV`);
  };

  const handleDownloadCancelledPDF = () => {
    const students = (activeSlotData.students || []).filter(
      (s) => s.is_cancelled || s.is_on_leave || s.effective_choice === "CANCELLED"
    );
    if (students.length === 0) {
      toast.info(`No students cancelled ${activeSlot.toUpperCase()} on ${selectedDate}`);
      return;
    }
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("Please allow popups to download/print PDF report");
      return;
    }
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Cancelled Meals List - ${selectedDate} (${activeSlot.toUpperCase()})</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding: 24px; color: #111; }
          h1 { margin: 0 0 4px 0; color: #991b1b; font-size: 20px; }
          .sub { color: #555; font-size: 12px; margin-bottom: 16px; }
          .summary-box { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 20px; background: #fef2f2; padding: 12px; border-radius: 8px; font-size: 12px; border: 1px solid #fecaca; }
          .summary-item { font-weight: bold; color: #991b1b; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11px; }
          th, td { border: 1px solid #ddd; padding: 8px 10px; text-align: left; }
          th { background-color: #991b1b; color: white; text-transform: uppercase; font-size: 10px; }
          tr:nth-child(even) { background-color: #fafafa; }
          .badge-cancel { color: #dc2626; font-weight: bold; }
          .badge-leave { color: #0d9488; font-weight: bold; }
          @media print { body { padding: 0; } button { display: none; } }
        </style>
      </head>
      <body>
        <h1>Ayushman Kitchen — Cancelled Meals & Skipped Attendance Report</h1>
        <div class="sub">Date: <strong>${selectedDate}</strong> | Slot: <strong>${activeSlot.toUpperCase()}</strong> | Total Cancelled: <strong>${students.length}</strong> | Printed: ${new Date().toLocaleTimeString()}</div>
        
        <div class="summary-box">
          <div class="summary-item">❌ Total Not Eating: ${students.length} Students</div>
          <div class="summary-item">🏖️ On Vacation / Leave: ${students.filter((s) => s.is_on_leave).length}</div>
          <div class="summary-item">🚫 Meal Opt-out: ${students.filter((s) => !s.is_on_leave).length}</div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 30px;">#</th>
              <th>Student Name</th>
              <th>Mobile / ID</th>
              <th>Subscription</th>
              <th>Reason / Cancellation Detail</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${students.map((s, idx) => `
              <tr>
                <td>${idx + 1}</td>
                <td><strong>${s.name}</strong></td>
                <td>${s.mobile || "—"}</td>
                <td>${s.plan} (${s.meal_plan_type || "BOTH"})</td>
                <td>${s.choice_detail || "Cancelled (Not Eating)"}</td>
                <td>
                  ${s.is_on_leave ? '<span class="badge-leave">🏖️ On Vacation</span>' : '<span class="badge-cancel">❌ Cancelled / Off</span>'}
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
        <script>
          window.onload = function() { window.print(); }
        </script>
      </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
  };

  const handleExportCancelledCSV = () => {
    const students = (activeSlotData.students || []).filter(
      (s) => s.is_cancelled || s.is_on_leave || s.effective_choice === "CANCELLED"
    );
    if (students.length === 0) {
      toast.info(`No students cancelled ${activeSlot.toUpperCase()} on ${selectedDate}`);
      return;
    }
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Index,Student Name,Mobile,Subscription Plan,Meal Slot,Reason / Detail,Status,Date\n";
    students.forEach((s, idx) => {
      const statusText = s.is_on_leave ? "On Vacation" : "Cancelled";
      const row = [
        idx + 1,
        `"${(s.name || "").replace(/"/g, '""')}"`,
        `"${(s.mobile || "").replace(/"/g, '""')}"`,
        `"${s.plan} (${s.meal_plan_type || "BOTH"})"`,
        activeSlot.toUpperCase(),
        `"${(s.choice_detail || "Cancelled (Not Eating)").replace(/"/g, '""')}"`,
        statusText,
        selectedDate,
      ].join(",");
      csvContent += row + "\n";
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Cancelled_Meals_${selectedDate}_${activeSlot}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(`Exported ${students.length} cancelled records for ${selectedDate} to CSV`);
  };

  const handleDownloadDeliveryPDF = () => {
    const students = (activeSlotData.students || []).filter(
      (s) => !s.is_cancelled && !s.is_on_leave && s.delivery_option === "DELIVERY" && s.effective_choice !== "CANCELLED"
    );
    if (students.length === 0) {
      toast.info(`No room delivery orders for ${activeSlot.toUpperCase()} on ${selectedDate}`);
      return;
    }
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("Please allow popups to download/print PDF report");
      return;
    }
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Room Delivery Dispatch List - ${selectedDate} (${activeSlot.toUpperCase()})</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding: 24px; color: #111; }
          h1 { margin: 0 0 4px 0; color: #b45309; font-size: 20px; }
          .sub { color: #555; font-size: 12px; margin-bottom: 16px; }
          .summary-box { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 20px; background: #fffbeb; padding: 12px; border-radius: 8px; font-size: 12px; border: 1px solid #fef3c7; }
          .summary-item { font-weight: bold; color: #92400e; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11px; }
          th, td { border: 1px solid #ddd; padding: 8px 10px; text-align: left; }
          th { background-color: #b45309; color: white; text-transform: uppercase; font-size: 10px; }
          tr:nth-child(even) { background-color: #fffbf5; }
          .room-badge { font-weight: bold; font-size: 12px; color: #92400e; background: #fef3c7; padding: 3px 6px; border-radius: 4px; border: 1px solid #fde68a; display: inline-block; }
          .badge-deliv { color: #b45309; font-weight: bold; }
          .note-text { color: #78350f; font-size: 10px; margin-top: 2px; font-style: italic; }
          @media print { body { padding: 0; } button { display: none; } }
        </style>
      </head>
      <body>
        <h1>Ayushman Kitchen — Room Delivery Dispatch Sheet</h1>
        <div class="sub">Date: <strong>${selectedDate}</strong> | Slot: <strong>${activeSlot.toUpperCase()}</strong> | Total Deliveries: <strong>${students.length}</strong> | Printed: ${new Date().toLocaleTimeString()}</div>
        
        <div class="summary-box">
          <div class="summary-item">🛵 Total Room Deliveries: ${students.length} Orders</div>
          <div class="summary-item">🍱 Meal Slot: ${activeSlot.toUpperCase()}</div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 30px;">#</th>
              <th>Student Name</th>
              <th>Mobile / ID</th>
              <th>Delivery Room / Address</th>
              <th>Diet / Dish Choice</th>
              <th>Special Notes</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${students.map((s, idx) => `
              <tr>
                <td>${idx + 1}</td>
                <td><strong>${s.name}</strong></td>
                <td>${s.mobile || "—"}</td>
                <td>
                  <span class="room-badge">📍 ${s.delivery_address || "Address not provided"}</span>
                </td>
                <td>${s.choice_detail || s.effective_choice || "Standard"}</td>
                <td>${s.delivery_notes ? `<span class="note-text">${s.delivery_notes}</span>` : "—"}</td>
                <td><span class="badge-deliv">🛵 Room Delivery</span></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
        <script>
          window.onload = function() { window.print(); }
        </script>
      </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
  };

  const handleExportDeliveryCSV = () => {
    const students = (activeSlotData.students || []).filter(
      (s) => !s.is_cancelled && !s.is_on_leave && s.delivery_option === "DELIVERY" && s.effective_choice !== "CANCELLED"
    );
    if (students.length === 0) {
      toast.info(`No room delivery orders for ${activeSlot.toUpperCase()} on ${selectedDate}`);
      return;
    }
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Index,Student Name,Mobile,Subscription Plan,Meal Slot,Delivery Address,Delivery Notes,Diet / Choice,Status,Date\n";
    students.forEach((s, idx) => {
      const row = [
        idx + 1,
        `"${(s.name || "").replace(/"/g, '""')}"`,
        `"${(s.mobile || "").replace(/"/g, '""')}"`,
        `"${s.plan} (${s.meal_plan_type || "BOTH"})"`,
        activeSlot.toUpperCase(),
        `"${(s.delivery_address || "").replace(/"/g, '""')}"`,
        `"${(s.delivery_notes || "").replace(/"/g, '""')}"`,
        `"${(s.choice_detail || s.effective_choice || "Standard").replace(/"/g, '""')}"`,
        "Delivery",
        selectedDate,
      ].join(",");
      csvContent += row + "\n";
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Kitchen_Delivery_${selectedDate}_${activeSlot}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(`Exported ${students.length} delivery records for ${selectedDate} to CSV`);
  };

  const openRenewModal = (student) => {
    setRenewTargetStudent(student);
    setRenewDate(todayDateStr());
    const plan = student.meal_plan_type || "BOTH";
    setRenewPlan(plan);
    setRenewQuota(plan === "BOTH" ? 60 : 30);
  };

  const executeRenewal = async () => {
    if (!renewTargetStudent) return;
    setRenewing(true);
    try {
      await adminApi.post(`/admin/workers/${renewTargetStudent.id}/renew`, {
        renewal_start_date: renewDate,
        meal_plan_type: renewPlan,
        total_quota: parseInt(renewQuota, 10),
      });
      toast.success(`Successfully renewed ${renewTargetStudent.name}'s meal subscription!`);
      setRenewTargetStudent(null);
      await loadOverviewData();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setRenewing(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold text-teal-800 uppercase tracking-[.16em]">
            {admin.business_name || admin.business?.name || "Ayushman Kitchen"}
          </p>
          <h1 className="font-display text-3xl font-extrabold text-slate-950 mt-1">
            {greeting}, {admin.name || "Admin"}
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            {todayLabel} · Kitchen Live Headcount & Management
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => onNavigate("workers")}
            className="bg-teal-800 hover:bg-teal-900 rounded-2xl font-bold shadow-md"
          >
            <UserPlus className="h-4 w-4 mr-2" /> Add Student
          </Button>
          <Button
            onClick={() => onNavigate("menu")}
            variant="outline"
            className="rounded-2xl font-bold border-stone-300"
          >
            <ChefHat className="h-4 w-4 mr-2" /> Kitchen Timings & Menu
          </Button>
        </div>
      </div>

      {/* 1. Top Level Metrics Bar (Boxes) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Students Box */}
        <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <Users className="h-4 w-4 text-teal-800" /> Total Enrolled Students
          </span>
          <p className="font-display text-3xl font-extrabold text-slate-900">
            {workers.length}
          </p>
          <p className="text-[11px] text-slate-400">Registered mess subscribers</p>
        </div>

        {/* Premium Students Box */}
        <div className="rounded-3xl border border-amber-200 bg-amber-50/50 p-5 shadow-sm space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-amber-600" /> Premium Subscribers
          </span>
          <p className="font-display text-3xl font-extrabold text-amber-950">
            {premiumWorkersCount}
          </p>
          <p className="text-[11px] text-amber-800">Custom gourmet meal members</p>
        </div>

        {/* Total Eating Today (Active Slot) */}
        <div className="rounded-3xl border border-emerald-200 bg-emerald-50/60 p-5 shadow-sm space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-900 flex items-center gap-1.5">
            <ChefHat className="h-4 w-4 text-emerald-700" /> Total Eating ({activeSlot.toUpperCase()})
          </span>
          <p className="font-display text-3xl font-extrabold text-emerald-950">
            {activeSummary.total_eating || 0}
          </p>
          <p className="text-[11px] text-emerald-800">Confirmed meals for preparation</p>
        </div>

        {/* Cancelled / Off (Active Slot) */}
        <div className="rounded-3xl border border-rose-200 bg-rose-50/60 p-5 shadow-sm space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-rose-900 flex items-center gap-1.5">
            <XCircle className="h-4 w-4 text-rose-600" /> Cancelled / Off ({activeSlot.toUpperCase()})
          </span>
          <p className="font-display text-3xl font-extrabold text-rose-950">
            {activeSummary.cancelled_count || 0}
          </p>
          <p className="text-[11px] text-rose-800">Students skipped eating</p>
        </div>
      </div>

      {/* 2. Meal Headcount & Preparation Breakdown Card with Date Selector */}
      <div className="bg-white border border-stone-200 rounded-3xl p-5 sm:p-7 shadow-sm space-y-6">
        <div className="flex flex-col gap-4 border-b border-stone-100 pb-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className={`h-3 w-3 rounded-full ${selectedDate === todayStr ? "bg-emerald-500 animate-pulse" : "bg-teal-700"}`} />
                <h2 className="font-display text-xl font-extrabold text-slate-900">
                  {selectedDate === todayStr
                    ? "Today's Live Meal Preparation Headcount"
                    : selectedDate === getOffsetDateStr(1)
                    ? "Yesterday's Meal Preparation Headcount"
                    : selectedDate === getOffsetDateStr(2)
                    ? "2 Days Ago Meal Preparation Headcount"
                    : "Meal Preparation Headcount"}
                  <span className="text-slate-500 font-medium ml-2 text-base">({selectedDate})</span>
                </h2>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Kitchen tally of students eating, veg vs non-veg counts, and custom dishes for <span className="font-semibold text-slate-700">{selectedDate}</span>.
              </p>
            </div>

            {/* Slot Switcher (Lunch vs Dinner) */}
            <div className="flex items-center p-1 bg-stone-100 border border-stone-200 rounded-2xl self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setActiveSlot("lunch")}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  activeSlot === "lunch"
                    ? "bg-amber-400 text-slate-950 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Sun className="h-4 w-4 text-amber-900" />
                <span>☀️ Lunch Headcount</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveSlot("dinner")}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  activeSlot === "dinner"
                    ? "bg-teal-900 text-white shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Moon className="h-4 w-4 text-teal-300" />
                <span>🌙 Dinner Headcount</span>
              </button>
            </div>
          </div>

          {/* Date Selector Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 bg-stone-50/80 p-3 rounded-2xl border border-stone-200/80">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-bold text-slate-700 mr-1 flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5 text-teal-800" /> Select Date:
              </span>
              <button
                type="button"
                onClick={() => setSelectedDate(todayStr)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  selectedDate === todayStr
                    ? "bg-teal-800 text-white shadow-xs"
                    : "bg-white border border-stone-200 text-slate-700 hover:bg-stone-100"
                }`}
              >
                🟢 Today
              </button>
              <button
                type="button"
                onClick={() => setSelectedDate(getOffsetDateStr(1))}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  selectedDate === getOffsetDateStr(1)
                    ? "bg-teal-800 text-white shadow-xs"
                    : "bg-white border border-stone-200 text-slate-700 hover:bg-stone-100"
                }`}
              >
                Yesterday
              </button>
              <button
                type="button"
                onClick={() => setSelectedDate(getOffsetDateStr(2))}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  selectedDate === getOffsetDateStr(2)
                    ? "bg-teal-800 text-white shadow-xs"
                    : "bg-white border border-stone-200 text-slate-700 hover:bg-stone-100"
                }`}
              >
                2 Days Ago
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-500 font-semibold">Custom Date:</span>
              <input
                type="date"
                value={selectedDate}
                max={todayStr}
                onChange={(e) => {
                  if (e.target.value) setSelectedDate(e.target.value);
                }}
                className="bg-white border border-stone-300 text-slate-800 text-xs font-bold rounded-xl px-2.5 py-1.5 shadow-2xs focus:outline-hidden focus:ring-2 focus:ring-teal-700"
              />
              <button
                type="button"
                onClick={() => loadOverviewData()}
                title="Refresh Report Data"
                className="p-1.5 bg-white border border-stone-200 rounded-xl text-slate-600 hover:text-teal-800 hover:bg-stone-100 shadow-2xs transition-colors"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${headcountLoading ? "animate-spin text-teal-800" : ""}`} />
              </button>
            </div>
          </div>
        </div>

        {/* Detailed Breakdown Boxes for Active Slot */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* Total Eating */}
          <div className="p-4 rounded-2xl bg-teal-50 border border-teal-200 space-y-1">
            <span className="text-xs font-bold text-teal-900 flex items-center gap-1">
              🍽️ Total Eating
            </span>
            <p className="font-display text-2xl font-extrabold text-teal-950">
              {activeSummary.total_eating || 0}
            </p>
            <p className="text-[10px] text-teal-700">Confirmed meals</p>
          </div>

          {/* Dine-in Plates */}
          <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 space-y-1">
            <span className="text-xs font-bold text-emerald-900 flex items-center gap-1">
              🍽️ Dine-in (Mess)
            </span>
            <p className="font-display text-2xl font-extrabold text-emerald-950">
              {activeSummary.total_dine_in || 0}
            </p>
            <p className="text-[10px] text-emerald-700">Eating at Mess</p>
          </div>

          {/* Pickup Plates */}
          <div className="p-4 rounded-2xl bg-violet-50 border border-violet-200 space-y-1">
            <span className="text-xs font-bold text-violet-900 flex items-center gap-1">
              🧳 Pickup
            </span>
            <p className="font-display text-2xl font-extrabold text-violet-950">
              {activeSummary.total_pickup || 0}
            </p>
            <p className="text-[10px] text-violet-700">Counter Pickup</p>
          </div>

          {/* Delivery Plates */}
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 space-y-1">
            <span className="text-xs font-bold text-amber-900 flex items-center gap-1">
              🛵 Delivery (Room)
            </span>
            <p className="font-display text-2xl font-extrabold text-amber-950">
              {activeSummary.total_delivery || 0}
            </p>
            <p className="text-[10px] text-amber-700">Room / Doorstep</p>
          </div>

          {/* Pure Veg */}
          <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200 space-y-1">
            <span className="text-xs font-bold text-emerald-900 flex items-center gap-1">
              🥦 Pure Veg
            </span>
            <p className="font-display text-2xl font-extrabold text-emerald-950">
              {activeSummary.standard_veg || 0}
            </p>
            <p className="text-[10px] text-emerald-700">Veg meals</p>
          </div>

          {/* Non-Veg */}
          <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200 space-y-1">
            <span className="text-xs font-bold text-amber-900 flex items-center gap-1">
              🍗 Non-Veg
            </span>
            <p className="font-display text-2xl font-extrabold text-amber-950">
              {activeSummary.standard_non_veg || 0}
            </p>
            <p className="text-[10px] text-amber-700">Chicken/egg meals</p>
          </div>

          {/* Cancelled / On Leave */}
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 space-y-1">
            <span className="text-xs font-bold text-rose-900 flex items-center gap-1">
              ❌ Cancelled / Off
            </span>
            <p className="font-display text-2xl font-extrabold text-rose-950">
              {(activeSummary.cancelled_count || 0) + (activeSummary.on_leave_count || 0)}
            </p>
            <p className="text-[10px] text-rose-700">Not eating today</p>
          </div>
        </div>

        {/* Live Kitchen Roster Filter & Student List */}
        <div className="bg-stone-50 border border-stone-200 rounded-2xl p-4 sm:p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-display font-bold text-sm text-slate-900 flex items-center gap-2">
                <ChefHat className="h-4 w-4 text-teal-800" />
                <span>Live Student Preparation & Delivery List ({activeSlot.toUpperCase()})</span>
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Check who is eating in mess vs. who requested room delivery
              </p>
            </div>

            {/* Filter Tabs */}
            <div className="flex flex-wrap items-center gap-1.5 bg-white p-1 rounded-xl border border-stone-200 shadow-2xs">
              {[
                { key: "ALL", label: `All (${activeSlotData.students?.length || 0})` },
                { key: "DINE_IN", label: `🍽️ Dine-in (${activeSummary.total_dine_in || 0})` },
                { key: "PICKUP", label: `🧳 Pickup (${activeSummary.total_pickup || 0})` },
                { key: "DELIVERY", label: `🛵 Delivery (${activeSummary.total_delivery || 0})` },
                { key: "CANCELLED", label: `❌ Cancelled (${(activeSummary.cancelled_count || 0) + (activeSummary.on_leave_count || 0)})` },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setRosterFilter(tab.key)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                    rosterFilter === tab.key
                      ? "bg-teal-800 text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900 hover:bg-stone-100"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input
              value={rosterSearch}
              onChange={(e) => setRosterSearch(e.target.value)}
              placeholder="Search by student name, room/address, or mobile..."
              className="pl-9 bg-white rounded-xl text-xs h-8"
            />
          </div>

          {/* Roster Table */}
          {(() => {
            const allStudents = activeSlotData.students || [];
            const filtered = allStudents.filter((s) => {
              // Filter tab
              if (rosterFilter === "DINE_IN") {
                if (s.is_cancelled || s.is_on_leave || s.delivery_option === "DELIVERY" || s.delivery_option === "PICKUP") return false;
              } else if (rosterFilter === "PICKUP") {
                if (s.is_cancelled || s.is_on_leave || s.delivery_option !== "PICKUP") return false;
              } else if (rosterFilter === "DELIVERY") {
                if (s.is_cancelled || s.is_on_leave || s.delivery_option !== "DELIVERY") return false;
              } else if (rosterFilter === "CANCELLED") {
                if (!s.is_cancelled && !s.is_on_leave) return false;
              }
              // Search
              if (rosterSearch.trim()) {
                const q = rosterSearch.toLowerCase();
                const match = [s.name, s.mobile, s.delivery_address, s.choice_detail, s.plan].some((v) =>
                  String(v || "").toLowerCase().includes(q)
                );
                if (!match) return false;
              }
              return true;
            });

            if (filtered.length === 0) {
              return (
                <div className="py-8 text-center text-slate-400 text-xs bg-white rounded-xl border border-stone-200">
                  No students found in this category for {activeSlot.toUpperCase()}
                </div>
              );
            }

            return (
              <div className="bg-white border border-stone-200 rounded-xl overflow-x-auto shadow-2xs max-h-[360px] overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-stone-100/90 backdrop-blur-xs border-b border-stone-200 text-slate-600 font-bold uppercase text-[10px]">
                    <tr>
                      <th className="py-2.5 px-3">#</th>
                      <th className="py-2.5 px-3">Student</th>
                      <th className="py-2.5 px-3">Service Mode</th>
                      <th className="py-2.5 px-3">Delivery Room / Address</th>
                      <th className="py-2.5 px-3">Dish / Choice</th>
                      <th className="py-2.5 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((s, idx) => (
                      <tr key={s.worker_id || idx} className="border-t border-stone-100 hover:bg-stone-50/60">
                        <td className="py-2 px-3 text-slate-400 text-[11px]">{idx + 1}</td>
                        <td className="py-2 px-3">
                          <span className="font-bold text-slate-900 block">{s.name}</span>
                          <span className="text-[10px] text-slate-400 font-mono">{s.mobile || "—"}</span>
                        </td>
                        <td className="py-2 px-3">
                          {s.is_cancelled || s.is_on_leave ? (
                            <span className="text-slate-400 text-[11px]">—</span>
                          ) : s.delivery_option === "DELIVERY" ? (
                            <span className="inline-flex items-center gap-1 font-bold text-amber-900 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md text-[10px]">
                              🛵 Delivery
                            </span>
                          ) : s.delivery_option === "PICKUP" ? (
                            <span className="inline-flex items-center gap-1 font-bold text-violet-900 bg-violet-50 border border-violet-200 px-2 py-0.5 rounded-md text-[10px]">
                              🧳 Pickup
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 font-bold text-teal-800 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-md text-[10px]">
                              🍽️ Dine-in
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-[11px]">
                          {s.delivery_option === "DELIVERY" && !s.is_cancelled && !s.is_on_leave ? (
                            <div>
                              <span className="font-semibold text-slate-800 block">📍 {s.delivery_address || "Address not provided"}</span>
                              {s.delivery_notes && <span className="text-[10px] text-slate-500">Note: {s.delivery_notes}</span>}
                            </div>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-2 px-3 font-semibold text-slate-700 text-[11px]">
                          {s.choice_detail || s.effective_choice || "Standard"}
                        </td>
                        <td className="py-2 px-3">
                          {s.is_on_leave ? (
                            <span className="inline-flex items-center text-[10px] font-bold text-cyan-800 bg-cyan-50 border border-cyan-200 px-2 py-0.5 rounded-full">
                              🏖️ Vacation
                            </span>
                          ) : s.is_cancelled ? (
                            <span className="inline-flex items-center text-[10px] font-bold text-rose-800 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full">
                              ❌ Cancelled
                            </span>
                          ) : (
                            <span className="inline-flex items-center text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                              ✓ Eating
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </div>

        {/* Export Options: Full Roster, Cancelled-Only, & Delivery-Only Roster */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Card 1: Full Kitchen Meal Preparation Roster */}
          <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 flex flex-col justify-between gap-3">
            <div>
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                  <FileText className="h-4 w-4 text-teal-800" />
                  <span>Full Kitchen Roster ({activeSlot.toUpperCase()})</span>
                </h4>
                <Badge className="bg-teal-100 text-teal-900 border-teal-200 text-[10px] font-bold">
                  All {activeSlotData.students?.length || 0} Students
                </Badge>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Complete list with eating, diet preferences, delivery rooms, and cancellations for <span className="font-semibold text-slate-700">{selectedDate}</span>.
              </p>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Button
                type="button"
                onClick={handleDownloadPDF}
                variant="outline"
                className="flex-1 rounded-xl border-stone-300 bg-white hover:bg-stone-100 font-bold text-xs h-9"
              >
                📄 Full PDF
              </Button>
              <Button
                type="button"
                onClick={handleExportCSV}
                className="flex-1 rounded-xl bg-teal-800 hover:bg-teal-900 text-white font-bold text-xs h-9 shadow-xs"
              >
                📊 Full CSV
              </Button>
            </div>
          </div>

          {/* Card 2: Cancelled Only List */}
          <div className="p-4 rounded-2xl bg-rose-50/70 border border-rose-200 flex flex-col justify-between gap-3">
            <div>
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-rose-950 flex items-center gap-1.5">
                  <XCircle className="h-4 w-4 text-rose-600" />
                  <span>Cancelled Only List ({activeSlot.toUpperCase()})</span>
                </h4>
                <Badge className="bg-rose-100 text-rose-900 border-rose-300 text-[10px] font-bold">
                  {(activeSummary.cancelled_count || 0) + (activeSummary.on_leave_count || 0)} Cancelled / Off
                </Badge>
              </div>
              <p className="text-[11px] text-rose-800/80 mt-1">
                Downloads <span className="font-bold underline">only</span> students who marked cancelled or are on vacation for <span className="font-semibold text-slate-800">{selectedDate}</span>.
              </p>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Button
                type="button"
                onClick={handleDownloadCancelledPDF}
                variant="outline"
                className="flex-1 rounded-xl border-rose-300 bg-white hover:bg-rose-100 text-rose-900 font-bold text-xs h-9"
              >
                ❌ Cancelled PDF
              </Button>
              <Button
                type="button"
                onClick={handleExportCancelledCSV}
                className="flex-1 rounded-xl bg-rose-700 hover:bg-rose-800 text-white font-bold text-xs h-9 shadow-xs"
              >
                📑 Cancelled CSV
              </Button>
            </div>
          </div>

          {/* Card 3: Delivery Only List */}
          <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200 flex flex-col justify-between gap-3">
            <div>
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-amber-950 flex items-center gap-1.5">
                  <Bike className="h-4 w-4 text-amber-600" />
                  <span>Delivery Only List ({activeSlot.toUpperCase()})</span>
                </h4>
                <Badge className="bg-amber-100 text-amber-900 border-amber-300 text-[10px] font-bold">
                  {activeSummary.total_delivery || 0} Delivery Orders
                </Badge>
              </div>
              <p className="text-[11px] text-amber-800/80 mt-1">
                Downloads <span className="font-bold underline">only</span> students requesting room delivery with room numbers & instructions for <span className="font-semibold text-slate-800">{selectedDate}</span>.
              </p>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Button
                type="button"
                onClick={handleDownloadDeliveryPDF}
                variant="outline"
                className="flex-1 rounded-xl border-amber-300 bg-white hover:bg-amber-100 text-amber-900 font-bold text-xs h-9"
              >
                🛵 Delivery PDF
              </Button>
              <Button
                type="button"
                onClick={handleExportDeliveryCSV}
                className="flex-1 rounded-xl bg-amber-700 hover:bg-amber-800 text-white font-bold text-xs h-9 shadow-xs"
              >
                📦 Delivery CSV
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Two-Column Grid: ⚠️ Low Balance Alert Box + Live Notifications Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ⚠️ Low Balance Renewals Alert Box */}
        <div className="bg-white border-2 border-rose-200 rounded-3xl p-5 sm:p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-rose-100 pb-3">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-xl bg-rose-100 text-rose-800 flex items-center justify-center font-bold text-sm">
                ⚠️
              </div>
              <div>
                <h3 className="font-display font-bold text-base text-rose-950">
                  Subscriptions Expired / Ending Soon
                </h3>
                <p className="text-[11px] text-rose-700">Students with 45-day expiry or ≤ 4 meals remaining</p>
              </div>
            </div>
            <Badge className="bg-rose-100 text-rose-900 border-rose-300 font-bold text-xs">
              {lowBalanceList.length} Students
            </Badge>
          </div>

          {lowBalanceList.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-xs">
              All students have active valid subscriptions 👍
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[320px] overflow-y-auto pr-1">
              {lowBalanceList.map((item) => (
                <div
                  key={item.student.id}
                  className="p-3 rounded-2xl border border-rose-200 bg-rose-50/40 flex items-center justify-between gap-3 hover:bg-rose-50 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-xs text-slate-900 truncate">{item.student.name}</span>
                      {item.is_validity_expired ? (
                        <span className="bg-rose-600 text-white text-[9px] font-bold px-1.5 py-0.2 rounded">
                          Expired (45d)
                        </span>
                      ) : item.remaining === 0 ? (
                        <span className="bg-rose-600 text-white text-[9px] font-bold px-1.5 py-0.2 rounded">
                          0 Meals Left
                        </span>
                      ) : item.validity_days_left <= 5 && !item.stats?.holiday_mode_active ? (
                        <span className="bg-amber-400 text-slate-950 text-[9px] font-bold px-1.5 py-0.2 rounded">
                          {item.validity_days_left}d validity left
                        </span>
                      ) : null}
                    </div>
                    <span className="text-[10px] text-rose-800 font-medium block truncate">
                      {item.is_validity_expired
                        ? `45-day limit reached on ${item.validity_expiry_date} (${item.lapsed_meals || 0} lapsed meals)`
                        : `${item.remaining} / ${item.total_quota} meals left · Valid till ${item.validity_expiry_date}`}
                    </span>
                  </div>
                  <Button
                    type="button"
                    onClick={() => openRenewModal(item.student)}
                    size="sm"
                    className="bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold h-8 px-3 shrink-0 shadow-xs"
                  >
                    🔄 Renew Plan
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 🔔 Live Activity Feed & Notifications */}
        <div className="bg-white border border-stone-200 rounded-3xl p-5 sm:p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-stone-100 pb-3">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-xl bg-teal-100 text-teal-800 flex items-center justify-center font-bold text-sm">
                🔔
              </div>
              <div>
                <h3 className="font-display font-bold text-base text-slate-900">
                  Live Notifications & Activity Feed
                </h3>
                <p className="text-[11px] text-slate-500">Student vacation, meal cancellations & updates</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                onClick={async () => {
                  try {
                    await enablePushNotifications(true);
                    const res = await sendTestNotification(true);
                    if (res?.ok) {
                      toast.success(res.message || "Test notification sent! Check your device.");
                    } else {
                      toast.warning(res.message || "Please enable notification permission first.");
                    }
                  } catch (e) {
                    toast.error("Could not trigger test push: " + (e?.message || e));
                  }
                }}
                variant="outline"
                size="sm"
                className="rounded-xl text-xs h-8 text-amber-900 border-amber-300 bg-amber-50 hover:bg-amber-100"
              >
                🔔 Test Push
              </Button>
              <Button
                type="button"
                onClick={loadOverviewData}
                variant="ghost"
                size="sm"
                className="rounded-xl text-xs h-8 text-teal-800"
              >
                <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
              </Button>
            </div>
          </div>

          {activityFeed.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-xs">
              No recent student activity logs found
            </div>
          ) : (
            <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
              {activityFeed.map((act) => (
                <div
                  key={act.id}
                  className="p-3 rounded-2xl border border-stone-100 bg-stone-50/70 text-xs space-y-0.5"
                >
                  <p className="font-semibold text-slate-900 leading-snug">{act.title}</p>
                  <p className="text-[10px] text-slate-400">
                    {act.created_at ? new Date(act.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Just now"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 4. Quick Actions */}
      <section>
        <h2 className="font-display font-bold text-lg text-slate-900">Quick Operations</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
          <button
            type="button"
            onClick={() => onNavigate("workers")}
            className="rounded-2xl p-5 min-h-24 text-left transition-transform active:scale-[.98] bg-[#102f2c] text-white shadow-md"
          >
            <UserPlus className="h-6 w-6 mb-2 text-amber-300" />
            <span className="block text-base font-bold">Manage Students & Renewals</span>
            <span className="block text-xs opacity-75 mt-0.5">Register new students or renew active subscriptions</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate("menu")}
            className="rounded-2xl p-5 min-h-24 text-left transition-transform active:scale-[.98] bg-amber-100 text-amber-950 border border-amber-200 shadow-sm"
          >
            <ChefHat className="h-6 w-6 mb-2 text-amber-700" />
            <span className="block text-base font-bold">Meal Menu & Cutoff Timings</span>
            <span className="block text-xs opacity-75 mt-0.5">Configure 8-11 AM / 4-7 PM cutoff windows and weekly dishes</span>
          </button>
        </div>
      </section>

      {/* Renewal Modal Dialog */}
      {renewTargetStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-stone-200 space-y-4">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="h-9 w-9 rounded-2xl bg-teal-100 text-teal-800 flex items-center justify-center font-bold">
                  🔄
                </div>
                <div>
                  <h3 className="font-display font-bold text-base text-slate-900">
                    Renew Meal Subscription
                  </h3>
                  <p className="text-xs text-slate-500">{renewTargetStudent.name}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRenewTargetStudent(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <Label className="text-xs font-semibold text-slate-700">Renewal Start Date</Label>
                <Input
                  type="date"
                  value={renewDate}
                  onChange={(e) => setRenewDate(e.target.value)}
                  className="mt-1 w-full rounded-xl text-xs font-bold"
                />
                <p className="text-[10px] text-slate-400 mt-1">Meal consumption counting will reset from this date.</p>
              </div>

              <div>
                <Label className="text-xs font-semibold text-slate-700">Subscription Service Plan</Label>
                <div className="grid grid-cols-3 gap-2 mt-1">
                  {[
                    { key: "BOTH", label: "☀️🌙 Both", quota: 60 },
                    { key: "LUNCH_ONLY", label: "☀️ Lunch", quota: 30 },
                    { key: "DINNER_ONLY", label: "🌙 Dinner", quota: 30 },
                  ].map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => {
                        setRenewPlan(p.key);
                        setRenewQuota(p.quota);
                      }}
                      className={`p-2.5 rounded-xl border text-xs font-bold text-center transition-all ${
                        renewPlan === p.key
                          ? "bg-teal-800 border-teal-800 text-white shadow-xs"
                          : "bg-stone-50 border-stone-200 text-slate-700 hover:bg-stone-100"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label className="text-xs font-semibold text-slate-700">New Meal Pool Quota</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Input
                    type="number"
                    min="1"
                    value={renewQuota}
                    onChange={(e) => setRenewQuota(e.target.value)}
                    className="w-full rounded-xl text-sm font-bold font-mono"
                  />
                  <span className="text-xs font-bold text-slate-600 shrink-0">Meals</span>
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setRenewTargetStudent(null)}
                className="flex-1 rounded-xl text-xs"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={executeRenewal}
                disabled={renewing}
                className="flex-1 bg-teal-800 hover:bg-teal-900 text-white rounded-xl text-xs font-bold"
              >
                {renewing ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
                Confirm Renewal
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- 2. Workers Section ---------------- */
const randomWorkerId = () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(6);
  window.crypto.getRandomValues(bytes);
  return `WF-${Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("")}`;
};
const randomWorkerPassword = () => {
  const bytes = new Uint32Array(1);
  window.crypto.getRandomValues(bytes);
  return String(100000 + (bytes[0] % 900000));
};
const newWorkerForm = () => ({
  name: "", mobile: "", work_type: "Standard", diet_preference: "VEG",
  delivery_preference: "DINE_IN", delivery_address: "", delivery_notes: "",
  meal_plan_type: "BOTH", total_quota: 60, lunch_quota: 30, dinner_quota: 30,
  joining_date: todayDateStr(),
  lunch_start_date: todayDateStr(),
  dinner_start_date: todayDateStr(),
  salary: "", email: "",
  status: "ACTIVE", portal_enabled: true, login_id: randomWorkerId(), password: randomWorkerPassword(),
});

function WorkersSection({ workers, reload, onOpenWorkerView }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(newWorkerForm);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [delTarget, setDelTarget] = useState(null);
  const [query, setQuery] = useState("");
  const [credentials, setCredentials] = useState(null);
  const [resettingPassword, setResettingPassword] = useState(false);
  const workTypes = WORK_TYPES;

  // Profile Photo state
  const [selectedPhotoFile, setSelectedPhotoFile] = useState(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState("");
  const [photoRemoved, setPhotoRemoved] = useState(false);
  const photoInputRef = useRef(null);

  const visibleWorkers = workers.filter((w) =>
    [w.name, w.mobile, w.work_type, w.email, w.login_id, w.delivery_address].some((v) =>
      String(v || "").toLowerCase().includes(query.toLowerCase())
    )
  );

  const openNew = () => {
    setForm(newWorkerForm());
    setEditing(null);
    setSelectedPhotoFile(null);
    setPhotoPreviewUrl("");
    setPhotoRemoved(false);
    setResettingPassword(false);
    setOpen(true);
  };

  const openEdit = (w) => {
    setForm({
      ...w,
      work_type: w.work_type || "Standard",
      diet_preference: w.diet_preference || "VEG",
      delivery_preference: w.delivery_preference || "DINE_IN",
      delivery_address: w.delivery_address || "",
      delivery_notes: w.delivery_notes || "",
      meal_plan_type: w.meal_plan_type || "BOTH",
      total_quota: w.total_quota !== undefined ? w.total_quota : ((w.lunch_quota || 0) + (w.dinner_quota || 0) || (w.meal_plan_type === "BOTH" ? 60 : 30)),
      lunch_quota: w.lunch_quota !== undefined ? w.lunch_quota : 30,
      dinner_quota: w.dinner_quota !== undefined ? w.dinner_quota : 30,
      joining_date: w.joining_date || todayDateStr(),
      lunch_start_date: w.lunch_start_date || w.joining_date || todayDateStr(),
      dinner_start_date: w.dinner_start_date || w.joining_date || todayDateStr(),
      salary: String(w.salary || 0),
      email: w.email || "",
      status: w.status || "ACTIVE",
      portal_enabled: Boolean(w.portal_enabled),
      login_id: w.login_id || "",
      password: "",
    });
    setEditing(w.id);
    setSelectedPhotoFile(null);
    setPhotoPreviewUrl(w.profile_photo_url || "");
    setPhotoRemoved(false);
    setResettingPassword(false);
    setOpen(true);
  };

  const handlePhotoSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const validTypes = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
    if (!validTypes.includes(file.type.toLowerCase())) {
      toast.error("Unsupported image format. Please use JPEG, PNG, or WebP");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Profile photo exceeds the 5 MB limit");
      return;
    }
    setSelectedPhotoFile(file);
    setPhotoPreviewUrl(URL.createObjectURL(file));
    setPhotoRemoved(false);
  };

  const handleRemovePhoto = () => {
    setSelectedPhotoFile(null);
    setPhotoPreviewUrl("");
    setPhotoRemoved(true);
    if (photoInputRef.current) {
      photoInputRef.current.value = "";
    }
  };

  const save = async () => {
    if (!form.name) {
      toast.error("Student name is required");
      return;
    }
    if (form.portal_enabled && (!form.login_id || (!editing && !form.password))) {
      toast.error("Student ID and temporary password are required when login is enabled");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        salary: parseFloat(form.salary) || 0,
        total_quota: parseInt(form.total_quota ?? (form.meal_plan_type === "BOTH" ? 60 : 30), 10),
        lunch_quota: parseInt(form.lunch_quota ?? 30, 10),
        dinner_quota: parseInt(form.dinner_quota ?? 30, 10),
        meal_plan_type: form.meal_plan_type || "BOTH",
        delivery_preference: form.delivery_preference || "DINE_IN",
        delivery_address: (form.delivery_address || "").trim(),
        delivery_notes: (form.delivery_notes || "").trim(),
        lunch_start_date: form.lunch_start_date || form.joining_date,
        dinner_start_date: form.dinner_start_date || form.joining_date,
      };
      const response = editing
        ? await adminApi.put(`/workers/${editing}`, payload)
        : await adminApi.post("/workers", payload);
      
      const savedWorkerId = editing || response.data.id || response.data.worker?.id;

      // Handle photo changes if any
      if (savedWorkerId) {
        if (photoRemoved) {
          try {
            await adminApi.delete(`/workers/${savedWorkerId}/profile-photo`);
          } catch (err) {
            console.error("Failed to delete photo:", err);
          }
        } else if (selectedPhotoFile) {
          try {
            const photoForm = new FormData();
            photoForm.append("file", selectedPhotoFile);
            await adminApi.post(`/workers/${savedWorkerId}/profile-photo`, photoForm, {
              headers: { "Content-Type": "multipart/form-data" },
            });
          } catch (err) {
            toast.error("Photo upload failed. Please try again.");
          }
        }
      }

      toast.success(editing ? "Worker updated" : "Worker added successfully");
      setOpen(false);
      if (response.data.one_time_credentials) {
        setCredentials({ name: form.name, action: editing ? "updated" : "created", ...response.data.one_time_credentials });
      }
      reload();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const togglePortal = (enabled) => {
    if (enabled && !form.portal_enabled) {
      setForm({ ...form, portal_enabled: true, login_id: form.login_id || randomWorkerId(), password: randomWorkerPassword() });
      setResettingPassword(true);
    } else {
      setForm({ ...form, portal_enabled: enabled, password: "" });
      if (!enabled) setResettingPassword(false);
    }
  };

  const copyText = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Copy failed. Please select and copy manually.");
    }
  };

  const remove = async () => {
    try {
      await adminApi.delete(`/workers/${delTarget.id}`);
      toast.success("Student removed");
      setDelTarget(null);
      reload();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">Students</h1>
          <p className="text-slate-500 text-sm">{workers.length} registered student(s)</p>
        </div>
        <Button
          data-testid="add-worker-btn"
          onClick={openNew}
          className="bg-teal-800 hover:bg-teal-900 rounded-xl font-bold active:scale-95 transition-transform"
        >
          <Plus className="h-4 w-4 mr-1.5" /> Add Student</Button>
      </div>

      <div className="relative max-w-md mb-4">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          data-testid="worker-search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search student name, mobile, plan…"
          className="pl-10 bg-white rounded-xl"
        />
      </div>

      {/* Desktop Table (Hidden on small mobile screens) */}
      <div className="hidden md:block bg-white border border-stone-200 rounded-2xl shadow-sm overflow-x-auto">
        <table className="w-full text-left min-w-[900px]" data-testid="workers-table">
          <thead>
            <tr className="bg-stone-50 text-slate-600 text-xs uppercase tracking-wider font-bold border-b border-stone-200">
              <th className="py-3.5 px-4">Student</th>
              <th className="py-3.5 px-4">Plan</th>
              <th className="py-3.5 px-4">Service Mode</th>
              <th className="py-3.5 px-4">Mobile</th>
              <th className="py-3.5 px-4">Subscription Status</th>
              <th className="py-3.5 px-4">Portal Access</th>
              <th className="py-3.5 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleWorkers.length === 0 && (
              <tr>
                <td colSpan={7} className="py-12 text-center text-slate-400 text-sm">
                  {workers.length ? "No students match your search." : "No students added yet. Click 'Add Student'."}
                </td>
              </tr>
            )}
            {visibleWorkers.map((w) => {
              const isDelivery = (w.delivery_preference || "").toUpperCase() === "DELIVERY";
              return (
                <tr
                  key={w.id}
                  data-testid={`worker-row-${w.id}`}
                  className="border-t border-stone-100 hover:bg-stone-50/70 transition-colors"
                >
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <WorkerAvatar
                        name={w.name}
                        photoUrl={w.profile_photo_url}
                        size="md"
                        className="shadow-sm border border-stone-200 shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="font-bold text-slate-900 leading-tight">{w.name}</p>
                        <p className="text-[11px] font-mono font-semibold text-teal-800 mt-0.5">
                          {w.login_id || "WF-ID N/A"}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <Badge variant="secondary" className={`rounded-lg text-xs font-semibold ${w.work_type === "Premium" ? "bg-amber-50 text-amber-800 border border-amber-200" : "bg-sky-50 text-sky-800 border border-sky-200"}`}>
                      {w.work_type || "Standard"}
                    </Badge>
                  </td>
                  <td className="py-3 px-4">
                    {isDelivery ? (
                      <div className="space-y-0.5">
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-900 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-lg">
                          🛵 Delivery
                        </span>
                        {w.delivery_address && (
                          <p className="text-[11px] text-slate-500 truncate max-w-[180px]" title={w.delivery_address}>
                            📍 {w.delivery_address}
                          </p>
                        )}
                      </div>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-teal-800 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-lg">
                        🍽️ Dine-in
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 font-mono text-sm text-slate-600">{w.mobile || "—"}</td>
                  <td className="py-3 px-4">
                    <Badge className={w.status === "INACTIVE" ? "bg-slate-100 text-slate-600" : "bg-emerald-50 text-emerald-700 border border-emerald-200"}>
                      {w.status === "INACTIVE" ? "Inactive" : "Active"}
                    </Badge>
                  </td>
                  <td className="py-3 px-4">
                    {w.portal_enabled ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Login Enabled
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
                        No Login
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {/* Worker View (Phone display mode) */}
                      <button
                        data-testid={`view-worker-account-${w.id}`}
                        onClick={() => onOpenWorkerView(w.id)}
                        className="inline-flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-xl bg-teal-50 text-teal-800 border border-teal-200 hover:bg-teal-100 transition-colors"
                        title="Open read-only view for worker on owner phone"
                      >
                        <Eye className="h-3.5 w-3.5" /> </button>
                      <Button
                        data-testid={`edit-worker-${w.id}`}
                        variant="ghost"
                        size="icon"
                        onClick={() => openEdit(w)}
                        className="h-8 w-8 text-slate-500 hover:text-slate-900 rounded-lg"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        data-testid={`delete-worker-${w.id}`}
                        variant="ghost"
                        size="icon"
                        onClick={() => setDelTarget(w)}
                        className="h-8 w-8 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile Stacked Cards (Optimized for 320px, 360px, 375px, 390px, 412px, 430px) */}
      <div className="md:hidden space-y-3" data-testid="workers-mobile-cards">
        {visibleWorkers.length === 0 && (
          <div className="p-8 text-center bg-white rounded-2xl border border-stone-200 text-slate-400 text-sm">
            {workers.length ? "No students match your search." : "No students added yet. Click 'Add Student'."}
          </div>
        )}
        {visibleWorkers.map((w) => {
          const isDelivery = (w.delivery_preference || "").toUpperCase() === "DELIVERY";
          return (
            <div
              key={w.id}
              data-testid={`worker-card-${w.id}`}
              className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <WorkerAvatar
                    name={w.name}
                    photoUrl={w.profile_photo_url}
                    size="lg"
                    className="shadow-sm border border-stone-200 shrink-0"
                  />
                  <div className="min-w-0">
                    <h3 className="font-display font-bold text-base text-slate-900 leading-tight truncate">
                      {w.name}
                    </h3>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="secondary" className={`text-[11px] font-semibold ${w.work_type === "Premium" ? "bg-amber-50 text-amber-800 border border-amber-200" : "bg-sky-50 text-sky-800 border border-sky-200"}`}>
                        {w.work_type || "Standard"}
                      </Badge>
                      <Badge className={w.status === "INACTIVE" ? "bg-slate-100 text-slate-600 text-[10px]" : "bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px]"}>
                        {w.status === "INACTIVE" ? "Inactive" : "Active"}
                      </Badge>
                    </div>
                  </div>
                </div>
                {w.login_id && (
                  <span className="font-mono text-xs font-bold text-teal-800 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-md shrink-0">
                    {w.login_id}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs bg-stone-50 rounded-xl p-2.5 border border-stone-100">
                <div>
                  <span className="text-slate-400 block text-[10px]">Service Mode</span>
                  {isDelivery ? (
                    <span className="font-bold text-amber-900 inline-flex items-center gap-1">🛵 Delivery</span>
                  ) : (
                    <span className="font-bold text-teal-800 inline-flex items-center gap-1">🍽️ Dine-in</span>
                  )}
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Mobile</span>
                  <span className="font-mono font-semibold text-slate-800">{w.mobile || "—"}</span>
                </div>
                {isDelivery && w.delivery_address && (
                  <div className="col-span-2 text-[11px] text-slate-600 bg-amber-50/70 p-2 rounded-lg border border-amber-200/60">
                    <span className="text-amber-900 font-bold block text-[10px]">Delivery Room/Address:</span>
                    {w.delivery_address}
                  </div>
                )}
                <div className="col-span-2 flex items-center justify-between pt-1 border-t border-stone-200/60">
                  <span className="text-slate-400 text-[10px]">Portal Access:</span>
                  {w.portal_enabled ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                      <CheckCircle2 className="h-3 w-3" /> Login Enabled
                    </span>
                  ) : (
                    <span className="text-[11px] text-slate-400">No Login</span>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 pt-1 border-t border-stone-100">
                <button
                  data-testid={`view-worker-card-account-${w.id}`}
                  onClick={() => onOpenWorkerView(w.id)}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-bold py-2 px-3 rounded-xl bg-teal-800 text-white hover:bg-teal-900 transition-colors shadow-sm"
                >
                  <Eye className="h-3.5 w-3.5" /> </button>
                <Button
                  data-testid={`edit-worker-card-${w.id}`}
                  variant="outline"
                  size="sm"
                  onClick={() => openEdit(w)}
                  className="rounded-xl border-stone-200 hover:bg-stone-50 h-9 w-9 p-0"
                  aria-label="Edit worker"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  data-testid={`delete-worker-card-${w.id}`}
                  variant="outline"
                  size="sm"
                  onClick={() => setDelTarget(w)}
                  className="rounded-xl border-rose-200 text-rose-600 hover:bg-rose-50 h-9 w-9 p-0"
                  aria-label="Delete worker"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add / Edit Worker Modal */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[calc(100%_-_1.5rem)] max-w-2xl max-h-[92vh] overflow-y-auto rounded-3xl p-0 gap-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-stone-200">
            <DialogTitle className="font-display text-xl">
              {editing ? "Edit Student" : "Add Student"}
            </DialogTitle>
            <p className="text-xs text-slate-500 mt-1">
              Email is optional. Students without emails are fully managed here.
            </p>
          </DialogHeader>
          <div className="p-5 sm:p-6 space-y-6">

            {/* Profile Photo Section */}
            <section className="rounded-2xl border border-stone-200 bg-stone-50/70 p-4 sm:p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-teal-800">
                    Profile Photo</h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Max 5 MB, JPEG / PNG / WebP)
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-4 pt-1">
                <div className="shrink-0 flex items-center justify-center">
                  <WorkerAvatar
                    name={form.name || "Student"}
                    photoUrl={photoRemoved ? "" : photoPreviewUrl}
                    size="2xl"
                    className="shadow-md border-2 border-stone-200 ring-2 ring-teal-800/10"
                  />
                </div>

                <div className="flex flex-col gap-2 min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/jpg"
                      onChange={handlePhotoSelect}
                      className="hidden"
                      id="worker-photo-upload"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => photoInputRef.current?.click()}
                      className="rounded-xl border-stone-300 hover:bg-stone-100 font-bold text-xs"
                    >
                      <Upload className="h-3.5 w-3.5 mr-1.5" />
                      {photoPreviewUrl && !photoRemoved ? "Change Photo" : "Upload Photo"}
                    </Button>
                    {(photoPreviewUrl || (!photoRemoved && form.profile_photo_url)) && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleRemovePhoto}
                        className="rounded-xl text-rose-600 hover:bg-rose-50 hover:text-rose-700 font-bold text-xs"
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Remove
                      </Button>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-400">
                    Photos help mess staff identify students at meal service counters.
                  </p>
                </div>
              </div>
            </section>

            {/* Profile Information Section */}
            <section className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="min-w-0">
                  <Label className="text-xs font-semibold text-slate-700">Full Name *</Label>
                  <Input
                    data-testid="worker-name-input"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. Ramesh Kumar"
                    className="mt-1 w-full min-w-0 rounded-xl"
                  />
                </div>
                <div className="min-w-0">
                  <Label className="text-xs font-semibold text-slate-700">Mobile Number</Label>
                  <Input
                    data-testid="worker-mobile-input"
                    value={form.mobile}
                    onChange={(e) => setForm({ ...form, mobile: e.target.value })}
                    placeholder="10-digit mobile"
                    className="mt-1 w-full min-w-0 rounded-xl"
                  />
                </div>
              </div>

              <div className="min-w-0">
                <Label className="text-xs font-semibold text-slate-700">Student Plan / Category</Label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  {["Standard", "Premium"].map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setForm({ ...form, work_type: t })}
                      className={`min-h-10 px-3 py-2 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                        form.work_type === t
                          ? t === "Premium"
                            ? "bg-amber-600 border-amber-600 text-white shadow-sm"
                            : "bg-teal-800 border-teal-800 text-white shadow-sm"
                          : "bg-white border-stone-200 text-slate-700 hover:bg-stone-50"
                      }`}
                    >
                      {t === "Premium" && <Sparkles className="h-3.5 w-3.5 text-amber-200" />}
                      {t} Plan
                    </button>
                  ))}
                </div>
              </div>

              {/* Diet Preference */}
              {form.work_type !== "Premium" && (
                <div className="p-3.5 bg-stone-50 border border-stone-200 rounded-2xl space-y-2">
                  <Label className="text-xs font-bold text-slate-800">Diet Preference</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, diet_preference: "VEG" })}
                      className={`min-h-10 px-3 py-2 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                        (form.diet_preference || "VEG") === "VEG"
                          ? "bg-emerald-700 border-emerald-700 text-white shadow-sm"
                          : "bg-white border-stone-200 text-slate-700 hover:bg-stone-50"
                      }`}
                    >
                      🥦 Pure Veg
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, diet_preference: "NON_VEG" })}
                      className={`min-h-10 px-3 py-2 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                        form.diet_preference === "NON_VEG"
                          ? "bg-amber-700 border-amber-700 text-white shadow-sm"
                          : "bg-white border-stone-200 text-slate-700 hover:bg-stone-50"
                      }`}
                    >
                      🍗 Non-Veg
                    </button>
                  </div>
                </div>
              )}
              {form.work_type === "Premium" && (
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 font-medium space-y-1">
                  <div className="font-bold flex items-center gap-1.5 text-amber-950">
                    <Sparkles className="h-3.5 w-3.5 text-amber-600" /> Premium Subscriber
                  </div>
                  <p className="text-[11px] text-amber-800">
                    Premium students get daily gourmet dish customization (e.g. Chicken, Paneer, Mushroom specialties) managed under Meal Menu.
                  </p>
                </div>
              )}

              {/* Default Meal Service Mode: Dine-in vs. Delivery */}
              <div className="p-4 bg-stone-50 border border-stone-200 rounded-2xl space-y-3">
                <div>
                  <Label className="text-xs font-bold text-slate-800">Default Meal Service Mode</Label>
                  <p className="text-[11px] text-slate-500">Choose whether the student eats at the Mess (Dine-In) or gets meals delivered to room/hostel.</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, delivery_preference: "DINE_IN" })}
                    className={`min-h-10 px-3 py-2.5 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                      (form.delivery_preference || "DINE_IN") === "DINE_IN"
                        ? "bg-teal-800 border-teal-800 text-white shadow-sm"
                        : "bg-white border-stone-200 text-slate-700 hover:bg-stone-50"
                    }`}
                  >
                    🍽️ Dine-In (Mess)
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, delivery_preference: "DELIVERY" })}
                    className={`min-h-10 px-3 py-2.5 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                      form.delivery_preference === "DELIVERY"
                        ? "bg-amber-600 border-amber-600 text-white shadow-sm"
                        : "bg-white border-stone-200 text-slate-700 hover:bg-stone-50"
                    }`}
                  >
                    🛵 Delivery (Room / Doorstep)
                  </button>
                </div>

                {form.delivery_preference === "DELIVERY" && (
                  <div className="pt-2 space-y-3 border-t border-stone-200">
                    <div>
                      <Label className="text-xs font-semibold text-slate-700">Delivery Address / Hostel & Room No *</Label>
                      <Input
                        type="text"
                        placeholder="e.g. Boys Hostel 2, Room 304, 3rd Floor"
                        value={form.delivery_address || ""}
                        onChange={(e) => setForm({ ...form, delivery_address: e.target.value })}
                        className="mt-1 w-full rounded-xl bg-white text-xs font-medium"
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-semibold text-slate-700">Delivery Notes / Instructions (Optional)</Label>
                      <Input
                        type="text"
                        placeholder="e.g. Leave at guard desk / Call before coming"
                        value={form.delivery_notes || ""}
                        onChange={(e) => setForm({ ...form, delivery_notes: e.target.value })}
                        className="mt-1 w-full rounded-xl bg-white text-xs"
                      />
                    </div>
                  </div>
                )}
                <p className="text-[10px] text-slate-500">
                  Note: Students can also switch between Dine-In and Delivery daily in their Student Portal before the cutoff time.
                </p>
              </div>

              {/* Meal Service & Quota Controls */}
              <div className="p-4 bg-stone-50 border border-stone-200 rounded-2xl space-y-3">
                <div>
                  <Label className="text-xs font-bold text-slate-800">Meal Service Plan</Label>
                  <p className="text-[11px] text-slate-500">Choose which meals this student receives.</p>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { key: "BOTH", label: "☀️🌙 Both", desc: "60 Total Meals (Lunch + Dinner)" },
                    { key: "LUNCH_ONLY", label: "☀️ Lunch Only", desc: "30 Total Meals" },
                    { key: "DINNER_ONLY", label: "🌙 Dinner Only", desc: "30 Total Meals" },
                  ].map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => {
                        if (p.key === "BOTH") {
                          setForm({ ...form, meal_plan_type: "BOTH", total_quota: 60, lunch_quota: 30, dinner_quota: 30 });
                        } else if (p.key === "LUNCH_ONLY") {
                          setForm({ ...form, meal_plan_type: "LUNCH_ONLY", total_quota: 30, lunch_quota: 30, dinner_quota: 0 });
                        } else if (p.key === "DINNER_ONLY") {
                          setForm({ ...form, meal_plan_type: "DINNER_ONLY", total_quota: 30, lunch_quota: 0, dinner_quota: 30 });
                        }
                      }}
                      className={`p-2.5 rounded-xl border text-xs font-bold transition-all text-center ${
                        (form.meal_plan_type || "BOTH") === p.key
                          ? "bg-teal-800 border-teal-800 text-white shadow-sm"
                          : "bg-white border-stone-200 text-slate-700 hover:bg-stone-100"
                      }`}
                    >
                      <div>{p.label}</div>
                      <div className="text-[10px] font-normal opacity-80 mt-0.5">{p.desc}</div>
                    </button>
                  ))}
                </div>

                {/* Quota Input */}
                <div className="pt-1">
                  <Label className="text-xs font-semibold text-slate-700">Total Subscription Meal Quota</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <Input
                      type="number"
                      min="0"
                      placeholder="60 for Both, 30 for Single (0 = unlimited)"
                      value={form.total_quota ?? (form.meal_plan_type === "BOTH" ? 60 : 30)}
                      onChange={(e) => setForm({ ...form, total_quota: e.target.value })}
                      className="w-full rounded-xl bg-white text-sm font-bold font-mono"
                    />
                    <span className="text-xs font-bold text-slate-600 shrink-0">Meals</span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">
                    {form.meal_plan_type === "BOTH"
                      ? "Combined pool of 60 meals (Any lunch or dinner consumed deducts from this 60 pool)."
                      : "Total 30 meals for single slot service."}
                  </p>
                </div>
              </div>

              {/* Start Dates Configuration */}
              <div className="p-4 bg-stone-50 border border-stone-200 rounded-2xl space-y-3">
                <div>
                  <Label className="text-xs font-bold text-slate-800">Meal Service Start Dates</Label>
                  <p className="text-[11px] text-slate-500">Meal attendance and quota calculations begin from these dates.</p>
                </div>

                {form.meal_plan_type === "BOTH" ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs font-semibold text-amber-900 flex items-center gap-1">
                        <Sun className="h-3.5 w-3.5" /> Lunch Start Date
                      </Label>
                      <Input
                        type="date"
                        value={form.lunch_start_date || form.joining_date}
                        onChange={(e) => setForm({ ...form, lunch_start_date: e.target.value })}
                        className="mt-1 w-full rounded-xl bg-white text-xs font-bold"
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-semibold text-teal-900 flex items-center gap-1">
                        <Moon className="h-3.5 w-3.5" /> Dinner Start Date
                      </Label>
                      <Input
                        type="date"
                        value={form.dinner_start_date || form.joining_date}
                        onChange={(e) => setForm({ ...form, dinner_start_date: e.target.value })}
                        className="mt-1 w-full rounded-xl bg-white text-xs font-bold"
                      />
                    </div>
                  </div>
                ) : form.meal_plan_type === "LUNCH_ONLY" ? (
                  <div>
                    <Label className="text-xs font-semibold text-amber-900 flex items-center gap-1">
                      <Sun className="h-3.5 w-3.5" /> Lunch Start Date
                    </Label>
                    <Input
                      type="date"
                      value={form.lunch_start_date || form.joining_date}
                      onChange={(e) => setForm({ ...form, lunch_start_date: e.target.value, joining_date: e.target.value })}
                      className="mt-1 w-full rounded-xl bg-white text-xs font-bold"
                    />
                  </div>
                ) : (
                  <div>
                    <Label className="text-xs font-semibold text-teal-900 flex items-center gap-1">
                      <Moon className="h-3.5 w-3.5" /> Dinner Start Date
                    </Label>
                    <Input
                      type="date"
                      value={form.dinner_start_date || form.joining_date}
                      onChange={(e) => setForm({ ...form, dinner_start_date: e.target.value, joining_date: e.target.value })}
                      className="mt-1 w-full rounded-xl bg-white text-xs font-bold"
                    />
                  </div>
                )}
              </div>

              <div className="min-w-0">
                <Label className="text-xs font-semibold text-slate-700">Joining / Registration Date</Label>
                <Input
                  data-testid="worker-joindate-input"
                  type="date"
                  value={form.joining_date}
                  onChange={(e) => setForm({ ...form, joining_date: e.target.value })}
                  className="mt-1 w-full min-w-0 rounded-xl"
                />
              </div>

              <div className="min-w-0">
                <Label className="text-xs font-semibold text-slate-700">
                  Email Address (Optional</Label>
                <Input
                  data-testid="worker-email-input"
                  type="email"
                  placeholder="worker@example.com ("
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="mt-1 w-full min-w-0 rounded-xl"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  — </p>
              </div>
            </section>

            <section className="rounded-2xl border border-stone-200 bg-stone-50 p-4 space-y-3">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-700">Subscription Status</h3>
              <div className="grid grid-cols-2 gap-2">
                {["ACTIVE", "INACTIVE"].map((status) => (
                  <button key={status} type="button" onClick={() => setForm({ ...form, status })}
                    className={`min-h-10 rounded-xl border text-xs font-bold ${form.status === status ? "bg-teal-800 border-teal-800 text-white" : "bg-white border-stone-200 text-slate-700"}`}>
                    {status === "ACTIVE" ? "Active" : "Inactive"}
                  </button>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 sm:p-5 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">Portal Login</h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">Student ID password self-service portal access </p>
                </div>
                <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer shrink-0">
                  <input data-testid="worker-portal-toggle" type="checkbox" checked={Boolean(form.portal_enabled)}
                    onChange={(e) => togglePortal(e.target.checked)} className="h-5 w-5 accent-teal-800" />
                  {form.portal_enabled ? "Enabled" : "Disabled"}
                </label>
              </div>

              {form.portal_enabled && (
                <div className="space-y-4">
                  <div className="min-w-0">
                    <Label className="text-xs font-semibold text-slate-700">Student IDID</Label>
                    <div className="flex flex-col sm:flex-row gap-2 mt-1">
                      <Input data-testid="worker-login-id-input" value={form.login_id || ""}
                        onChange={(e) => setForm({ ...form, login_id: e.target.value.toUpperCase() })}
                        className="w-full min-w-0 rounded-xl font-mono uppercase" placeholder="WF-XXXXXX" />
                      <Button type="button" variant="outline" onClick={() => setForm({ ...form, login_id: randomWorkerId() })}
                        className="rounded-xl shrink-0"><RefreshCw className="h-4 w-4 mr-1.5" /> Generate ID</Button>
                    </div>
                  </div>

                  {(!editing || resettingPassword) ? (
                    <div className="min-w-0">
                      <Label className="text-xs font-semibold text-slate-700">Temporary Password</Label>
                      <div className="flex flex-col sm:flex-row gap-2 mt-1">
                        <Input data-testid="worker-temp-password-input" value={form.password || ""}
                          onChange={(e) => setForm({ ...form, password: e.target.value })}
                          className="w-full min-w-0 rounded-xl font-mono tracking-widest" placeholder="6 or more characters" />
                        <Button type="button" variant="outline" onClick={() => setForm({ ...form, password: randomWorkerPassword() })}
                          className="rounded-xl shrink-0"><RefreshCw className="h-4 w-4 mr-1.5" /> Generate Password</Button>
                      </div>
                      <p className="text-[11px] text-amber-800 mt-1.5">password save </p>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white border border-amber-200 p-3">
                      <p className="text-xs text-slate-600">Current password is securely hidden.</p>
                      <Button type="button" variant="outline" onClick={() => { setResettingPassword(true); setForm({ ...form, password: randomWorkerPassword() }); }}
                        className="rounded-xl"><KeyRound className="h-4 w-4 mr-1.5" /> Reset Password</Button>
                    </div>
                  )}

                  {editing && (
                    <Button type="button" variant="outline" onClick={() => togglePortal(false)}
                      className="w-full rounded-xl border-rose-200 text-rose-700 hover:bg-rose-50"><Power className="h-4 w-4 mr-1.5" /> Disable Login</Button>
                  )}
                </div>
              )}
            </section>
          </div>

          <DialogFooter className="px-6 py-4 border-t border-stone-200 bg-stone-50 gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button data-testid="save-worker-btn" onClick={save} disabled={saving} className="bg-teal-800 hover:bg-teal-900">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? "Save changes" : "Add Student"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* One-time worker credentials */}
      <Dialog open={Boolean(credentials)} onOpenChange={(isOpen) => !isOpen && setCredentials(null)}>
        <DialogContent className="w-[calc(100%_-_1.5rem)] max-w-md rounded-3xl">
          <DialogHeader>
            <div className="h-12 w-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mb-2">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <DialogTitle>{credentials?.action === "updated" ? "Worker Login Updated Successfully" : "Worker Added Successfully"}</DialogTitle>
            <p className="text-sm font-bold text-slate-700">{credentials?.name}</p>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-2xl bg-stone-50 border border-stone-200 p-4">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Worker ID</span>
              <div className="flex items-center justify-between gap-3 mt-1">
                <code className="text-lg font-extrabold text-slate-900 break-all">{credentials?.login_id}</code>
                <Button type="button" size="sm" variant="outline" onClick={() => copyText(credentials?.login_id || "", "Worker ID")}><Copy className="h-4 w-4 mr-1" /> Copy ID</Button>
              </div>
            </div>
            <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4">
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800">Temporary Password</span>
              <div className="flex items-center justify-between gap-3 mt-1">
                <code className="text-lg font-extrabold text-slate-900 break-all">{credentials?.password}</code>
                <Button type="button" size="sm" variant="outline" onClick={() => copyText(credentials?.password || "", "Password")}><Copy className="h-4 w-4 mr-1" /> Copy Password</Button>
              </div>
            </div>
            <p className="text-xs leading-relaxed text-rose-700 font-semibold">Details Worker Password </p>
            <Button type="button" onClick={() => copyText(`WorkForce Login\n\nWorker ID: ${credentials?.login_id}\nPassword: ${credentials?.password}`, "Credentials")}
              className="w-full bg-teal-800 hover:bg-teal-900 rounded-xl"><Copy className="h-4 w-4 mr-1.5" /> Copy Both / Credentials </Button>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCredentials(null)} className="w-full rounded-xl">Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!delTarget} onOpenChange={(o) => !o && setDelTarget(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {delTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes their attendance, payment, and extra-work records from your workspace.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              data-testid="confirm-delete-btn"
              onClick={remove}
              className="bg-rose-600 hover:bg-rose-700"
            >
              Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ---------------- 3. Attendance Section ---------------- */
function AttendanceSection({ workers }) {
  const [viewMode, setViewMode] = useState("daily"); // "daily" or "calendar"
  const [selectedCalendarWorkerId, setSelectedCalendarWorkerId] = useState(workers[0]?.id || "");
  const [date, setDate] = useState(todayDateStr());
  const [records, setRecords] = useState({});
  const [markingAll, setMarkingAll] = useState(false);

  useEffect(() => {
    if (workers.length > 0 && !selectedCalendarWorkerId) {
      setSelectedCalendarWorkerId(workers[0].id);
    }
  }, [workers, selectedCalendarWorkerId]);

  const load = useCallback(async () => {
    try {
      const r = await adminApi.get("/attendance", { params: { date } });
      const map = {};
      r.data.forEach((a) => {
        map[a.worker_id] = a.status;
      });
      setRecords(map);
    } catch (e) {
      toast.error(apiError(e));
    }
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  const mark = async (worker_id, status) => {
    const previous = records[worker_id];
    setRecords((p) => ({ ...p, [worker_id]: status }));
    try {
      await adminApi.post("/attendance", { worker_id, date, status });
      toast.success("Attendance updated");
    } catch (e) {
      setRecords((p) => ({ ...p, [worker_id]: previous }));
      toast.error(apiError(e));
    }
  };

  const markEveryonePresent = async () => {
    if (!workers.length) return;
    setMarkingAll(true);
    try {
      await Promise.all(
        workers.map((w) => adminApi.post("/attendance", { worker_id: w.id, date, status: "Present" }))
      );
      setRecords(Object.fromEntries(workers.map((w) => [w.id, "Present"])));
      toast.success(`Marked all ${workers.length} workers present`);
    } catch (e) {
      toast.error(apiError(e));
      load();
    } finally {
      setMarkingAll(false);
    }
  };

  const setQuickDate = (type) => {
    if (type === "today") setDate(todayDateStr());
    else if (type === "yesterday") {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      setDate(`${y}-${m}-${day}`);
    }
  };

  const selectedWorker = workers.find((w) => w.id === selectedCalendarWorkerId) || workers[0];

  return (
    <div>
      {/* Top Header & Mode Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">Attendance</h1>
          <p className="text-slate-500 text-sm">
            Mark attendance for today or browse complete monthly attendance calendars.
          </p>
        </div>

        {/* View Mode Switcher */}
        <div className="flex items-center gap-1 bg-stone-200/80 p-1 rounded-2xl self-start sm:self-auto shadow-xs">
          <button
            type="button"
            data-testid="attendance-view-daily-btn"
            onClick={() => setViewMode("daily")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
              viewMode === "daily"
                ? "bg-white text-teal-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <CalendarCheck className="h-3.5 w-3.5 inline mr-1.5 text-teal-800" />
            Daily)
          </button>
          <button
            type="button"
            data-testid="attendance-view-calendar-btn"
            onClick={() => setViewMode("calendar")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
              viewMode === "calendar"
                ? "bg-teal-800 text-white shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <BarChart3 className="h-3.5 w-3.5 inline mr-1.5" />
            Calendar)
          </button>
        </div>
      </div>

      {/* Mode 1: Monthly Calendar View */}
      {viewMode === "calendar" && (
        <div className="space-y-5">
          {workers.length === 0 ? (
            <div className="bg-white border border-stone-200 rounded-3xl p-12 text-center text-slate-400">
              <Users className="h-10 w-10 mx-auto mb-2 opacity-40 text-teal-800" />
              <p>Add workers to view monthly attendance calendars.</p>
            </div>
          ) : (
            <>
              {/* Worker Selector Pills */}
              <div className="bg-white border border-stone-200 rounded-2xl p-3 shadow-xs">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-2 px-1">
                  Select Worker:
                </span>
                <div className="flex items-center gap-2 overflow-x-auto pb-1" data-testid="calendar-worker-selector">
                  {workers.map((w) => {
                    const isSelected = selectedWorker?.id === w.id;
                    return (
                      <button
                        key={w.id}
                        type="button"
                        data-testid={`select-worker-cal-${w.id}`}
                        onClick={() => setSelectedCalendarWorkerId(w.id)}
                        className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-2 border ${
                          isSelected
                            ? "bg-teal-800 text-white border-teal-800 shadow-sm"
                            : "bg-stone-50 hover:bg-stone-100 text-slate-700 border-stone-200"
                        }`}
                      >
                        <WorkerAvatar
                          name={w.name}
                          photoUrl={w.profile_photo_url}
                          size="xs"
                          className="shrink-0"
                        />
                        <span>{w.name}</span>
                        {w.login_id && (
                          <span className={`text-[10px] font-mono ${isSelected ? "text-amber-300" : "text-slate-400"}`}>
                            {w.login_id}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Monthly Attendance Calendar */}
              {selectedWorker && (
                <AttendanceCalendar
                  key={selectedWorker.id}
                  workerId={selectedWorker.id}
                  worker={selectedWorker}
                  isAdmin={true}
                  onDateSelect={(clickedDate) => {
                    setDate(clickedDate);
                  }}
                />
              )}
            </>
          )}
        </div>
      )}

      {/* Mode 2: Daily Attendance Marking View */}
      {viewMode === "daily" && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
            {/* Date Selector with Quick Buttons */}
            <div className="flex items-center gap-2 bg-white p-2 border border-stone-200 rounded-2xl shadow-sm">
              <button
                type="button"
                onClick={() => setQuickDate("today")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                  date === todayDateStr() ? "bg-teal-800 text-white" : "bg-stone-100 text-slate-700 hover:bg-stone-200"
                }`}
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setQuickDate("yesterday")}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-stone-100 text-slate-700 hover:bg-stone-200 transition-colors"
              >
                Yesterday
              </button>
              <Input
                data-testid="attendance-date-input"
                type="date"
                max={todayDateStr()}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-auto h-8 text-xs font-semibold rounded-xl"
              />
            </div>

            {workers.length > 0 && (
              <Button
                data-testid="mark-all-present-btn"
                variant="outline"
                onClick={markEveryonePresent}
                disabled={markingAll}
                className="bg-white border-teal-300 text-teal-900 hover:bg-teal-50 rounded-xl text-xs font-bold"
              >
                {markingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <CalendarCheck className="h-3.5 w-3.5 mr-1.5 text-teal-800" />}
                Mark everyone present</Button>
            )}
          </div>

          <div className="space-y-3">
            {workers.length === 0 && <p className="text-slate-400 py-10 text-center">Add workers first.</p>}
            {workers.map((w) => {
              const currentStatus = records[w.id];
              return (
                <div
                  key={w.id}
                  data-testid={`attendance-row-${w.id}`}
                  className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3">
                    <WorkerAvatar
                      name={w.name}
                      photoUrl={w.profile_photo_url}
                      size="md"
                      className="border border-stone-200 shadow-xs shrink-0"
                    />
                    <div>
                      <p className="font-bold text-slate-900">{w.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-slate-500 font-medium">{w.work_type}</span>
                        {w.login_id && (
                          <span className="text-[11px] font-mono font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
                            {w.login_id}
                          </span>
                        )}
                        <span className="text-[11px] text-slate-400">· ₹{w.salary}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {[
                      { key: "Present", label: "Present" },
                      { key: "Half Day", label: "Half" },
                      { key: "Absent", label: "Absent" },
                    ].map(({ key: s, label }) => (
                      <button
                        key={s}
                        data-testid={`mark-${s.replace(/\s/g, "").toLowerCase()}-${w.id}`}
                        onClick={() => mark(w.id, s)}
                        className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all ${
                          currentStatus === s
                            ? attStyle[s]
                            : "bg-white text-slate-600 border-stone-200 hover:bg-stone-50"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------- 4. Payments & Advances Section ---------------- */
export function PaymentsSection({ workers = [] }) {
  const safeWorkers = useMemo(() => (Array.isArray(workers) ? workers.filter(Boolean) : []), [workers]);
  const [payments, setPayments] = useState([]);
  const [summaries, setSummaries] = useState({});
  const [form, setForm] = useState({
    worker_id: "",
    type: "SALARY_PAYMENT",
    amount: "",
    date: todayDateStr(),
    note: "",
  });
  const [saving, setSaving] = useState(false);
  const [delTarget, setDelTarget] = useState(null);
  const [slipTarget, setSlipTarget] = useState(null);

  const load = useCallback(async () => {
    try {
      const p = await adminApi.get("/payments");
      setPayments(Array.isArray(p?.data) ? p.data : []);

      const s = {};
      await Promise.all(
        safeWorkers.map(async (w) => {
          try {
            s[w.id] = (await adminApi.get(`/workers/${w.id}/summary`)).data;
          } catch {}
        })
      );
      setSummaries(s);
    } catch (e) {
      toast.error(apiError(e));
    }
  }, [safeWorkers]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!form.worker_id || !form.amount) {
      toast.error("Please select a worker and enter an amount");
      return;
    }
    setSaving(true);
    try {
      await adminApi.post("/payments", {
        ...form,
        amount: parseFloat(form.amount),
      });
      toast.success(
        form.type === "ADVANCE" ? "Advance recorded" : "Payment recorded"
      );
      setForm({
        worker_id: "",
        type: "SALARY_PAYMENT",
        amount: "",
        date: todayDateStr(),
        note: "",
      });
      load();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const removePayment = async () => {
    if (!delTarget) return;
    try {
      await adminApi.delete(`/payments/${delTarget.id}`);
      toast.success("Transaction removed-");
      setDelTarget(null);
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const wname = (id) => safeWorkers.find((w) => w.id === id)?.name || "—";

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-slate-900">
        Payments & Advances</h1>
      <p className="text-slate-500 text-sm mb-6">
        Record salary payouts, advances, and extra-work settlements with clear transaction history.
      </p>

      {safeWorkers.length === 0 ? (
        <div data-testid="payments-empty-workers" className="bg-white border border-stone-200 rounded-3xl p-8 text-center shadow-sm">
          <HardHat className="h-8 w-8 mx-auto text-amber-500 mb-3" />
          <p className="font-semibold text-slate-900">No workers added yet.</p>
          <p className="text-sm text-slate-500 mt-1">Add a worker before recording a payment or generating a salary slip.</p>
        </div>
      ) : <>

      {/* Record Payment / Advance Form with FIXED non-overlapping select */}
      <div className="bg-white border border-stone-200 rounded-3xl p-6 sm:p-7 shadow-sm mb-8">
        <h2 className="font-display text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
          <Wallet className="h-5 w-5 text-teal-800" /> -Record Transaction
        </h2>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
          {/* Worker Select */}
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-slate-700">Worker</Label>
            <Select
              value={form.worker_id}
              onValueChange={(v) => setForm({ ...form, worker_id: v })}
            >
              <SelectTrigger data-testid="payment-worker-select">
                <SelectValue placeholder="Select worker" />
              </SelectTrigger>
              <SelectContent>
                {safeWorkers.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name} ({w.work_type})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Type Select */}
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-slate-700">Type</Label>
            <Select
              value={form.type}
              onValueChange={(v) => setForm({ ...form, type: v })}
            >
              <SelectTrigger data-testid="payment-type-select">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SALARY_PAYMENT">Salary Payment)</SelectItem>
                <SelectItem value="ADVANCE">Advance)</SelectItem>
                <SelectItem value="EXTRA_WORK_PAYMENT">Extra Work)</SelectItem>
                <SelectItem value="ADJUSTMENT">Adjustment</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Date */}
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-slate-700">Date</Label>
            <Input
              data-testid="payment-date-input"
              type="date"
              max={todayDateStr()}
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              className="rounded-xl h-10"
            />
          </div>

          {/* Amount */}
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-slate-700">Amount (₹)</Label>
            <Input
              data-testid="payment-amount-input"
              type="number"
              min="1"
              placeholder="e.g. 5000"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              className="rounded-xl h-10"
            />
          </div>
        </div>

        <div className="grid sm:grid-cols-[1fr_auto] gap-4 mt-4 items-end">
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-slate-700">Note (Optional</Label>
            <Input
              data-testid="payment-note-input"
              placeholder="e.g. Weekly advance, Diwali bonus adjustment"
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              className="rounded-xl h-10"
            />
          </div>
          <Button
            data-testid="record-payment-btn"
            onClick={save}
            disabled={saving}
            className="bg-teal-800 hover:bg-teal-900 rounded-xl h-10 px-6 font-bold shadow-md"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Record"}
          </Button>
        </div>
      </div>

      {/* Salary & Advance Status Cards per Worker */}
      <h2 className="font-display text-lg font-bold text-slate-900 mb-3">
        Monthly Status by Worker
      </h2>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {safeWorkers.map((w) => {
          const s = summaries?.[w.id] || null;
          return (
            <div
              key={w.id}
              data-testid={`salary-status-${w.id}`}
              className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm flex flex-col justify-between"
            >
              <div>
                <div className="flex justify-between items-start gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <WorkerAvatar
                      name={w.name}
                      photoUrl={w.profile_photo_url}
                      size="sm"
                      className="shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900 text-sm truncate">{w.name}</p>
                      <p className="text-xs text-slate-500 truncate">{w.work_type}</p>
                    </div>
                  </div>
                  <span className="text-xs font-mono font-bold text-slate-500 shrink-0">
                    {money(w.salary)}</span>
                </div>

                {s ? (
                  <div className="mt-4 space-y-1.5 text-xs">
                    <div className="flex justify-between py-1 border-b border-stone-100">
                      <span className="text-slate-500">Earned):</span>
                      <span className="font-bold text-teal-800">{money(s.gross_earned)}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-stone-100">
                      <span className="text-slate-500">Paid):</span>
                      <span className="font-bold text-teal-600">{money(s.paid_this_month)}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-stone-100">
                      <span className="text-slate-500">Advance):</span>
                      <span className="font-bold text-amber-700">{money(s.advance_taken)}</span>
                    </div>
                    <div className="flex justify-between pt-1 font-bold text-sm">
                      <span className="text-slate-800">Payable):</span>
                      <span className="text-amber-800">{money(s.remaining_payable)}</span>
                    </div>
                  </div>
                ) : (
                  <Loader2 className="h-4 w-4 animate-spin text-slate-300 mt-4" />
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-stone-100 flex justify-end">
                <Button
                  type="button"
                  data-testid={`worker-slip-btn-${w.id}`}
                  onClick={() => w?.id && setSlipTarget(w)}
                  variant="outline"
                  size="sm"
                  className="rounded-xl text-xs font-bold text-teal-900 bg-teal-50 hover:bg-teal-100/80 border-teal-200 h-8"
                >
                  <FileText className="h-3.5 w-3.5 mr-1 text-teal-800" /> PDF)
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Salary Slip Modal */}
      <SalarySlipModal
        open={!!slipTarget}
        onClose={() => setSlipTarget(null)}
        workerId={slipTarget?.id}
        worker={slipTarget}
        isAdmin={true}
      />

      {/* Transaction History Table */}
      <h2 className="font-display text-lg font-bold text-slate-900 mb-3">
        -Transaction History
      </h2>
      <div className="bg-white border border-stone-200 rounded-2xl shadow-sm overflow-x-auto">
        <table className="w-full text-left min-w-[650px]" data-testid="payments-table">
          <thead>
            <tr className="bg-stone-50 text-slate-600 text-xs uppercase tracking-wider font-bold border-b border-stone-200">
              <th className="py-3.5 px-4">Worker</th>
              <th className="py-3.5 px-4">Type</th>
              <th className="py-3.5 px-4">Date</th>
              <th className="py-3.5 px-4">Note</th>
              <th className="py-3.5 px-4 text-right">Amount</th>
              <th className="py-3.5 px-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {payments.length === 0 && (
              <tr>
                <td colSpan={6} className="py-10 text-center text-slate-400 text-sm">
                  -No payments or advances recorded yet.
                </td>
              </tr>
            )}
            {payments.map((p) => (
              <tr key={p.id} className="border-t border-stone-100 hover:bg-stone-50/70">
                <td className="py-3.5 px-4 font-bold text-slate-900">{wname(p.worker_id)}</td>
                <td className="py-3.5 px-4">
                  <span
                    className={`text-xs px-2.5 py-1 rounded-full font-bold ${
                      p.type === "ADVANCE"
                        ? "bg-amber-100 text-amber-800 border border-amber-300"
                        : "bg-teal-100 text-teal-800 border border-teal-300"
                    }`}
                  >
                    {p.type === "ADVANCE" ? "Advance)" : "Salary)"}
                  </span>
                </td>
                <td className="py-3.5 px-4 font-mono text-sm text-slate-600">{p.date}</td>
                <td className="py-3.5 px-4 text-sm text-slate-500">{p.note || "—"}</td>
                <td className="py-3.5 px-4 text-right font-display font-bold text-teal-800">
                  {money(p.amount)}
                </td>
                <td className="py-3.5 px-4 text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDelTarget(p)}
                    className="h-8 w-8 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Delete Transaction Alert */}
      <AlertDialog open={!!delTarget} onOpenChange={(o) => !o && setDelTarget(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this transaction-?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this {money(delTarget?.amount)} entry?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={removePayment} className="bg-rose-600 hover:bg-rose-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </>}
    </div>
  );
}

/* ---------------- 5. Extra Work Section ---------------- */
function ExtraSection({ workers }) {
  const [entries, setEntries] = useState([]);
  const [form, setForm] = useState({
    worker_id: "",
    description: "",
    date: todayDateStr(),
    amount: "",
  });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await adminApi.get("/extra-work");
      setEntries(res.data);
    } catch (e) {
      toast.error(apiError(e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!form.worker_id || !form.description || !form.amount) {
      toast.error("Fill all required fields");
      return;
    }
    setSaving(true);
    try {
      await adminApi.post("/extra-work", {
        ...form,
        amount: parseFloat(form.amount),
      });
      toast.success("Extra work entry saved");
      setForm({ worker_id: "", description: "", date: todayDateStr(), amount: "" });
      load();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const wname = (id) => workers.find((w) => w.id === id)?.name || "—";

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-slate-900">Extra Work</h1>
      <p className="text-slate-500 text-sm mb-6">
        Record overtime or specialized tasks added to worker earnings.
      </p>

      {/* Extra Work Form with FIXED select */}
      <div className="bg-white border border-stone-200 rounded-3xl p-6 sm:p-7 shadow-sm mb-8">
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-slate-700">Worker</Label>
            <Select
              value={form.worker_id}
              onValueChange={(v) => setForm({ ...form, worker_id: v })}
            >
              <SelectTrigger data-testid="extra-worker-select">
                <SelectValue placeholder="Select worker" />
              </SelectTrigger>
              <SelectContent>
                {workers.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name} ({w.work_type})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-semibold text-slate-700">Date</Label>
            <Input
              data-testid="extra-date-input"
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              className="rounded-xl h-10"
            />
          </div>
        </div>

        <div className="mt-4 space-y-1">
          <Label className="text-xs font-semibold text-slate-700">
            Work Description</Label>
          <Textarea
            data-testid="extra-desc-input"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="e.g. "
            rows={2}
            className="rounded-xl"
          />
        </div>

        <div className="grid sm:grid-cols-[1fr_auto] gap-4 mt-4 items-end">
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-slate-700">Extra Amount (₹)</Label>
            <Input
              data-testid="extra-amount-input"
              type="number"
              min="0"
              placeholder="e.g. 1500"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              className="rounded-xl h-10"
            />
          </div>
          <Button
            data-testid="add-extra-btn"
            onClick={save}
            disabled={saving}
            className="bg-indigo-700 hover:bg-indigo-800 rounded-xl h-10 px-6 font-bold shadow-md"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add Entry"}
          </Button>
        </div>
      </div>

      {/* History Table */}
      <div className="bg-white border border-stone-200 rounded-2xl shadow-sm overflow-x-auto">
        <table className="w-full text-left min-w-[600px]" data-testid="extra-table">
          <thead>
            <tr className="bg-stone-50 text-slate-600 text-xs uppercase tracking-wider font-bold border-b border-stone-200">
              <th className="py-3.5 px-4">Worker</th>
              <th className="py-3.5 px-4">Description</th>
              <th className="py-3.5 px-4">Date</th>
              <th className="py-3.5 px-4 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && (
              <tr>
                <td colSpan={4} className="py-10 text-center text-slate-400 text-sm">
                  </td>
              </tr>
            )}
            {entries.map((e) => (
              <tr key={e.id} className="border-t border-stone-100 hover:bg-stone-50/70">
                <td className="py-3.5 px-4 font-bold text-slate-900">{wname(e.worker_id)}</td>
                <td className="py-3.5 px-4 text-sm text-slate-600">{e.description}</td>
                <td className="py-3.5 px-4 font-mono text-sm text-slate-600">{e.date}</td>
                <td className="py-3.5 px-4 text-right font-display font-bold text-indigo-700">
                  {money(e.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------- 6. Messages / Chat Section (WhatsApp-Style) ---------------- */
function MessagesSection({ workers, admin, onUnreadChange }) {
  const [conversations, setConversations] = useState([]);
  const [activeConv, setActiveConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [firstUnreadId, setFirstUnreadId] = useState(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [showRecorder, setShowRecorder] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileShowChat, setMobileShowChat] = useState(false);
  const conversationsRequestRef = useRef(0);
  const messagesRequestRef = useRef(0);
  const { listRef: messageListRef, onScroll: handleMessageScroll, scrollAfterSend } = useSmartChatScroll(messages, activeConv?.conversation_id);
  const inputRef = useRef(null);

  // Broadcast Message State
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [broadcastMode, setBroadcastMode] = useState("ALL"); // ALL | SELECTED | PREMIUM | STANDARD
  const [selectedWorkerIds, setSelectedWorkerIds] = useState([]);
  const [broadcastText, setBroadcastText] = useState("");
  const [broadcastSending, setBroadcastSending] = useState(false);
  const [studentSearch, setStudentSearch] = useState("");

  const activeStudents = useMemo(() => {
    return (workers || []).filter((w) => w.status !== "INACTIVE");
  }, [workers]);

  const targetStudentsCount = useMemo(() => {
    if (broadcastMode === "PREMIUM") return activeStudents.filter((w) => (w.work_type || "").toLowerCase() === "premium").length;
    if (broadcastMode === "STANDARD") return activeStudents.filter((w) => (w.work_type || "").toLowerCase() !== "premium").length;
    if (broadcastMode === "SELECTED") return selectedWorkerIds.length;
    return activeStudents.length;
  }, [activeStudents, broadcastMode, selectedWorkerIds]);

  const filteredSelectableStudents = useMemo(() => {
    if (!studentSearch.trim()) return activeStudents;
    const q = studentSearch.toLowerCase();
    return activeStudents.filter((w) => (w.name || "").toLowerCase().includes(q) || (w.login_id || "").toLowerCase().includes(q) || (w.mobile || "").includes(q));
  }, [activeStudents, studentSearch]);

  const toggleSelectStudent = (id) => {
    setSelectedWorkerIds((prev) => prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]);
  };

  const selectAllStudents = () => {
    setSelectedWorkerIds(activeStudents.map((w) => w.id));
  };

  const deselectAllStudents = () => {
    setSelectedWorkerIds([]);
  };

  const handleSendBroadcast = async (e) => {
    e?.preventDefault();
    if (!broadcastText.trim()) {
      toast.error("Please enter a message to broadcast");
      return;
    }
    if (broadcastMode === "SELECTED" && selectedWorkerIds.length === 0) {
      toast.error("Please select at least one student");
      return;
    }

    setBroadcastSending(true);
    try {
      const res = await adminApi.post("/chat/broadcast", {
        recipient_mode: broadcastMode,
        worker_ids: broadcastMode === "SELECTED" ? selectedWorkerIds : [],
        text: broadcastText.trim(),
      });
      toast.success(`📢 Broadcast message sent to ${res.data.sent_count} student(s) successfully!`);
      setBroadcastOpen(false);
      setBroadcastText("");
      await loadConversations();
      if (activeConv) await loadMessages();
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setBroadcastSending(false);
    }
  };

  const loadConversations = useCallback(async () => {
    const requestId = ++conversationsRequestRef.current;
    try {
      const res = await adminApi.get("/chat/conversations");
      if (requestId !== conversationsRequestRef.current) return;
      setConversations(res.data);
      await onUnreadChange?.();
      if (!activeConv && res.data.length > 0) {
        const requested = new URLSearchParams(window.location.search).get("conversation");
        setActiveConv(res.data.find((item) => item.conversation_id === requested) || res.data[0]);
      }
    } catch (e) {
      console.error(e);
    }
  }, [activeConv]);

  const loadMessages = useCallback(async () => {
    if (!activeConv) return;
    const conversationId = activeConv.conversation_id;
    const requestId = ++messagesRequestRef.current;
    try {
      const { data: readState } = await adminApi.post(`/chat/conversations/${conversationId}/read`);
      if (requestId !== messagesRequestRef.current || conversationId !== activeConv.conversation_id) return;
      setFirstUnreadId((current) => current || readState.first_unread_message_id);
      setConversations((items) => items.map((item) => item.conversation_id === conversationId ? { ...item, unread_count: readState.unread_count } : item));
      onUnreadChange?.(readState.total_unread_count);
      clearConversationNotifications(conversationId, readState.total_unread_count);
      const res = await adminApi.get(`/chat/conversations/${conversationId}/messages`);
      if (requestId !== messagesRequestRef.current || conversationId !== activeConv.conversation_id) return;
      setMessages(res.data);
      await loadConversations();
    } catch (e) {
      console.error(e);
    }
  }, [activeConv, loadConversations]);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  useEffect(() => {
    setFirstUnreadId(null);
    setMessages([]);
    loadMessages();
    const interval = setInterval(loadMessages, 3500);
    return () => clearInterval(interval);
  }, [loadMessages]);

  const handleSendText = async (e) => {
    e?.preventDefault();
    if (!text.trim() || !activeConv) return;
    setSending(true);
    try {
      await adminApi.post("/chat/messages", {
        conversation_id: activeConv.conversation_id,
        worker_id: activeConv.worker.id,
        message_type: "text",
        text: text.trim(),
      });
      setText("");
      scrollAfterSend();
      loadMessages();
      loadConversations();
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleSendAudio = async ({ audioAssetId, duration }) => {
    if (!activeConv) return;
    try {
      await adminApi.post("/chat/messages", {
        conversation_id: activeConv.conversation_id,
        worker_id: activeConv.worker.id,
        message_type: "audio",
        audio_asset_id: audioAssetId,
        duration,
      });
      setShowRecorder(false);
      scrollAfterSend();
      loadMessages();
      loadConversations();
    } catch (err) {
      toast.error(apiError(err));
    }
  };

  const filteredConversations = conversations.filter((c) =>
    !searchQuery || c.worker.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatMsgTime = (ts) => {
    if (!ts) return "";
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const formatLastMsgTime = (ts) => {
    if (!ts) return "";
    const d = new Date(ts);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
    return d.toLocaleDateString([], { day: "2-digit", month: "2-digit" });
  };

  // Group messages by date
  const groupedMessages = messages.reduce((groups, msg) => {
    const dateKey = msg.created_at ? new Date(msg.created_at).toDateString() : "Today";
    if (!groups[dateKey]) groups[dateKey] = [];
    groups[dateKey].push(msg);
    return groups;
  }, {});

  const isAdminMsg = (m) => m.sender_type === "owner" || m.sender_type === "admin";

  const selectConversation = (conv) => {
    setActiveConv(conv);
    setMobileShowChat(true);
  };

  return (
    <div className="h-[calc(100vh-140px)] min-h-[600px] flex flex-col">
      <div className="flex flex-1 min-h-0 rounded-3xl overflow-hidden shadow-xl border border-stone-200 bg-white">
        {/* ─── LEFT SIDEBAR: Conversation List ─── */}
        <div
          className={`flex flex-col border-r border-stone-200 bg-[#f0f2f0] shrink-0 transition-all
            ${mobileShowChat ? "hidden md:flex" : "flex"}
            w-full md:w-[320px] lg:w-[360px]`}
        >
          {/* Sidebar Header */}
          <div className="bg-[#102f2c] px-4 py-3.5 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-amber-400 text-slate-950 flex items-center justify-center font-bold">
                <ChefHat className="h-5 w-5" />
              </div>
              <span className="font-display font-bold text-white text-base">Kitchen Messages</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setBroadcastText("");
                  setBroadcastMode("ALL");
                  setSelectedWorkerIds(activeStudents.map((w) => w.id));
                  setBroadcastOpen(true);
                }}
                className="h-8 px-3 rounded-full bg-amber-400 hover:bg-amber-300 active:scale-95 text-slate-950 font-extrabold text-xs flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                title="Send broadcast message to all or selected students"
              >
                <Megaphone className="h-3.5 w-3.5 text-slate-950" />
                <span>Broadcast</span>
              </button>
              <button
                type="button"
                onClick={() => loadConversations()}
                className="h-8 w-8 rounded-full hover:bg-white/10 flex items-center justify-center text-teal-200 hover:text-white transition-colors"
                title="Refresh"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Search Bar */}
          <div className="px-3 py-2.5 bg-[#f0f2f0] border-b border-stone-200 shrink-0">
            <div className="flex items-center gap-2 bg-white rounded-full px-3 py-2 border border-stone-200">
              <Search className="h-4 w-4 text-slate-400 shrink-0" />
              <input
                type="text"
                placeholder="Search students..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 text-sm text-slate-700 outline-none bg-transparent placeholder:text-slate-400"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} className="text-slate-400 hover:text-slate-600">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Conversation List */}
          <div className="flex-1 overflow-y-auto">
            {filteredConversations.length === 0 && (
              <div className="flex flex-col items-center justify-center h-40 text-slate-400 text-sm gap-2">
                <MessageSquare className="h-8 w-8 opacity-40" />
                <span>{searchQuery ? "No results" : "No student conversations yet"}</span>
              </div>
            )}
            {filteredConversations.map((c) => {
              const isActive = activeConv?.conversation_id === c.conversation_id;
              const hasUnread = c.unread_count > 0;
              const lastMsg = c.last_message;
              return (
                <button
                  key={c.conversation_id}
                  onClick={() => selectConversation(c)}
                  className={`w-full px-3 py-3.5 flex items-center gap-3 text-left transition-colors border-b border-stone-100 hover:bg-[#e8ebe8] active:bg-[#dce0dc]
                    ${isActive ? "bg-[#e8ebe8]" : "bg-transparent"}`}
                >
                  {/* Avatar */}
                  <div className="relative shrink-0">
                    <WorkerAvatar
                      name={c.worker.name}
                      photoUrl={c.worker.profile_photo_url}
                      size="md"
                      className="shadow-sm"
                    />
                    {hasUnread && (
                      <span className="absolute -top-0.5 -right-0.5 h-5 w-5 bg-emerald-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-sm">
                        {c.unread_count > 9 ? "9+" : c.unread_count}
                      </span>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-sm font-semibold truncate ${hasUnread ? "text-slate-900 font-bold" : "text-slate-800"}`}>
                        {c.worker.name}
                      </span>
                      {lastMsg?.created_at && (
                        <span className={`text-[11px] shrink-0 ${hasUnread ? "text-emerald-600 font-bold" : "text-slate-400"}`}>
                          {formatLastMsgTime(lastMsg.created_at)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <p className={`text-xs truncate flex-1 ${hasUnread ? "text-slate-700 font-medium" : "text-slate-500"}`}>
                        {lastMsg?.text
                          ? (lastMsg.sender_type === "owner" ? `You: ${lastMsg.text}` : lastMsg.text)
                          : lastMsg?.message_type === "audio"
                          ? "🎵 Voice note"
                          : c.worker.work_type || "Tap to chat"}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ─── RIGHT: Chat Window ─── */}
        <div className={`flex-1 flex flex-col min-w-0 ${!mobileShowChat && "hidden md:flex"}`}>
          {activeConv ? (
            <>
              {/* Chat Window Header */}
              <div
                className="bg-[#102f2c] px-4 py-3 flex items-center gap-3 shrink-0 cursor-pointer"
                style={{ minHeight: 60 }}
              >
                {/* Back button on mobile */}
                <button
                  onClick={() => setMobileShowChat(false)}
                  className="md:hidden h-8 w-8 rounded-full hover:bg-white/10 flex items-center justify-center text-teal-200 hover:text-white transition-colors"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>

                <WorkerAvatar
                  name={activeConv.worker.name}
                  photoUrl={activeConv.worker.profile_photo_url}
                  size="sm"
                  className="shadow-sm shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm text-white leading-tight truncate">{activeConv.worker.name}</p>
                  <p className="text-xs text-teal-300 truncate">
                    {activeConv.worker.work_type} · {activeConv.worker.mobile || activeConv.worker.login_id || ""}
                  </p>
                </div>
                <button
                  onClick={() => loadMessages()}
                  className="h-8 w-8 rounded-full hover:bg-white/10 flex items-center justify-center text-teal-200 hover:text-white transition-colors shrink-0"
                  title="Refresh messages"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
              </div>

              {/* Wallpaper / Message Thread */}
              <div
                ref={messageListRef}
                onScroll={handleMessageScroll}
                className="flex-1 overflow-y-auto px-4 py-4 space-y-1"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23102f2c' fill-opacity='0.03'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
                  backgroundColor: "#f0ece3",
                }}
              >
                {messages.length === 0 ? (
                  <div className="h-full flex items-center justify-center">
                    <div className="bg-[#102f2c]/80 text-white px-5 py-3 rounded-2xl text-sm text-center max-w-xs shadow-lg">
                      <span className="text-xl block mb-1">👋</span>
                      <p className="font-semibold">Say hello to {activeConv.worker.name}!</p>
                      <p className="text-xs text-teal-200 mt-1">Messages are end-to-end encrypted</p>
                    </div>
                  </div>
                ) : (
                  Object.entries(groupedMessages).map(([dateKey, dayMessages]) => (
                    <div key={dateKey}>
                      {/* Date Separator */}
                      <div className="flex items-center justify-center my-4">
                        <span className="bg-[#102f2c]/70 text-teal-100 text-[11px] font-semibold px-3 py-1 rounded-full shadow-sm">
                          {dateKey === new Date().toDateString() ? "Today" : dateKey}
                        </span>
                      </div>

                      {dayMessages.map((m, idx) => {
                        const isMe = isAdminMsg(m);
                        const prevMsg = dayMessages[idx - 1];
                        const isFirstInGroup = !prevMsg || isAdminMsg(prevMsg) !== isMe;
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
                                className={`relative max-w-[75%] sm:max-w-[65%] px-3 py-2 shadow-sm
                                  ${isMe
                                    ? "bg-[#dcf8c6] text-slate-900 rounded-tl-2xl rounded-bl-2xl rounded-tr-sm rounded-br-2xl"
                                    : "bg-white text-slate-900 rounded-tr-2xl rounded-br-2xl rounded-tl-sm rounded-bl-2xl"}
                                  ${isFirstInGroup ? "" : ""}
                                `}
                                style={{ minWidth: 80 }}
                              >
                                {/* Audio or Text */}
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

                                {/* Timestamp & Read tick */}
                                <div className={`flex items-center gap-1 mt-1 ${isMe ? "justify-end" : "justify-start"}`}>
                                  <span className="text-[10px] text-slate-400">{formatMsgTime(m.created_at)}</span>
                                  {isMe && (
                                    <svg className="h-3 w-3 text-blue-500 shrink-0" viewBox="0 0 16 11" fill="currentColor">
                                      <path d="M11.071.653a.75.75 0 0 1 .176 1.046l-5.5 7.5a.75.75 0 0 1-1.14.074l-3-3a.75.75 0 1 1 1.06-1.06l2.405 2.405 4.953-6.789a.75.75 0 0 1 1.046-.176z" />
                                      <path d="M14.571.653a.75.75 0 0 1 .176 1.046l-5.5 7.5a.75.75 0 0 1-1.046.176.75.75 0 0 0 1.14-.074l5.23-7.648z" />
                                    </svg>
                                  )}
                                </div>

                                {/* Tail */}
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
                  ))
                )}
              </div>

              {/* Composer */}
              <div className="bg-[#f0ece3] px-3 py-2.5 border-t border-stone-200 shrink-0">
                {showRecorder ? (
                  <div className="bg-white rounded-2xl px-3 py-2 shadow-sm border border-stone-200">
                    <VoiceRecorder
                      conversationId={activeConv.conversation_id}
                      isAdmin={true}
                      onSend={handleSendAudio}
                      onCancel={() => setShowRecorder(false)}
                    />
                  </div>
                ) : (
                  <form onSubmit={handleSendText} className="flex items-end gap-2">
                    {/* Mic Button */}
                    <button
                      type="button"
                      onClick={() => setShowRecorder(true)}
                      title="Voice note"
                      className="h-10 w-10 rounded-full bg-white border border-stone-200 shadow-sm flex items-center justify-center text-teal-800 hover:bg-teal-50 transition-colors shrink-0"
                    >
                      <Mic className="h-4 w-4" />
                    </button>

                    {/* Speech to text */}
                    <SpeechTyping
                      currentText={text}
                      onSpeechResult={(transcript) => setText(transcript)}
                      disabled={showRecorder}
                    />

                    {/* Message Input */}
                    <div className="flex-1 min-w-0 bg-white rounded-2xl border border-stone-200 shadow-sm px-4 py-2.5 flex items-center">
                      <input
                        ref={inputRef}
                        type="text"
                        placeholder="Type a message..."
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleSendText();
                          }
                        }}
                        className="w-full text-sm text-slate-800 bg-transparent outline-none placeholder:text-slate-400"
                      />
                    </div>

                    {/* Send Button */}
                    <button
                      type="submit"
                      disabled={sending || !text.trim()}
                      className={`h-10 w-10 rounded-full flex items-center justify-center shadow-sm transition-all shrink-0
                        ${text.trim() ? "bg-[#102f2c] text-white hover:bg-teal-700 scale-100" : "bg-stone-300 text-slate-500 cursor-not-allowed"}`}
                    >
                      {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </button>
                  </form>
                )}
              </div>
            </>
          ) : (
            /* No conversation selected */
            <div className="flex-1 flex flex-col items-center justify-center gap-4 bg-[#f0ece3]"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23102f2c' fill-opacity='0.03'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
              }}
            >
              <div className="bg-white/80 backdrop-blur-sm border border-stone-200 rounded-3xl p-8 text-center max-w-xs shadow-lg">
                <div className="h-16 w-16 rounded-full bg-[#102f2c]/10 flex items-center justify-center mx-auto mb-4">
                  <MessageSquare className="h-8 w-8 text-[#102f2c]" />
                </div>
                <h3 className="font-display font-bold text-slate-900 text-lg mb-1">Ayushman Kitchen Chat</h3>
                <p className="text-sm text-slate-500">
                  Select a student from the left to start chatting. Messages are synced in real-time.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 📢 Broadcast Message Modal */}
      {broadcastOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-white border border-stone-200 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="bg-[#102f2c] px-6 py-4 flex items-center justify-between text-white shrink-0">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center font-bold shadow-md">
                  <Megaphone className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-display font-bold text-lg leading-tight">Send Broadcast Message</h3>
                  <p className="text-xs text-teal-200">Send an instant notice to all or selected students</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setBroadcastOpen(false)}
                className="p-1.5 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSendBroadcast} className="p-6 space-y-4 overflow-y-auto flex-1 flex flex-col">
              {/* 1. Recipient Target Mode */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700">Choose Recipients</Label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => setBroadcastMode("ALL")}
                    className={`p-2.5 rounded-2xl border text-xs font-bold flex flex-col items-center justify-center gap-1 transition-all ${
                      broadcastMode === "ALL"
                        ? "bg-[#102f2c] text-white border-[#102f2c] shadow-xs"
                        : "bg-stone-50 border-stone-200 text-slate-700 hover:bg-stone-100"
                    }`}
                  >
                    <span>👥 All Students</span>
                    <span className="text-[10px] opacity-80">({activeStudents.length})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setBroadcastMode("PREMIUM")}
                    className={`p-2.5 rounded-2xl border text-xs font-bold flex flex-col items-center justify-center gap-1 transition-all ${
                      broadcastMode === "PREMIUM"
                        ? "bg-amber-500 text-slate-950 border-amber-500 shadow-xs"
                        : "bg-stone-50 border-stone-200 text-slate-700 hover:bg-stone-100"
                    }`}
                  >
                    <span>⭐ Premium</span>
                    <span className="text-[10px] opacity-80">
                      ({activeStudents.filter((w) => (w.work_type || "").toLowerCase() === "premium").length})
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setBroadcastMode("STANDARD")}
                    className={`p-2.5 rounded-2xl border text-xs font-bold flex flex-col items-center justify-center gap-1 transition-all ${
                      broadcastMode === "STANDARD"
                        ? "bg-teal-800 text-white border-teal-800 shadow-xs"
                        : "bg-stone-50 border-stone-200 text-slate-700 hover:bg-stone-100"
                    }`}
                  >
                    <span>🍚 Standard</span>
                    <span className="text-[10px] opacity-80">
                      ({activeStudents.filter((w) => (w.work_type || "").toLowerCase() !== "premium").length})
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setBroadcastMode("SELECTED")}
                    className={`p-2.5 rounded-2xl border text-xs font-bold flex flex-col items-center justify-center gap-1 transition-all ${
                      broadcastMode === "SELECTED"
                        ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                        : "bg-stone-50 border-stone-200 text-slate-700 hover:bg-stone-100"
                    }`}
                  >
                    <span>🎯 Selected</span>
                    <span className="text-[10px] opacity-80">({selectedWorkerIds.length})</span>
                  </button>
                </div>
              </div>

              {/* Multi-select student list (if SELECTED mode) */}
              {broadcastMode === "SELECTED" && (
                <div className="rounded-2xl border border-stone-200 bg-stone-50 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Search by name, ID or mobile..."
                        value={studentSearch}
                        onChange={(e) => setStudentSearch(e.target.value)}
                        className="w-full bg-white border border-stone-200 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-800 outline-none"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={selectAllStudents}
                      className="text-[11px] font-bold text-teal-800 hover:underline px-1.5"
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={deselectAllStudents}
                      className="text-[11px] font-bold text-slate-500 hover:underline px-1.5"
                    >
                      Clear
                    </button>
                  </div>

                  <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
                    {filteredSelectableStudents.map((w) => {
                      const isSelected = selectedWorkerIds.includes(w.id);
                      return (
                        <div
                          key={w.id}
                          onClick={() => toggleSelectStudent(w.id)}
                          className={`p-2 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                            isSelected
                              ? "bg-indigo-50 border-indigo-300 text-indigo-950 font-bold"
                              : "bg-white border-stone-200 text-slate-700 hover:bg-stone-100"
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <WorkerAvatar worker={w} className="h-6 w-6 text-[10px]" />
                            <span className="text-xs truncate">{w.name}</span>
                            <span className="text-[10px] text-slate-400 font-mono">({w.login_id || w.mobile || "ID"})</span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                              (w.work_type || "").toLowerCase() === "premium"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-teal-100 text-teal-800"
                            }`}>
                              {w.work_type || "Standard"}
                            </span>
                            <div className={`h-4 w-4 rounded flex items-center justify-center ${
                              isSelected ? "bg-indigo-600 text-white" : "border border-stone-300 bg-white"
                            }`}>
                              {isSelected && <Check className="h-3 w-3" />}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Quick Template Chips */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700">Quick Templates</Label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    "📢 Today's meal menu has been updated! Please check and confirm your choice.",
                    "⏰ Reminder: Lunch cutoff window closes soon. Mark your preference now!",
                    "🎉 Special Sunday Biryani Feast today! Veg & Non-Veg options available.",
                    "⚠️ Notice: Kitchen timing update for today.",
                  ].map((tpl, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setBroadcastText(tpl)}
                      className="text-[11px] bg-stone-100 hover:bg-amber-100 text-slate-700 hover:text-amber-900 border border-stone-200 rounded-xl px-2.5 py-1 text-left transition-colors"
                    >
                      {tpl.slice(0, 36)}...
                    </button>
                  ))}
                </div>
              </div>

              {/* Message Textarea */}
              <div className="space-y-1.5 flex-1 flex flex-col">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold text-slate-700">Message Content</Label>
                  <span className="text-[10px] text-slate-400">{broadcastText.length}/4000</span>
                </div>
                <textarea
                  required
                  rows={4}
                  placeholder="Type the message you want to broadcast..."
                  value={broadcastText}
                  onChange={(e) => setBroadcastText(e.target.value)}
                  className="w-full rounded-2xl border border-stone-200 p-3 text-sm text-slate-800 outline-none focus:border-teal-700 focus:ring-1 focus:ring-teal-700 resize-none flex-1"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-2 border-t border-stone-100">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setBroadcastOpen(false)}
                  className="flex-1 rounded-2xl font-bold text-xs h-11 border-stone-200"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={broadcastSending || !broadcastText.trim() || targetStudentsCount === 0}
                  className="flex-2 bg-[#102f2c] hover:bg-teal-900 text-white rounded-2xl font-bold text-xs h-11 shadow-md gap-2"
                >
                  {broadcastSending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4 text-amber-300" />
                  )}
                  Send Broadcast to {targetStudentsCount} Student{targetStudentsCount !== 1 ? "s" : ""}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- 3. Meal Menu & Kitchen Headcount Section (Lunch & Dinner) ---------------- */
const DAYS_ORDER = [
  { key: "monday", label: "Monday" },
  { key: "tuesday", label: "Tuesday" },
  { key: "wednesday", label: "Wednesday" },
  { key: "thursday", label: "Thursday" },
  { key: "friday", label: "Friday" },
  { key: "saturday", label: "Saturday" },
  { key: "sunday", label: "Sunday" },
];

function MealMenuSection({ workers }) {
  const [selectedDayKey, setSelectedDayKey] = useState(() => {
    const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    return dayNames[new Date().getDay()] || "monday";
  });
  const [menuSlotKey, setMenuSlotKey] = useState("lunch"); // "lunch" or "dinner"

  const [menuConfig, setMenuConfig] = useState(null);
  const [windowsConfig, setWindowsConfig] = useState({
    lunch: { start_time: "08:00", end_time: "11:00", is_enabled: true },
    dinner: { start_time: "16:00", end_time: "19:00", is_enabled: true },
  });
  const [premiumItems, setPremiumItems] = useState([]);
  const [premiumSunday, setPremiumSunday] = useState({
    lunch_veg: { name: "", type: "VEG", description: "" },
    lunch_non_veg: { name: "", type: "NON_VEG", description: "" },
  });
  const [menuLoading, setMenuLoading] = useState(true);
  const [savingMenu, setSavingMenu] = useState(false);

  const [newPremiumName, setNewPremiumName] = useState("");
  const [newPremiumType, setNewPremiumType] = useState("NON_VEG");
  const [newPremiumDesc, setNewPremiumDesc] = useState("");

  // College holiday mode + mess closure controls (separate /mess-controls endpoints)
  const [collegeHoliday, setCollegeHoliday] = useState({ is_active: false, reason: "", start_date: "", history: [] });
  const [messClosure, setMessClosure] = useState({ is_active: false, slots: [], start_date: "", end_date: "", reason: "", history: [] });
  const [holidaySaving, setHolidaySaving] = useState(false);
  const [closureSaving, setClosureSaving] = useState(false);
  const [holidayReasonInput, setHolidayReasonInput] = useState("");
  const [closureForm, setClosureForm] = useState({ slots: "both", mode: "days", days: "1", start_date: "", end_date: "", reason: "" });

  const loadMenu = useCallback(async () => {
    setMenuLoading(true);
    try {
      const res = await adminApi.get("/meal-settings");
      setMenuConfig(res.data.days || {});
      if (res.data.windows) setWindowsConfig(res.data.windows);
      setPremiumItems(res.data.premium_items || []);
      if (res.data.premium_sunday) {
        const raw = res.data.premium_sunday;
        setPremiumSunday({
          lunch_veg: raw.lunch_veg || { name: "🥦 Special Sunday Veg Paneer Dum Biryani", type: "VEG", description: "Hyderabadi spiced Veg & Paneer Dum Biryani, Mirchi Ka Salan, Boondi Raita, Gulab Jamun" },
          lunch_non_veg: raw.lunch_non_veg || { name: "🍗 Special Sunday Chicken Dum Biryani", type: "NON_VEG", description: "Hyderabadi Chicken Dum Biryani, Mirchi Ka Salan, Boondi Raita, Gulab Jamun" },
        });
      }
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setMenuLoading(false);
    }
  }, []);

  const loadMessControls = useCallback(async () => {
    try {
      const res = await adminApi.get("/mess-controls");
      if (res.data.college_holiday) setCollegeHoliday(res.data.college_holiday);
      if (res.data.mess_closure) setMessClosure(res.data.mess_closure);
    } catch (e) {
      // Non-fatal — controls just stay at defaults
      console.warn("Failed to load mess controls", e);
    }
  }, []);

  useEffect(() => {
    loadMenu();
    loadMessControls();
  }, [loadMenu, loadMessControls]);

  const handleToggleCollegeHoliday = async (nextActive) => {
    setHolidaySaving(true);
    try {
      const res = await adminApi.post("/mess-controls/college-holiday", {
        is_active: nextActive,
        reason: holidayReasonInput.trim(),
      });
      if (res.data.college_holiday) setCollegeHoliday(res.data.college_holiday);
      toast.success(
        nextActive
          ? "College Holiday Mode ON — students' 45-day validity is now paused."
          : "College Holiday Mode OFF — normal 45-day validity resumed."
      );
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setHolidaySaving(false);
    }
  };

  const handleSetMessClosure = async (activate) => {
    setClosureSaving(true);
    try {
      const payload = activate
        ? {
            is_active: true,
            slots: closureForm.slots,
            reason: closureForm.reason.trim(),
            ...(closureForm.mode === "days"
              ? { start_date: closureForm.start_date || undefined, days: closureForm.days }
              : { start_date: closureForm.start_date || undefined, end_date: closureForm.end_date || undefined }),
          }
        : { is_active: false };
      const res = await adminApi.post("/mess-controls/mess-closure", payload);
      if (res.data.mess_closure) setMessClosure(res.data.mess_closure);
      toast.success(
        activate
          ? "Mess closure applied — students notified & portal cut off."
          : "Mess reopened — students can choose meals again."
      );
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setClosureSaving(false);
    }
  };

  const handleSaveMenu = async () => {
    if (!menuConfig) return;
    setSavingMenu(true);
    try {
      await adminApi.put("/meal-settings", {
        days: menuConfig,
        windows: windowsConfig,
        premium_items: premiumItems,
        premium_sunday: premiumSunday,
      });
      toast.success("Meal menu, timing windows, premium dishes & Sunday special saved permanently!");
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSavingMenu(false);
    }
  };

  // Helper for active day slot menu
  const rawDayData = menuConfig?.[selectedDayKey] || {};
  const currentSlotMenu = rawDayData[menuSlotKey] || {
    is_closed: false,
    standard_mode: "VEG_ONLY",
    standard_veg_title: "",
    standard_veg_desc: "",
    standard_non_veg_title: "",
    standard_non_veg_desc: "",
  };

  const updateCurrentSlot = (field, value) => {
    setMenuConfig((prev) => ({
      ...prev,
      [selectedDayKey]: {
        day_name: selectedDayKey.charAt(0).toUpperCase() + selectedDayKey.slice(1),
        ...rawDayData,
        [menuSlotKey]: {
          ...currentSlotMenu,
          [field]: value,
        },
      },
    }));
  };

  const handleAddPremiumItem = () => {
    if (!newPremiumName.trim()) {
      toast.error("Dish name is required");
      return;
    }
    const newItem = {
      id: `p-${Date.now()}`,
      name: newPremiumName.trim(),
      type: newPremiumType,
      description: newPremiumDesc.trim(),
    };
    setPremiumItems((prev) => [...prev, newItem]);
    setNewPremiumName("");
    setNewPremiumDesc("");
    toast.success(`Added "${newItem.name}" to Premium Menu`);
  };

  const handleRemovePremiumItem = (id) => {
    setPremiumItems((prev) => prev.filter((i) => i.id !== id));
  };

  return (
    <div className="space-y-8">
      {/* 1. Header & Quick Save */}
      <div className="bg-[#102f2c] text-white rounded-3xl p-6 sm:p-7 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-[11px] font-extrabold uppercase tracking-widest text-teal-300">
            Mess Settings & Kitchen Controls
          </span>
          <h2 className="font-display text-2xl font-extrabold mt-0.5">
            Meal Timings, Weekly Schedule & Premium Dishes
          </h2>
          <p className="text-xs text-teal-200 mt-1 max-w-xl">
            Set your weekly rules and gourmet dishes once. They apply continuously every week without needing daily entry.
          </p>
        </div>
        <Button
          onClick={handleSaveMenu}
          disabled={savingMenu || menuLoading}
          className="bg-amber-400 hover:bg-amber-500 text-slate-950 rounded-2xl font-bold h-11 px-6 shadow-sm active:scale-95 transition-transform shrink-0"
        >
          {savingMenu ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Save All Settings
        </Button>
      </div>

      {/* ⚡ Live Mess Controls — College Holiday + Mess Closure (apply instantly, students notified) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* College Holiday Mode */}
        <div className={`rounded-3xl p-5 sm:p-6 shadow-sm space-y-4 border-2 transition-colors ${collegeHoliday.is_active ? "border-indigo-400 bg-indigo-50/60" : "border-stone-200 bg-white"}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className={`h-10 w-10 rounded-2xl flex items-center justify-center shrink-0 ${collegeHoliday.is_active ? "bg-indigo-500 text-white" : "bg-indigo-100 text-indigo-700"}`}>
                <GraduationCap className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h3 className="font-display text-base font-extrabold text-slate-900">College Holiday Mode</h3>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                  Turn ON during college vacation. Students' <strong>45-day validity is paused</strong> — their plan then ends only when the meal quota finishes. Turn OFF to resume normal 45-day counting.
                </p>
              </div>
            </div>
            <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full shrink-0 ${collegeHoliday.is_active ? "bg-indigo-500 text-white" : "bg-stone-100 text-slate-500"}`}>
              {collegeHoliday.is_active ? "ON" : "OFF"}
            </span>
          </div>

          {!collegeHoliday.is_active && (
            <Input
              placeholder="Reason (optional) e.g. Diwali vacation, Semester break"
              value={holidayReasonInput}
              onChange={(e) => setHolidayReasonInput(e.target.value)}
              className="text-xs rounded-xl bg-white"
            />
          )}

          {collegeHoliday.is_active && (
            <div className="rounded-2xl bg-white/70 border border-indigo-200 px-3.5 py-2.5 text-[11px] text-indigo-900">
              <p className="font-bold">✅ Active{collegeHoliday.start_date ? ` since ${collegeHoliday.start_date}` : ""}</p>
              {collegeHoliday.reason && <p className="text-indigo-700 mt-0.5">{collegeHoliday.reason}</p>}
              <p className="text-indigo-600/80 mt-1">Days spent on holiday are added back to every student's validity window.</p>
            </div>
          )}

          <Button
            onClick={() => handleToggleCollegeHoliday(!collegeHoliday.is_active)}
            disabled={holidaySaving}
            className={`w-full rounded-2xl font-bold h-11 active:scale-95 transition-transform ${collegeHoliday.is_active ? "bg-slate-800 hover:bg-slate-900 text-white" : "bg-indigo-600 hover:bg-indigo-700 text-white"}`}
          >
            {holidaySaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Power className="h-4 w-4 mr-2" />}
            {collegeHoliday.is_active ? "Turn OFF (resume 45-day validity)" : "Turn ON (pause validity for holiday)"}
          </Button>
        </div>

        {/* Mess Closure */}
        <div className={`rounded-3xl p-5 sm:p-6 shadow-sm space-y-4 border-2 transition-colors ${messClosure.is_active ? "border-rose-400 bg-rose-50/60" : "border-stone-200 bg-white"}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className={`h-10 w-10 rounded-2xl flex items-center justify-center shrink-0 ${messClosure.is_active ? "bg-rose-500 text-white" : "bg-rose-100 text-rose-700"}`}>
                <CalendarOff className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h3 className="font-display text-base font-extrabold text-slate-900">Close the Mess</h3>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                  Close lunch, dinner or both for a number of days. Students get a <strong>push notification</strong>, their portal is cut off, and those meals are <strong>not deducted</strong> from quota.
                </p>
              </div>
            </div>
            <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full shrink-0 ${messClosure.is_active ? "bg-rose-500 text-white" : "bg-stone-100 text-slate-500"}`}>
              {messClosure.is_active ? "CLOSED" : "OPEN"}
            </span>
          </div>

          {messClosure.is_active ? (
            <div className="rounded-2xl bg-white/70 border border-rose-200 px-3.5 py-2.5 text-[11px] text-rose-900 space-y-1">
              <p className="font-bold">
                🚫 {(messClosure.slots || []).map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(" & ") || "Lunch & Dinner"} closed
              </p>
              <p className="text-rose-700">
                {messClosure.start_date}{messClosure.end_date && messClosure.end_date !== messClosure.start_date ? ` → ${messClosure.end_date}` : ""}
              </p>
              {messClosure.reason && <p className="text-rose-700/90">{messClosure.reason}</p>}
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <Label className="text-[11px] font-bold text-slate-700">Which service to close?</Label>
                <div className="grid grid-cols-3 gap-2 mt-1">
                  {[
                    { v: "lunch", l: "☀️ Lunch" },
                    { v: "dinner", l: "🌙 Dinner" },
                    { v: "both", l: "Both" },
                  ].map((o) => (
                    <button
                      key={o.v}
                      type="button"
                      onClick={() => setClosureForm((f) => ({ ...f, slots: o.v }))}
                      className={`text-xs font-bold rounded-xl h-9 border transition-all ${closureForm.slots === o.v ? "bg-rose-600 border-rose-600 text-white" : "bg-white border-stone-200 text-slate-600 hover:border-rose-300"}`}
                    >
                      {o.l}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setClosureForm((f) => ({ ...f, mode: "days" }))}
                  className={`text-xs font-bold rounded-xl h-9 border transition-all ${closureForm.mode === "days" ? "bg-slate-800 border-slate-800 text-white" : "bg-white border-stone-200 text-slate-600"}`}
                >
                  For N days
                </button>
                <button
                  type="button"
                  onClick={() => setClosureForm((f) => ({ ...f, mode: "range" }))}
                  className={`text-xs font-bold rounded-xl h-9 border transition-all ${closureForm.mode === "range" ? "bg-slate-800 border-slate-800 text-white" : "bg-white border-stone-200 text-slate-600"}`}
                >
                  Date range
                </button>
              </div>

              {closureForm.mode === "days" ? (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[10px] font-semibold text-slate-600">Start (blank = today)</Label>
                    <Input type="date" value={closureForm.start_date} onChange={(e) => setClosureForm((f) => ({ ...f, start_date: e.target.value }))} className="mt-1 text-xs rounded-xl bg-white" />
                  </div>
                  <div>
                    <Label className="text-[10px] font-semibold text-slate-600">Number of days</Label>
                    <Input type="number" min="1" max="180" value={closureForm.days} onChange={(e) => setClosureForm((f) => ({ ...f, days: e.target.value }))} className="mt-1 text-xs rounded-xl bg-white" />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[10px] font-semibold text-slate-600">Start date</Label>
                    <Input type="date" value={closureForm.start_date} onChange={(e) => setClosureForm((f) => ({ ...f, start_date: e.target.value }))} className="mt-1 text-xs rounded-xl bg-white" />
                  </div>
                  <div>
                    <Label className="text-[10px] font-semibold text-slate-600">End date</Label>
                    <Input type="date" value={closureForm.end_date} onChange={(e) => setClosureForm((f) => ({ ...f, end_date: e.target.value }))} className="mt-1 text-xs rounded-xl bg-white" />
                  </div>
                </div>
              )}

              <Input
                placeholder="Reason (shown to students) e.g. Staff on leave, Kitchen maintenance"
                value={closureForm.reason}
                onChange={(e) => setClosureForm((f) => ({ ...f, reason: e.target.value }))}
                className="text-xs rounded-xl bg-white"
              />
            </div>
          )}

          {messClosure.is_active ? (
            <Button
              onClick={() => handleSetMessClosure(false)}
              disabled={closureSaving}
              className="w-full rounded-2xl font-bold h-11 bg-emerald-600 hover:bg-emerald-700 text-white active:scale-95 transition-transform"
            >
              {closureSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
              Reopen Mess (notify students)
            </Button>
          ) : (
            <Button
              onClick={() => handleSetMessClosure(true)}
              disabled={closureSaving}
              className="w-full rounded-2xl font-bold h-11 bg-rose-600 hover:bg-rose-700 text-white active:scale-95 transition-transform"
            >
              {closureSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CalendarOff className="h-4 w-4 mr-2" />}
              Close Mess & Notify Students
            </Button>
          )}
        </div>
      </div>


      {/* 2. Timing Windows & Holiday Settings */}
      <div className="bg-white border border-stone-200 rounded-3xl p-5 sm:p-7 shadow-sm space-y-5">
        <div className="border-b border-stone-100 pb-4">
          <h3 className="font-display text-lg font-bold text-slate-900 flex items-center gap-2">
            <Clock className="h-5 w-5 text-teal-800" />
            <span>Cutoff Time Windows (Order & Cancel Window)</span>
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Students can select dishes or cancel meals only while the window is open. After the window closes, the kitchen starts preparation.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Lunch Window Config */}
          <div className="p-4 rounded-2xl border border-amber-200 bg-amber-50/40 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wider text-amber-950 flex items-center gap-1.5">
                <Sun className="h-4 w-4 text-amber-700" /> ☀️ Lunch Window
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold text-slate-700">Opens At</Label>
                <Input
                  type="time"
                  value={windowsConfig?.lunch?.start_time || "08:00"}
                  onChange={(e) =>
                    setWindowsConfig((prev) => ({
                      ...prev,
                      lunch: { ...prev.lunch, start_time: e.target.value },
                    }))
                  }
                  className="mt-1 bg-white rounded-xl text-xs font-bold"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold text-slate-700">Closes (Cutoff)</Label>
                <Input
                  type="time"
                  value={windowsConfig?.lunch?.end_time || "11:00"}
                  onChange={(e) =>
                    setWindowsConfig((prev) => ({
                      ...prev,
                      lunch: { ...prev.lunch, end_time: e.target.value },
                    }))
                  }
                  className="mt-1 bg-white rounded-xl text-xs font-bold"
                />
              </div>
            </div>
          </div>

          {/* Dinner Window Config */}
          <div className="p-4 rounded-2xl border border-teal-200 bg-teal-50/40 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wider text-teal-950 flex items-center gap-1.5">
                <Moon className="h-4 w-4 text-teal-700" /> 🌙 Dinner Window
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold text-slate-700">Opens At</Label>
                <Input
                  type="time"
                  value={windowsConfig?.dinner?.start_time || "16:00"}
                  onChange={(e) =>
                    setWindowsConfig((prev) => ({
                      ...prev,
                      dinner: { ...prev.dinner, start_time: e.target.value },
                    }))
                  }
                  className="mt-1 bg-white rounded-xl text-xs font-bold"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold text-slate-700">Closes (Cutoff)</Label>
                <Input
                  type="time"
                  value={windowsConfig?.dinner?.end_time || "19:00"}
                  onChange={(e) =>
                    setWindowsConfig((prev) => ({
                      ...prev,
                      dinner: { ...prev.dinner, end_time: e.target.value },
                    }))
                  }
                  className="mt-1 bg-white rounded-xl text-xs font-bold"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. ⭐ Global Permanent Premium Dishes Menu (One-Time Setup) */}
      <div className="bg-white border-2 border-amber-300 rounded-3xl p-5 sm:p-7 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-amber-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-6 w-6 rounded-lg bg-amber-400 text-slate-950 flex items-center justify-center font-bold text-xs">
                ⭐
              </span>
              <h3 className="font-display text-lg font-extrabold text-amber-950">
                Premium Gourmet Dishes Catalog (Permanent Setup)
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Add your mess premium special dishes once here. Premium students can choose from these options every day without you having to re-enter them daily.
            </p>
          </div>
          <span className="text-xs font-mono font-bold bg-amber-100 text-amber-950 px-3 py-1 rounded-xl self-start sm:self-auto shrink-0">
            {premiumItems.length} Dishes Configured
          </span>
        </div>

        {/* Existing Premium Dishes Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {premiumItems.map((opt) => (
            <div
              key={opt.id}
              className="p-3.5 rounded-2xl border border-amber-200 bg-amber-50/40 flex items-start justify-between gap-3 group hover:bg-amber-50 transition-colors"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                    opt.type === "NON_VEG"
                      ? "bg-rose-100 text-rose-800 border border-rose-200"
                      : "bg-emerald-100 text-emerald-800 border border-emerald-200"
                  }`}>
                    {opt.type === "NON_VEG" ? "🍗 Non-Veg" : "🥦 Veg"}
                  </span>
                  <span className="font-bold text-xs text-slate-900">{opt.name}</span>
                </div>
                {opt.description && (
                  <p className="text-[11px] text-slate-600 mt-1 leading-snug">{opt.description}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleRemovePremiumItem(opt.id)}
                className="text-stone-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition-colors shrink-0"
                title="Remove dish"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>

        {/* Add New Premium Dish Box */}
        <div className="p-4 rounded-2xl border border-dashed border-amber-300 bg-amber-50/30 space-y-3">
          <span className="text-xs font-extrabold text-amber-950 block">
            + Add New Gourmet Dish to Premium Catalog
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Input
              placeholder="Dish Name (e.g. Butter Chicken Special / Mushroom Matar / Shahi Paneer)"
              value={newPremiumName}
              onChange={(e) => setNewPremiumName(e.target.value)}
              className="sm:col-span-2 text-xs rounded-xl bg-white"
            />
            <select
              value={newPremiumType}
              onChange={(e) => setNewPremiumType(e.target.value)}
              className="text-xs rounded-xl border border-stone-200 bg-white px-3 font-semibold text-slate-700 h-10"
            >
              <option value="NON_VEG">🍗 Non-Veg Dish</option>
              <option value="VEG">🥦 Veg Dish</option>
            </select>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              placeholder="Description / Sides (e.g. Tender chicken, 2 Butter Naan, Jeera Rice, Dal Makhani, Sweet)"
              value={newPremiumDesc}
              onChange={(e) => setNewPremiumDesc(e.target.value)}
              className="text-xs rounded-xl bg-white flex-1"
            />
            <Button
              type="button"
              onClick={handleAddPremiumItem}
              className="bg-amber-400 hover:bg-amber-500 text-slate-950 font-bold text-xs rounded-xl h-10 px-5 shrink-0 shadow-sm"
            >
              + Add to Menu
            </Button>
          </div>
        </div>

        {/* ⭐ Premium Sunday Lunch Special (Biryani Day - Veg & Non-Veg) */}
        <div className="p-4 rounded-2xl border-2 border-amber-400 bg-gradient-to-br from-amber-50 to-orange-50/50 space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-lg">🍗</span>
            <div>
              <h4 className="font-display text-sm font-extrabold text-amber-950">Premium Sunday Lunch Special (Biryani Day)</h4>
              <p className="text-[11px] text-slate-600 mt-0.5">
                Sunday lunch special with both Veg and Non-Veg biryani options for premium students (students can choose Veg vs Non-Veg). Sunday dinner follows regular premium menu items.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {/* 🥦 Sunday Lunch Veg Special */}
            <div className="rounded-2xl bg-white/80 border border-emerald-300 p-3.5 space-y-2.5 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-900 flex items-center gap-1.5">
                  🥦 Sunday Lunch Veg Special
                </span>
                <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">Veg Option</span>
              </div>
              <Input
                placeholder="Veg dish name (e.g. Special Sunday Veg Paneer Dum Biryani)"
                value={premiumSunday?.lunch_veg?.name || ""}
                onChange={(e) => setPremiumSunday((prev) => ({ ...prev, lunch_veg: { ...prev.lunch_veg, name: e.target.value, type: "VEG" } }))}
                className="text-xs rounded-xl bg-white"
              />
              <Input
                placeholder="Description / Sides (e.g. Mirchi Ka Salan, Boondi Raita, Gulab Jamun)"
                value={premiumSunday?.lunch_veg?.description || ""}
                onChange={(e) => setPremiumSunday((prev) => ({ ...prev, lunch_veg: { ...prev.lunch_veg, description: e.target.value, type: "VEG" } }))}
                className="text-xs rounded-xl bg-white"
              />
            </div>

            {/* 🍗 Sunday Lunch Non-Veg Special */}
            <div className="rounded-2xl bg-white/80 border border-amber-300 p-3.5 space-y-2.5 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                  🍗 Sunday Lunch Non-Veg Special
                </span>
                <span className="text-[10px] font-bold bg-rose-100 text-rose-800 px-2 py-0.5 rounded-full">Non-Veg Option</span>
              </div>
              <Input
                placeholder="Non-Veg dish name (e.g. Special Sunday Chicken Dum Biryani)"
                value={premiumSunday?.lunch_non_veg?.name || ""}
                onChange={(e) => setPremiumSunday((prev) => ({ ...prev, lunch_non_veg: { ...prev.lunch_non_veg, name: e.target.value, type: "NON_VEG" } }))}
                className="text-xs rounded-xl bg-white"
              />
              <Input
                placeholder="Description / Sides (e.g. Mirchi Ka Salan, Boondi Raita, Gulab Jamun)"
                value={premiumSunday?.lunch_non_veg?.description || ""}
                onChange={(e) => setPremiumSunday((prev) => ({ ...prev, lunch_non_veg: { ...prev.lunch_non_veg, description: e.target.value, type: "NON_VEG" } }))}
                className="text-xs rounded-xl bg-white"
              />
            </div>
          </div>
          <p className="text-[10px] text-amber-700 font-semibold">💾 Saved with the "Save All Settings" button above.</p>
        </div>
      </div>

      {/* 4. Weekly Standard Menu Schedule */}
      <div className="bg-white border border-stone-200 rounded-3xl p-5 sm:p-7 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-100 pb-5">
          <div>
            <h2 className="font-display text-xl font-bold text-slate-900">
              Weekly Regular Schedule (Monday – Sunday)
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Configure pure veg rules and regular menu items for each weekday.
            </p>
          </div>
        </div>

        {/* Day Selector Tabs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          {DAYS_ORDER.map((d) => {
            const isSelected = selectedDayKey === d.key;
            const dayLunch = menuConfig?.[d.key]?.lunch;
            const dayDinner = menuConfig?.[d.key]?.dinner;
            return (
              <button
                key={d.key}
                type="button"
                onClick={() => setSelectedDayKey(d.key)}
                className={`p-3 rounded-2xl border text-left transition-all ${
                  isSelected
                    ? "bg-teal-900 border-teal-900 text-white shadow-sm ring-2 ring-teal-800/30"
                    : "bg-stone-50 border-stone-200 text-slate-700 hover:bg-stone-100"
                }`}
              >
                <span className={`text-xs font-bold block ${isSelected ? "text-white" : "text-slate-900"}`}>
                  {d.label}
                </span>
                <div className="mt-1 flex flex-col gap-0.5 text-[9px] font-semibold">
                  <span className={isSelected ? "text-amber-200" : "text-slate-500"}>
                    ☀️ {dayLunch?.is_closed ? "Closed" : dayLunch?.standard_mode === "VEG_ONLY" ? "Veg" : "Veg+NonVeg"}
                  </span>
                  <span className={isSelected ? "text-teal-200" : "text-slate-500"}>
                    🌙 {dayDinner?.is_closed ? "Closed" : dayDinner?.standard_mode === "VEG_ONLY" ? "Veg" : "Veg+NonVeg"}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Slot Selector (Lunch vs Dinner) & Settings for this Day */}
        <div className="bg-stone-50/70 border border-stone-200 rounded-2xl p-5 sm:p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-200 pb-4">
            <div className="flex items-center gap-2">
              <div className="flex items-center p-1 bg-white border border-stone-200 rounded-xl">
                <button
                  type="button"
                  onClick={() => setMenuSlotKey("lunch")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    menuSlotKey === "lunch"
                      ? "bg-amber-400 text-slate-950 shadow-xs"
                      : "text-slate-600 hover:bg-stone-100"
                  }`}
                >
                  <Sun className="h-3.5 w-3.5 text-amber-800" />
                  <span>☀️ Lunch Menu</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMenuSlotKey("dinner")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    menuSlotKey === "dinner"
                      ? "bg-teal-900 text-white shadow-xs"
                      : "text-slate-600 hover:bg-stone-100"
                  }`}
                >
                  <Moon className="h-3.5 w-3.5 text-teal-300" />
                  <span>🌙 Dinner Menu</span>
                </button>
              </div>

              <Badge variant="outline" className="text-xs uppercase font-bold">
                {selectedDayKey.toUpperCase()}
              </Badge>
            </div>

            {/* Holiday / Closed Switch for this Day & Slot */}
            <div className="flex items-center gap-3">
              <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700 bg-white border border-stone-200 px-3 py-1.5 rounded-xl">
                <input
                  type="checkbox"
                  checked={Boolean(currentSlotMenu.is_closed)}
                  onChange={(e) => updateCurrentSlot("is_closed", e.target.checked)}
                  className="rounded text-teal-800"
                />
                <span className={currentSlotMenu.is_closed ? "text-rose-700 font-extrabold" : "text-slate-600"}>
                  {currentSlotMenu.is_closed ? "🏖️ Kitchen Closed / Holiday" : "Kitchen Open"}
                </span>
              </label>

              {/* Standard Mode Selector */}
              {!currentSlotMenu.is_closed && (
                <div className="flex items-center gap-1 p-1 bg-white border border-stone-200 rounded-xl">
                  <button
                    type="button"
                    onClick={() => updateCurrentSlot("standard_mode", "VEG_ONLY")}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                      currentSlotMenu.standard_mode === "VEG_ONLY"
                        ? "bg-emerald-700 text-white shadow-xs"
                        : "text-slate-600 hover:bg-stone-100"
                    }`}
                  >
                    🥦 Pure Veg
                  </button>
                  <button
                    type="button"
                    onClick={() => updateCurrentSlot("standard_mode", "VEG_AND_NON_VEG")}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                      currentSlotMenu.standard_mode === "VEG_AND_NON_VEG"
                        ? "bg-amber-700 text-white shadow-xs"
                        : "text-slate-600 hover:bg-stone-100"
                    }`}
                  >
                    🍲 Veg + NonVeg
                  </button>
                </div>
              )}
            </div>
          </div>

          {currentSlotMenu.is_closed ? (
            <div className="p-8 text-center bg-white border border-stone-200 rounded-2xl space-y-2">
              <CalendarOff className="h-8 w-8 text-rose-500 mx-auto" />
              <h4 className="font-display text-base font-bold text-slate-900">
                Kitchen Marked as Closed / Holiday for {selectedDayKey.toUpperCase()} {menuSlotKey.toUpperCase()}
              </h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Students will be informed that the mess kitchen is closed for this meal and no meal counts will be deducted.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Standard Veg */}
              <div className="bg-white border border-emerald-200 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-800 flex items-center gap-1">
                    <span>🥦</span> Standard Veg Meal ({menuSlotKey.toUpperCase()})
                  </span>
                  <span className="text-[10px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    Standard Plan
                  </span>
                </div>
                <div>
                  <Label className="text-xs font-semibold text-slate-700">Dish Title</Label>
                  <Input
                    value={currentSlotMenu.standard_veg_title || ""}
                    onChange={(e) => updateCurrentSlot("standard_veg_title", e.target.value)}
                    placeholder="e.g. Paneer Butter Masala & Dal Tadka"
                    className="mt-1 text-sm rounded-xl font-medium"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-slate-700">Full Description</Label>
                  <Textarea
                    value={currentSlotMenu.standard_veg_desc || ""}
                    onChange={(e) => updateCurrentSlot("standard_veg_desc", e.target.value)}
                    placeholder="e.g. Paneer Butter Masala, Yellow Dal Tadka, Steamed Rice, 4 Butter Rotis, Salad, Sweet"
                    className="mt-1 text-xs rounded-xl min-h-[70px]"
                  />
                </div>
              </div>

              {/* Standard Non-Veg */}
              <div className={`border rounded-2xl p-4 space-y-3 transition-opacity ${
                currentSlotMenu.standard_mode === "VEG_ONLY"
                  ? "bg-stone-100/60 border-stone-200 opacity-60"
                  : "bg-white border-amber-200"
              }`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-amber-900 flex items-center gap-1">
                    <span>🍗</span> Standard Non-Veg Meal ({menuSlotKey.toUpperCase()})
                  </span>
                  {currentSlotMenu.standard_mode === "VEG_ONLY" ? (
                    <span className="text-[10px] text-slate-500 font-semibold bg-stone-200 px-2 py-0.5 rounded-full">
                      Disabled (Pure Veg)
                    </span>
                  ) : (
                    <span className="text-[10px] text-amber-800 font-semibold bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                      For Non-Veg Students
                    </span>
                  )}
                </div>
                <div>
                  <Label className="text-xs font-semibold text-slate-700">Dish Title</Label>
                  <Input
                    disabled={currentSlotMenu.standard_mode === "VEG_ONLY"}
                    value={currentSlotMenu.standard_non_veg_title || ""}
                    onChange={(e) => updateCurrentSlot("standard_non_veg_title", e.target.value)}
                    placeholder="e.g. Home Style Chicken Curry"
                    className="mt-1 text-sm rounded-xl font-medium"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-slate-700">Full Description</Label>
                  <Textarea
                    disabled={currentSlotMenu.standard_mode === "VEG_ONLY"}
                    value={currentSlotMenu.standard_non_veg_desc || ""}
                    onChange={(e) => updateCurrentSlot("standard_non_veg_desc", e.target.value)}
                    placeholder="e.g. Chicken Curry (3 pcs), Steamed Rice, 4 Butter Rotis, Salad"
                    className="mt-1 text-xs rounded-xl min-h-[70px]"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <Button
            onClick={handleSaveMenu}
            disabled={savingMenu || menuLoading}
            className="bg-teal-800 hover:bg-teal-900 rounded-xl font-bold px-6 active:scale-95 transition-transform"
          >
            {savingMenu ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
            Save All Settings
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- 7. Admin Settings Section ---------------- */
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

function SettingsSection({ admin, setAdmin }) {
  const [bizName, setBizName] = useState(admin.business?.name || admin.business_name || "Ayushman Kitchen");
  const [logoUrl, setLogoUrl] = useState(admin.business?.logo_url || "");
  const [adminEmail, setAdminEmail] = useState(admin.email || admin.business?.admin_email || "");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingBoxImg, setUploadingBoxImg] = useState({});

  // Ticker State
  const [tickerEnabled, setTickerEnabled] = useState(
    admin.business?.notice_ticker?.enabled !== undefined ? admin.business.notice_ticker.enabled : true
  );
  const [tickerBadge, setTickerBadge] = useState(
    admin.business?.notice_ticker?.badge || "LATEST ANNOUNCEMENT"
  );
  const [tickerText, setTickerText] = useState(
    admin.business?.notice_ticker?.text ||
    "🎉 Welcome to Ayushman Kitchen! Fresh, hygienic, and home-style nutritious meals served daily. Mark your meal preference before cutoff time (Lunch 11:00 AM • Dinner 7:00 PM)."
  );

  // 4 Showcase Boxes State
  const [showcaseBoxes, setShowcaseBoxes] = useState(() => {
    const existing = admin.business?.showcase_boxes;
    if (Array.isArray(existing) && existing.length === 4) return existing;
    return DEFAULT_SHOWCASE_BOXES;
  });

  // Meal Plan Pricing State
  const DEFAULT_PLANS = [
    {
      id: "standard",
      name: "Standard Plan",
      price: 3300,
      description: "Wholesome lunch & dinner daily",
      features: ["Lunch + Dinner Daily", "Homestyle Fresh Meals", "Monthly Billing", "Student Portal Access"],
    },
    {
      id: "premium",
      name: "Premium Plan",
      price: 3800,
      description: "Premium thali with extra choices",
      features: ["Lunch + Dinner Daily", "Premium Gourmet Thali", "Extra Dish Options", "Priority Support", "Student Portal Access"],
    },
  ];
  const [mealPlans, setMealPlans] = useState(() => {
    const existing = admin.business?.meal_plans;
    if (Array.isArray(existing) && existing.length >= 1) return existing;
    return DEFAULT_PLANS;
  });

  const updatePlanField = (idx, field, value) => {
    setMealPlans((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [field]: value };
      return copy;
    });
  };

  const updatePlanFeature = (planIdx, featIdx, value) => {
    setMealPlans((prev) => {
      const copy = [...prev];
      const feats = [...(copy[planIdx].features || [])];
      feats[featIdx] = value;
      copy[planIdx] = { ...copy[planIdx], features: feats };
      return copy;
    });
  };

  const addPlanFeature = (planIdx) => {
    setMealPlans((prev) => {
      const copy = [...prev];
      const feats = [...(copy[planIdx].features || []), ""];
      copy[planIdx] = { ...copy[planIdx], features: feats };
      return copy;
    });
  };

  const removePlanFeature = (planIdx, featIdx) => {
    setMealPlans((prev) => {
      const copy = [...prev];
      const feats = (copy[planIdx].features || []).filter((_, i) => i !== featIdx);
      copy[planIdx] = { ...copy[planIdx], features: feats };
      return copy;
    });
  };


  const [savingSettings, setSavingSettings] = useState(false);

  // Change Password State
  const [pwdForm, setPwdForm] = useState({ current: "", next: "", confirm: "" });
  const [showPwd, setShowPwd] = useState(false);
  const [changingPwd, setChangingPwd] = useState(false);

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await adminApi.post("/admin/business/upload-image", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setLogoUrl(res.data.url);
      toast.success("Logo uploaded successfully!");
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleBoxImageUpload = async (index, e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingBoxImg((prev) => ({ ...prev, [index]: true }));
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await adminApi.post("/admin/business/upload-image", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      updateBoxField(index, "image_url", res.data.url);
      toast.success(`Image uploaded for Box ${index + 1}!`);
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setUploadingBoxImg((prev) => ({ ...prev, [index]: false }));
    }
  };

  const updateBoxField = (index, field, value) => {
    setShowcaseBoxes((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleSaveAllSettings = async (e) => {
    e?.preventDefault();
    if (!bizName.trim()) {
      toast.error("Business / Mess name is required");
      return;
    }
    setSavingSettings(true);
    try {
      const payload = {
        name: bizName.trim(),
        timezone: "Asia/Kolkata",
        logo_url: logoUrl.trim(),
        admin_email: adminEmail.trim(),
        notice_ticker: {
          enabled: tickerEnabled,
          badge: tickerBadge.trim() || "LATEST UPDATE",
          text: tickerText.trim(),
        },
        showcase_boxes: showcaseBoxes,
        meal_plans: mealPlans.map((p) => ({
          ...p,
          price: Number(p.price) || 0,
          features: (p.features || []).filter((f) => f.trim() !== ""),
        })),
      };
      const res = await adminApi.put("/admin/business", payload);
      applyDynamicBranding(res.data);
      setAdmin((prev) => ({
        ...prev,
        email: adminEmail.trim(),
        business_name: res.data.name,
        business: res.data,
      }));
      toast.success("Settings, Branding, Notice Ticker & Home Showcase updated successfully!");
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setSavingSettings(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!pwdForm.current) {
      toast.error("Please enter your current password");
      return;
    }
    if (pwdForm.next.length < 6) {
      toast.error("New password must be at least 6 characters");
      return;
    }
    if (pwdForm.next !== pwdForm.confirm) {
      toast.error("New password and confirm password do not match");
      return;
    }
    setChangingPwd(true);
    try {
      await adminApi.post("/admin/change-password", {
        current_password: pwdForm.current,
        new_password: pwdForm.next,
      });
      setPwdForm({ current: "", next: "", confirm: "" });
      toast.success("Admin password changed successfully!");
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setChangingPwd(false);
    }
  };

  return (
    <div className="space-y-8 pb-12">
      {/* 1. Header Banner */}
      <div className="bg-[#102f2c] text-white rounded-3xl p-6 sm:p-7 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-[11px] font-extrabold uppercase tracking-widest text-teal-300">
            Kitchen Administration
          </span>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold mt-0.5">
            Admin Settings & Branding
          </h1>
          <p className="text-xs text-teal-200 mt-1 max-w-xl">
            Configure your mess name, logo, live notice ticker, homepage showcase menu cards, admin recovery email, and security settings.
          </p>
        </div>
        <Button
          onClick={handleSaveAllSettings}
          disabled={savingSettings}
          className="bg-amber-400 hover:bg-amber-500 text-slate-950 rounded-2xl font-bold h-11 px-6 shadow-sm active:scale-95 transition-transform shrink-0"
        >
          {savingSettings ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
          Save All Settings
        </Button>
      </div>

      {/* 2. Company Name, Logo & Recovery Email */}
      <div className="bg-white border border-stone-200 rounded-3xl p-5 sm:p-7 shadow-sm space-y-6">
        <div className="border-b border-stone-100 pb-4">
          <h2 className="font-display text-lg font-bold text-slate-900 flex items-center gap-2">
            <Building2 className="h-5 w-5 text-teal-800" />
            <span>Mess Branding & Contact Details</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            These details appear across the student portal, notifications, and reports.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
          {/* Logo Upload & Preview */}
          <div className="p-4 rounded-2xl border border-stone-200 bg-stone-50/50 flex flex-col items-center text-center space-y-3">
            <Label className="text-xs font-bold text-slate-700">Company / Mess Logo</Label>
            <div className="h-24 w-24 rounded-2xl border-2 border-stone-200 bg-white shadow-sm overflow-hidden flex items-center justify-center relative group">
              {logoUrl ? (
                <img src={logoUrl} alt="Mess Logo" className="h-full w-full object-cover" />
              ) : (
                <div className="flex flex-col items-center text-stone-400">
                  <ChefHat className="h-10 w-10 text-teal-800" />
                  <span className="text-[10px] font-bold mt-1 text-slate-500">No Logo</span>
                </div>
              )}
            </div>

            <div className="w-full space-y-2">
              <label className="cursor-pointer inline-flex items-center justify-center gap-1.5 w-full bg-white border border-stone-200 hover:bg-stone-100 text-slate-800 text-xs font-bold py-2 px-3 rounded-xl transition-colors shadow-xs">
                <Upload className="h-3.5 w-3.5 text-teal-800" />
                <span>{uploadingLogo ? "Uploading..." : "Upload Logo"}</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  disabled={uploadingLogo}
                  className="hidden"
                />
              </label>
              {logoUrl && (
                <button
                  type="button"
                  onClick={() => setLogoUrl("")}
                  className="text-[11px] text-rose-600 hover:underline font-semibold"
                >
                  Remove Logo
                </button>
              )}
            </div>
          </div>

          {/* Business Name & Admin Email */}
          <div className="md:col-span-2 space-y-4">
            <div>
              <Label className="text-xs font-semibold text-slate-700">Company / Mess Name</Label>
              <Input
                value={bizName}
                onChange={(e) => setBizName(e.target.value)}
                placeholder="e.g. Ayushman Kitchen"
                className="mt-1 text-sm font-semibold rounded-xl"
              />
              <p className="text-[11px] text-slate-400 mt-1">Displayed on the top header, bills, and student login portal.</p>
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                <span>Admin Email (Password Recovery & Notifications)</span>
                <Badge variant="outline" className="text-[10px] text-teal-800 bg-teal-50 border-teal-200">
                  Password Reset Target
                </Badge>
              </Label>
              <Input
                type="email"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                placeholder="e.g. admin@ayushmankitchen.com"
                className="mt-1 text-sm font-semibold rounded-xl"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                If you use "Forgot Password", the secure recovery link will be sent directly to this email address.
              </p>
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-700">Logo Image Direct URL (Optional)</Label>
              <Input
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://example.com/logo.png"
                className="mt-1 text-xs rounded-xl"
              />
            </div>
          </div>
        </div>
      </div>

      {/* 3. ⭐ Latest Update Notice Ticker (Right to Left Animation) */}
      <div className="bg-white border-2 border-teal-800/30 rounded-3xl p-5 sm:p-7 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-6 w-6 rounded-lg bg-teal-800 text-white flex items-center justify-center font-bold text-xs">
                <Megaphone className="h-3.5 w-3.5" />
              </span>
              <h2 className="font-display text-lg font-extrabold text-slate-900">
                Latest Notice / Announcement Marquee Ticker
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Displays a continuous right-to-left moving marquee ticker on the student portal and home page for important notices.
            </p>
          </div>

          <label className="inline-flex items-center gap-2 cursor-pointer bg-stone-100 px-3.5 py-1.5 rounded-xl border border-stone-200 self-start sm:self-auto">
            <input
              type="checkbox"
              checked={tickerEnabled}
              onChange={(e) => setTickerEnabled(e.target.checked)}
              className="rounded text-teal-800 h-4 w-4"
            />
            <span className={`text-xs font-bold ${tickerEnabled ? "text-teal-900" : "text-slate-500"}`}>
              {tickerEnabled ? "🟢 Ticker Active" : "⚪ Ticker Disabled"}
            </span>
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label className="text-xs font-semibold text-slate-700">Ticker Tag / Badge</Label>
            <Input
              value={tickerBadge}
              onChange={(e) => setTickerBadge(e.target.value)}
              placeholder="e.g. LATEST ANNOUNCEMENT"
              className="mt-1 text-xs rounded-xl font-bold uppercase text-teal-900"
            />
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs font-semibold text-slate-700">Notice Announcement Message</Label>
            <Input
              value={tickerText}
              onChange={(e) => setTickerText(e.target.value)}
              placeholder="e.g. Sunday Special Biryani will be served at 1:00 PM! Please mark your preference before 11:00 AM."
              className="mt-1 text-sm rounded-xl font-medium"
            />
          </div>
        </div>

        {/* Live Preview of the Ticker */}
        <div>
          <Label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
            👀 Live Preview on Student Portal:
          </Label>
          <div className="bg-[#102f2c] text-white rounded-2xl p-2.5 sm:p-3 flex items-center gap-3 overflow-hidden shadow-inner border border-teal-900">
            <span className="bg-amber-400 text-slate-950 font-extrabold text-[10px] sm:text-xs px-2.5 py-1 rounded-lg uppercase tracking-wider shrink-0 flex items-center gap-1 shadow-xs">
              <Megaphone className="h-3 w-3" />
              <span>{tickerBadge || "UPDATE"}</span>
            </span>
            <div className="flex-1 overflow-hidden relative">
              {tickerEnabled && tickerText ? (
                <div className="animate-ticker text-xs sm:text-sm font-semibold text-teal-100">
                  {tickerText}
                </div>
              ) : (
                <span className="text-xs text-teal-400/60 italic">Ticker is currently disabled.</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 4. 🍽️ Home Page 4 Custom Menu / Showcase Boxes */}
      <div className="bg-white border-2 border-amber-300/80 rounded-3xl p-5 sm:p-7 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-amber-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-6 w-6 rounded-lg bg-amber-400 text-slate-950 flex items-center justify-center font-bold text-xs">
                ⭐
              </span>
              <h2 className="font-display text-lg font-extrabold text-amber-950">
                Home Page 4 Feature & Menu Showcase Boxes
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Customize the 4 featured cards shown on the student home page. Add images, titles, descriptions, and highlights.
            </p>
          </div>
          <Badge className="bg-amber-100 text-amber-900 border-amber-300 text-xs font-mono font-bold self-start sm:self-auto">
            4 Cards Configured
          </Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {showcaseBoxes.map((box, idx) => (
            <div
              key={box.id || idx}
              className="p-4 sm:p-5 rounded-2xl border border-stone-200 bg-stone-50/40 hover:bg-stone-50 transition-colors space-y-3"
            >
              <div className="flex items-center justify-between gap-2 border-b border-stone-200/80 pb-2">
                <span className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
                  <span className="h-5 w-5 rounded-full bg-teal-800 text-white flex items-center justify-center text-[10px]">
                    {idx + 1}
                  </span>
                  <span>Feature Box {idx + 1}</span>
                </span>
                <Input
                  value={box.badge || ""}
                  onChange={(e) => updateBoxField(idx, "badge", e.target.value)}
                  placeholder="Badge / Tag (e.g. Popular)"
                  className="w-32 text-[11px] h-7 rounded-lg bg-white font-bold text-teal-800 text-right"
                />
              </div>

              {/* Card Image Preview & Upload */}
              <div className="flex items-center gap-3">
                <div className="h-20 w-28 rounded-xl border border-stone-200 bg-white overflow-hidden shrink-0 shadow-xs relative">
                  {box.image_url ? (
                    <img src={box.image_url} alt={box.title} className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-stone-300">
                      <ImageIcon className="h-6 w-6" />
                    </div>
                  )}
                </div>
                <div className="flex-1 space-y-1.5 min-w-0">
                  <label className="cursor-pointer inline-flex items-center justify-center gap-1 w-full bg-white border border-stone-200 hover:bg-stone-100 text-slate-800 text-xs font-semibold py-1.5 px-2.5 rounded-xl transition-colors shadow-xs">
                    <Upload className="h-3 w-3 text-teal-800" />
                    <span>{uploadingBoxImg[idx] ? "Uploading..." : "Upload Image"}</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleBoxImageUpload(idx, e)}
                      disabled={uploadingBoxImg[idx]}
                      className="hidden"
                    />
                  </label>
                  <Input
                    value={box.image_url || ""}
                    onChange={(e) => updateBoxField(idx, "image_url", e.target.value)}
                    placeholder="Or enter Image URL"
                    className="text-[11px] h-8 rounded-xl bg-white"
                  />
                </div>
              </div>

              {/* Title & Description */}
              <div className="space-y-2">
                <div>
                  <Label className="text-[11px] font-semibold text-slate-600">Card Title</Label>
                  <Input
                    value={box.title || ""}
                    onChange={(e) => updateBoxField(idx, "title", e.target.value)}
                    placeholder="e.g. Special Deluxe Thali"
                    className="mt-0.5 text-xs font-bold rounded-xl bg-white"
                  />
                </div>
                <div>
                  <Label className="text-[11px] font-semibold text-slate-600">Subtitle / Description</Label>
                  <Textarea
                    value={box.subtitle || ""}
                    onChange={(e) => updateBoxField(idx, "subtitle", e.target.value)}
                    placeholder="e.g. Paneer Butter Masala, Dal Makhani, 4 Butter Rotis & Sweet"
                    className="mt-0.5 text-xs rounded-xl bg-white min-h-[55px]"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 5. 💰 Meal Plan Pricing */}
      <div className="bg-white border-2 border-emerald-600/30 rounded-3xl p-5 sm:p-7 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-emerald-50 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-6 w-6 rounded-lg bg-emerald-700 text-white flex items-center justify-center font-bold text-xs">
                ₹
              </span>
              <h2 className="font-display text-lg font-extrabold text-slate-900">
                Meal Plan Pricing
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Set or update the monthly meal plan prices shown on the Home Page. Changes are reflected immediately on the public landing page.
            </p>
          </div>
          <Badge className="bg-emerald-50 text-emerald-800 border-emerald-300 text-xs font-mono font-bold self-start sm:self-auto">
            {mealPlans.length} Plans Active
          </Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {mealPlans.map((plan, idx) => {
            const isPremium = plan.id === "premium" || idx === mealPlans.length - 1;
            return (
              <div
                key={plan.id || idx}
                className={`p-5 rounded-2xl border space-y-4 ${
                  isPremium
                    ? "border-amber-300 bg-amber-50/40"
                    : "border-stone-200 bg-stone-50/40"
                }`}
              >
                {/* Plan Header */}
                <div className="flex items-center gap-2 border-b border-stone-200/80 pb-3">
                  <span
                    className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-extrabold text-white ${
                      isPremium ? "bg-amber-500" : "bg-teal-800"
                    }`}
                  >
                    {idx + 1}
                  </span>
                  <span className={`text-sm font-extrabold ${
                    isPremium ? "text-amber-900" : "text-slate-900"
                  }`}>
                    {isPremium ? "⭐ Premium Plan" : "🍽️ Standard Plan"}
                  </span>
                </div>

                {/* Plan Name */}
                <div>
                  <Label className="text-[11px] font-semibold text-slate-600">Plan Name</Label>
                  <Input
                    value={plan.name || ""}
                    onChange={(e) => updatePlanField(idx, "name", e.target.value)}
                    placeholder="e.g. Standard Plan"
                    className="mt-0.5 text-sm font-bold rounded-xl bg-white"
                  />
                </div>

                {/* Price */}
                <div>
                  <Label className="text-[11px] font-semibold text-slate-600">Monthly Price (₹)</Label>
                  <div className="relative mt-0.5">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-sm">₹</span>
                    <Input
                      type="number"
                      min={0}
                      value={plan.price ?? ""}
                      onChange={(e) => updatePlanField(idx, "price", e.target.value)}
                      placeholder="3300"
                      className={`pl-7 text-lg font-extrabold rounded-xl bg-white ${
                        isPremium ? "text-amber-800" : "text-teal-900"
                      }`}
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">This price is shown on the home page and student portal.</p>
                </div>

                {/* Description */}
                <div>
                  <Label className="text-[11px] font-semibold text-slate-600">Short Description</Label>
                  <Input
                    value={plan.description || ""}
                    onChange={(e) => updatePlanField(idx, "description", e.target.value)}
                    placeholder="e.g. Wholesome lunch & dinner daily"
                    className="mt-0.5 text-xs rounded-xl bg-white"
                  />
                </div>

                {/* Features */}
                <div>
                  <Label className="text-[11px] font-semibold text-slate-600 block mb-2">Plan Features / Includes</Label>
                  <div className="space-y-2">
                    {(plan.features || []).map((feat, fi) => (
                      <div key={fi} className="flex items-center gap-2">
                        <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                        <Input
                          value={feat}
                          onChange={(e) => updatePlanFeature(idx, fi, e.target.value)}
                          placeholder="e.g. Lunch + Dinner Daily"
                          className="flex-1 text-xs h-8 rounded-xl bg-white"
                        />
                        <button
                          type="button"
                          onClick={() => removePlanFeature(idx, fi)}
                          className="text-rose-500 hover:text-rose-700 text-xs font-bold px-1.5 shrink-0"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => addPlanFeature(idx)}
                    className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-teal-800 hover:underline"
                  >
                    + Add Feature
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
          <span className="text-amber-600 font-bold">⚡</span>
          Price changes are reflected on the public home page immediately after saving.
        </p>
      </div>

      {/* 6. 🔒 Admin Security & Password Change */}
      <div className="bg-white border border-stone-200 rounded-3xl p-5 sm:p-7 shadow-sm space-y-5">
        <div className="border-b border-stone-100 pb-4">
          <h2 className="font-display text-lg font-bold text-slate-900 flex items-center gap-2">
            <Lock className="h-5 w-5 text-teal-800" />
            <span>Admin Account Security & Password</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Update your admin login password securely.
          </p>
        </div>

        <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
          <div>
            <Label className="text-xs font-semibold text-slate-700">Current Password</Label>
            <Input
              type={showPwd ? "text" : "password"}
              value={pwdForm.current}
              onChange={(e) => setPwdForm({ ...pwdForm, current: e.target.value })}
              placeholder="Enter current admin password"
              className="mt-1 text-sm rounded-xl font-mono"
            />
          </div>

          <div>
            <Label className="text-xs font-semibold text-slate-700">New Password (Min 6 Characters)</Label>
            <Input
              type={showPwd ? "text" : "password"}
              value={pwdForm.next}
              onChange={(e) => setPwdForm({ ...pwdForm, next: e.target.value })}
              placeholder="Enter new password"
              className="mt-1 text-sm rounded-xl font-mono"
            />
          </div>

          <div>
            <Label className="text-xs font-semibold text-slate-700">Confirm New Password</Label>
            <Input
              type={showPwd ? "text" : "password"}
              value={pwdForm.confirm}
              onChange={(e) => setPwdForm({ ...pwdForm, confirm: e.target.value })}
              placeholder="Re-enter new password"
              className="mt-1 text-sm rounded-xl font-mono"
            />
          </div>

          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={() => setShowPwd(!showPwd)}
              className="text-xs text-teal-800 font-semibold hover:underline flex items-center gap-1"
            >
              {showPwd ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              <span>{showPwd ? "Hide Passwords" : "Show Passwords"}</span>
            </button>

            <Button
              type="submit"
              disabled={changingPwd || !pwdForm.current || !pwdForm.next}
              className="bg-teal-800 hover:bg-teal-900 text-white font-bold text-xs rounded-xl h-10 px-5"
            >
              {changingPwd ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <KeyRound className="h-4 w-4 mr-1.5" />}
              Update Password
            </Button>
          </div>
        </form>
      </div>

      {/* 6. Save All Floating Action */}
      <div className="flex justify-end pt-2">
        <Button
          onClick={handleSaveAllSettings}
          disabled={savingSettings}
          className="bg-amber-400 hover:bg-amber-500 text-slate-950 font-extrabold text-sm rounded-2xl h-12 px-8 shadow-md active:scale-95 transition-transform"
        >
          {savingSettings ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
          Save All Settings
        </Button>
      </div>
    </div>
  );
}

