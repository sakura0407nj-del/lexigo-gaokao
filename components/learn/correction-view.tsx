"use client";

import { AlertTriangle, Check, Copy, Download, FileText, ImagePlus, Lightbulb, ScanText, Send, StopCircle, X } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import type { Correction } from "@/lib/learning-types";
import { api, errorText, isAbort } from "./api";
import { correctionMistakes } from "./mistakes";
import { useProgress } from "./progress";
import { ErrorNote, Loading, SectionHeader, copyText, countEnglishWords, cx, downloadText } from "./ui";

type Kind = "essay" | "questions";
interface Shot {
  id: string;
  name: string;
  dataUrl: string;
  bytes: number;
}

const MAX_TEXT = 6000;
const MAX_PROMPT = 2000;
const MAX_IMAGES = 3;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const LONG_EDGE = 1600;

const SAMPLES: Record<Kind, { prompt: string; text: string; score: 15 | 25 }> = {
  essay: {
    score: 15,
    prompt: "假定你是李华，你校英语俱乐部将举办英文演讲比赛。请给外教 Mr. Smith 写一封邮件，邀请他担任评委。内容包括：1. 比赛时间和地点；2. 评委职责；3. 期待回复。词数 80 左右。",
    text: "Dear Mr. Smith,\n\nI am Li Hua, the chairman of our school English Club. I am writing to invite you to be a judge of our English speech competition, which will hold in the school hall at 3 p.m. next Friday.\n\nAs a judge, you will need to listen the speeches carefully and give scores according to pronunciation, content and performance. Besides, it would be great if you can give some advices to the speakers at the end.\n\nWe would be very honored if you could accept our invitation. Looking forward to your reply.\n\nYours,\nLi Hua",
  },
  questions: {
    score: 15,
    prompt: "语法填空（每空 1 分）：\nThe Dragon Boat Festival is one of the most important traditional festivals in China. It ___1___ (celebrate) on the fifth day of the fifth lunar month. People eat zongzi, ___2___ are made of sticky rice, and watch dragon boat races. The festival is held ___3___ (honor) Qu Yuan, a great poet.",
    text: "1. celebrates\n2. which\n3. honor",
  },
};

function bytesOfDataUrl(dataUrl: string) {
  const base64 = dataUrl.split(",")[1] ?? "";
  return Math.floor((base64.length * 3) / 4);
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("decode"));
    };
    image.src = url;
  });
}

async function shrinkImage(file: File): Promise<string> {
  const image = await loadImage(file);
  const scale = Math.min(1, LONG_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  let quality = 0.85;
  let dataUrl = canvas.toDataURL("image/jpeg", quality);
  while (bytesOfDataUrl(dataUrl) > MAX_IMAGE_BYTES && quality > 0.4) {
    quality -= 0.15;
    dataUrl = canvas.toDataURL("image/jpeg", quality);
  }
  return dataUrl;
}

function correctionToText(result: Correction) {
  const lines = [`得分：${result.score} / ${result.maxScore}`, "", result.summary, ""];
  if (result.dimensions.length) {
    lines.push("分项：");
    result.dimensions.forEach((item) => lines.push(`- ${item.name} ${item.score}/${item.max}：${item.comment}`));
    lines.push("");
  }
  if (result.errors.length) {
    lines.push("错误与修改：");
    result.errors.forEach((item, index) => lines.push(`${index + 1}. [${item.category}] ${item.original} → ${item.corrected}（${item.reason}）`));
    lines.push("");
  }
  if (result.revised) lines.push("修改稿：", result.revised, "");
  if (result.advice.length) {
    lines.push("下一步建议：");
    result.advice.forEach((item) => lines.push(`- ${item}`));
  }
  return lines.join("\n");
}

export function CorrectionView({ kind, aiNotice, primaryGrade }: { kind: Kind; aiNotice?: string; primaryGrade?:3|4|5|6 }) {
  const { recordCorrection, addMistakes } = useProgress();
  const [collected, setCollected] = useState(0);
  const [maxScore, setMaxScore] = useState<15 | 25>(15);
  const [prompt, setPrompt] = useState("");
  const [text, setText] = useState("");
  const [shots, setShots] = useState<Shot[]>([]);
  const [fileNote, setFileNote] = useState("");
  const [processing, setProcessing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Correction | null>(null);
  const [copied, setCopied] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const textInput = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);
  useEffect(() => {
    if (!submitting) return;
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [submitting]);

  const words = countEnglishWords(text);
  const tooLong = text.length > MAX_TEXT || prompt.length > MAX_PROMPT;
  const empty = !text.trim() && shots.length === 0;
  const isEssay = kind === "essay";

  async function onImages(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;
    setFileNote("");
    const room = MAX_IMAGES - shots.length;
    if (room <= 0) {
      setFileNote(`最多上传 ${MAX_IMAGES} 张图片。`);
      return;
    }
    setProcessing(true);
    const added: Shot[] = [];
    const notes: string[] = [];
    for (const file of files.slice(0, room)) {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        notes.push(`${file.name} 不是 JPG/PNG/WEBP 图片。`);
        continue;
      }
      try {
        const dataUrl = await shrinkImage(file);
        const bytes = bytesOfDataUrl(dataUrl);
        if (bytes > MAX_IMAGE_BYTES) {
          notes.push(`${file.name} 压缩后仍超过 3MB。`);
          continue;
        }
        added.push({ id: `${Date.now()}-${file.name}-${added.length}`, name: file.name, dataUrl, bytes });
      } catch {
        notes.push(`${file.name} 无法读取。`);
      }
    }
    if (files.length > room) notes.push(`最多 ${MAX_IMAGES} 张，多余的图片已忽略。`);
    setShots((current) => [...current, ...added].slice(0, MAX_IMAGES));
    setFileNote(notes.join(" "));
    setProcessing(false);
  }

  async function onTextFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setFileNote("");
    const name = file.name.toLowerCase();
    if (name.endsWith(".pdf") || file.type === "application/pdf") {
      setFileNote("暂不支持直接读取 PDF。请把需要批改的页面截图（或导出为图片）后用“添加图片”上传。");
      return;
    }
    if (!name.endsWith(".txt") && file.type !== "text/plain") {
      setFileNote("只支持 UTF-8 编码的 .txt 文本文件。");
      return;
    }
    if (file.size > 200 * 1024) {
      setFileNote("文本文件太大了，请控制在 200KB 以内。");
      return;
    }
    try {
      const content = (await file.text()).replace(/^\uFEFF/, "");
      if (content.includes("\uFFFD")) setFileNote("文件里有无法识别的字符，可能不是 UTF-8 编码，请检查内容。");
      setText(content.slice(0, MAX_TEXT));
      if (content.length > MAX_TEXT) setFileNote(`内容超过 ${MAX_TEXT} 字符，已截断。`);
    } catch {
      setFileNote("无法读取这个文件。");
    }
  }

  async function submit() {
    if (empty || tooLong || submitting) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setSubmitting(true);
    setSeconds(0);
    setError("");
    try {
      const data = await api.correct(
        {
          kind,
          ...(primaryGrade?{stage:'primary' as const,grade:primaryGrade}:{}),
          text: text.trim(),
          maxScore,
          ...(prompt.trim() ? { prompt: prompt.trim() } : {}),
          ...(shots.length ? { images: shots.map((shot) => shot.dataUrl) } : {}),
        },
        controller.signal,
      );
      setResult(data);
      setCollected(addMistakes(correctionMistakes(kind, data, { text, prompt })));
      recordCorrection({ kind, score: data.score, maxScore: data.maxScore, summary: data.summary });
      window.setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (err) {
      setError(isAbort(err) ? "已停止等待批改结果（服务器端可能仍在处理）。输入内容和图片仍保留，可重新提交。" : `${errorText(err)} 输入内容和图片仍保留，可点击“开始批改”重试。`);
    } finally {
      setSubmitting(false);
    }
  }

  function loadSample() {
    if(primaryGrade){setPrompt(isEssay?'用简单的英语介绍你喜欢的动物，写3到5句话。':'选择正确单词：I ____ a student. A. am B. is C. are D. be');setText(isEssay?'I like cats. My cat have white fur. She is small and very cute. I plays with her after school.':'1. B');setMaxScore(15);return;}
    const sample = SAMPLES[kind];
    setPrompt(sample.prompt);
    setText(sample.text);
    setMaxScore(sample.score);
  }

  async function copyRevised() {
    if (!result?.revised) return;
    const ok = await copyText(result.revised);
    setCopied(ok);
    if (!ok) setError("复制失败，请手动选择文字复制。");
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <section className="view">
      <SectionHeader
        eyebrow={isEssay ? "Writing" : "Answer Check"}
        title={isEssay ? primaryGrade?`小学${primaryGrade}年级 · 写作小老师`:"作文批改" : "题目批改"}
        description={
          primaryGrade ? '根据所选年级讲解真实错误，保留孩子原本的表达；支持输入文字或上传清晰照片。' : isEssay
            ? "粘贴作文或上传手写照片，按高考评分维度给出分数、逐句纠错和修改稿。"
            : "粘贴题目和学生答案（或上传题目截图），逐题判断并讲解。"
        }
        action={
          <button type="button" className="btn btn-ghost btn-sm" onClick={loadSample} disabled={submitting}>
            示例
          </button>
        }
      />

      <div className="card card-pad space-y-5">
        <fieldset className="field">
          <legend className="field-label">{isEssay ? "写作类型" : "满分"}</legend>
          <div className="segmented">
            {(primaryGrade?[15] as const:[15, 25] as const).map((value) => (
              <button key={value} type="button" className={cx("seg", maxScore === value && "is-active")} aria-pressed={maxScore === value} onClick={() => setMaxScore(value)} disabled={submitting}>
                {primaryGrade?'小学练习反馈 · 15 分':isEssay ? (value === 15 ? "应用文 · 15 分" : "读后续写 · 25 分") : `${value} 分`}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="field">
          <label htmlFor={`${kind}-prompt`} className="field-label">
            {isEssay ? "题目要求（可选）" : "题目内容"}
            <span className="field-count">{prompt.length} / {MAX_PROMPT}</span>
          </label>
          <textarea
            id={`${kind}-prompt`}
            className={cx("text-area", prompt.length > MAX_PROMPT && "is-wrong")}
            rows={isEssay ? 3 : 6}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder={isEssay ? (maxScore === 25 ? "粘贴读后续写的原文和段首句，帮助判断情节衔接。" : "粘贴写作任务要求，帮助判断要点是否齐全。") : "粘贴题干、原文和选项。也可以全部放进下方答案框。"}
            disabled={submitting}
          />
        </div>

        <div className="field">
          <label htmlFor={`${kind}-text`} className="field-label">
            {isEssay ? "作文正文" : "学生答案"}
            <span className={cx("field-count", tooLong && "text-[var(--orange)]")}>
              {isEssay ? `${words} 词 · ` : ""}
              {text.length} / {MAX_TEXT}
            </span>
          </label>
          <textarea
            id={`${kind}-text`}
            className={cx("text-area text-area-write", text.length > MAX_TEXT && "is-wrong")}
            rows={isEssay ? 12 : 8}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={isEssay ? "Dear ..., / 在这里输入或粘贴英文作文" : "例如：\n1. B\n2. which\n3. to honor"}
            lang="en"
            spellCheck={false}
            disabled={submitting}
          />
          {isEssay && words > 0 ? (
            <p className="hint">{primaryGrade?'从几个正确的句子开始，按老师布置的要求写作。':maxScore === 15 ? "应用文建议约 80 词。" : "读后续写两段合计建议约 150 词。"}当前 {words} 词。</p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => imageInput.current?.click()} disabled={submitting || processing || shots.length >= MAX_IMAGES}>
            <ImagePlus aria-hidden className="size-4" /> 添加图片（{shots.length}/{MAX_IMAGES}）
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => textInput.current?.click()} disabled={submitting}>
            <FileText aria-hidden className="size-4" /> 导入 .txt
          </button>
          <input ref={imageInput} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={onImages} />
          <input ref={textInput} type="file" accept=".txt,text/plain,.pdf,application/pdf" hidden onChange={onTextFile} />
        </div>
        {processing ? <Loading label="正在压缩图片…" /> : null}
        {fileNote ? <p className="note note-warn">{fileNote}</p> : null}
        {shots.length ? (
          <ul className="shot-row">
            {shots.map((shot) => (
              <li key={shot.id} className="shot">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={shot.dataUrl} alt={`已添加：${shot.name}`} />
                <span className="shot-meta">{(shot.bytes / 1024).toFixed(0)} KB</span>
                <button type="button" className="shot-remove" onClick={() => setShots((list) => list.filter((item) => item.id !== shot.id))} aria-label={`移除 ${shot.name}`} disabled={submitting}>
                  <X aria-hidden className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {error ? <ErrorNote message={error} /> : null}
        {aiNotice ? <p className="note note-info">{aiNotice}</p> : null}

        <div className="submit-row">
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn btn-primary" onClick={submit} disabled={empty || tooLong || submitting || processing}>
              {submitting ? <Loading label={`AI 批改中… ${seconds}s`} /> : (<><Send aria-hidden className="size-4" /> 开始批改</>)}
            </button>
            {submitting ? (
              <button type="button" className="btn btn-ghost" onClick={() => controllerRef.current?.abort()}>
                <StopCircle aria-hidden className="size-4" /> 取消
              </button>
            ) : null}
          </div>
          <p className="hint">提交后，文字和图片会发送给已配置的第三方 AI 模型服务进行批改。请勿包含身份证号等个人敏感信息。</p>
          {tooLong ? <p className="hint text-[var(--orange)]">内容超出长度限制，请删减后再提交。</p> : null}
        </div>
      </div>

      {result ? (
        <div ref={resultRef} className="scroll-mt-6 space-y-5">
          <div className="card card-pad result-head">
            <div className="score-block">
              <p className="eyebrow">AI 评分（仅供参考）</p>
              <p className="score-num">
                {result.score}
                <span> / {result.maxScore}</span>
              </p>
            </div>
            {result.summary ? <p className="result-summary">{result.summary}</p> : null}
            <p className="meta-line result-collected" role="status">
              {collected ? `${collected} 处错误已自动加入错题集（${kind === "essay" ? "作文句子修改" : "题目订正"}），可在「错题集」里挑战清除。` : "本次没有可加入错题集的错误。"}
            </p>
          </div>

          {result.recognized || result.uncertainty?.length ? (
            <div className="card card-pad space-y-3">
              <h2 className="sub-title flex items-center gap-2">
                <ScanText aria-hidden className="size-5" /> 图片识别结果
              </h2>
              {result.recognized ? <pre className="recognized" lang="en">{result.recognized}</pre> : null}
              {result.uncertainty?.length ? (
                <div className="note note-warn">
                  <AlertTriangle aria-hidden className="size-5 shrink-0" />
                  <div>
                    <p className="font-semibold">以下内容识别不确定，请核对原图：</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5">
                      {result.uncertainty.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {result.dimensions.length ? (
            <div className="card card-pad">
              <h2 className="sub-title">分项评价</h2>
              <ul className="dimension-list">
                {result.dimensions.map((item) => (
                  <li key={item.name}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-semibold">{item.name}</span>
                      <span className="tabular-nums text-[var(--ink-soft)]">
                        {item.score} / {item.max}
                      </span>
                    </div>
                    <div className="progress-track">
                      <span style={{ width: `${item.max ? Math.min(100, (item.score / item.max) * 100) : 0}%` }} />
                    </div>
                    {item.comment ? <p className="text-sm text-[var(--ink-soft)]">{item.comment}</p> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {result.errors.length ? (
            <div className="card card-pad">
              <h2 className="sub-title">错误与修改 · {result.errors.length} 处</h2>
              <ol className="error-list">
                {result.errors.map((item, index) => (
                  <li key={`${item.original}-${index}`}>
                    <div className="error-pair" lang="en">
                      <del>{item.original}</del>
                      <span aria-hidden className="text-[var(--ink-faint)]">→</span>
                      <ins>{item.corrected}</ins>
                    </div>
                    <p className="text-sm">
                      {item.category ? <span className="tag tag-lime mr-2">{item.category}</span> : null}
                      {item.reason}
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          {result.revised ? (
            <div className="card card-pad space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="sub-title m-0">{isEssay ? "修改稿" : "订正版"}</h2>
                <div className="flex gap-2">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={copyRevised}>
                    {copied ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />} {copied ? "已复制" : "复制"}
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => downloadText(isEssay ? "修改稿.txt" : "订正版.txt", result.revised)}>
                    <Download aria-hidden className="size-4" /> 下载
                  </button>
                </div>
              </div>
              <div className="passage" lang="en">
                {result.revised}
              </div>
            </div>
          ) : null}

          {result.advice.length ? (
            <div className="card card-pad">
              <h2 className="sub-title flex items-center gap-2">
                <Lightbulb aria-hidden className="size-5" /> 下一步练习
              </h2>
              <ul className="advice-list">
                {result.advice.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <button type="button" className="btn btn-ghost" onClick={() => downloadText(isEssay ? "作文批改报告.txt" : "题目批改报告.txt", correctionToText(result))}>
            <Download aria-hidden className="size-4" /> 下载完整报告
          </button>
        </div>
      ) : null}
    </section>
  );
}

