import React from "react";
import { act } from "react-dom/test-utils";
import { createRoot } from "react-dom/client";
import AttendanceCalendar from "./AttendanceCalendar";
import { adminApi, workerApi } from "../../lib/api";

jest.mock("../../lib/api", () => ({
  adminApi: {
    get: jest.fn(),
    post: jest.fn(),
  },
  workerApi: {
    get: jest.fn(),
    post: jest.fn(),
  },
  apiError: (e) => e?.message || "An error occurred",
}));

const mockCalendarData = {
  year: 2026,
  month: 8,
  days_in_month: 31,
  first_weekday: 5, // Saturday
  worker: {
    id: "w-1",
    name: "Ramesh Kumar",
    work_type: "Mason",
    login_id: "WF-7K4P92",
    joining_date: "2026-08-01",
  },
  summary: {
    present: 12,
    half_day: 2,
    absent: 1,
    not_marked: 0,
    eligible_days: 15,
    earned_units: 13.0,
    attendance_rate: 86.7,
  },
  days: [
    { date: "2026-08-01", day: 1, status: "Present", is_future: false, is_pre_joining: false, is_today: false },
    { date: "2026-08-02", day: 2, status: "Present", is_future: false, is_pre_joining: false, is_today: false },
    { date: "2026-08-03", day: 3, status: "Half Day", is_future: false, is_pre_joining: false, is_today: false },
    { date: "2026-08-04", day: 4, status: "Absent", is_future: false, is_pre_joining: false, is_today: false },
    { date: "2026-08-15", day: 15, status: "Present", is_future: false, is_pre_joining: false, is_today: true },
    { date: "2026-08-16", day: 16, status: null, is_future: true, is_pre_joining: false, is_today: false },
  ],
};

async function renderCalendar(props) {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const node = document.createElement("div");
  document.body.appendChild(node);
  const root = createRoot(node);
  await act(async () => {
    root.render(<AttendanceCalendar {...props} />);
  });
  return {
    node,
    root,
    cleanup: async () => {
      await act(async () => {
        root.unmount();
      });
      node.remove();
    },
  };
}

describe("AttendanceCalendar Component", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("fetches and renders calendar data for admin view", async () => {
    adminApi.get.mockResolvedValue({ data: mockCalendarData });

    const component = await renderCalendar({ workerId: "w-1", isAdmin: true });

    expect(adminApi.get).toHaveBeenCalledWith(
      "/workers/w-1/attendance/month",
      expect.objectContaining({ params: expect.objectContaining({ year: expect.any(Number), month: expect.any(Number) }) })
    );

    const title = component.node.querySelector('[data-testid="calendar-month-title"]');
    expect(title).not.toBeNull();

    const presentCount = component.node.querySelector('[data-testid="summary-present-count"]');
    expect(presentCount.textContent).toBe("12");

    const halfdayCount = component.node.querySelector('[data-testid="summary-halfday-count"]');
    expect(halfdayCount.textContent).toBe("2");

    const absentCount = component.node.querySelector('[data-testid="summary-absent-count"]');
    expect(absentCount.textContent).toBe("1");

    const rate = component.node.querySelector('[data-testid="summary-attendance-rate"]');
    expect(rate.textContent).toBe("86.7%");

    await component.cleanup();
  });

  test("fetches and renders calendar data for worker self view", async () => {
    workerApi.get.mockResolvedValue({ data: mockCalendarData });

    const component = await renderCalendar({ isAdmin: false });

    expect(workerApi.get).toHaveBeenCalledWith(
      "/worker/me/attendance/month",
      expect.objectContaining({ params: expect.objectContaining({ year: expect.any(Number), month: expect.any(Number) }) })
    );

    const summaryCards = component.node.querySelector('[data-testid="attendance-summary-cards"]');
    expect(summaryCards).not.toBeNull();

    await component.cleanup();
  });

  test("tapping a day reveals the day detail card popup", async () => {
    adminApi.get.mockResolvedValue({ data: mockCalendarData });

    const component = await renderCalendar({ workerId: "w-1", isAdmin: true });

    const dayBtn = component.node.querySelector('[data-testid="calendar-day-2026-08-01"]');
    expect(dayBtn).not.toBeNull();

    await act(async () => {
      dayBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const detailCard = component.node.querySelector('[data-testid="calendar-day-detail-card"]');
    expect(detailCard).not.toBeNull();
    expect(detailCard.textContent).toContain("2026-08-01");
    expect(detailCard.textContent).toContain("Present");

    await component.cleanup();
  });

  test("displays error state with retry button on network error", async () => {
    adminApi.get.mockRejectedValueOnce(new Error("Network Failure"));

    const component = await renderCalendar({ workerId: "w-1", isAdmin: true });

    const retryBtn = component.node.querySelector('[data-testid="calendar-retry-btn"]');
    expect(retryBtn).not.toBeNull();

    adminApi.get.mockResolvedValueOnce({ data: mockCalendarData });
    await act(async () => {
      retryBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const summaryCards = component.node.querySelector('[data-testid="attendance-summary-cards"]');
    expect(summaryCards).not.toBeNull();

    await component.cleanup();
  });
});
