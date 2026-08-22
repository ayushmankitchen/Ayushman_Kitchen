import React from "react";
import { act } from "react-dom/test-utils";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import AdminDashboard from "./AdminDashboard";
import * as AdminAuthContext from "@/context/AdminAuth";

jest.mock("@/context/AdminAuth", () => ({
  useAdminAuth: jest.fn(),
}));

jest.mock("@/lib/notifications", () => ({
  clearConversationNotifications: jest.fn(),
  enablePushNotifications: jest.fn().mockResolvedValue(true),
  onPushNotification: jest.fn(() => () => {}),
  pushSupported: jest.fn(() => false),
  sendTestNotification: jest.fn(),
  updateAppBadge: jest.fn(),
}));

jest.mock("@/lib/api", () => ({
  adminApi: {
    get: jest.fn().mockResolvedValue({ data: [] }),
    post: jest.fn().mockResolvedValue({ data: {} }),
    put: jest.fn().mockResolvedValue({ data: {} }),
    delete: jest.fn().mockResolvedValue({ data: {} }),
  },
  apiError: (e) => e?.message || "Error",
  money: (n) => `₹${n}`,
}));

describe("AdminDashboard", () => {
  let root;
  let container;

  beforeEach(() => {
    jest.clearAllMocks();
    global.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  test("renders AdminDashboard without error", async () => {
    AdminAuthContext.useAdminAuth.mockReturnValue({
      admin: { id: "admin-1", name: "Admin", email: "admin@test.com", business_name: "Ayushman Kitchen" },
      loading: false,
      logout: jest.fn(),
      setAdmin: jest.fn(),
    });

    await act(async () => {
      root.render(
        <BrowserRouter>
          <AdminDashboard />
        </BrowserRouter>
      );
    });

    expect(container.textContent).toContain("Ayushman Kitchen");
  });
});
