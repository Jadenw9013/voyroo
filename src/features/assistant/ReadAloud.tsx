"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useTrip } from "@/client/store";
import { MAX_SPEECH_TEXT } from "@/domain/readAloud";
import { Icon } from "@/ui/Icon";

function localVoice() {
  const voices = window.speechSynthesis?.getVoices().filter((voice) => voice.localService) ?? [];
  const language = document.documentElement.lang.split("-")[0] || navigator.language.split("-")[0];
  return voices.find((voice) => voice.default && voice.lang.split("-")[0] === language)
    ?? voices.find((voice) => voice.lang.split("-")[0] === language)
    ?? voices.find((voice) => voice.default)
    ?? voices[0];
}

function subscribe(listener: () => void) {
  const synth = window.speechSynthesis;
  synth?.addEventListener("voiceschanged", listener);
  return () => synth?.removeEventListener("voiceschanged", listener);
}

const hasLocalVoice = () => typeof SpeechSynthesisUtterance !== "undefined" && !!localVoice();

interface Playback {
  controller: AbortController;
  audio?: AudioContext;
  usingDeviceVoice?: boolean;
}

/** Read the visible reply. Source citations and chat controls sit outside the spoken blocks. */
export function ReadAloud() {
  const { tripId, online } = useTrip();
  const hasDeviceVoice = useSyncExternalStore(subscribe, hasLocalVoice, () => false);
  const canGenerate = online && typeof AudioContext !== "undefined";
  const button = useRef<HTMLButtonElement>(null);
  const current = useRef<Playback | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "playing" | "error">("idle");

  function stop() {
    const playback = current.current;
    current.current = null;
    if (!playback) return;
    playback.controller.abort();
    if (playback.audio) void playback.audio.close().catch(() => {});
    if (playback.usingDeviceVoice) window.speechSynthesis.cancel();
  }

  useEffect(() => {
    const leave = () => {
      stop();
      setState("idle");
    };
    window.addEventListener("pagehide", leave);
    return () => {
      window.removeEventListener("pagehide", leave);
      stop();
    };
  }, []);

  function finish(playback: Playback, next: "idle" | "error") {
    if (current.current !== playback) return;
    stop();
    setState(next);
  }

  function playDeviceVoice(playback: Playback, text: string) {
    if (current.current !== playback) return;
    const voice = localVoice();
    if (!voice || typeof SpeechSynthesisUtterance === "undefined") {
      finish(playback, "error");
      return;
    }
    const phrases = text.split(/\n+/)
      .flatMap((line) => line.match(/.{1,220}(?:\s+|$)|.{1,220}/gu) ?? [])
      .map((line) => line.trim()).filter(Boolean);
    playback.usingDeviceVoice = true;
    const speak = (index: number) => {
      const utterance = new SpeechSynthesisUtterance(phrases[index]);
      utterance.voice = voice;
      utterance.lang = voice.lang;
      utterance.rate = 0.95;
      utterance.onend = () => {
        if (current.current !== playback) return;
        if (index + 1 < phrases.length) speak(index + 1);
        else finish(playback, "idle");
      };
      utterance.onerror = () => finish(playback, "error");
      window.speechSynthesis.speak(utterance);
    };
    setState("playing");
    speak(0);
  }

  async function toggle() {
    if (current.current) {
      stop();
      setState("idle");
      return;
    }
    const reply = button.current?.closest("[data-assistant-reply]");
    if (!reply) return;
    const text = Array.from(reply.querySelectorAll<HTMLElement>("[data-spoken-answer]"), (block) => block.innerText.trim())
      .filter(Boolean).join("\n\n");
    if (!text) return;
    const playback: Playback = { controller: new AbortController() };
    current.current = playback;
    if (!canGenerate || text.length > MAX_SPEECH_TEXT) {
      playDeviceVoice(playback, text);
      return;
    }
    setState("loading");
    try {
      // Unlock playback while the tap is still active on mobile Safari.
      const audio = new AudioContext();
      playback.audio = audio;
      await audio.resume();
      if (current.current !== playback) return;
      const response = await fetch(`/api/t/${tripId}/speech`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: playback.controller.signal,
        body: JSON.stringify({ text }),
      });
      if (!response.ok) throw new Error("Voice unavailable");
      const buffer = await audio.decodeAudioData(await response.arrayBuffer());
      if (current.current !== playback) return;
      const source = audio.createBufferSource();
      source.buffer = buffer;
      source.connect(audio.destination);
      source.onended = () => finish(playback, "idle");
      source.start();
      setState("playing");
    } catch {
      if (current.current !== playback) return;
      if (playback.audio) void playback.audio.close().catch(() => {});
      playback.audio = undefined;
      playDeviceVoice(playback, text);
    }
  }

  if (!canGenerate && !hasDeviceVoice && state === "idle") return null;
  const playing = state === "playing" || state === "loading";
  return (
    <div className="flex flex-wrap items-center gap-x-2">
      <button ref={button} type="button" aria-label={playing ? "Stop reading" : "Listen to answer"} onClick={() => void toggle()}
        className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-1.5 text-sm font-semibold text-muted hover:bg-sunken hover:text-ink">
        {playing ? <span aria-hidden="true" className="size-3 rounded-sm bg-current" /> : <Icon name="volume" className="size-4" />}
        {playing ? "Stop reading" : "Listen"}
      </button>
      {state === "loading" && <span role="status" className="text-sm text-muted">Preparing audio…</span>}
      {state === "error" && <span role="status" className="text-sm text-muted">Playback stopped. Tap Listen to try again.</span>}
    </div>
  );
}
