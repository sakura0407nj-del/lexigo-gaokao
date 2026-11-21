"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { androidRequest, androidVoices, hasAndroidBridge, type NativeSpeechStatus } from "./android-bridge";

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
let nativeSnapshot: VoiceSnapshot = { supported: true, ready: false, voices: [] };

function isSupported() {
  return hasAndroidBridge() || (typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined");
}

function compute(): VoiceSnapshot {
  if (hasAndroidBridge()) return nativeSnapshot;
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
  if (hasAndroidBridge()) {
    let active = true;
    let retry: number | undefined;
    let attempts = 0;
    const refresh = async () => {
      try {
        const status = await androidRequest<NativeSpeechStatus>("ttsStatus");
        if (!active) return;
        nativeSnapshot = { supported: true, ready: status.ready === true, voices: androidVoices(status) };
        snapshot = nativeSnapshot;
        listener();
        if (!status.ready && ++attempts < 15) retry = window.setTimeout(refresh, 750);
        else if (!status.ready) { nativeSnapshot = { supported: true, ready: true, voices: [] }; snapshot = nativeSnapshot; listener(); }
      } catch {
        if (!active) return;
        nativeSnapshot = { supported: true, ready: true, voices: [] };
        snapshot = nativeSnapshot;
        listener();
      }
    };
    const onVisible = () => { if (!document.hidden) { attempts = 0; window.clearTimeout(retry); void refresh(); } };
    void refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => { active = false; window.clearTimeout(retry); document.removeEventListener("visibilitychange", onVisible); };
  }
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
    if (hasAndroidBridge()) void androidRequest("stopSpeech").catch(() => {});
    else if (isSupported()) window.speechSynthesis.cancel();
  }, []);

  useEffect(() => stop, [stop]);

  const speak = useCallback<SpeechState["speak"]>(
    (text, options) => {
      if (!supported) return false;
      const voice = pickVoice(voices, options?.accent ?? "en-US");
      if (!voice) return false;
      if (hasAndroidBridge()) {
        const token = ++speakToken;
        window.clearTimeout(gapTimer);
        const total = Math.max(1, Math.min(5, Math.round(options?.repeat ?? 1)));
        const sayNative = async (round: number) => {
          try {
            await androidRequest("speak", { text, lang: voice.lang, voice: voice.name, rate: options?.rate ?? 1 }, 600000);
            if (token !== speakToken) return;
            if (round + 1 < total) gapTimer = window.setTimeout(() => void sayNative(round + 1), options?.gapMs ?? 1000);
            else options?.onEnd?.();
          } catch { if (token === speakToken) options?.onError?.(); }
        };
        void sayNative(0);
        return true;
      }
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
    if (hasAndroidBridge()) return;
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
