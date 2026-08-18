import { adminApi, workerApi, apiError } from "./api";
import { toast } from "sonner";

export async function downloadSalarySlipPdf({
  workerId,
  workerName = "Worker",
  year,
  month,
  isAdmin = false,
}) {
  const loadingToast = toast.loading("Generating Salary Slip PDF...");
  try {
    let res;
    if (isAdmin) {
      res = await adminApi.get(`/workers/${workerId}/salary-slip`, {
        params: { year, month },
        responseType: "blob",
      });
    } else {
      res = await workerApi.get("/worker/me/salary-slip", {
        params: { year, month },
        responseType: "blob",
      });
    }

    // Try to extract filename from content-disposition header if available
    let filename = `WorkForce_Salary_Slip_${workerName.replace(/\s+/g, "_")}_${month}_${year}.pdf`;
    const disposition = res.headers?.["content-disposition"] || res.headers?.["Content-Disposition"];
    if (disposition && disposition.includes("filename=")) {
      const match = disposition.match(/filename="?([^"]+)"?/);
      if (match && match[1]) filename = match[1];
    }

    const blob = new Blob([res.data], { type: "application/pdf" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => window.URL.revokeObjectURL(url), 10000);

    toast.dismiss(loadingToast);
    toast.success("Salary Slip Downloaded");
    return true;
  } catch (err) {
    toast.dismiss(loadingToast);
    let errMsg = "Salary slip could not be generated. Please try again.";
    if (err.response?.data instanceof Blob) {
      try {
        const text = await err.response.data.text();
        const json = JSON.parse(text);
        if (json.detail) errMsg = json.detail;
      } catch {
        // use fallback message
      }
    } else {
      errMsg = apiError(err);
    }
    toast.error(errMsg);
    return false;
  }
}
