import React, { useState, useRef, useEffect } from "react";
import { Play, Pause, Volume2, AlertCircle } from "lucide-react";
import { API } from "@/lib/api";

export default function AudioPlayer({ audioUrl, duration, own = false }) {
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(duration || 0);
  const [error, setError] = useState(false);
  const audioRef = useRef(null);

  // Construct full stream URL
  const safeAudioUrl = String(audioUrl || "");
  const src = safeAudioUrl.startsWith("http")
    ? safeAudioUrl
    : `${API.replace(/\/api$/, "")}${safeAudioUrl.startsWith("/") ? "" : "/"}${safeAudioUrl}`;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration)) {
        setAudioDuration(audio.duration);
      }
    };
    const onEnded = () => {
      setPlaying(false);
      setCurrentTime(0);
    };
    const onError = () => setError(true);

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
    };
  }, []);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      audioRef.current.play().then(() => setPlaying(true)).catch(() => setError(true));
    }
  };

  const handleSeek = (e) => {
    if (!audioRef.current || !audioDuration) return;
    const seekTime = (parseFloat(e.target.value) / 100) * audioDuration;
    audioRef.current.currentTime = seekTime;
    setCurrentTime(seekTime);
  };

  const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const progressPercent = audioDuration > 0 ? (currentTime / audioDuration) * 100 : 0;

  if (error) {
    return (
      <div className="flex items-center gap-2 text-xs text-rose-600 bg-rose-50 px-3 py-2 rounded-xl">
        <AlertCircle className="h-4 w-4" /> Audio unavailable
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-3 rounded-2xl px-3 py-2 shadow-sm w-[min(78vw,300px)] min-w-0 ${own ? "bg-teal-800 border border-teal-800 text-white" : "bg-white/90 border border-slate-200"}`}>
      <audio ref={audioRef} src={src} preload="metadata" crossOrigin="use-credentials" />
      <button
        type="button"
        aria-label={playing ? "Pause voice message" : "Play voice message"}
        onClick={togglePlay}
        className="h-9 w-9 rounded-full bg-teal-800 hover:bg-teal-900 text-white flex items-center justify-center shrink-0 shadow-md active:scale-95 transition-transform"
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
      </button>

      <div className="flex-1 min-w-0">
        <div className="relative flex items-center h-4">
          <input
            type="range"
            min="0"
            max="100"
            value={progressPercent || 0}
            onChange={handleSeek}
            className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-teal-800"
          />
        </div>
        <div className={`flex justify-between text-[11px] font-mono mt-0.5 ${own ? "text-teal-100" : "text-slate-500"}`}>
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(audioDuration)}</span>
        </div>
      </div>
    </div>
  );
}
