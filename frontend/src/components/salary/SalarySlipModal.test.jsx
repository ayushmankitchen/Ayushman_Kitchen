import React from "react";
import { act } from "react-dom/test-utils";
import { createRoot } from "react-dom/client";
import SalarySlipModal from "./SalarySlipModal";
import * as salarySlipLib from "../../lib/salarySlip";

jest.mock("../../lib/salarySlip", () => ({ downloadSalarySlipPdf: jest.fn() }));

const mockWorker = { id: "w-1", name: "Ramesh Kumar", login_id: "WF-7K4P92", work_type: "Mason", salary: 20000 };

async function renderModal(props) {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const node = document.createElement("div");
  document.body.appendChild(node);
  const root = createRoot(node);
  await act(async () => root.render(<SalarySlipModal {...props} />));
  return { node, cleanup: async () => { await act(async () => root.unmount()); node.remove(); } };
}

describe("SalarySlipModal Component", () => {
  beforeEach(() => jest.clearAllMocks());

  test("renders modal when open is true", async () => {
    const component = await renderModal({ open: true, onClose: jest.fn(), worker: mockWorker, isAdmin: true });
    const content = component.node.querySelector('[data-testid="salary-slip-modal-content"]');
    expect(content).not.toBeNull();
    expect(content.textContent).toContain("");
    expect(content.textContent).toContain("Ramesh Kumar");
    expect(content.textContent).toContain("WF-7K4P92");
    await component.cleanup();
  });

  test("allows selecting month and triggers PDF download", async () => {
    salarySlipLib.downloadSalarySlipPdf.mockResolvedValue(true);
    const onClose = jest.fn();
    const component = await renderModal({ open: true, onClose, worker: mockWorker, isAdmin: true });
    const monthSelect = component.node.querySelector('[data-testid="salary-slip-month-select"]');
    await act(async () => { monthSelect.value = "8"; monthSelect.dispatchEvent(new Event("change", { bubbles: true })); });
    const downloadBtn = component.node.querySelector('[data-testid="confirm-download-salary-slip-btn"]');
    await act(async () => downloadBtn.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(salarySlipLib.downloadSalarySlipPdf).toHaveBeenCalledWith(expect.objectContaining({ workerId: "w-1", workerName: "Ramesh Kumar", month: 8, isAdmin: true }));
    expect(onClose).toHaveBeenCalled();
    await component.cleanup();
  });

  test("does not render when closed or when no worker target exists", async () => {
    const closed = await renderModal({ open: false, onClose: jest.fn(), worker: mockWorker });
    expect(closed.node.querySelector('[data-testid="salary-slip-modal-content"]')).toBeNull();
    await closed.cleanup();
    const empty = await renderModal({ open: true, onClose: jest.fn(), worker: null, workerId: undefined, isAdmin: true });
    expect(empty.node.querySelector('[data-testid="salary-slip-modal-content"]')).toBeNull();
    await empty.cleanup();
  });
});
