import { useEffect, useState } from "react";
import { Download } from "lucide-react";

export default function InstallWorkforceApp() {
  const [prompt, setPrompt] = useState(null);
  const [installed, setInstalled] = useState(() => window.matchMedia?.("(display-mode: standalone)").matches);
  useEffect(() => {
    const ready = (event) => { event.preventDefault(); setPrompt(event); };
    const installedHandler = () => { setInstalled(true); setPrompt(null); };
    window.addEventListener("beforeinstallprompt", ready);
    window.addEventListener("appinstalled", installedHandler);
    return () => { window.removeEventListener("beforeinstallprompt", ready); window.removeEventListener("appinstalled", installedHandler); };
  }, []);
  if (installed) return null;
  return <button type="button" onClick={async () => { if (prompt) { await prompt.prompt(); setPrompt(null); } else { window.alert("Use your browser menu and choose ‘Add to Home Screen’ or ‘Install App’."); } }} className="fixed bottom-4 right-4 z-50 max-w-[calc(100vw-2rem)] rounded-2xl bg-teal-800 px-4 py-3 text-sm font-bold text-white shadow-xl flex items-center gap-2 hover:bg-teal-900">
    <Download className="h-4 w-4" /> Install Ayushman Kitchen App</button>;
}
