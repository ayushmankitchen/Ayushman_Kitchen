import { adminApi, workerApi, apiError } from "./api";
import { toast } from "sonner";

export async function downloadStudentMealPdf({
  workerId,
  studentName = "Student",
  month, // format: "YYYY-MM"
  isAdmin = true,
}) {
  const loadingToast = toast.loading("Generating Student Meal Statement PDF...");
  try {
    let res;
    if (isAdmin) {
      res = await adminApi.get(`/admin/workers/${workerId}/meal-pdf`, {
        params: { month },
        responseType: "blob",
      });
    } else {
      res = await workerApi.get("/worker/me/meal-pdf", {
        params: { month },
        responseType: "blob",
      });
    }

    // Extract filename from header or create a default
    let filename = `Meal_Statement_${studentName.replace(/\s+/g, "_")}_${month || "current"}.pdf`;
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
    toast.success("Meal Statement PDF Downloaded");
    return true;
  } catch (err) {
    toast.dismiss(loadingToast);
    let errMsg = "Student meal statement could not be generated.";
    if (err.response?.data instanceof Blob) {
      try {
        const text = await err.response.data.text();
        const json = JSON.parse(text);
        if (json.detail) errMsg = json.detail;
      } catch {}
    } else {
      errMsg = apiError(err);
    }
    toast.error(errMsg);
    return false;
  }
}
