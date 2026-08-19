import React, { useState, useRef, useEffect, useCallback } from "react";
import { Play, Pause, Loader2, Volume2, AlertCircle } from "lucide-react";
import { API, adminApi, workerApi } from "@/lib/api";

// Active playing audio listener to allow single playback at a time
let activeAudioElement = null;

export default function AudioPlayer({ audioUrl, duration = 0, own = false }) {
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(duration || 0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [blobSrc, setBlobSrc] = useState(null);

  const audioRef = useRef(null);

  // Compute clean endpoint URL
  const safeAudioUrl = String(audioUrl || "");
  let rawSrc = "";
  if (safeAudioUrl.startsWith("http://") || safeAudioUrl.startsWith("https://") || safeAudioUrl.startsWith("blob:")) {
    rawSrc = safeAudioUrl;
  } else if (safeAudioUrl.startsWith("/api/")) {
    rawSrc = `${API.replace(/\/api$/, "")}${safeAudioUrl}`;
  } else if (safeAudioUrl.startsWith("/")) {
    rawSrc = `${API}${safeAudioUrl}`;
  } else if (safeAudioUrl) {
    rawSrc = `${API}/${safeAudioUrl}`;
  }

  const effectiveSrc = blobSrc || rawSrc;

  // Clean up blob URL on unmount
  useEffect(() => {
    return () => {
      if (blobSrc && blobSrc.startsWith("blob:")) {
        URL.revokeObjectURL(blobSrc);
      }
    };
  }, [blobSrc]);

  // Handle media event listeners
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
        setAudioDuration(audio.duration);
      }
    };
    const onDurationChange = () => {
      if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
        setAudioDuration(audio.duration);
      }
    };
    const onEnded = () => {
      setPlaying(false);
      setCurrentTime(0);
    };
    const onPause = () => setPlaying(false);
    const onPlay = () => setPlaying(true);
    const onError = async () => {
      // If direct src failed and we haven't tried blob fetch yet, fetch blob via authenticated API
      if (!blobSrc && rawSrc) {
        try {
          setLoading(true);
          const relativePath = safeAudioUrl.startsWith("/api/")
            ? safeAudioUrl.replace(/^\/api/, "")
            : safeAudioUrl.startsWith("/")
            ? safeAudioUrl
            : `/${safeAudioUrl}`;

          // Try admin or worker api
          const res = await (adminApi.get(relativePath, { responseType: "blob" }).catch(() =>
            workerApi.get(relativePath, { responseType: "blob" })
          ));
          if (res?.data) {
            const url = URL.createObjectURL(res.data);
            setBlobSrc(url);
            setError(false);
            return;
          }
        } catch {
          setError(true);
        } finally {
          setLoading(false);
        }
      }
      setError(true);
      setPlaying(false);
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("durationchange", onDurationChange);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("error", onError);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("durationchange", onDurationChange);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("error", onError);
    };
  }, [blobSrc, rawSrc, safeAudioUrl]);

  const togglePlay = async (e) => {
    e?.stopPropagation();
    if (!audioRef.current || !effectiveSrc) return;

    if (playing) {
      audioRef.current.pause();
    } else {
      // Pause any other playing voice note
      if (activeAudioElement && activeAudioElement !== audioRef.current) {
        try {
          activeAudioElement.pause();
        } catch {}
      }
      activeAudioElement = audioRef.current;

      try {
        setLoading(true);
        await audioRef.current.play();
        setPlaying(true);
        setError(false);
      } catch (err) {
        // Fallback: load as authenticated blob if direct stream was rejected
        if (!blobSrc && rawSrc) {
          try {
            const relativePath = safeAudioUrl.startsWith("/api/")
              ? safeAudioUrl.replace(/^\/api/, "")
              : safeAudioUrl.startsWith("/")
              ? safeAudioUrl
              : `/${safeAudioUrl}`;

            const res = await (adminApi.get(relativePath, { responseType: "blob" }).catch(() =>
              workerApi.get(relativePath, { responseType: "blob" })
            ));
            if (res?.data) {
              const url = URL.createObjectURL(res.data);
              setBlobSrc(url);
              setTimeout(() => {
                if (audioRef.current) {
                  audioRef.current.play().then(() => setPlaying(true)).catch(() => setError(true));
                }
              }, 50);
              return;
            }
          } catch {
            setError(true);
          }
        }
        setError(true);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleSeek = (e) => {
    e?.stopPropagation();
    if (!audioRef.current) return;
    const total = audioDuration || duration || 1;
    const seekTime = (parseFloat(e.target.value) / 100) * total;
    audioRef.current.currentTime = seekTime;
    setCurrentTime(seekTime);
  };

  const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds) || !isFinite(seconds)) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const effectiveDuration = audioDuration > 0 ? audioDuration : (duration > 0 ? duration : 0);
  const progressPercent = effectiveDuration > 0 ? (currentTime / effectiveDuration) * 100 : 0;

  if (error) {
    return (
      <div className="flex items-center gap-2 text-xs text-rose-700 bg-rose-50/90 border border-rose-200 px-3 py-2 rounded-2xl max-w-[280px]">
        <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
        <span className="truncate">Voice note unavailable</span>
      </div>
    );
  }

  return (
    <div
      className={`flex items-center gap-2.5 py-1.5 px-3 rounded-2xl w-full max-w-[280px] sm:max-w-[300px] transition-all select-none ${
        own
          ? "bg-[#102f2c] text-white shadow-xs"
          : "bg-stone-100/90 text-slate-900 border border-stone-200 shadow-xs"
      }`}
    >
      <audio
        ref={audioRef}
        src={effectiveSrc}
        preload="metadata"
      />

      {/* Play/Pause Button */}
      <button
        type="button"
        aria-label={playing ? "Pause voice message" : "Play voice message"}
        onClick={togglePlay}
        disabled={loading}
        className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 shadow-sm active:scale-95 transition-transform ${
          own
            ? "bg-amber-400 text-slate-950 hover:bg-amber-300"
            : "bg-teal-800 text-white hover:bg-teal-900"
        }`}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : playing ? (
          <Pause className="h-4 w-4" />
        ) : (
          <Play className="h-4 w-4 ml-0.5" />
        )}
      </button>

      {/* Progress & Waveform Bar */}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="relative flex items-center h-3">
          <input
            type="range"
            min="0"
            max="100"
            step="0.5"
            value={progressPercent || 0}
            onChange={handleSeek}
            className={`w-full h-1.5 rounded-lg appearance-none cursor-pointer ${
              own
                ? "bg-teal-900/60 accent-amber-400"
                : "bg-stone-300 accent-teal-800"
            }`}
          />
        </div>

        <div className="flex justify-between items-center text-[10px] font-mono leading-none">
          <span className={own ? "text-teal-200" : "text-slate-500"}>
            {formatTime(currentTime)}
          </span>
          <span className={`font-bold ${own ? "text-amber-300" : "text-slate-700"}`}>
            {formatTime(effectiveDuration)}
          </span>
        </div>
      </div>
    </div>
  );
}
