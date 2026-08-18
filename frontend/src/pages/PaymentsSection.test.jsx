import React from "react";
import { act } from "react-dom/test-utils";
import { createRoot } from "react-dom/client";

jest.mock("@/lib/api", () => ({
  adminApi: { get: jest.fn() },
  apiError: () => "Request failed",
  money: (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`,
}));
jest.mock("sonner", () => ({ toast: { error: jest.fn(), success: jest.fn() } }));
jest.mock("@/components/salary/SalarySlipModal", () => ({ open, worker }) => (
  open ? <div data-testid="salary-slip-modal">{worker?.name}</div> : null
));

import { PaymentsSection } from "./AdminDashboard";
import { adminApi } from "@/lib/api";

function renderPayments(workers) {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const node = document.createElement("div");
  const root = createRoot(node);
  act(() => root.render(<PaymentsSection workers={workers} />));
  return { node, root };
}

beforeEach(() => {
  adminApi.get.mockReset();
  adminApi.get.mockResolvedValue({ data: [] });
});

test("Payments page renders with missing optional summary fields", async () => {
  adminApi.get.mockImplementation((url) => Promise.resolve({ data: url === "/payments" ? [] : {} }));
  const { node, root } = renderPayments([{ id: "worker-1", name: "Asha" }]);
  await act(async () => {});
  expect(node.textContent).toContain("Payments & Advances");
  expect(node.querySelector('[data-testid="worker-slip-btn-worker-1"]')).not.toBeNull();
  act(() => root.unmount());
});

test("Payments page shows an empty state when no workers exist", async () => {
  const { node, root } = renderPayments([]);
  await act(async () => {});
  expect(node.querySelector('[data-testid="payments-empty-workers"]')?.textContent).toContain("No workers added yet.");
  act(() => root.unmount());
});

test("Salary Slip button opens the modal for a valid worker", async () => {
  const { node, root } = renderPayments([{ id: "worker-1", name: "Asha" }]);
  await act(async () => {});
  await act(async () => node.querySelector('[data-testid="worker-slip-btn-worker-1"]').click());
  expect(node.querySelector('[data-testid="salary-slip-modal"]')?.textContent).toContain("Asha");
  act(() => root.unmount());
});
