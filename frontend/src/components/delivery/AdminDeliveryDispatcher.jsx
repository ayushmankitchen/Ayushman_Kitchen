import { useCallback, useEffect, useRef, useState } from "react";
import { Bike, CheckCircle2, Loader2, MapPin, Navigation, Phone, Radio, RefreshCw, Square } from "lucide-react";
import { toast } from "sonner";
import { adminApi, apiError } from "@/lib/api";
import { startVisiblePolling } from "@/lib/polling";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import DeliveryMap from "./DeliveryMap";

export default function AdminDeliveryDispatcher() {
  const [mealSlot, setMealSlot] = useState("lunch");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [broadcasting, setBroadcasting] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [driver, setDriver] = useState({ name: "Kitchen Delivery Team", phone: "" });
  const watchRef = useRef(null);
  const lastSentRef = useRef(0);
  const requestRef = useRef(0);
  const gpsGenerationRef = useRef(0);

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    try {
      const { data: session } = await adminApi.get("/delivery/admin/session", { params: { meal_slot: mealSlot } });
      if (request !== requestRef.current) return;
      setData(session);
      if (session.session_id) setDriver({ name: session.driver_name, phone: session.driver_phone || "" });
    } catch (error) {
      if (request === requestRef.current) toast.error(apiError(error));
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, [mealSlot]);

  useEffect(() => {
    setLoading(true);
    load();
    const stopPolling = startVisiblePolling(load, data?.is_active ? 5000 : 15000);
    return () => { stopPolling(); requestRef.current += 1; };
  }, [load, data?.is_active]);

  useEffect(() => () => {
    gpsGenerationRef.current += 1;
    if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
  }, []);

  const currentPosition = () => new Promise((resolve) => {
    if (!navigator.geolocation) return resolve({});
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ current_lat: coords.latitude, current_lng: coords.longitude }),
      () => resolve({}),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 },
    );
  });

  const startRun = async () => {
    setWorking(true);
    try {
      const coordinates = await currentPosition();
      const response = await adminApi.post("/delivery/admin/session/start", {
        meal_slot: mealSlot, driver_name: driver.name.trim() || "Kitchen Delivery Team",
        driver_phone: driver.phone.trim(), ...coordinates,
      });
      setData(response.data);
      if (watchRef.current === null) toggleGps();
      toast.success(`${mealSlot === "lunch" ? "Lunch" : "Dinner"} delivery started for ${response.data.total_stops} order(s)`);
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setWorking(false);
    }
  };

  const stopGps = () => {
    gpsGenerationRef.current += 1;
    if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
    watchRef.current = null;
    setBroadcasting(false);
  };

  const stopRun = async () => {
    setWorking(true);
    try {
      await adminApi.post("/delivery/admin/session/stop", null, { params: { meal_slot: mealSlot } });
      stopGps();
      toast.success("Delivery run completed");
      await load();
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setWorking(false);
    }
  };

  const toggleGps = () => {
    if (broadcasting) {
      stopGps();
      toast.info("GPS sharing paused");
      return;
    }
    if (!navigator.geolocation) return toast.error("This browser does not support GPS");
    const generation = ++gpsGenerationRef.current;
    lastSentRef.current = 0;
    watchRef.current = navigator.geolocation.watchPosition(async ({ coords }) => {
      if (generation !== gpsGenerationRef.current) return;
      if (Date.now() - lastSentRef.current < 5000) return;
      lastSentRef.current = Date.now();
      try {
        await adminApi.post("/delivery/admin/session/location", { latitude: coords.latitude, longitude: coords.longitude }, { params: { meal_slot: mealSlot } });
        if (generation === gpsGenerationRef.current) await load();
      } catch (error) {
        if (generation !== gpsGenerationRef.current) return;
        stopGps();
        toast.error(apiError(error));
      }
    }, (error) => {
      if (generation !== gpsGenerationRef.current) return;
      stopGps();
      toast.error(`GPS unavailable: ${error.message}`);
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 });
    setBroadcasting(true);
    toast.success("Live rider GPS sharing started");
  };

  const markDelivered = async (stop) => {
    setCompleting(true);
    requestRef.current += 1;
    try {
      await adminApi.post(`/delivery/admin/orders/${stop.selection_id}/deliver`);
      toast.success(`${stop.student_name}'s meal marked delivered`);
      await load();
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setCompleting(false);
    }
  };

  const mapStops = (data?.stops || []).map((stop) => ({ id: stop.selection_id, lat: stop.delivery_lat, lng: stop.delivery_lng, title: stop.student_name, subtitle: stop.delivery_address, status: stop.delivery_status }));
  const driverPoint = Number.isFinite(data?.current_lat) && Number.isFinite(data?.current_lng) ? { lat: data.current_lat, lng: data.current_lng } : null;
  const nextStop = data?.next_stop;

  return (
    <section className="space-y-5" data-testid="delivery-dispatcher">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div><span className="text-[10px] font-extrabold tracking-[.2em] text-teal-700">LIVE DELIVERY</span><h1 className="font-display text-2xl sm:text-3xl font-extrabold text-slate-950">Route Dispatcher</h1><p className="text-sm text-slate-500 mt-1">Start a run, share the rider's live GPS and confirm every room delivery.</p></div>
        <div className="flex rounded-2xl bg-white border border-stone-200 p-1 shadow-sm">
          {["lunch", "dinner"].map((slot) => <button key={slot} disabled={working || completing} onClick={() => { if (slot === mealSlot) return; stopGps(); requestRef.current += 1; setData(null); setLoading(true); setMealSlot(slot); }} className={`px-5 py-2.5 rounded-xl text-xs font-extrabold capitalize ${mealSlot === slot ? "bg-amber-400 text-slate-950" : "text-slate-600"}`}>{slot === "lunch" ? "☀️" : "🌙"} {slot}</button>)}
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        {[{ label: "Delivery orders", value: data?.total_stops || 0, icon: Bike }, { label: "Stops remaining", value: data?.pending_stops || 0, icon: Navigation }, { label: "Delivered", value: data?.delivered_stops || 0, icon: CheckCircle2 }].map((item) => <div key={item.label} className="rounded-2xl bg-white border border-stone-200 p-4 flex items-center gap-3 shadow-sm"><div className="h-10 w-10 rounded-xl bg-teal-50 text-teal-800 flex items-center justify-center"><item.icon className="h-5 w-5" /></div><div><div className="text-2xl font-extrabold text-slate-950">{item.value}</div><div className="text-[11px] font-bold text-slate-500">{item.label}</div></div></div>)}
      </div>

      <div className="rounded-3xl bg-white border border-stone-200 p-4 sm:p-5 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row gap-3"><Input value={driver.name} onChange={(e) => setDriver({ ...driver, name: e.target.value })} placeholder="Rider name" className="rounded-xl" /><Input value={driver.phone} onChange={(e) => setDriver({ ...driver, phone: e.target.value })} placeholder="Rider phone" className="rounded-xl" /></div>
        <div className="flex flex-wrap gap-2">
          {!data?.is_active ? <Button onClick={startRun} disabled={working || loading || !data?.total_stops} className="rounded-xl bg-teal-900 hover:bg-teal-800"><Bike className="h-4 w-4 mr-2" />{working ? "Starting…" : "Start delivery run"}</Button> : <><Button onClick={toggleGps} className={`rounded-xl ${broadcasting ? "bg-emerald-600 hover:bg-emerald-700" : "bg-teal-900 hover:bg-teal-800"}`}><Radio className="h-4 w-4 mr-2" />{broadcasting ? "GPS sharing ON" : "Share live GPS"}</Button><Button variant="outline" onClick={stopRun} disabled={working} className="rounded-xl"><Square className="h-4 w-4 mr-2" />End run</Button></>}
          <Button variant="outline" onClick={load} className="rounded-xl"><RefreshCw className="h-4 w-4 mr-2" />Refresh</Button>
        </div>
        {!data?.total_stops && !loading && <p className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">No students selected Room Delivery for today's {mealSlot}.</p>}
      </div>

      {data?.is_active && (
        <div className="rounded-3xl bg-teal-950 text-white p-5 sm:p-6 space-y-3" aria-live="polite" data-testid="next-delivery">
          <p className="text-xs font-bold uppercase tracking-widest text-amber-300">Next delivery</p>
          {nextStop ? <>
            <h2 className="text-2xl font-extrabold">{nextStop.student_name}</h2>
            <p className="font-semibold">{nextStop.delivery_address}</p>
            <p className="text-sm text-teal-100">{nextStop.option_name} · {Math.round(nextStop.distance_meters)} m straight-line distance</p>
            {nextStop.delivery_notes && <p className="text-sm">{nextStop.delivery_notes}</p>}
            <div className="flex flex-wrap gap-3">
              {nextStop.student_phone && <a href={`tel:${nextStop.student_phone}`} className="rounded-xl border border-teal-600 px-4 py-2 text-sm">Call student</a>}
              <a href={`https://www.openstreetmap.org/?mlat=${nextStop.delivery_lat}&mlon=${nextStop.delivery_lng}#map=18/${nextStop.delivery_lat}/${nextStop.delivery_lng}`} target="_blank" rel="noreferrer" className="rounded-xl border border-teal-600 px-4 py-2 text-sm">Open location</a>
              <Button disabled={completing || nextStop.delivery_status !== "OUT_FOR_DELIVERY"} onClick={() => markDelivered(nextStop)} className="rounded-xl bg-emerald-600 hover:bg-emerald-700">{completing ? "Confirming…" : "Delivered — next student"}</Button>
            </div>
            <p className="text-xs text-teal-200">Nearest pending GPS location. When you or the student confirms receipt, the next pending stop appears.</p>
          </> : <p>{data.pending_stops === 0 ? "All deliveries completed!" : "Waiting for rider and student GPS locations. Orders without GPS remain in the list below."}</p>}
          {!broadcasting && data.pending_stops > 0 && <p className="text-xs text-amber-200">Share live GPS to update the next stop as you move. Keep this page open during delivery.</p>}
        </div>
      )}

      <DeliveryMap driver={driverPoint} stops={mapStops.filter(stop => stop.status !== "DELIVERED")} />

      <div className="rounded-3xl bg-white border border-stone-200 overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-stone-200 font-display font-bold">Delivery stops</div>
        <div className="divide-y divide-stone-100">
          {(data?.stops || []).map((stop, index) => <div key={stop.selection_id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between"><div className="flex gap-3 min-w-0"><div className="h-9 w-9 rounded-full bg-amber-100 text-amber-900 flex items-center justify-center font-extrabold shrink-0">{index + 1}</div><div className="min-w-0"><strong className="text-sm text-slate-950 block truncate">{stop.student_name} · {stop.option_name}</strong><span className="text-xs text-slate-500 flex items-center gap-1"><MapPin className="h-3 w-3" />{stop.delivery_address || "Location not saved"}</span>{stop.student_phone && <span className="text-[11px] text-slate-400 flex items-center gap-1"><Phone className="h-3 w-3" />{stop.student_phone}</span>}</div></div>{stop.delivery_status === "DELIVERED" ? <span className="text-xs font-bold text-emerald-700">✓ Delivered</span> : <Button size="sm" disabled={completing || stop.delivery_status !== "OUT_FOR_DELIVERY"} onClick={() => markDelivered(stop)} className="rounded-xl bg-emerald-600 hover:bg-emerald-700">Mark delivered</Button>}</div>)}
          {loading && <div className="p-8 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-teal-800" /></div>}
        </div>
      </div>
    </section>
  );
}
