/** Only the Android app injects this origin-scoped message port. No credentials cross it. */
interface NativePort {
  postMessage(message: string): void;
  onmessage: ((event: { data: string }) => void) | null;
}

declare global {
  interface Window { LexiGoNative?: NativePort }
}

export interface NativeVoice {
  name: string;
  lang: string;
  localService: boolean;
  default: boolean;
}
export interface NativeSpeechStatus { ready: boolean; voices: NativeVoice[]; error?: string }

let attachedPort: NativePort | undefined;
let sequence = 0;
const pending = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();

export function hasAndroidBridge(): boolean {
  return typeof window !== "undefined" && typeof window.LexiGoNative?.postMessage === "function";
}

export function androidRequest<T>(method: "ttsStatus" | "speak" | "stopSpeech" | "saveText" | "speechSettings", payload: Record<string, unknown> = {}, timeoutMs = 15000): Promise<T> {
  if (!hasAndroidBridge()) return Promise.reject(new Error("当前环境不是拾词安卓 App"));
  const port = window.LexiGoNative!;
  if (attachedPort !== port) {
    for (const task of pending.values()) { clearTimeout(task.timer); task.reject(new Error("安卓连接已更新，请重试")); }
    pending.clear();
    attachedPort = port;
    port.onmessage = (event) => {
      try {
        const reply: unknown = JSON.parse(event.data);
        if (!reply || typeof reply !== "object") return;
        const value = reply as { id?: unknown; ok?: unknown; result?: unknown; error?: unknown };
        if (typeof value.id !== "string" || typeof value.ok !== "boolean") return;
        const task = pending.get(value.id);
        if (!task) return;
        pending.delete(value.id);
        clearTimeout(task.timer);
        if (value.ok) task.resolve(value.result);
        else task.reject(new Error(typeof value.error === "string" ? value.error.slice(0,300) : "安卓操作未完成，请重试"));
      } catch { /* Ignore malformed or unrelated messages. */ }
    };
  }
  const id = `lexigo-${Date.now().toString(36)}-${++sequence}`;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error("安卓操作等待超时，请重试")); }, timeoutMs);
    pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timer });
    try { port.postMessage(JSON.stringify({ id, method, payload })); }
    catch { clearTimeout(timer); pending.delete(id); reject(new Error("无法连接安卓功能，请重新打开 App")); }
  });
}

export function androidVoices(status: NativeSpeechStatus): SpeechSynthesisVoice[] {
  if (!Array.isArray(status.voices)) return [];
  return status.voices.filter(voice => voice && typeof voice.name === "string" && typeof voice.lang === "string")
    .map(voice => ({ name: voice.name, lang: voice.lang, voiceURI: `android:${voice.name}`, localService: !!voice.localService, default: !!voice.default }));
}
