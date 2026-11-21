"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
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

const canSpeak = () => typeof SpeechSynthesisUtterance !== "undefined" && !!localVoice();

/** Read the formatted reply in short phrases. Source links and chat controls sit outside these blocks. */
export function ReadAloud() {
  const available = useSyncExternalStore(subscribe, canSpeak, () => false);
  const button = useRef<HTMLButtonElement>(null);
  const current = useRef<SpeechSynthesisUtterance | null>(null);
  const [state, setState] = useState<"idle" | "playing" | "error">("idle");

  function stop() {
    if (!current.current) return;
    current.current = null;
    window.speechSynthesis.cancel();
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

  function toggle() {
    if (current.current) {
      stop();
      setState("idle");
      return;
    }
    const voice = localVoice();
    const reply = button.current?.closest("[data-assistant-reply]");
    if (!reply || !voice) return;
    const phrases = Array.from(reply.querySelectorAll<HTMLElement>("[data-spoken-answer]"))
      .flatMap((block) => block.innerText.split(/\n+/))
      .flatMap((line) => line.trim().match(/.{1,220}(?:\s+|$)|.{1,220}/gu) ?? [])
      .map((line) => line.trim()).filter(Boolean);
    if (!phrases.length) return;
    const speak = (index: number) => {
      const utterance = new SpeechSynthesisUtterance(phrases[index]);
      utterance.voice = voice;
      utterance.lang = voice.lang;
      current.current = utterance;
      utterance.onend = () => {
        if (current.current !== utterance) return;
        if (index + 1 < phrases.length) speak(index + 1);
        else { current.current = null; setState("idle"); }
      };
      utterance.onerror = () => {
        if (current.current !== utterance) return;
        current.current = null;
        setState("error");
      };
      window.speechSynthesis.speak(utterance);
    };
    setState("playing");
    speak(0);
  }

  if (!available) return null;
  const playing = state === "playing";
  return (
    <div className="flex flex-wrap items-center gap-x-2">
      <button ref={button} type="button" aria-label={playing ? "Stop reading" : "Listen to answer"} onClick={toggle}
        className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-1.5 text-sm font-semibold text-muted hover:bg-sunken hover:text-ink">
        {playing ? <span aria-hidden="true" className="size-3 rounded-sm bg-current" /> : <Icon name="volume" className="size-4" />}
        {playing ? "Stop reading" : "Listen"}
      </button>
      {state === "error" && <span role="status" className="text-sm text-muted">Playback stopped. Tap Listen to try again.</span>}
    </div>
  );
}
