import axios from "axios";

const configuredBackend = process.env.REACT_APP_BACKEND_URL;

// When running in production (e.g. Vercel), use relative path "/api"
// which is forwarded by vercel.json rewrite to Render backend.
// This guarantees same-origin cookie delivery and prevents 401 cross-site auth loss.
const isProd = process.env.NODE_ENV === "production" || (typeof window !== "undefined" && window.location.hostname !== "localhost");
const BACKEND_URL = isProd
  ? ""
  : (configuredBackend || "http://localhost:8000");

export const API = `${BACKEND_URL.replace(/\/$/, "")}/api`;

export const adminApi = axios.create({ baseURL: API, withCredentials: true });
export const workerApi = axios.create({ baseURL: API, withCredentials: true });

const getStoredToken = (key) => {
  if (typeof localStorage === "undefined") return null;
  try {
    return localStorage.getItem(key) || null;
  } catch {
    return null;
  }
};

const setStoredToken = (key, value) => {
  if (typeof localStorage === "undefined") return;
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {}
};

let adminCsrf = getStoredToken("admin_csrf_token");
let workerCsrf = getStoredToken("worker_csrf_token");

export const setAdminCsrf = (value) => {
  adminCsrf = value || null;
  setStoredToken("admin_csrf_token", value);
};

export const setWorkerCsrf = (value) => {
  workerCsrf = value || null;
  setStoredToken("worker_csrf_token", value);
};

export function csrfTokenFromCookie() {
  if (typeof document === "undefined") return null;
  const cookie = document.cookie.split("; ").find((entry) => entry.startsWith("csrf_token="));
  return cookie ? decodeURIComponent(cookie.slice("csrf_token=".length)) : null;
}

export function applyCsrfHeader(config, memoryToken) {
  const token = csrfTokenFromCookie() || memoryToken;
  if (["post", "put", "patch", "delete"].includes(config.method?.toLowerCase()) && token) {
    config.headers = config.headers || {};
    config.headers["X-CSRF-Token"] = token;
  }
  return config;
}

const csrfInterceptor = (getToken) => (config) => {
  return applyCsrfHeader(config, getToken());
};
adminApi.interceptors?.request?.use?.(csrfInterceptor(() => adminCsrf || getStoredToken("admin_csrf_token")));
workerApi.interceptors?.request?.use?.(csrfInterceptor(() => workerCsrf || getStoredToken("worker_csrf_token")));

// Response interceptors: store fresh token and auto-retry on 403 CSRF failure
adminApi.interceptors?.response?.use?.(
  (response) => {
    if (response.data?.csrf_token) setAdminCsrf(response.data.csrf_token);
    return response;
  },
  async (error) => {
    const originalRequest = error?.config;
    if (
      error?.response?.status === 403 &&
      error?.response?.data?.detail === "CSRF validation failed" &&
      originalRequest &&
      !originalRequest._retry
    ) {
      originalRequest._retry = true;
      try {
        const refreshRes = await axios.get(`${API}/admin/auth/me`, { withCredentials: true });
        const newToken = refreshRes.data?.csrf_token;
        if (newToken) {
          setAdminCsrf(newToken);
          originalRequest.headers = originalRequest.headers || {};
          originalRequest.headers["X-CSRF-Token"] = newToken;
          return adminApi(originalRequest);
        }
      } catch {}
    }
    return Promise.reject(error);
  }
);

workerApi.interceptors?.response?.use?.(
  (response) => {
    if (response.data?.csrf_token) setWorkerCsrf(response.data.csrf_token);
    return response;
  },
  async (error) => {
    const originalRequest = error?.config;
    if (
      error?.response?.status === 403 &&
      error?.response?.data?.detail === "CSRF validation failed" &&
      originalRequest &&
      !originalRequest._retry
    ) {
      originalRequest._retry = true;
      try {
        const refreshRes = await axios.get(`${API}/worker/auth/me`, { withCredentials: true });
        const newToken = refreshRes.data?.csrf_token;
        if (newToken) {
          setWorkerCsrf(newToken);
          originalRequest.headers = originalRequest.headers || {};
          originalRequest.headers["X-CSRF-Token"] = newToken;
          return workerApi(originalRequest);
        }
      } catch {}
    }
    return Promise.reject(error);
  }
);

export function apiError(e) {
  const detail = e?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((d) => d.msg || JSON.stringify(d)).join(" ");
  if (e?.request && !e?.response) {
    return "Cannot connect to WorkForce server. Server connection Backend ";
  }
  return e?.message || "Something went wrong";
}

export const money = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;
