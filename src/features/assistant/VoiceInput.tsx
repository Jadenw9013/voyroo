"use client";

import { useEffect, useRef, useState } from "react";
import { VOICE_SECONDS } from "@/domain/voiceAudio";
import { Icon } from "@/ui/Icon";
import { btn } from "@/ui/kit";
import { encodeRecording } from "./voiceRecording";

interface VoiceProps {
  tripId: string;
  online: boolean;
  disabled: boolean;
  onTranscript: (text: string) => void;
  onBusyChange: (busy: boolean) => void;
}

type Phase = "idle" | "requesting" | "recording" | "stopping" | "ready" | "transcribing";
const successNotice = "Transcript ready. Review your message before sending.";
interface Session {
  controller: AbortController;
  stream?: MediaStream;
  recorder?: MediaRecorder;
  timer?: number;
  clip?: Blob;
  transcribeOnStop: boolean;
}

function stopMicrophone(session: Session) {
  window.clearTimeout(session.timer);
  if (session.recorder?.state === "recording") session.recorder.stop();
  session.stream?.getTracks().forEach((track) => track.stop());
}

function discard(session: Session | null) {
  if (!session) return;
  session.controller.abort();
  stopMicrophone(session);
  session.clip = undefined;
}

export function VoiceInput({ tripId, online, disabled, onTranscript, onBusyChange }: VoiceProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [notice, setNotice] = useState("");
  const active = useRef<Session | null>(null);
  const busy = phase !== "idle";
  useEffect(() => {
    if (notice !== successNotice) return;
    const timer = window.setTimeout(() => setNotice(""), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    onBusyChange(busy);
    return () => { if (busy) onBusyChange(false); };
  }, [busy, onBusyChange]);
  useEffect(() => {
    function interrupt(message: string) {
      if (!active.current) return;
      discard(active.current);
      active.current = null;
      setPhase("idle");
      setNotice(message);
    }
    const offline = () => interrupt("Voice input needs a connection. Your typed draft is still here.");
    const hidden = () => {
      if (document.hidden) interrupt("Voice input stopped when you left this screen.");
    };
    window.addEventListener("offline", offline);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("offline", offline);
      document.removeEventListener("visibilitychange", hidden);
      discard(active.current);
      active.current = null;
    };
  }, [tripId]);

  function finish(message: string) {
    discard(active.current);
    active.current = null;
    setPhase("idle");
    setNotice(message);
  }

  async function transcribe(session: Session) {
    if (!session.clip || session.controller.signal.aborted) return;
    setPhase("transcribing");
    setNotice("Google Gemini is transcribing your recording…");
    try {
      const audio = await encodeRecording(session.clip);
      if (session.controller.signal.aborted) return;
      const response = await fetch(`/api/t/${tripId}/transcribe`, {
        method: "POST", signal: session.controller.signal,
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ audio }),
      });
      const result = await response.json();
      if (session.controller.signal.aborted) return;
      if (!response.ok || typeof result.text !== "string" || !result.text.trim()) throw new Error(result.error || "Couldn’t transcribe the recording.");
      onTranscript(result.text.trim());
      finish(successNotice);
    } catch (error) {
      if (session.controller.signal.aborted) return;
      setPhase("ready");
      setNotice(error instanceof Error ? error.message : "Couldn’t read the recording. Try again or type your question.");
    }
  }

  async function start() {
    if (active.current || disabled || !online) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined" || typeof OfflineAudioContext === "undefined") {
      setNotice("Voice recording isn’t available in this browser. You can type your question.");
      return;
    }
    const session: Session = { controller: new AbortController(), transcribeOnStop: false };
    active.current = session;
    setPhase("requesting");
    setNotice("Allow microphone access to record a question.");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 }, video: false });
      if (session.controller.signal.aborted) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      session.stream = stream;
      const recorder = new MediaRecorder(stream, { audioBitsPerSecond: 64_000 });
      session.recorder = recorder;
      const chunks: Blob[] = [];
      let bytes = 0;
      recorder.ondataavailable = (event) => {
        if (session.controller.signal.aborted) return;
        bytes += event.data.size;
        if (bytes > 2_000_000) finish("That recording was too large. Try a shorter question.");
        else if (event.data.size) chunks.push(event.data);
      };
      recorder.onerror = () => {
        if (!session.controller.signal.aborted) finish("The microphone was interrupted. Try recording again.");
      };
      recorder.onstop = () => {
        if (session.controller.signal.aborted) return;
        stopMicrophone(session);
        session.clip = new Blob(chunks, { type: recorder.mimeType });
        if (!session.clip.size) return finish("The microphone didn’t capture any audio. Try again.");
        if (session.transcribeOnStop) void transcribe(session);
        else {
          setPhase("ready");
          setNotice("Recording stopped. Transcribe to send this clip to Google Gemini, or cancel to discard it.");
        }
      };
      recorder.start(1000);
      setPhase("recording");
      setNotice("Recording for up to one minute. Stop and transcribe sends your audio to Google Gemini. You can review the text before sending your question.");
      session.timer = window.setTimeout(() => stopMicrophone(session), VOICE_SECONDS * 1000);
    } catch (error) {
      if (session.controller.signal.aborted) return;
      const denied = error instanceof DOMException && error.name === "NotAllowedError";
      finish(denied ? "Microphone access is off. Allow it in your browser or type your question." : "Couldn’t open the microphone. Check your device or type your question.");
    }
  }

  function stopAndTranscribe() {
    const session = active.current;
    if (!session || session.recorder?.state !== "recording") return;
    session.transcribeOnStop = true;
    setPhase("stopping");
    stopMicrophone(session);
  }

  return <>
    <button type="button" aria-label="Record voice" title="Record voice" disabled={!online || disabled || busy} onClick={() => void start()}
      className="flex size-11 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-sunken disabled:opacity-50 sm:w-auto sm:gap-1.5 sm:px-2">
      <Icon name="mic" /><span className="hidden text-sm sm:inline">Voice</span>
    </button>
    <span className="sr-only" aria-live="polite" aria-atomic="true">{notice === successNotice ? successNotice : ""}</span>
    {(busy || (notice && notice !== successNotice)) && <div className="order-last flex min-w-0 basis-full flex-col gap-2 rounded-xl border border-line bg-surface p-3">
      <p role="status" className="text-sm">{notice}</p>
      <div className="flex flex-wrap gap-2">
        {phase === "recording" && <button type="button" className={btn.primary} onClick={stopAndTranscribe}>Stop and transcribe</button>}
        {phase === "ready" && <button type="button" className={btn.primary} disabled={!online} onClick={() => { if (active.current) void transcribe(active.current); }}>Transcribe recording</button>}
        {busy ? <button type="button" className={btn.secondary} onClick={() => finish("")}>Cancel voice</button>
          : <button type="button" className={btn.quiet} onClick={() => setNotice("")}>Dismiss</button>}
      </div>
    </div>}
  </>;
}
