import { startVisiblePolling } from "./polling";

beforeEach(() => {
  jest.useFakeTimers();
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
});
afterEach(() => jest.useRealTimers());

test("does not overlap slow polls and stops scheduling after cleanup", async () => {
  let finish;
  const callback = jest.fn(() => new Promise(resolve => { finish = resolve; }));
  const stop = startVisiblePolling(callback, 1000);
  jest.advanceTimersByTime(1000);
  jest.advanceTimersByTime(10000);
  expect(callback).toHaveBeenCalledTimes(1);
  stop();
  finish();
  await Promise.resolve();
  jest.advanceTimersByTime(10000);
  expect(callback).toHaveBeenCalledTimes(1);
});

test("hidden tabs do not poll; returning to the tab refreshes", async () => {
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
  const callback = jest.fn().mockResolvedValue();
  const stop = startVisiblePolling(callback, 1000);
  jest.advanceTimersByTime(1000);
  expect(callback).not.toHaveBeenCalled();
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  document.dispatchEvent(new Event("visibilitychange"));
  await Promise.resolve();
  expect(callback).toHaveBeenCalledTimes(1);
  stop();
});
