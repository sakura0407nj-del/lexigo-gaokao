"use client";

import { AlertCircle, Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { androidRequest, hasAndroidBridge } from "./android-bridge";

export function cx(...names: Array<string | false | null | undefined>) {
  return names.filter(Boolean).join(" ");
}

export function SectionHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <header className="section-head">
      <div className="min-w-0">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="section-title">{title}</h1>
        {description ? <p className="section-desc">{description}</p> : null}
      </div>
      {action ? <div className="section-action">{action}</div> : null}
    </header>
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="note note-error">
      <AlertCircle aria-hidden className="size-5 shrink-0" />
      <p className="min-w-0 flex-1">{message}</p>
      {onRetry ? (
        <button type="button" className="btn btn-ghost btn-sm" onClick={onRetry}>
          重试
        </button>
      ) : null}
    </div>
  );
}

export function Loading({ label = "加载中…" }: { label?: string }) {
  return (
    <div className="loading" role="status">
      <Loader2 aria-hidden className="size-5 animate-spin" />
      <span>{label}</span>
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <p className="empty-title">{title}</p>
      {children ? <div className="empty-body">{children}</div> : null}
    </div>
  );
}

export function downloadText(filename: string, content: string, type = "text/plain;charset=utf-8") {
  if (hasAndroidBridge()) {
    void androidRequest("saveText", { filename, content, mime: type.split(";")[0] }, 600000).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "文件未保存，请重试";
      if (!/取消|cancel/i.test(message)) window.alert(message);
    });
    return;
  }
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function formatDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

export function countEnglishWords(text: string) {
  const matches = text.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g);
  return matches ? matches.length : 0;
}
