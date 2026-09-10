import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function deliveryLocationDraft(source = {}) {
  const latitude = source?.delivery_lat ?? null;
  const longitude = source?.delivery_lng ?? null;
  return { address: source?.delivery_address || "", latitude, longitude,
    saved: Number.isFinite(latitude) && Number.isFinite(longitude), replace_saved_location: false };
}

export default function SavedDeliveryLocation({ value, onChange, disabled = false }) {
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const latest = useRef(value);
  latest.current = value;
  useEffect(() => () => { generation.current += 1; }, []);

  const detect = () => {
    if (value.saved) return;
    setError("");
    if (!navigator.geolocation) return setError("This browser does not support location detection.");
    const request = ++generation.current;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      if (request !== generation.current) return;
      onChange({ ...latest.current, latitude: coords.latitude, longitude: coords.longitude, accuracy: Math.round(coords.accuracy || 0) });
      setLocating(false);
    }, e => {
      if (request !== generation.current) return;
      setError(e.code === 1 ? "Allow location access in your browser, then press Detect my location." : "Location could not be detected. Try again while at your room or PG.");
      setLocating(false);
    }, { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 });
  };
  const remove = () => {
    generation.current += 1;
    setLocating(false);
    setError("");
    onChange({ address: "", latitude: null, longitude: null, saved: false, replace_saved_location: true });
  };
  const hasPoint = Number.isFinite(value.latitude) && Number.isFinite(value.longitude);
  return <div className="space-y-3">
    <label className="block text-sm font-semibold text-slate-700">
      Hostel / PG, floor & room number
      <Input value={value.address} readOnly={value.saved} disabled={disabled} maxLength={500}
        onChange={e => onChange({ ...value, address: e.target.value })}
        placeholder="e.g. Shanti PG, 2nd floor, Room 204" className="mt-2 w-full rounded-xl" />
    </label>
    {hasPoint ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950">
      <p className="flex items-center gap-2 font-bold"><MapPin className="h-4 w-4" />{value.saved ? "Saved delivery location" : "Location detected — save to confirm"}</p>
      <p className="mt-1 text-xs">{value.saved ? "Used every day, even when you are away. It changes only when you replace it." : "Check your room / PG address before saving this location."}</p>
      <button type="button" disabled={disabled} onClick={remove} className="mt-3 text-xs font-bold underline underline-offset-2">Remove / change location</button>
    </div> : <>
      <Button type="button" onClick={detect} disabled={disabled || locating} className="w-full rounded-xl bg-teal-900 hover:bg-teal-800">
        {locating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <MapPin className="h-4 w-4 mr-2" />}
        {locating ? "Detecting location…" : "Detect my location"}
      </Button>
      <p className="text-xs text-slate-500">Press this while at your room or PG. Save once; you do not need to detect it daily.</p>
    </>}
    {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
    {value.replace_saved_location && <p className="text-xs text-amber-800">Your previous saved location is replaced only when you save the new one.</p>}
  </div>;
}
