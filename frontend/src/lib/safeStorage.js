export function readStorage(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

export function writeStorage(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch { /* Storage may be disabled in private browsing. */ }
}
