import axios from "axios";

const configuredBackend = process.env.REACT_APP_BACKEND_URL;
// In production on Vercel, use relative URL so requests go through
// Vercel's rewrite proxy (same domain = cookies work perfectly).
// Only use the full backend URL for local development.
const BACKEND_URL = process.env.NODE_ENV === "production"
  ? (configuredBackend || "")
  : (configuredBackend || "http://localhost:8000");
export const API = `${BACKEND_URL.replace(/\/$/, "")}/api`;

export const adminApi = axios.create({ baseURL: API, withCredentials: true });
export const workerApi = axios.create({ baseURL: API, withCredentials: true });

let adminCsrf = null;
let workerCsrf = null;
export const setAdminCsrf = (value) => { adminCsrf = value || null; };
export const setWorkerCsrf = (value) => { workerCsrf = value || null; };

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
adminApi.interceptors.request.use(csrfInterceptor(() => adminCsrf));
workerApi.interceptors.request.use(csrfInterceptor(() => workerCsrf));

// Session refresh endpoints return a fresh token. Keep the next mutating request
// synchronized even if the PWA was resumed while the cookie changed.
adminApi.interceptors.response?.use((response) => {
  if (response.data?.csrf_token) setAdminCsrf(response.data.csrf_token);
  return response;
});
workerApi.interceptors.response?.use((response) => {
  if (response.data?.csrf_token) setWorkerCsrf(response.data.csrf_token);
  return response;
});

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
