import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { workerApi, setWorkerCsrf } from "@/lib/api";

const WorkerAuthContext = createContext(null);

export function WorkerAuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [worker, setWorker] = useState(null);
  const [loading, setLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    try {
      const { data } = await workerApi.get("/worker/auth/me");
      setWorkerCsrf(data.csrf_token);
      setUser(data.user);
      setWorker(data.worker);
    } catch {
      setUser(null);
      setWorker(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const login = async (login_id, password) => {
    const { data } = await workerApi.post("/worker/login", { login_id, password });
    setWorkerCsrf(data.csrf_token);
    setUser(data.user);
    setWorker(data.worker);
    return data;
  };

  const changePassword = async (current_password, new_password) => {
    const { data } = await workerApi.post("/worker/change-password", {
      current_password,
      new_password,
    });
    return data;
  };

  const logout = async () => {
    try {
      await workerApi.post("/worker/auth/logout");
    } catch {}
    setWorkerCsrf(null);
    setUser(null);
    setWorker(null);
  };

  return (
    <WorkerAuthContext.Provider
      value={{
        user,
        worker,
        setUser,
        setWorker,
        loading,
        login,
        changePassword,
        logout,
        checkAuth,
      }}
    >
      {children}
    </WorkerAuthContext.Provider>
  );
}

export const useWorkerAuth = () => useContext(WorkerAuthContext);
