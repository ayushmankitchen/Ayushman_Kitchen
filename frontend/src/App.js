import "./App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import { AdminAuthProvider } from "@/context/AdminAuth";
import { WorkerAuthProvider } from "@/context/WorkerAuth";
import Landing from "@/pages/Landing";
import AdminLogin from "@/pages/AdminLogin";
import AdminDashboard from "@/pages/AdminDashboard";
import WorkerLogin from "@/pages/WorkerLogin";
import WorkerDashboard from "@/pages/WorkerDashboard";
import ResetPassword from "@/pages/ResetPassword";
import InstallWorkforceApp from "@/components/InstallWorkforceApp";

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/admin" element={<AdminDashboard />} />
      <Route path="/student/login" element={<WorkerLogin />} />
      <Route path="/student" element={<WorkerDashboard />} />
      <Route path="/worker/login" element={<WorkerLogin />} />
      <Route path="/worker" element={<WorkerDashboard />} />
      <Route path="/reset-password" element={<ResetPassword />} />
    </Routes>
  );
}

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <AdminAuthProvider>
          <WorkerAuthProvider>
            <AppRoutes />
            <Toaster position="top-right" richColors />
            <InstallWorkforceApp />
          </WorkerAuthProvider>
        </AdminAuthProvider>
      </BrowserRouter>
    </div>
  );
}

export default App;
