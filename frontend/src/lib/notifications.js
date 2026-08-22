import { adminApi, workerApi } from "./api";

let cachedPublicKey = process.env.REACT_APP_VAPID_PUBLIC_KEY || "";

function keyBytes(value) {
  const padded = `${value}${"=".repeat((4 - (value.length % 4)) % 4)}`.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

export const pushSupported = () =>
  Boolean(typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window);

export async function getVapidPublicKey(isAdmin = false) {
  if (cachedPublicKey && cachedPublicKey.trim()) return cachedPublicKey.trim();
  try {
    const api = isAdmin ? adminApi : workerApi;
    const res = await api.get("/push/public-key");
    if (res.data?.public_key) {
      cachedPublicKey = res.data.public_key.trim();
      return cachedPublicKey;
    }
  } catch (e) {
    console.warn("Could not fetch VAPID public key from backend:", e);
  }
  return "";
}

export async function enablePushNotifications(isAdmin = false) {
  if (!pushSupported()) {
    console.warn("Push notifications are not supported in this browser.");
    return false;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      console.warn("Notification permission was not granted by user.");
      return false;
    }

    const key = await getVapidPublicKey(isAdmin);
    if (!key) {
      console.warn("No VAPID public key available to subscribe.");
      return false;
    }

    const registration = await navigator.serviceWorker.register("/service-worker.js");
    await navigator.serviceWorker.ready;

    let subscription = await registration.pushManager.getSubscription();

    // If subscription already exists, check or recreate if key changed
    if (subscription) {
      try {
        const api = isAdmin ? adminApi : workerApi;
        await api.post("/push/subscribe", subscription.toJSON());
        return true;
      } catch (_) {
        try {
          await subscription.unsubscribe();
        } catch (e) {}
        subscription = null;
      }
    }

    // Subscribe with current key
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes(key),
    });

    const api = isAdmin ? adminApi : workerApi;
    await api.post("/push/subscribe", subscription.toJSON());
    console.info("Push notifications successfully enabled and registered with backend.");
    return true;
  } catch (err) {
    console.warn("Push registration notice:", err);
    return false;
  }
}

export async function sendTestNotification(isAdmin = false) {
  const api = isAdmin ? adminApi : workerApi;
  const res = await api.post("/push/test");
  return res.data;
}

export function updateAppBadge(count) {
  const unread = Math.max(0, Number(count) || 0);
  if (unread > 0 && typeof navigator.setAppBadge === "function") navigator.setAppBadge(unread).catch(() => {});
  if (unread === 0 && typeof navigator.clearAppBadge === "function") navigator.clearAppBadge().catch(() => {});
}

export async function clearConversationNotifications(conversationId, totalUnreadCount = 0) {
  if (!conversationId || !("serviceWorker" in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return;
    const message = { type: "CONVERSATION_READ", conversationId, totalUnreadCount };
    registration.active?.postMessage(message);
    registration.waiting?.postMessage(message);
    registration.installing?.postMessage(message);
    if (typeof registration.getNotifications === "function") {
      const notifications = await registration.getNotifications({ tag: conversationId });
      notifications.forEach((notification) => notification.close());
    }
  } catch (_) {
    // Notification cleanup is best-effort and must never interrupt chat reads.
  }
}

export function onPushNotification(callback) {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return () => {};
  const handler = (event) => {
    if (event.data?.type === "PUSH_RECEIVED") {
      callback(event.data.data);
    }
  };
  navigator.serviceWorker.addEventListener("message", handler);
  return () => navigator.serviceWorker.removeEventListener("message", handler);
}


