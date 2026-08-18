import React, { useEffect, useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";
import { toast } from "sonner";

export default function SpeechTyping({ onSpeechResult, currentText = "", disabled = false }) {
  const [listening, setListening] = useState(false);
  const [lang, setLang] = useState("hi-IN");
  const [supported, setSupported] = useState(true);
  const recognitionRef = useRef(null);
  const listeningRef = useRef(false);
  const startingRef = useRef(false);
  const intentionalStopRef = useRef(false);
  const textRef = useRef(currentText);
  const resultRef = useRef(onSpeechResult);

  useEffect(() => { textRef.current = currentText; }, [currentText]);
  useEffect(() => { resultRef.current = onSpeechResult; }, [onSpeechResult]);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { setSupported(false); return undefined; }
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "hi-IN";
    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript?.trim();
      if (transcript) resultRef.current(textRef.current ? `${textRef.current} ${transcript}` : transcript);
    };
    recognition.onerror = (event) => {
      if (!["aborted", "no-speech"].includes(event.error) && !intentionalStopRef.current) {
        toast.error("Speech typing could not start. Please check microphone permission.");
      }
      listeningRef.current = false;
      startingRef.current = false;
      setListening(false);
    };
    recognition.onend = () => {
      listeningRef.current = false;
      startingRef.current = false;
      intentionalStopRef.current = false;
      setListening(false);
    };
    recognitionRef.current = recognition;
    return () => {
      if (listeningRef.current || startingRef.current) {
        intentionalStopRef.current = true;
        recognition.stop();
      }
      recognitionRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (disabled && (listeningRef.current || startingRef.current)) {
      intentionalStopRef.current = true;
      recognitionRef.current?.stop();
    }
  }, [disabled]);

  if (!supported) return <span className="hidden sm:inline text-[11px] text-slate-500" role="status">Voice typing unavailable; text and voice messages still work.</span>;

  const toggleListening = (e) => {
    e.preventDefault();
    const recognition = recognitionRef.current;
    if (!recognition || disabled) return;
    if (listeningRef.current || startingRef.current) {
      intentionalStopRef.current = true;
      recognition.stop();
      return;
    }
    try {
      recognition.lang = lang;
      intentionalStopRef.current = false;
      startingRef.current = true;
      recognition.start();
      listeningRef.current = true;
      startingRef.current = false;
      setListening(true);
      toast.info(lang === "hi-IN" ? "" : "Speak now in English...");
    } catch (_) { startingRef.current = false; }
  };

  return <div className="flex items-center gap-1">
    <button type="button" disabled={disabled} aria-label={listening ? "Stop voice typing" : "Voice typing in Hindi or English"} onClick={toggleListening}
      title={listening ? "Stop voice typing" : "Voice typing"}
      className={`p-2 rounded-xl border text-xs font-medium flex items-center gap-1 transition-all disabled:opacity-50 ${listening ? "bg-rose-500 text-white border-rose-600 animate-pulse" : "bg-white text-slate-700 border-slate-300 hover:border-teal-700 hover:bg-slate-50"}`}>
      {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4 text-teal-800" />}<span className="hidden sm:inline">{listening ? "" : ""}</span>
    </button>
    <button type="button" disabled={disabled} aria-label="Change speech recognition language" onClick={(e) => { e.preventDefault(); setLang((v) => v === "hi-IN" ? "en-IN" : "hi-IN"); }}
      className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-slate-800 text-[10px] font-bold disabled:opacity-50">{lang === "hi-IN" ? "HI" : "EN"}</button>
  </div>;
}
