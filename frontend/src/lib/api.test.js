jest.mock("axios", () => ({
  create: () => ({ interceptors: { request: { use: jest.fn() } } }),
}));

import { apiError, applyCsrfHeader } from "./api";

test("preserves backend validation errors", () => {
  expect(apiError({ response: { data: { detail: "Email already exists" } } })).toBe("Email already exists");
});

test("explains an unreachable backend in English and Hindi", () => {
  const message = apiError({ request: {}, message: "Network Error" });
  expect(message).toContain("Cannot connect to WorkForce server");
  expect(message).toContain("Server connection ");
});

test("uses the current CSRF cookie over stale in-memory state for chat posts", () => {
  Object.defineProperty(document, "cookie", { configurable: true, value: "csrf_token=current-token" });
  const config = applyCsrfHeader({ method: "post", headers: {} }, "stale-token");
  expect(config.headers["X-CSRF-Token"]).toBe("current-token");
});
