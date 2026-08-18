import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { adminApi, setAdminCsrf } from "@/lib/api";

const AdminAuthContext = createContext(null);

export function AdminAuthProvider({ children }) {
  const [admin, setAdmin] = useState(null);
  const [loading, setLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    try {
      const { data } = await adminApi.get("/admin/me");
      setAdminCsrf(data.csrf_token);
      delete data.csrf_token;
      setAdmin(data);
    } catch {
      setAdmin(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const signup = async ({ name, business_name, username, email, password }) => {
    const { data } = await adminApi.post("/admin/signup", {
      name,
      business_name,
      username,
      email,
      password,
    });
    setAdminCsrf(data.csrf_token);
    setAdmin(data.admin);
    return data;
  };

  const login = async (identifier, password) => {
    const { data } = await adminApi.post("/admin/login", { identifier, password });
    setAdminCsrf(data.csrf_token);
    setAdmin(data.admin);
    return data.admin;
  };

  const forgotPassword = async (email) => {
    const { data } = await adminApi.post("/admin/forgot-password", { email });
    return data;
  };

  const resetPassword = async (token, new_password) => {
    const { data } = await adminApi.post("/admin/reset-password", { token, new_password });
    return data;
  };

  const logout = async () => {
    try {
      await adminApi.post("/admin/logout");
    } catch {}
    setAdminCsrf(null);
    setAdmin(null);
  };

  return (
    <AdminAuthContext.Provider
      value={{
        admin,
        setAdmin,
        loading,
        signup,
        login,
        forgotPassword,
        resetPassword,
        logout,
        checkAuth,
      }}
    >
      {children}
    </AdminAuthContext.Provider>
  );
}

export const useAdminAuth = () => useContext(AdminAuthContext);
