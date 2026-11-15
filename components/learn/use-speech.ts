"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

export type Accent = "en-US" | "en-GB";

export interface SpeechState {
  supported: boolean;
  ready: boolean;
  voices: SpeechSynthesisVoice[];
  hasEnglish: boolean;
  hasAccent: (accent: Accent) => boolean;
  speak: (text: string, options?: SpeakOptions) => boolean;
  stop: () => void;
  prime: () => void;
}

export interface SpeakOptions {
  accent?: Accent;
  rate?: number;
  repeat?: number;
  gapMs?: number;
  onEnd?: () => void;
  onError?: () => void;
}

interface VoiceSnapshot {
  supported: boolean;
  ready: boolean;
  voices: SpeechSynthesisVoice[];
}

const SERVER_SNAPSHOT: VoiceSnapshot = { supported: false, ready: false, voices: [] };
let snapshot: VoiceSnapshot | null = null;
let timedOut = false;
let speakToken = 0;
let gapTimer: number | undefined;

function isSupported() {
  return typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
}

function compute(): VoiceSnapshot {
  if (!isSupported()) return { supported: false, ready: true, voices: [] };
  const voices = window.speechSynthesis.getVoices();
  return { supported: true, ready: voices.length > 0 || timedOut, voices };
}

function getSnapshot() {
  if (!snapshot) snapshot = compute();
  return snapshot;
}

function getServerSnapshot() {
  return SERVER_SNAPSHOT;
}

function subscribe(listener: () => void) {
  if (!isSupported()) return () => {};
  const synth = window.speechSynthesis;
  const refresh = () => {
    snapshot = compute();
    listener();
  };
  synth.addEventListener?.("voiceschanged", refresh);
  const timer = window.setTimeout(() => {
    timedOut = true;
    refresh();
  }, 1500);
  return () => {
    synth.removeEventListener?.("voiceschanged", refresh);
    window.clearTimeout(timer);
  };
}

function normLang(lang: string) {
  return lang.toLowerCase().replace("_", "-");
}

function englishVoices(voices: SpeechSynthesisVoice[]) {
  return voices.filter((voice) => normLang(voice.lang).startsWith("en"));
}

function pickVoice(voices: SpeechSynthesisVoice[], accent: Accent): SpeechSynthesisVoice | undefined {
  const english = englishVoices(voices);
  const exact = english.filter((voice) => normLang(voice.lang) === accent.toLowerCase());
  return exact.find((voice) => voice.localService) ?? exact[0] ?? english.find((voice) => voice.default) ?? english[0];
}

export function useSpeech(): SpeechState {
  const { supported, ready, voices } = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const stop = useCallback(() => {
    speakToken += 1;
    window.clearTimeout(gapTimer);
    if (isSupported()) window.speechSynthesis.cancel();
  }, []);

  useEffect(() => stop, [stop]);

  const speak = useCallback<SpeechState["speak"]>(
    (text, options) => {
      if (!supported) return false;
      const voice = pickVoice(voices, options?.accent ?? "en-US");
      if (!voice) return false;
      const synth = window.speechSynthesis;
      speakToken += 1;
      const token = speakToken;
      window.clearTimeout(gapTimer);
      synth.cancel();
      const total = Math.max(1, Math.min(5, Math.round(options?.repeat ?? 1)));
      const gap = options?.gapMs ?? 1000;
      const sayOnce = (round: number) => {
        if (token !== speakToken) return;
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.voice = voice;
        utterance.lang = voice.lang;
        utterance.rate = options?.rate ?? 1;
        utterance.onend = () => {
          if (token !== speakToken) return;
          if (round + 1 < total) {
            gapTimer = window.setTimeout(() => sayOnce(round + 1), gap);
          } else {
            options?.onEnd?.();
          }
        };
        utterance.onerror = (event) => {
          if (token !== speakToken) return;
          if (event.error === "interrupted" || event.error === "canceled") return;
          options?.onError?.();
        };
        if (synth.paused) synth.resume();
        synth.speak(utterance);
      };
      sayOnce(0);
      return true;
    },
    [supported, voices],
  );
  const hasAccent = useCallback((accent: Accent) => englishVoices(voices).some((voice) => normLang(voice.lang) === accent.toLowerCase()), [voices]);

  const prime = useCallback(() => {
    if (!isSupported()) return;
    try {
      const synth = window.speechSynthesis;
      if (synth.speaking || synth.pending) return;
      const utterance = new SpeechSynthesisUtterance(" ");
      utterance.volume = 0;
      synth.speak(utterance);
    } catch {
      /* ignore */
    }
  }, []);

  return { supported, ready, voices, hasEnglish: englishVoices(voices).length > 0, hasAccent, speak, stop, prime };
}
