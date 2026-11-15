import type { StatusResponse } from "./api";

export type StatusLike = StatusResponse & {
  health?: "ready" | "unknown" | "degraded";
  aiMessage?: string;
  quota?: { daily: number };
  loginRequired?: boolean;
};

export interface AiStatusInfo {
  label: string;
  short: string;
  tone: "ok" | "unknown" | "warn";
  notice?: string;
}

const GUIDANCE = "AI 请求可能需要排队，返回的结果是学习参考，请结合解析自行判断。";

export function aiStatusInfo(status: StatusLike | null, statusError: string): AiStatusInfo {
  if (!status) {
    return statusError
      ? { label: "服务状态暂时无法获取", short: "未知", tone: "unknown", notice: `暂时无法确认 AI 状态（${statusError}），仍可尝试提交；失败时输入内容会保留。${GUIDANCE}` }
      : { label: "正在检查服务…", short: "…", tone: "unknown" };
  }
  if (!status.ai) {
    return { label: "AI 功能暂未开放", short: "未开放", tone: "warn", notice: `AI 功能目前没有开放，提交可能会失败。题库练习、词库和听写不受影响。` };
  }
  if (status.health === "ready") {
    return { label: "AI 已连接", short: "已连接", tone: "ok", notice: GUIDANCE };
  }
  if (status.health === "degraded") {
    const message = status.aiMessage?.trim() || "AI 服务目前不太稳定，可能较慢或失败。";
    return { label: "AI 服务不稳定", short: "不稳定", tone: "warn", notice: `${message} 失败时输入内容会保留，可稍后重试。${GUIDANCE}` };
  }
  return { label: "AI 服务已配置", short: "已配置", tone: "unknown", notice: `${status.aiMessage?.trim() ? `${status.aiMessage.trim()} ` : ""}${GUIDANCE}` };
}
