import React from "react";
import { act } from "react-dom/test-utils";
import { createRoot } from "react-dom/client";
import AdminDeliveryDispatcher from "./AdminDeliveryDispatcher";
import StudentDeliveryTracker from "./StudentDeliveryTracker";
import { adminApi, workerApi } from "@/lib/api";
import { startVisiblePolling } from "@/lib/polling";

jest.mock("@/lib/api", () => ({ adminApi: { get: jest.fn(), post: jest.fn() }, workerApi: { get: jest.fn(), post: jest.fn() }, apiError: e => e.message }));
jest.mock("@/lib/polling", () => ({ startVisiblePolling: jest.fn(() => () => {}) }));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("./DeliveryMap", () => () => <div />);

let root, container;
beforeEach(() => {
  jest.clearAllMocks();
  startVisiblePolling.mockImplementation(() => () => {});
  global.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });
const click = async text => {
  const button = [...container.querySelectorAll("button")].find(b => b.textContent.includes(text));
  expect(button).toBeDefined();
  await act(async () => button.click());
};

test("student confirms own receipt and receives completed status", async () => {
  workerApi.get.mockResolvedValue({ data: { selection_id: "own-order", has_delivery_order: true, can_confirm_receipt: true, is_out_for_delivery: true, delivery_status: "OUT_FOR_DELIVERY" } });
  workerApi.post.mockImplementation(async () => {
    workerApi.get.mockResolvedValue({ data: { selection_id: "own-order", has_delivery_order: true, can_confirm_receipt: false, is_out_for_delivery: false, delivery_status: "DELIVERED" } });
    return { data: { ok: true } };
  });
  await act(async () => root.render(<StudentDeliveryTracker />));
  await click("OK — meal received");
  expect(workerApi.post).toHaveBeenCalledWith("/delivery/student/orders/own-order/receive");
  expect(container.textContent).toContain("Meal delivered");
  expect(container.textContent).not.toContain("OK — meal received");
});

test("dispatcher advances after admin receipt, then student receipt via polling", async () => {
  const a = { selection_id: "a", student_name: "Student A", delivery_status: "OUT_FOR_DELIVERY", distance_meters: 5 };
  const b = { selection_id: "b", student_name: "Student B", delivery_status: "OUT_FOR_DELIVERY", distance_meters: 10 };
  let session = { is_active: true, pending_stops: 2, total_stops: 2, next_stop: a, stops: [a, b] };
  adminApi.get.mockImplementation(async () => ({ data: session }));
  adminApi.post.mockImplementation(async () => {
    session = { ...session, next_stop: b, pending_stops: 1, stops: [{ ...a, delivery_status: "DELIVERED" }, b] };
    return { data: { ok: true } };
  });
  await act(async () => root.render(<AdminDeliveryDispatcher />));
  await click("Delivered — next student");
  expect(adminApi.post).toHaveBeenCalledWith("/delivery/admin/orders/a/deliver");
  expect(container.querySelector('[data-testid="next-delivery"]').textContent).toContain("Student B");
  session = { ...session, next_stop: null, pending_stops: 0, stops: [] };
  const poll = startVisiblePolling.mock.calls.at(-1)[0];
  await act(async () => poll());
  expect(container.textContent).toContain("All deliveries completed!");
});
