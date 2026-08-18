import { downloadSalarySlipPdf } from "./salarySlip";
import { adminApi, workerApi } from "./api";
import { toast } from "sonner";

jest.mock("./api", () => ({
  adminApi: {
    get: jest.fn(),
  },
  workerApi: {
    get: jest.fn(),
  },
  apiError: (e) => e?.message || "An error occurred",
}));

jest.mock("sonner", () => ({
  toast: {
    loading: jest.fn(() => "toast-id"),
    dismiss: jest.fn(),
    success: jest.fn(),
    error: jest.fn(),
  },
}));

describe("salarySlip download helper", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.URL.createObjectURL = jest.fn(() => "blob:http://localhost/mock-url");
    global.URL.revokeObjectURL = jest.fn();
  });

  test("admin download creates blob url and triggers link download", async () => {
    const mockBlob = new Blob(["%PDF-mock"], { type: "application/pdf" });
    adminApi.get.mockResolvedValueOnce({
      data: mockBlob,
      headers: {
        "content-disposition": 'attachment; filename="WorkForce_Salary_Slip_Ramesh_August_2026.pdf"',
      },
    });

    const success = await downloadSalarySlipPdf({
      workerId: "w-1",
      workerName: "Ramesh Kumar",
      year: 2026,
      month: 8,
      isAdmin: true,
    });

    expect(success).toBe(true);
    expect(adminApi.get).toHaveBeenCalledWith(
      "/workers/w-1/salary-slip",
      expect.objectContaining({ params: { year: 2026, month: 8 }, responseType: "blob" })
    );
    expect(toast.success).toHaveBeenCalled();
  });

  test("worker self download calls workerApi and downloads PDF", async () => {
    const mockBlob = new Blob(["%PDF-mock"], { type: "application/pdf" });
    workerApi.get.mockResolvedValueOnce({
      data: mockBlob,
      headers: {},
    });

    const success = await downloadSalarySlipPdf({
      workerName: "Amit Singh",
      year: 2026,
      month: 8,
      isAdmin: false,
    });

    expect(success).toBe(true);
    expect(workerApi.get).toHaveBeenCalledWith(
      "/worker/me/salary-slip",
      expect.objectContaining({ params: { year: 2026, month: 8 }, responseType: "blob" })
    );
    expect(toast.success).toHaveBeenCalled();
  });

  test("handles API errors gracefully and displays error toast", async () => {
    adminApi.get.mockRejectedValueOnce(new Error("Network Error"));

    const success = await downloadSalarySlipPdf({
      workerId: "w-1",
      workerName: "Ramesh Kumar",
      year: 2026,
      month: 8,
      isAdmin: true,
    });

    expect(success).toBe(false);
    expect(toast.error).toHaveBeenCalled();
  });
});
