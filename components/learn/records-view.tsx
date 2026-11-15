"use client";

import { Download, HardDrive, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { ORIGIN_LABEL, TYPE_LABEL, type BankResponse } from "./api";
import { parseProgress, streakDays, todayKey, useProgress } from "./progress";
import { SourcesSection } from "./sources-section";
import { Empty, ErrorNote, Loading, SectionHeader, downloadText, formatDate } from "./ui";

export function RecordsView({ bank, bankError, onReloadBank }: { bank: BankResponse | null; bankError: string; onReloadBank: () => void }) {
  const { progress, hydrated, storageAvailable, replaceAll, clearAll } = useProgress();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (confirmOpen && !dialog.open) dialog.showModal();
    if (!confirmOpen && dialog.open) dialog.close();
  }, [confirmOpen]);

  function exportJson() {
    downloadText(`lexigo-记录-${todayKey()}.json`, JSON.stringify(progress, null, 2), "application/json");
    setMessage("已导出学习记录。");
  }

  async function importJson(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setMessage("");
    setError("");
    if (file.size > 20 * 1024 * 1024) {
      setError("文件太大，学习记录文件应小于 20MB。");
      return;
    }
    try {
      const parsed = parseProgress(JSON.parse(await file.text()));
      replaceAll(parsed);
      setMessage(`导入成功：已掌握 ${parsed.learned.length} 词，收藏 ${parsed.starred.length} 词，错词 ${Object.keys(parsed.wrongbook).length} 个，错题 ${Object.keys(parsed.mistakes).length} 道。`);
    } catch (err) {
      setError(`导入失败：${err instanceof SyntaxError ? "文件不是有效的 JSON" : err instanceof Error ? err.message : "格式不正确"}。当前记录未改变。`);
    }
  }

  const practice = [...progress.practice].reverse();
  const corrections = [...progress.corrections].reverse();
  const dictTotal = progress.dictation.reduce((sum, item) => sum + item.total, 0);
  const dictCorrect = progress.dictation.reduce((sum, item) => sum + item.correct, 0);

  return (
    <section className="view">
      <SectionHeader eyebrow="Records" title="学习记录与来源" description="记录只保存在这台设备的浏览器中，不会同步到云端。换设备前请先导出备份。" />

      {!storageAvailable ? <ErrorNote message="浏览器存储已满或不可用，最新记录尚未保存。请立即导出备份，刷新会丢失未保存的部分。" /> : null}

      {!hydrated ? (
        <Loading label="正在读取本机记录…" />
      ) : (
        <>
          <div className="stat-grid">
            <Stat label="连续学习" value={streakDays(progress.days)} unit="天" />
            <Stat label="学习天数" value={progress.days.length} unit="天" />
            <Stat label="已掌握" value={progress.learned.length} unit="词" />
            <Stat label="听写正确率" value={dictTotal ? Math.round((dictCorrect / dictTotal) * 100) : "—"} unit={dictTotal ? "%" : ""} note={dictTotal ? `${dictCorrect}/${dictTotal}` : "暂无"} />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <div className="card card-pad">
              <h2 className="sub-title">练习记录</h2>
              {practice.length ? (
                <ul className="history-list">
                  {practice.slice(0, 12).map((item) => (
                    <li key={`${item.at}-${item.paperId}`}>
                      <span className="min-w-0 truncate">
                        {item.title}
                        <span className="block text-xs text-[var(--ink-faint)]">
                          {TYPE_LABEL[item.type]} · {ORIGIN_LABEL[item.origin]} · {formatDate(item.at)}
                        </span>
                      </span>
                      <span className="font-semibold tabular-nums">
                        {item.score}/{item.maxScore}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty title="还没有练习记录" />
              )}
            </div>
            <div className="card card-pad">
              <h2 className="sub-title">批改记录</h2>
              {corrections.length ? (
                <ul className="history-list">
                  {corrections.slice(0, 12).map((item) => (
                    <li key={item.at}>
                      <span className="min-w-0">
                        <span className="line-clamp-2">{item.summary || (item.kind === "essay" ? "作文批改" : "题目批改")}</span>
                        <span className="block text-xs text-[var(--ink-faint)]">
                          {item.kind === "essay" ? "作文" : "题目"} · {formatDate(item.at)}
                        </span>
                      </span>
                      <span className="font-semibold tabular-nums">
                        {item.score}/{item.maxScore}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty title="还没有批改记录" />
              )}
            </div>
          </div>

          <div className="card card-pad space-y-4">
            <h2 className="sub-title flex items-center gap-2">
              <HardDrive aria-hidden className="size-5" /> 备份与恢复
            </h2>
            <p className="section-desc">导出为 JSON 文件；导入时会校验格式，并用文件内容替换本机当前记录。</p>
            <div className="flex flex-wrap gap-3">
              <button type="button" className="btn btn-primary" onClick={exportJson}>
                <Download aria-hidden className="size-4" /> 导出 JSON
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => fileRef.current?.click()}>
                <Upload aria-hidden className="size-4" /> 导入 JSON
              </button>
              <button type="button" className="btn btn-danger" onClick={() => setConfirmOpen(true)}>
                <Trash2 aria-hidden className="size-4" /> 清空记录
              </button>
              <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={importJson} />
            </div>
            {message ? <p className="note note-success" role="status">{message}</p> : null}
            {error ? <ErrorNote message={error} /> : null}
          </div>
        </>
      )}

      <div id="sources" className="scroll-mt-6">
        <SourcesSection bank={bank} bankError={bankError} onReloadBank={onReloadBank} />
      </div>

      <dialog ref={dialogRef} className="confirm-dialog" onClose={() => setConfirmOpen(false)} aria-labelledby="confirm-title">
        <h2 id="confirm-title" className="sub-title">清空全部学习记录？</h2>
        <p className="section-desc">已掌握、收藏、错词本、听写/练习/批改历史都会从这台设备删除，无法撤销。建议先导出备份。</p>
        <div className="mt-5 flex flex-wrap justify-end gap-3">
          <button type="button" className="btn btn-ghost" onClick={() => setConfirmOpen(false)} autoFocus>
            取消
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => {
              clearAll();
              setConfirmOpen(false);
              setMessage("已清空本机学习记录。");
              setError("");
            }}
          >
            确认清空
          </button>
        </div>
      </dialog>
    </section>
  );
}

function Stat({ label, value, unit, note }: { label: string; value: number | string; unit?: string; note?: string }) {
  return (
    <div className="stat">
      <p className="stat-label">{label}</p>
      <p className="stat-value">
        {typeof value === "number" ? value.toLocaleString("zh-CN") : value}
        {unit ? <span>{unit}</span> : null}
      </p>
      {note ? <p className="stat-note">{note}</p> : null}
    </div>
  );
}

export { Stat };

