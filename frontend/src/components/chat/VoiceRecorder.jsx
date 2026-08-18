import React, { useState, useRef, useEffect } from "react";
import { Mic, Square, Trash2, Send, Play, Pause, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { adminApi, workerApi, apiError } from "@/lib/api";

export default function VoiceRecorder({ onSend, conversationId, isAdmin = false, onCancel }) {
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [uploading, setUploading] = useState(false);

  const mediaRecorderRef = useRef(null);
  const timerRef = useRef(null);
  const audioChunksRef = useRef([]);
  const previewAudioRef = useRef(null);

  useEffect(() => {
    // Cleanup URL on unmount
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [audioUrl]);

  const startRecording = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
        toast.error("Voice recording is unavailable in this browser");
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const mimeType = mediaRecorder.mimeType || "audio/webm";
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        setAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        // Stop all audio tracks to release microphone
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start(100);
      setRecording(true);
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      toast.error("Microphone permission microphone ");
      if (onCancel) onCancel();
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const cancelRecording = () => {
    stopRecording();
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioBlob(null);
    setAudioUrl(null);
    setRecordingTime(0);
    if (onCancel) onCancel();
  };

  const togglePreview = () => {
    if (!previewAudioRef.current) return;
    if (previewPlaying) {
      previewAudioRef.current.pause();
      setPreviewPlaying(false);
    } else {
      previewAudioRef.current.play().then(() => setPreviewPlaying(true));
    }
  };

  const handleSend = async () => {
    if (!audioBlob) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", audioBlob, "voice_note.webm");
      formData.append("conversation_id", conversationId);

      const api = isAdmin ? adminApi : workerApi;
      const { data } = await api.post("/chat/upload-audio", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      onSend({
        audioAssetId: data.audio_asset_id,
        duration: data.duration || recordingTime,
      });

      cancelRecording();
    } catch (err) {
      toast.error(apiError(err) || "Failed to upload audio message.");
    } finally {
      setUploading(false);
    }
  };

  const formatTime = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  return (
    <div className="flex flex-wrap items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-2xl animate-in fade-in-50">
      {audioUrl && (
        <audio
          ref={previewAudioRef}
          src={audioUrl}
          onEnded={() => setPreviewPlaying(false)}
        />
      )}

      {/* When not started and no blob */}
      {!recording && !audioBlob && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 w-full min-w-0">
          <span className="text-sm font-medium text-amber-900 flex items-center gap-2">
            <Mic className="h-4 w-4 text-amber-700" /> Record voice note
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={startRecording}
              className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold flex items-center gap-1.5 shadow-sm active:scale-95 transition-transform"
            >
              <Mic className="h-4 w-4" /> Start
            </button>
            <button
              type="button"
              onClick={cancelRecording}
              className="p-2 text-slate-500 hover:text-slate-700 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* While Recording */}
      {recording && (
        <div className="flex flex-wrap items-center justify-between gap-2 w-full min-w-0">
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-600"></span>
            </span>
            <span className="font-mono text-sm font-bold text-rose-700">
              {formatTime(recordingTime)}
            </span>
            <span className="text-xs text-slate-500 hidden sm:inline"></span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={stopRecording}
              className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-transform"
            >
              <Square className="h-3.5 w-3.5 fill-current" /> Stop
            </button>
            <button
              type="button"
              onClick={cancelRecording}
              className="p-2 text-slate-400 hover:text-rose-600"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* After Recording Stopped, Preview & Send */}
      {!recording && audioBlob && (
        <div className="flex flex-wrap items-center justify-between gap-2 w-full min-w-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={togglePreview}
              className="h-8 w-8 rounded-full bg-amber-600 text-white flex items-center justify-center shrink-0 shadow-sm"
            >
              {previewPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
            </button>
            <span className="font-mono text-xs text-slate-700 font-medium">
              {formatTime(recordingTime)}
            </span>
            <span className="text-xs text-slate-500">Ready to send</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={cancelRecording}
              className="p-2 text-slate-400 hover:text-rose-600 transition-colors"
              title="Delete recording"
            >
              <Trash2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleSend}
              disabled={uploading}
              className="px-4 py-1.5 rounded-xl bg-teal-800 hover:bg-teal-900 text-white text-xs font-bold flex items-center gap-1.5 shadow-md active:scale-95 transition-transform disabled:opacity-50"
            >
              {uploading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <>
                  <Send className="h-3.5 w-3.5" /> Send
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
