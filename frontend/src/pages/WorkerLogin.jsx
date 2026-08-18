import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import axios from "axios";
import {
  ArrowLeft,
  GraduationCap,
  KeyRound,
  Eye,
  EyeOff,
  Loader2,
  X,
  UtensilsCrossed,
  Mail,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
} from "lucide-react";
import { useWorkerAuth } from "@/context/WorkerAuth";
import { API, apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function WorkerLogin() {
  const navigate = useNavigate();
  const { worker, loading: authLoading, login } = useWorkerAuth();
  const [loading, setLoading] = useState(false);

  const [loginId, setLoginId] = useState(() => localStorage.getItem("workforce_last_worker_identifier") || "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Forgot Password Modal State
  const [forgotModalOpen, setForgotModalOpen] = useState(false);
  const [forgotIdentifier, setForgotIdentifier] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotResult, setForgotResult] = useState(null);

  useEffect(() => {
    if (!authLoading && worker) navigate("/student");
  }, [worker, authLoading, navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!loginId.trim() || !password) {
      toast.error("Please enter your Student ID or Phone Number and password");
      return;
    }

    setLoading(true);
    try {
      await login(loginId.trim(), password);
      localStorage.setItem("workforce_last_worker_identifier", loginId.trim());
      setPassword("");
      toast.success("Signed in successfully");
      navigate("/student");
    } catch (error) {
      const msg = apiError(error);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    if (!forgotIdentifier.trim()) {
      toast.error("Please enter your Student ID, Phone Number or registered Email");
      return;
    }

    setForgotLoading(true);
    try {
      const res = await axios.post(`${API}/worker/forgot-password`, {
        identifier: forgotIdentifier.trim(),
      });
      setForgotResult(res.data);
      if (res.data.ok) {
        toast.success("Reset link sent!");
      }
    } catch (error) {
      const msg = apiError(error);
      toast.error(msg);
      setForgotResult({
        ok: false,
        has_email: false,
        message: msg,
      });
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#faf8f5] flex flex-col font-sans">
      {/* Back button */}
      <header className="p-4 sm:p-6">
        <button
          onClick={() => navigate("/")}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Home
        </button>
      </header>

      {/* Form Card */}
      <div className="flex-1 flex items-center justify-center px-4 pb-16">
        <div className="w-full max-w-md bg-white border border-stone-200 rounded-3xl shadow-xl p-8 sm:p-10">
          {/* Icon & Heading */}
          <div className="flex items-center gap-3.5 mb-8">
            <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-[#102f2c] to-[#1a4440] flex items-center justify-center shadow-md text-amber-300 border border-teal-700/30">
              <GraduationCap className="h-7 w-7" />
            </div>
            <div>
              <span className="text-[11px] font-bold text-teal-800 uppercase tracking-widest block">
                Student Portal
              </span>
              <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-slate-900 leading-tight">
                Student Sign In
              </h1>
            </div>
          </div>

          <p className="text-sm text-slate-600 mb-7 leading-relaxed">
            Enter your registered Student ID or mobile number and password to access your daily meals and attendance.
          </p>

          <form onSubmit={handleLogin} className="space-y-5" data-testid="worker-login-form">
            <div>
              <Label className="text-xs font-bold text-slate-700">
                Student ID or Mobile Number
              </Label>
              <div className="relative mt-1.5">
                <KeyRound className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                <Input
                  data-testid="worker-loginid-input"
                  type="text"
                  required
                  placeholder="e.g. 9876543210 or Student ID"
                  value={loginId}
                  onChange={(e) => setLoginId(e.target.value)}
                  className="pl-10 h-11 rounded-xl text-sm font-mono tracking-wide"
                  autoComplete="username"
                />
                {loginId && (
                  <button
                    type="button"
                    aria-label="Clear remembered identifier"
                    onClick={() => {
                      setLoginId("");
                      localStorage.removeItem("workforce_last_worker_identifier");
                    }}
                    className="absolute right-2 top-2 p-1 text-slate-400 hover:text-slate-700"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <Label className="text-xs font-bold text-slate-700">Password</Label>
                <button
                  type="button"
                  onClick={() => {
                    setForgotIdentifier(loginId);
                    setForgotResult(null);
                    setForgotModalOpen(true);
                  }}
                  className="text-xs font-bold text-teal-800 hover:text-teal-950 hover:underline"
                >
                  Forgot Password?
                </button>
              </div>
              <div className="relative">
                <Input
                  data-testid="worker-password-input"
                  type={showPassword ? "text" : "password"}
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-10 h-11 rounded-xl text-sm font-mono"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              data-testid="worker-login-submit"
              disabled={loading || authLoading}
              className="w-full bg-teal-800 hover:bg-teal-900 text-white font-bold h-11 rounded-xl shadow-md text-sm transition-all active:scale-[0.99]"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <UtensilsCrossed className="h-4 w-4 mr-2 text-amber-300" />
              )}
              Access Meal Dashboard
            </Button>
          </form>

          <p className="text-xs text-center text-slate-400 mt-7 leading-relaxed">
            Contact Ayushman Kitchen mess management if you need new login credentials or diet updates.
          </p>
        </div>
      </div>

      {/* 🔐 Student Forgot Password Modal */}
      {forgotModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white border border-stone-200 rounded-3xl shadow-2xl p-6 sm:p-8 space-y-5 relative">
            <button
              onClick={() => setForgotModalOpen(false)}
              className="absolute right-5 top-5 p-1 text-slate-400 hover:text-slate-700 rounded-full hover:bg-stone-100 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-2xl bg-teal-50 border border-teal-200 text-teal-800 flex items-center justify-center">
                <Mail className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-display font-bold text-lg text-slate-900 leading-tight">
                  Student Password Reset
                </h2>
                <p className="text-xs text-slate-500">Receive a reset link on your registered email</p>
              </div>
            </div>

            {forgotResult ? (
              <div
                className={`p-4 rounded-2xl border text-xs sm:text-sm space-y-2 ${
                  forgotResult.ok
                    ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                    : "bg-amber-50 border-amber-200 text-amber-900"
                }`}
              >
                <div className="flex items-start gap-2.5">
                  {forgotResult.ok ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <p className="font-bold">{forgotResult.ok ? "Link Sent Successfully" : "Notice"}</p>
                    <p className="mt-1 leading-relaxed">{forgotResult.message}</p>
                  </div>
                </div>

                <div className="pt-3 flex gap-2">
                  <Button
                    onClick={() => {
                      setForgotModalOpen(false);
                      setForgotResult(null);
                    }}
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold h-9"
                  >
                    Done
                  </Button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div>
                  <Label className="text-xs font-bold text-slate-700">
                    Student ID, Mobile Number or Email
                  </Label>
                  <div className="relative mt-1.5">
                    <Input
                      type="text"
                      required
                      placeholder="e.g. 9876543210 or student@example.com"
                      value={forgotIdentifier}
                      onChange={(e) => setForgotIdentifier(e.target.value)}
                      className="h-11 rounded-xl text-sm font-mono"
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1.5">
                    A secure 30-minute password reset link will be sent to the email address registered on your student profile.
                  </p>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setForgotModalOpen(false)}
                    className="flex-1 rounded-xl text-xs font-bold h-11 border-stone-300"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={forgotLoading}
                    className="flex-1 bg-teal-800 hover:bg-teal-900 text-white rounded-xl text-xs font-bold h-11"
                  >
                    {forgotLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Mail className="h-4 w-4 mr-2" />}
                    Send Reset Link
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
