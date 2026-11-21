"use client";

import { Download, HardDrive, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { ORIGIN_LABEL, TYPE_LABEL, type BankResponse } from "./api";
import { streakDays, todayKey, useProgress } from "./progress";
import { backupCounts, createHighBackup, MAX_BACKUP_BYTES, parseHighBackup, type HighBackupPreview } from "./high-backup";
import { SourcesSection } from "./sources-section";
import { Empty, ErrorNote, Loading, SectionHeader, downloadText, formatDate } from "./ui";

export function RecordsView({ bank, bankError, onReloadBank }: { bank: BankResponse | null; bankError: string; onReloadBank: () => void }) {
  const { progress, hydrated, storageAvailable, replaceAll, clearAll } = useProgress();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState<(HighBackupPreview & {filename: string; generation: number}) | null>(null);
  const [reading, setReading] = useState(false);
  const readGeneration = useRef(0);
  const previewRef = useRef<HTMLHeadingElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => { readGeneration.current++; }, []);
  useEffect(() => { if (pending) previewRef.current?.focus(); }, [pending]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (confirmOpen && !dialog.open) dialog.showModal();
    if (!confirmOpen && dialog.open) dialog.close();
  }, [confirmOpen]);

  function exportJson() {
    downloadText(`lexigo-高中记录-${todayKey()}.json`, JSON.stringify(createHighBackup(progress), null, 2), "application/json");
    setMessage("已发起导出，请完成文件保存。");
  }

  function cancelImport() {
    readGeneration.current++;
    setPending(null);
    setReading(false);
  }

  function chooseImport() {
    cancelImport();
    setError("");
    setMessage("");
    fileRef.current?.click();
  }

  async function importJson(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const generation = ++readGeneration.current;
    setPending(null);
    setReading(true);
    setMessage("");
    setError("");
    try {
      if (file.size > MAX_BACKUP_BYTES) throw new Error("文件太大，学习记录文件应小于 20MB");
      const text = await file.text();
      if (generation !== readGeneration.current) return;
      if (text.length > MAX_BACKUP_BYTES) throw new Error("文件内容过大");
      const parsed = parseHighBackup(JSON.parse(text));
      setPending({...parsed, filename: file.name.slice(0, 200), generation});
    } catch (err) {
      if (generation === readGeneration.current) setError(`无法预览：${err instanceof SyntaxError ? "文件不是有效的 JSON" : err instanceof Error ? err.message : "格式不正确"}。当前记录未改变。`);
    } finally {
      if (generation === readGeneration.current) setReading(false);
    }
  }

  function applyImport() {
    if (!pending || reading || pending.generation !== readGeneration.current) return;
    try {
      if (!replaceAll(pending.progress)) {
        setError("保存失败：浏览器存储已满或不可用，原有记录未改动。请先导出当前记录，再释放空间后重试。");
        return;
      }
      cancelImport();
      setError("");
      setMessage("已保存并恢复高中学习记录。小学记录未改动。");
    } catch {
      setError("恢复失败，原有记录未改动。请保留备份文件后重试。");
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
            <p className="section-desc">导出带有高中标识的 JSON 备份。导入先预览并确认，再替换本机高中记录；也可读取旧版高中备份。备份不包含未完成草稿、游戏现场与单独保存的积分历史。</p>
            <div className="flex flex-wrap gap-3">
              <button type="button" className="btn btn-primary" onClick={exportJson}>
                <Download aria-hidden className="size-4" /> 导出 JSON
              </button>
              <button type="button" className="btn btn-ghost" onClick={chooseImport}>
                <Upload aria-hidden className="size-4" /> {reading || pending ? "重新选择备份" : "导入 JSON"}
              </button>
              <button type="button" className="btn btn-danger" onClick={() => { cancelImport(); setConfirmOpen(true); }}>
                <Trash2 aria-hidden className="size-4" /> 清空记录
              </button>
              <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={importJson} />
            </div>
            {reading ? <div aria-live="polite"><p>正在读取备份；当前记录尚未改变。</p><button type="button" className="btn btn-ghost mt-3" onClick={cancelImport}>取消读取</button></div> : null}
            {pending ? <section aria-labelledby="backup-preview-title" className="space-y-3 border-t border-[var(--border)] pt-4">
              <h3 id="backup-preview-title" ref={previewRef} tabIndex={-1} className="sub-title">导入预览 · 当前记录尚未改变</h3>
              <p className="section-desc break-all">{pending.filename}{pending.exportedAt ? ` · 导出于 ${formatDate(pending.exportedAt)}` : ""}</p>
              <p className="note">{pending.source === "high" ? "已识别：高中学习记录备份。" : "旧版备份未标注学段；未发现小学标识。请确认此文件来自高中模式，再决定是否替换。"}</p>
              <div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">当前高中记录与备份记录数量对比</caption><thead><tr><th scope="col" className="py-2">记录类型</th><th scope="col">当前</th><th scope="col">备份</th></tr></thead><tbody>
                {backupCounts(progress).map(([label, count], index) => <tr key={label}><th scope="row" className="py-2 font-normal">{label}</th><td>{count}</td><td>{backupCounts(pending.progress)[index][1]}</td></tr>)}
              </tbody></table></div>
              <p className="section-desc">确认后将替换上表全部高中记录，不会与现有记录合并。若需要保留当前内容，请先导出当前记录。</p>
              <div className="flex flex-wrap gap-3"><button type="button" className="btn btn-primary" onClick={applyImport}>确认替换高中记录</button><button type="button" className="btn btn-ghost" onClick={cancelImport}>取消导入</button></div>
            </section> : null}
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

