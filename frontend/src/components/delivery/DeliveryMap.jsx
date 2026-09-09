import { MapPin, Navigation } from "lucide-react";

const clamp = (value) => Math.max(8, Math.min(92, value));

export default function DeliveryMap({ driver, stops = [], student }) {
  const points = [driver, student, ...stops].filter((point) => Number.isFinite(point?.lat) && Number.isFinite(point?.lng));
  const lats = points.map((point) => point.lat);
  const lngs = points.map((point) => point.lng);
  const minLat = lats.length ? Math.min(...lats) : 0;
  const maxLat = lats.length ? Math.max(...lats) : 0;
  const minLng = lngs.length ? Math.min(...lngs) : 0;
  const maxLng = lngs.length ? Math.max(...lngs) : 0;
  const latSpan = Math.max(maxLat - minLat, 0.001);
  const lngSpan = Math.max(maxLng - minLng, 0.001);
  const position = (point) => ({
    left: `${clamp(8 + ((point.lng - minLng) / lngSpan) * 84)}%`,
    top: `${clamp(92 - ((point.lat - minLat) / latSpan) * 84)}%`,
  });
  const center = driver || student || points[0];
  const mapUrl = center
    ? `https://www.openstreetmap.org/?mlat=${center.lat}&mlon=${center.lng}#map=17/${center.lat}/${center.lng}`
    : null;

  return (
    <div className="relative h-72 sm:h-80 overflow-hidden rounded-3xl border border-teal-900/10 bg-gradient-to-br from-emerald-50 via-stone-100 to-amber-50 shadow-inner">
      <div className="absolute inset-0 opacity-40" style={{ backgroundImage: "linear-gradient(#0f766e22 1px, transparent 1px), linear-gradient(90deg, #0f766e22 1px, transparent 1px)", backgroundSize: "34px 34px" }} />
      <div className="absolute left-0 right-0 top-[45%] h-3 rotate-[-7deg] bg-white/90 border-y border-stone-300" />
      <div className="absolute top-0 bottom-0 left-[58%] w-3 rotate-[12deg] bg-white/90 border-x border-stone-300" />

      {stops.filter((point) => Number.isFinite(point?.lat) && Number.isFinite(point?.lng)).map((point, index) => (
        <div key={point.id || index} className="absolute -translate-x-1/2 -translate-y-1/2 z-10 group" style={position(point)}>
          <div className={`h-8 w-8 rounded-full border-2 border-white shadow-lg flex items-center justify-center text-xs font-extrabold ${point.status === "DELIVERED" ? "bg-emerald-600 text-white" : "bg-amber-400 text-slate-950"}`}>
            {point.status === "DELIVERED" ? "✓" : index + 1}
          </div>
          <div className="hidden group-hover:block absolute left-1/2 -translate-x-1/2 top-9 min-w-36 rounded-xl bg-slate-950 px-3 py-2 text-[10px] text-white shadow-xl">
            <strong className="block">{point.title}</strong>{point.subtitle}
          </div>
        </div>
      ))}

      {student && Number.isFinite(student.lat) && Number.isFinite(student.lng) && (
        <div className="absolute -translate-x-1/2 -translate-y-1/2 z-20" style={position(student)} title="Your delivery location">
          <div className="h-10 w-10 rounded-full bg-rose-600 text-white border-2 border-white shadow-lg flex items-center justify-center"><MapPin className="h-5 w-5" /></div>
        </div>
      )}
      {driver && Number.isFinite(driver.lat) && Number.isFinite(driver.lng) && (
        <div className="absolute -translate-x-1/2 -translate-y-1/2 z-30" style={position(driver)} title="Live rider location">
          <span className="absolute inset-0 rounded-full bg-teal-500 animate-ping opacity-30" />
          <div className="relative h-11 w-11 rounded-full bg-teal-900 text-white border-2 border-white shadow-xl flex items-center justify-center text-xl">🛵</div>
        </div>
      )}

      <div className="absolute left-3 top-3 rounded-xl bg-white/90 px-3 py-2 text-[10px] font-bold text-slate-700 shadow-sm border border-white">
        Live route overview
      </div>
      {mapUrl && (
        <a href={mapUrl} target="_blank" rel="noreferrer" className="absolute right-3 bottom-3 inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-[11px] font-bold text-teal-900 shadow-md border border-stone-200">
          <Navigation className="h-3.5 w-3.5" /> Open street map
        </a>
      )}
    </div>
  );
}
