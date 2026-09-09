// A slow request must finish before another poll starts. Hidden tabs stay idle.
export function startVisiblePolling(callback, intervalMs) {
  let stopped = false;
  let timer;
  let running = false;
  const tick = async () => {
    if (stopped || running) return;
    clearTimeout(timer);
    running = true;
    try {
      if (document.visibilityState !== "hidden") await callback();
    } catch (error) {
      // Callers display endpoint-specific errors. Keep future polls alive.
    } finally {
      running = false;
      if (!stopped) timer = setTimeout(tick, intervalMs);
    }
  };
  const onVisibility = () => {
    if (document.visibilityState !== "hidden") tick();
  };
  timer = setTimeout(tick, intervalMs);
  document.addEventListener("visibilitychange", onVisibility);
  return () => {
    stopped = true;
    clearTimeout(timer);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}
