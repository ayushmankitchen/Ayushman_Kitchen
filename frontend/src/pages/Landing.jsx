import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { API } from "@/lib/api";
import { applyDynamicBranding } from "@/lib/dynamicBranding";
import {
  ArrowRight,
  UtensilsCrossed,
  ChefHat,
  GraduationCap,
  Flame,
  Check,
  IndianRupee,
  ShieldCheck,
  MessageSquare,
  Sparkles,
  ConciergeBell,
  CalendarCheck,
  Award,
  Soup,
  Megaphone,
  Star,
  Zap,
} from "lucide-react";

const DEFAULT_SHOWCASE_BOXES = [
  {
    id: 1,
    title: "Special Deluxe Thali",
    subtitle: "Paneer Butter Masala, Dal Makhani, 4 Butter Rotis, Steamed Rice, Salad & Sweet",
    image_url: "https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=500&auto=format&fit=crop&q=60",
    badge: "Popular Thali",
  },
  {
    id: 2,
    title: "Sunday Special Biryani",
    subtitle: "Fragrant Dum Biryani served with spiced Mirchi Ka Salan, Boondi Raita & Gulab Jamun",
    image_url: "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=500&auto=format&fit=crop&q=60",
    badge: "Sunday Feast",
  },
  {
    id: 3,
    title: "High-Protein Diet Bowl",
    subtitle: "Sprouted pulses, boiled eggs, fresh curd, roasted paneer cubes and crunchy green salad",
    image_url: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=500&auto=format&fit=crop&q=60",
    badge: "Healthy Choice",
  },
  {
    id: 4,
    title: "Evening Snacks & Tea",
    subtitle: "Hot crispy Samosas, Poha, Bread Pakoras & steaming hot Ginger Masala Chai daily",
    image_url: "https://images.unsplash.com/photo-1601050690597-df0568f70950?w=500&auto=format&fit=crop&q=60",
    badge: "Snacks & Chai",
  },
];

const DEFAULT_MEAL_PLANS = [
  {
    id: "standard",
    name: "Standard Plan",
    price: 3300,
    description: "Perfect for everyday students who want healthy, filling homestyle meals.",
    features: [
      "Lunch + Dinner Daily",
      "Homestyle Fresh Meals",
      "Monthly Billing",
      "Student Portal Access",
    ],
  },
  {
    id: "premium",
    name: "Premium Plan",
    price: 3800,
    description: "Elevated dining with premium gourmet thali, extra dishes & priority service.",
    features: [
      "Lunch + Dinner Daily",
      "Premium Gourmet Thali",
      "Extra Dish Options",
      "Priority Support",
      "Student Portal Access",
    ],
  },
];

const features = [
  {
    icon: CalendarCheck,
    badge: "Meal Tracking",
    title: "Daily Meal & Attendance",
    copy: "Easily track daily lunch and dinner attendance. Students can view meal logs and pause meals during vacations or leaves.",
  },
  {
    icon: IndianRupee,
    badge: "Fees & Ledger",
    title: "Subscription & Fees",
    copy: "Completely transparent monthly meal subscription charges, advance payments, and live balance calculation without any confusion.",
  },
  {
    icon: MessageSquare,
    badge: "Student Support",
    title: "Direct Voice & Chat",
    copy: "Instant communication for diet preferences, meal timings, special requests, or leave notifications with voice notes and chat.",
  },
  {
    icon: Soup,
    badge: "Hygienic & Fresh",
    title: "Fresh & Nutritious Meals",
    copy: "Homestyle, balanced and hygienic meals prepared daily under the highest food safety standards for students and hostellers.",
  },
];

const highlights = [
  { label: "Daily Meal Sync", desc: "Lunch & Dinner tracking" },
  { label: "Transparent Ledger", desc: "Instant fee & payment visibility" },
  { label: "Vacation / Leave Pause", desc: "1-click pause meal notifications" },
  { label: "100% Mobile Portal", desc: "Fast login via Student ID / Mobile" },
];

export default function Landing() {
  const navigate = useNavigate();
  const [biz, setBiz] = useState({
    name: "Ayushman Kitchen",
    logo_url: "",
    notice_ticker: {
      enabled: true,
      badge: "LATEST ANNOUNCEMENT",
      text: "🎉 Welcome to Ayushman Kitchen! Fresh, hygienic, and home-style nutritious meals served daily. Mark your meal preference before cutoff time (Lunch 11:00 AM • Dinner 7:00 PM).",
    },
    showcase_boxes: DEFAULT_SHOWCASE_BOXES,
    meal_plans: DEFAULT_MEAL_PLANS,
  });

  useEffect(() => {
    axios
      .get(`${API}/public/business`)
      .then((res) => {
        if (res.data) {
          applyDynamicBranding(res.data);
          setBiz((prev) => ({
            ...prev,
            name: res.data.name || prev.name,
            logo_url: res.data.logo_url || "",
            notice_ticker: res.data.notice_ticker || prev.notice_ticker,
            showcase_boxes:
              Array.isArray(res.data.showcase_boxes) && res.data.showcase_boxes.length === 4
                ? res.data.showcase_boxes
                : DEFAULT_SHOWCASE_BOXES,
            meal_plans:
              Array.isArray(res.data.meal_plans) && res.data.meal_plans.length >= 1
                ? res.data.meal_plans
                : DEFAULT_MEAL_PLANS,
          }));
        }
      })
      .catch(() => {});
  }, []);

  const showcaseBoxes =
    Array.isArray(biz.showcase_boxes) && biz.showcase_boxes.length === 4
      ? biz.showcase_boxes
      : DEFAULT_SHOWCASE_BOXES;

  const mealPlans =
    Array.isArray(biz.meal_plans) && biz.meal_plans.length >= 1
      ? biz.meal_plans
      : DEFAULT_MEAL_PLANS;

  // Hero card: show the two plans side-by-side
  const stdPlan = mealPlans.find((p) => p.id === "standard") || mealPlans[0];
  const premPlan = mealPlans.find((p) => p.id === "premium") || mealPlans[1] || mealPlans[0];

  return (
    <div className="min-h-screen bg-[#faf8f5] text-slate-950 overflow-hidden font-sans selection:bg-amber-200 selection:text-amber-950">
      {/* 📢 Live Moving Notice Announcement Ticker */}
      {biz.notice_ticker?.enabled !== false && biz.notice_ticker?.text && (
        <div className="bg-amber-400 text-slate-950 py-2.5 px-4 flex items-center gap-3 overflow-hidden shadow-xs border-b border-amber-500/30">
          <div className="max-w-7xl w-full mx-auto flex items-center gap-3 overflow-hidden">
            <span className="bg-teal-950 text-amber-300 font-extrabold text-[10px] sm:text-xs px-2.5 py-0.5 rounded-lg uppercase tracking-wider shrink-0 flex items-center gap-1 shadow-xs">
              <Megaphone className="h-3.5 w-3.5" />
              <span>{biz.notice_ticker.badge || "UPDATE"}</span>
            </span>
            <div className="flex-1 overflow-hidden relative">
              <div className="animate-ticker text-xs sm:text-sm font-bold text-slate-950">
                {biz.notice_ticker.text}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="relative z-10 max-w-7xl mx-auto px-5 sm:px-8 py-5 flex items-center justify-between">
        <button
          data-testid="home-logo"
          onClick={() => navigate("/")}
          className="flex items-center gap-3.5 group text-left"
        >
          <div className="h-12 w-12 rounded-2xl bg-white border border-stone-300 p-0.5 overflow-hidden shadow-md group-hover:scale-105 transition-transform flex items-center justify-center">
            <img 
              src={biz.logo_url || "/workforce-logo.png"} 
              alt="Logo" 
              className="h-full w-full object-cover rounded-xl"
              onError={(e) => { e.currentTarget.src = "/workforce-logo.png"; }}
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-display font-extrabold tracking-tight text-2xl block text-slate-900 leading-none">
                {biz.name || "Ayushman Kitchen"}
              </span>
            </div>
            <span className="text-[10px] text-teal-800 font-bold uppercase tracking-widest block mt-0.5">
              Student Meal & Mess Service
            </span>
          </div>
        </button>

        <div className="flex items-center gap-3">
          <button
            data-testid="header-admin-login"
            onClick={() => navigate("/admin/login")}
            className="inline-flex items-center gap-2 text-xs sm:text-sm font-bold px-4 py-2.5 rounded-xl border border-stone-300 bg-white hover:border-teal-800 hover:text-teal-900 transition-all shadow-sm hover:shadow"
          >
            <ShieldCheck className="h-4 w-4 text-teal-800" />
            <span>Admin / Manager Sign In</span>
            <ArrowRight className="h-3.5 w-3.5 opacity-60" />
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <main>
        <section className="relative max-w-7xl mx-auto px-5 sm:px-8 pt-8 lg:pt-14 pb-16 grid lg:grid-cols-[1.1fr_.9fr] gap-12 items-center">
          <div className="relative z-10">
            {/* Pill Badge */}
            <div className="inline-flex items-center gap-2 rounded-full bg-amber-50 border border-amber-200/80 text-amber-900 px-4 py-1.5 text-xs font-bold uppercase tracking-wider shadow-sm">
              <GraduationCap className="h-4 w-4 text-amber-700" />
              <span>Dedicated Meal Service for Students & Hostellers</span>
            </div>

            {/* Main Headline */}
            <h1 className="font-display text-[clamp(2.5rem,5.5vw,4.5rem)] font-extrabold leading-[1.03] tracking-[-0.04em] mt-5 max-w-3xl text-slate-900">
              Nutritious Homestyle Food.<br />
              <span className="bg-gradient-to-r from-amber-600 via-amber-700 to-teal-900 bg-clip-text text-transparent">
                Complete Meal & Fee
              </span><br />
              Transparency for Students.
            </h1>

            {/* Description */}
            <p className="mt-5 text-base sm:text-lg text-slate-600 leading-relaxed max-w-2xl font-normal">
              {biz.name || "Ayushman Kitchen"} offers healthy, hygienic, homestyle daily meals for students. Track daily meal attendance, manage monthly subscriptions, choose custom gourmet options, and stay connected with mess management effortlessly.
            </p>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 mt-8">
              <button
                data-testid="goto-worker-btn"
                onClick={() => navigate("/student/login")}
                className="inline-flex justify-center items-center gap-3 rounded-2xl bg-gradient-to-r from-[#102f2c] to-[#1a4440] hover:from-[#0b2220] hover:to-[#143633] text-white font-bold px-7 py-4 shadow-xl shadow-teal-950/25 active:scale-[0.98] transition-all text-base border border-teal-700/40 group"
              >
                <GraduationCap className="h-5 w-5 text-amber-300 group-hover:scale-110 transition-transform" />
                <span>Student Portal</span>
                <ArrowRight className="h-4 w-4 text-amber-300" />
              </button>

              <button
                data-testid="goto-admin-btn"
                onClick={() => navigate("/admin/login")}
                className="inline-flex justify-center items-center gap-2.5 rounded-2xl bg-white hover:bg-amber-50/70 border border-stone-300 font-bold px-6 py-4 text-slate-800 active:scale-[0.98] transition-all shadow-sm hover:shadow text-base group"
              >
                <ShieldCheck className="h-5 w-5 text-teal-800 group-hover:scale-110 transition-transform" />
                <span>Admin / Mess Manager</span>
              </button>
            </div>

            {/* Feature Bullets */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-8 text-xs font-semibold text-slate-700">
              {[
                "Daily Lunch & Dinner Service",
                "Monthly Meal Fees & Receipts",
                "1-Click Vacation / Leave Hold",
                "Direct Student Support & Chat",
              ].map((text) => (
                <div key={text} className="flex items-center gap-2 bg-white/70 backdrop-blur-sm border border-stone-200/80 rounded-xl px-3 py-2">
                  <div className="h-5 w-5 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
                    <Check className="h-3.5 w-3.5" />
                  </div>
                  <span>{text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right Visual Card — dual mini plan preview */}
          <div className="relative lg:pl-4" aria-hidden="true">
            <div className="absolute -inset-10 bg-gradient-to-tr from-amber-200/40 via-teal-100/30 to-amber-100/50 rounded-full blur-3xl" />
            <div className="relative bg-gradient-to-b from-[#0e2724] to-[#081816] text-white rounded-[2.5rem] p-6 sm:p-8 shadow-2xl shadow-teal-950/30 border border-teal-800/40">
              {/* Header inside card */}
              <div className="flex items-center justify-between pb-5 border-b border-teal-800/50 mb-6">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-amber-400/10 border border-amber-400/30 flex items-center justify-center text-amber-300">
                    <Soup className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-[10px] text-teal-300 uppercase tracking-widest font-bold">Student Mess Service</p>
                    <p className="font-display text-lg font-bold text-white">Meal Plans & Pricing</p>
                  </div>
                </div>
                <span className="bg-emerald-400/20 text-emerald-300 border border-emerald-400/30 text-[10px] font-bold px-2.5 py-1 rounded-full">
                  Live & Active
                </span>
              </div>

              {/* Plan Mini-Cards */}
              <div className="space-y-3">
                {/* Standard Plan */}
                {stdPlan && (
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-1.5 mb-1">
                        <UtensilsCrossed className="h-3.5 w-3.5 text-amber-300" />
                        <span className="text-[11px] text-teal-200/80 font-bold uppercase tracking-wider">
                          {stdPlan.name}
                        </span>
                      </div>
                      <p className="font-display text-2xl font-extrabold text-white">
                        ₹{stdPlan.price?.toLocaleString("en-IN")}
                        <span className="text-sm font-medium text-teal-300 ml-1">/ month</span>
                      </p>
                      <p className="text-[11px] text-teal-300/70 mt-0.5">{stdPlan.description}</p>
                    </div>
                    <div className="h-10 w-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                      <IndianRupee className="h-5 w-5 text-amber-300" />
                    </div>
                  </div>
                )}

                {/* Premium Plan */}
                {premPlan && premPlan.id !== stdPlan?.id && (
                  <div className="bg-amber-400/10 border border-amber-400/25 rounded-2xl p-4 flex items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-1.5 mb-1">
                        <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400" />
                        <span className="text-[11px] text-amber-300 font-bold uppercase tracking-wider">
                          {premPlan.name}
                        </span>
                      </div>
                      <p className="font-display text-2xl font-extrabold text-white">
                        ₹{premPlan.price?.toLocaleString("en-IN")}
                        <span className="text-sm font-medium text-amber-300/80 ml-1">/ month</span>
                      </p>
                      <p className="text-[11px] text-amber-200/60 mt-0.5">{premPlan.description}</p>
                    </div>
                    <div className="h-10 w-10 rounded-xl bg-amber-400/20 flex items-center justify-center shrink-0">
                      <Zap className="h-5 w-5 text-amber-300" />
                    </div>
                  </div>
                )}
              </div>

              {/* Status Ticker */}
              <div className="mt-4 flex items-center justify-between text-xs text-teal-200/80 px-1">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-amber-400" /> Pure, Nutritious & Fresh Ingredients
                </span>
                <span className="font-mono font-bold text-amber-300">Asia/Kolkata</span>
              </div>
            </div>
          </div>
        </section>

        {/* 🍽️ 4 Feature & Menu Showcase Boxes Section */}
        <section className="max-w-7xl mx-auto px-5 sm:px-8 py-14 border-t border-stone-200/80">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
            <div>
              <div className="inline-flex items-center gap-1.5 bg-amber-100 text-amber-950 border border-amber-300 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
                <Sparkles className="h-3.5 w-3.5 text-amber-700" />
                <span>Featured Dishes & Menu</span>
              </div>
              <h2 className="font-display text-3xl sm:text-4xl font-extrabold text-slate-900 mt-2.5 tracking-tight">
                Kitchen Specialties & Daily Highlights
              </h2>
              <p className="text-slate-600 mt-1 text-sm sm:text-base">
                Fresh gourmet recipes, traditional flavors & nutritious diet options crafted daily for our students.
              </p>
            </div>
            <button
              onClick={() => navigate("/student/login")}
              className="inline-flex items-center gap-2 text-xs sm:text-sm font-bold bg-[#102f2c] text-white hover:bg-teal-900 px-5 py-3 rounded-2xl shadow-sm transition-all self-start sm:self-auto shrink-0"
            >
              <span>Explore Today's Menu</span>
              <ArrowRight className="h-4 w-4 text-amber-300" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {showcaseBoxes.map((box, i) => (
              <div
                key={box.id || i}
                className="group bg-white border border-stone-200 rounded-3xl overflow-hidden shadow-sm hover:shadow-xl hover:border-amber-300 transition-all flex flex-col justify-between"
              >
                <div className="relative h-44 w-full overflow-hidden bg-stone-100">
                  {box.image_url ? (
                    <img
                      src={box.image_url}
                      alt={box.title}
                      className="h-full w-full object-cover group-hover:scale-108 transition-transform duration-500"
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-stone-300">
                      <ChefHat className="h-12 w-12 text-teal-800/40" />
                    </div>
                  )}
                  {box.badge && (
                    <span className="absolute top-3 right-3 bg-amber-400 text-slate-950 text-[11px] font-extrabold px-3 py-1 rounded-full shadow-md backdrop-blur-xs">
                      {box.badge}
                    </span>
                  )}
                </div>
                <div className="p-5 flex-1 flex flex-col justify-between space-y-2">
                  <div>
                    <h3 className="font-display font-bold text-base text-slate-900 group-hover:text-teal-900 transition-colors line-clamp-1">
                      {box.title}
                    </h3>
                    <p className="text-xs text-slate-500 line-clamp-2 mt-1.5 leading-relaxed">
                      {box.subtitle}
                    </p>
                  </div>
                  <div className="pt-2 border-t border-stone-100 flex items-center justify-between text-xs text-teal-800 font-bold group-hover:translate-x-0.5 transition-transform">
                    <span>Available in Mess</span>
                    <ArrowRight className="h-3.5 w-3.5 opacity-70" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Highlights Bar */}
        <section className="bg-stone-900 text-stone-100 border-y border-stone-800 py-6">
          <div className="max-w-7xl mx-auto px-5 sm:px-8 grid grid-cols-2 md:grid-cols-4 gap-6">
            {highlights.map((item) => (
              <div key={item.label} className="flex flex-col">
                <span className="font-display text-base font-bold text-amber-400">{item.label}</span>
                <span className="text-xs text-stone-400 mt-0.5">{item.desc}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Features Section */}
        <section className="bg-white border-b border-stone-200 py-20">
          <div className="max-w-7xl mx-auto px-5 sm:px-8">
            <div className="max-w-2xl">
              <span className="text-xs font-extrabold text-teal-800 uppercase tracking-widest bg-teal-50 px-3 py-1 rounded-full border border-teal-200/60">
                Designed for Students & Mess Services
              </span>
              <h2 className="font-display text-3xl sm:text-4xl font-extrabold text-slate-900 mt-3 tracking-tight">
                Complete peace of mind for meals, attendance & billing.
              </h2>
              <p className="text-slate-600 mt-2 text-base leading-relaxed">
                Empowering students and meal providers with total transparency in daily diet logs, subscription charges, and vacation adjustments.
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mt-12">
              {features.map(({ icon: Icon, badge, title, copy }, i) => (
                <div
                  key={title}
                  className="bg-[#faf8f5] border border-stone-200/80 rounded-3xl p-6 hover:shadow-lg hover:border-teal-700/30 transition-all flex flex-col justify-between group"
                >
                  <div>
                    <div className="flex items-center justify-between mb-5">
                      <div className="h-12 w-12 rounded-2xl bg-white border border-stone-200 flex items-center justify-center text-teal-800 group-hover:bg-teal-800 group-hover:text-amber-300 transition-colors shadow-sm">
                        <Icon className="h-6 w-6" />
                      </div>
                      <span className="text-xs font-mono font-bold text-stone-400">0{i + 1}</span>
                    </div>
                    <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wider block mb-1">
                      {badge}
                    </span>
                    <h3 className="font-display text-lg font-bold text-slate-900 leading-snug">{title}</h3>
                    <p className="text-slate-600 mt-2.5 text-xs sm:text-sm leading-relaxed">{copy}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ───────────── 💰 MEAL PLAN PRICING SECTION ───────────── */}
        <section id="pricing" className="max-w-7xl mx-auto px-5 sm:px-8 py-20">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 bg-teal-50 text-teal-900 border border-teal-200 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider mb-4">
              <IndianRupee className="h-3.5 w-3.5" />
              Transparent Pricing — No Hidden Charges
            </div>
            <h2 className="font-display text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              Choose Your Meal Plan
            </h2>
            <p className="text-slate-600 mt-3 max-w-xl mx-auto text-sm sm:text-base leading-relaxed">
              Simple, affordable monthly subscriptions designed for student budgets. Switch plans any month — no lock-in.
            </p>
          </div>

          <div className={`grid gap-6 max-w-4xl mx-auto ${mealPlans.length === 1 ? "grid-cols-1 justify-items-center" : "sm:grid-cols-2"}`}>
            {mealPlans.map((plan, idx) => {
              const isPremium = plan.id === "premium" || idx === mealPlans.length - 1;
              return (
                <div
                  key={plan.id || idx}
                  className={`relative rounded-3xl p-7 sm:p-8 flex flex-col transition-all shadow-lg hover:shadow-2xl border ${
                    isPremium
                      ? "bg-gradient-to-b from-[#0e2724] to-[#051210] text-white border-teal-700/40 scale-[1.02]"
                      : "bg-white border-stone-200 text-slate-900 hover:border-amber-300"
                  }`}
                >
                  {isPremium && (
                    <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                      <span className="bg-amber-400 text-slate-950 text-[11px] font-extrabold px-4 py-1.5 rounded-full shadow-md flex items-center gap-1.5">
                        <Star className="h-3 w-3 fill-slate-950" /> Most Popular
                      </span>
                    </div>
                  )}

                  {/* Plan Header */}
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <span
                        className={`text-[11px] font-extrabold uppercase tracking-widest block mb-1 ${
                          isPremium ? "text-amber-300" : "text-teal-700"
                        }`}
                      >
                        {plan.name}
                      </span>
                      <p
                        className={`text-xs leading-relaxed max-w-[200px] ${
                          isPremium ? "text-teal-200/70" : "text-slate-500"
                        }`}
                      >
                        {plan.description}
                      </p>
                    </div>
                    <div
                      className={`h-12 w-12 rounded-2xl flex items-center justify-center shrink-0 ${
                        isPremium
                          ? "bg-amber-400/15 border border-amber-400/30 text-amber-300"
                          : "bg-teal-50 border border-teal-200 text-teal-800"
                      }`}
                    >
                      {isPremium ? <Zap className="h-6 w-6" /> : <UtensilsCrossed className="h-6 w-6" />}
                    </div>
                  </div>

                  {/* Price */}
                  <div className="mb-7">
                    <div className="flex items-end gap-1">
                      <span
                        className={`text-[11px] font-bold mt-1 ${
                          isPremium ? "text-teal-300" : "text-slate-400"
                        }`}
                      >
                        ₹
                      </span>
                      <span className={`font-display text-5xl font-black leading-none ${isPremium ? "text-white" : "text-slate-900"}`}>
                        {plan.price?.toLocaleString("en-IN")}
                      </span>
                      <span className={`text-sm font-semibold mb-1 ${isPremium ? "text-teal-300/80" : "text-slate-400"}`}>
                        / month
                      </span>
                    </div>
                    <div
                      className={`h-1.5 w-full rounded-full mt-4 overflow-hidden ${
                        isPremium ? "bg-white/10" : "bg-stone-100"
                      }`}
                    >
                      <div
                        className={`h-full rounded-full ${isPremium ? "w-full bg-gradient-to-r from-amber-400 to-amber-300" : "w-4/5 bg-gradient-to-r from-teal-700 to-emerald-600"}`}
                      />
                    </div>
                  </div>

                  {/* Features */}
                  <ul className="space-y-3 flex-1 mb-7">
                    {(plan.features || []).map((feat, fi) => (
                      <li key={fi} className="flex items-center gap-3">
                        <div
                          className={`h-5 w-5 rounded-full flex items-center justify-center shrink-0 ${
                            isPremium
                              ? "bg-amber-400/20 text-amber-300"
                              : "bg-emerald-100 text-emerald-700"
                          }`}
                        >
                          <Check className="h-3 w-3" />
                        </div>
                        <span
                          className={`text-sm font-medium ${isPremium ? "text-teal-100/90" : "text-slate-700"}`}
                        >
                          {feat}
                        </span>
                      </li>
                    ))}
                  </ul>

                  {/* CTA */}
                  <button
                    onClick={() => navigate("/student/login")}
                    className={`w-full py-3.5 rounded-2xl font-bold text-sm transition-all active:scale-[0.98] flex items-center justify-center gap-2 ${
                      isPremium
                        ? "bg-amber-400 hover:bg-amber-300 text-slate-950 shadow-lg shadow-amber-900/20"
                        : "bg-[#102f2c] hover:bg-teal-900 text-white"
                    }`}
                  >
                    <GraduationCap className="h-4 w-4" />
                    Get Started — Student Portal
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>

          <p className="text-center text-xs text-slate-500 mt-8 font-medium">
            Prices are set and updated by the mess manager. Contact admin for custom plans or bulk discounts.
          </p>
        </section>

        {/* Quality Pillars / CTA Section */}
        <section className="max-w-7xl mx-auto px-5 sm:px-8 py-8 pb-16">
          <div className="bg-gradient-to-br from-[#102f2c] to-[#0a1e1b] rounded-3xl p-8 sm:p-12 text-white shadow-2xl relative overflow-hidden">
            <div className="absolute right-0 top-0 w-96 h-96 bg-amber-400/10 rounded-full blur-3xl pointer-events-none" />
            <div className="relative z-10 max-w-3xl">
              <div className="inline-flex items-center gap-2 bg-amber-400/20 text-amber-300 border border-amber-400/30 rounded-full px-3 py-1 text-xs font-bold">
                <Award className="h-4 w-4" /> The {biz.name || "Ayushman Kitchen"} Promise
              </div>
              <h3 className="font-display text-2xl sm:text-4xl font-extrabold mt-4 leading-tight">
                Homestyle nourishment away from home.
              </h3>
              <p className="text-teal-100/90 text-sm sm:text-base mt-4 leading-relaxed">
                Whether you are studying for competitive exams or living in hostel/PG, {biz.name || "Ayushman Kitchen"} ensures you get warm, healthy meals every single day with complete subscription clarity.
              </p>

              <div className="flex flex-wrap gap-4 mt-8">
                <button
                  onClick={() => navigate("/student/login")}
                  className="bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold px-6 py-3 rounded-xl text-sm transition-colors shadow-md"
                >
                  Student Portal Login
                </button>
                <button
                  onClick={() => navigate("/admin/login")}
                  className="bg-white/10 hover:bg-white/20 text-white font-bold px-6 py-3 rounded-xl text-sm border border-white/20 transition-colors"
                >
                  Admin / Manager Sign In
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-5 sm:px-8 py-8 flex flex-col sm:flex-row justify-between items-center gap-4 text-xs sm:text-sm text-slate-500 border-t border-stone-200">
        <div className="flex items-center gap-2">
          <ChefHat className="h-4 w-4 text-teal-800" />
          <span className="font-semibold text-slate-700">© {new Date().getFullYear()} {biz.name || "Ayushman Kitchen"}</span>
          <span>— Student Meal & Mess Management Portal.</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-600 font-medium">
          <span>Developed by</span>
          <span className="font-bold text-slate-900 bg-amber-100/90 text-amber-950 px-2.5 py-1 rounded-lg border border-amber-300 shadow-2xs">
            Swagat and Nishant
          </span>
        </div>
      </footer>
    </div>
  );
}
