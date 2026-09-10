import { useCallback, useEffect, useRef, useState } from "react";
import { Bike, CheckCircle2, Clock, Loader2, MapPin, Navigation, Phone, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { workerApi, apiError } from "@/lib/api";
import { startVisiblePolling } from "@/lib/polling";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import DeliveryMap from "./DeliveryMap";

const STEPS = ["CONFIRMED", "PREPARING", "OUT_FOR_DELIVERY", "DELIVERED"];

export default function StudentDeliveryTracker({ worker }) {
  const [mealSlot, setMealSlot] = useState("lunch");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [locating, setLocating] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const requestRef = useRef(0);
  const [address, setAddress] = useState(worker?.delivery_address || "");

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    try {
      const response = await workerApi.get("/delivery/track/student", { params: { meal_slot: mealSlot } });
      if (request !== requestRef.current) return;
      setData(response.data);
      if (response.data.delivery_address) setAddress(response.data.delivery_address);
    } catch (error) {
      if (request === requestRef.current) toast.error(apiError(error));
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, [mealSlot]);

  useEffect(() => {
    setLoading(true);
    load();
    const stopPolling = startVisiblePolling(load, data?.is_out_for_delivery ? 10000 : 30000);
    return () => { stopPolling(); requestRef.current += 1; };
  }, [load, data?.is_out_for_delivery]);

  const confirmReceipt = async () => {
    if (!data?.can_confirm_receipt || !data?.selection_id) return;
    setConfirming(true);
    requestRef.current += 1;
    try {
      await workerApi.post(`/delivery/student/orders/${data.selection_id}/receive`);
      setData(current => ({ ...current, delivery_status: "DELIVERED", can_confirm_receipt: false, is_out_for_delivery: false }));
      toast.success("Meal received. Thank you! The kitchen has been updated.");
      await load();
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setConfirming(false);
    }
  };

  const saveLocation = () => {
    if (!address.trim()) return toast.error("Enter hostel and room number first");
    if (!navigator.geolocation) return toast.error("This browser does not support GPS");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(async ({ coords }) => {
      try {
        await workerApi.post("/delivery/student/location", { latitude: coords.latitude, longitude: coords.longitude, address: address.trim() });
        toast.success("Delivery location saved");
        await load();
      } catch (error) {
        toast.error(apiError(error));
      } finally {
        setLocating(false);
      }
    }, (error) => { setLocating(false); toast.error(`GPS unavailable: ${error.message}`); }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 });
  };

  const currentStep = Math.max(0, STEPS.indexOf(data?.delivery_status));
  const driver = Number.isFinite(data?.driver_lat) && Number.isFinite(data?.driver_lng) ? { lat: data.driver_lat, lng: data.driver_lng } : null;
  const student = Number.isFinite(data?.student_lat) && Number.isFinite(data?.student_lng) ? { lat: data.student_lat, lng: data.student_lng } : null;

  return (
    <section className="space-y-5" data-testid="student-delivery-tracker">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4"><div><span className="text-[10px] font-extrabold tracking-[.2em] text-teal-700">LIVE TRACKER</span><h1 className="font-display text-2xl font-extrabold text-slate-950">Meal Delivery</h1><p className="text-sm text-slate-500 mt-1">Track your rider and receive an arrival update.</p></div><div className="flex rounded-2xl bg-white border border-stone-200 p-1">{["lunch", "dinner"].map((slot) => <button key={slot} disabled={confirming || locating} onClick={() => { if (slot === mealSlot) return; requestRef.current += 1; setData(null); setLoading(true); setMealSlot(slot); }} className={`px-4 py-2 rounded-xl text-xs font-extrabold capitalize ${mealSlot === slot ? "bg-amber-400" : "text-slate-600"}`}>{slot === "lunch" ? "☀️" : "🌙"} {slot}</button>)}</div></div>

      {!loading && !data?.has_delivery_order && <div className="rounded-3xl bg-white border border-stone-200 p-7 text-center shadow-sm"><Bike className="h-10 w-10 text-amber-500 mx-auto" /><h2 className="font-display font-bold mt-3">No room delivery selected</h2><p className="text-sm text-slate-500 mt-1">Choose Delivery in today's meal selection before cutoff to enable live tracking.</p></div>}

      {data?.has_delivery_order && <>
        {data.can_confirm_receipt && <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 space-y-3">
          <h2 className="font-bold text-emerald-950">Has your meal arrived?</h2>
          <p className="text-sm text-emerald-900">Confirm only after receiving your meal. Your delivery will be completed and the rider can move to the next student.</p>
          <Button onClick={confirmReceipt} disabled={confirming} className="rounded-xl bg-emerald-700 hover:bg-emerald-800"><CheckCircle2 className="h-4 w-4 mr-2" />{confirming ? "Confirming…" : "OK — meal received"}</Button>
        </div>}
        <div className="rounded-3xl bg-[#102f2c] text-white p-5 shadow-md"><div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"><div><div className="text-[10px] font-extrabold tracking-widest text-teal-300">{mealSlot.toUpperCase()} · {data.option_name}</div><h2 className="font-display text-xl font-extrabold mt-1">{data.delivery_status === "DELIVERED" ? "🎉 Meal delivered" : data.is_out_for_delivery ? "🛵 Rider is on the way" : "🍱 Order confirmed"}</h2><p className="text-xs text-teal-200 mt-1">{data.delivery_address}</p></div>{data.is_out_for_delivery && <div className="rounded-2xl bg-white/10 px-4 py-3"><strong className="text-lg block">~{data.eta_minutes || "—"} min</strong><span className="text-[10px] text-teal-200">{data.distance_meters ? `${Math.round(data.distance_meters)} m away` : "Live location updating"}</span></div>}</div></div>

        <div className="rounded-3xl bg-white border border-stone-200 p-4 shadow-sm overflow-x-auto"><div className="min-w-[560px] flex items-start">{STEPS.map((step, index) => <div key={step} className="flex items-start flex-1 last:flex-none"><div className="text-center w-28"><div className={`h-9 w-9 rounded-full mx-auto flex items-center justify-center font-extrabold text-xs ${index <= currentStep ? "bg-emerald-600 text-white" : "bg-stone-200 text-stone-500"}`}>{index < currentStep || data.delivery_status === "DELIVERED" ? "✓" : index + 1}</div><div className="text-[10px] font-bold mt-2">{step.replaceAll("_", " ")}</div></div>{index < STEPS.length - 1 && <div className={`h-1 flex-1 mt-4 rounded ${index < currentStep ? "bg-emerald-500" : "bg-stone-200"}`} />}</div>)}</div></div>

        <DeliveryMap driver={driver} student={student} />

        <div className="grid md:grid-cols-2 gap-4"><div className="rounded-3xl bg-white border border-stone-200 p-5 shadow-sm space-y-3"><h3 className="font-display font-bold flex items-center gap-2"><MapPin className="h-4 w-4 text-rose-600" />Your delivery location</h3><Input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Hostel, floor and room number" className="rounded-xl" /><Button onClick={saveLocation} disabled={locating} className="w-full rounded-xl bg-teal-900 hover:bg-teal-800">{locating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Navigation className="h-4 w-4 mr-2" />}Detect GPS & save</Button></div><div className="rounded-3xl bg-white border border-stone-200 p-5 shadow-sm"><h3 className="font-display font-bold flex items-center gap-2"><Bike className="h-4 w-4 text-teal-700" />Rider details</h3>{data.driver_name ? <div className="mt-3 space-y-2 text-sm"><p className="font-bold">{data.driver_name}</p>{data.driver_phone && <a href={`tel:${data.driver_phone}`} className="inline-flex items-center gap-2 text-teal-800 font-semibold"><Phone className="h-4 w-4" />{data.driver_phone}</a>}<p className="text-xs text-slate-500 flex items-center gap-1"><Clock className="h-3 w-3" />Location refreshes while the delivery run is active.</p></div> : <p className="text-sm text-slate-500 mt-3">Rider details appear when kitchen dispatches the meal.</p>}</div></div>
        <Button variant="outline" onClick={load} className="rounded-xl"><RefreshCw className="h-4 w-4 mr-2" />Refresh status</Button>
      </>}
    </section>
  );
}
