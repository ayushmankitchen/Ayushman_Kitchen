import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowLeft,
  ShieldCheck,
  User,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  KeyRound,
  CheckCircle2,
  X,
} from "lucide-react";
import { useAdminAuth } from "@/context/AdminAuth";
import { apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function AdminLogin() {
  const navigate = useNavigate();
  const { admin, login, forgotPassword } = useAdminAuth();

  const [loading, setLoading] = useState(false);

  // Login form state
  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // Forgot password modal state
  const [forgotModalOpen, setForgotModalOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSuccess, setForgotSuccess] = useState(false);

  useEffect(() => {
    if (admin) {
      navigate("/admin");
    }
  }, [admin, navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!loginIdentifier.trim() || !loginPassword) {
      toast.error("Please enter both username/email and password");
      return;
    }

    setLoading(true);
    try {
      await login(loginIdentifier.trim(), loginPassword);
      toast.success("Signed in successfully!");
      navigate("/admin");
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    if (!forgotEmail.trim()) {
      toast.error("Please enter your email address");
      return;
    }

    setForgotLoading(true);
    try {
      await forgotPassword(forgotEmail.trim().toLowerCase());
      setForgotSuccess(true);
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8f7f2] flex flex-col">
      {/* Top Header */}
      <header className="p-4 sm:p-6 flex items-center justify-between">
        <button
          onClick={() => navigate("/")}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Home</button>
      </header>

      {/* Main Form Container */}
      <div className="flex-1 flex items-center justify-center px-4 py-8 sm:py-12">
        <div className="w-full bg-white border border-stone-200 rounded-3xl shadow-xl p-6 sm:p-10 max-w-lg">
          {/* Brand Icon & Heading */}
          <div className="flex items-center gap-3 mb-8">
            <div className="h-12 w-12 rounded-2xl bg-[#102f2c] flex items-center justify-center shadow-md">
              <ShieldCheck className="h-6 w-6 text-amber-300" />
            </div>
            <div>
              <span className="text-[11px] font-bold text-teal-800 uppercase tracking-widest block">
                Owner & Admin Portal</span>
              <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-slate-900 leading-tight">
                Admin Sign In
              </h1>
            </div>
          </div>

          {/* SIGN IN FORM */}
          <form onSubmit={handleLogin} className="space-y-4" data-testid="admin-login-form">
            <div>
              <Label className="text-xs font-bold text-slate-700">
                Username or Email</Label>
              <div className="relative mt-1.5">
                <User className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                <Input
                  data-testid="login-identifier-input"
                  type="text"
                  required
                  placeholder="e.g. admin or owner@example.com"
                  value={loginIdentifier}
                  onChange={(e) => setLoginIdentifier(e.target.value)}
                  className="pl-10 h-11 rounded-xl text-sm"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-slate-700">Password</Label>
                <button
                  type="button"
                  data-testid="forgot-password-link"
                  onClick={() => {
                    setForgotEmail(loginIdentifier.includes("@") ? loginIdentifier : "");
                    setForgotSuccess(false);
                    setForgotModalOpen(true);
                  }}
                  className="text-xs font-bold text-teal-800 hover:text-teal-900 underline"
                >
                  Forgot??
                </button>
              </div>
              <div className="relative mt-1.5">
                <Lock className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                <Input
                  data-testid="login-password-input"
                  type={showLoginPassword ? "text" : "password"}
                  required
                  placeholder="••••••••"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="pl-10 pr-10 h-11 rounded-xl text-sm font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowLoginPassword(!showLoginPassword)}
                  className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                >
                  {showLoginPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              data-testid="admin-login-submit"
              disabled={loading}
              className="w-full bg-teal-800 hover:bg-teal-900 text-white font-bold h-11 rounded-xl shadow-md text-sm mt-6"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Sign In to Workspace</Button>
          </form>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {forgotModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full min-w-0 max-w-md max-h-[calc(100vh-2rem)] overflow-y-auto bg-white rounded-3xl shadow-2xl p-6 sm:p-8 relative">
            <button
              onClick={() => setForgotModalOpen(false)}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 rounded-full"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="h-12 w-12 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center mb-4">
              <KeyRound className="h-6 w-6" />
            </div>

            <h2 className="font-display text-xl font-bold text-slate-900">
              Forgot Password</h2>
            <p className="text-xs text-slate-500 mt-1">
              Enter your registered email address. We will send you a secure password reset link.
            </p>

            {forgotSuccess ? (
              <div className="mt-6 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Email Sent</p>
                  <p className="text-xs text-emerald-800 mt-1">
                    If an account exists for <strong>{forgotEmail}</strong>, a reset link has been sent. Please check your inbox and spam folder.
                  </p>
                  <Button
                    onClick={() => setForgotModalOpen(false)}
                    className="mt-4 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold"
                  >
                    Close</Button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleForgotPassword} className="mt-5 space-y-4">
                <div>
                  <Label className="text-xs font-bold text-slate-700">Registered Email</Label>
                  <div className="relative mt-1.5 min-w-0">
                    <Mail className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                    <Input
                      type="email"
                      required
                      placeholder="owner@example.com"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      className="w-full min-w-0 pl-10 h-11 rounded-xl text-sm"
                    />
                  </div>
                </div>

                <div className="flex gap-2 justify-end pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setForgotModalOpen(false)}
                    className="rounded-xl text-xs"
                  >
                    Cancel</Button>
                  <Button
                    type="submit"
                    disabled={forgotLoading}
                    className="bg-teal-800 hover:bg-teal-900 text-white rounded-xl text-xs font-bold"
                  >
                    {forgotLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                    Send Reset Link</Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
