/**
 * @file channels-reply.util.ts
 * @module ChannelsModule
 *
 * 将 AgentService 的对话结果（AgentChatResponse）转换为 IM 通道口语化回复。
 *
 * 设计要点：
 * - 成功但 Agent 未给出明确文案时，从 SUCCESS_REPLIES 随机选一句短确认，避免冷场。
 * - 失败且无文案时，从 FAIL_REPLIES 随机选一句，语气更自然。
 * - 支持注入 pick 函数以便单测确定性取值。
 */
import type { AgentChatResponse } from '../agent/service';

/** 去除回复中的 Markdown 噪音，便于企微 / MCP / 硬件屏展示 */
function stripMarkdownForChannel(text: string): string {
  if (!text) return text;
  let out = text;
  out = out.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang: string, code: string) => {
    const lines = code
      .trim()
      .split('\n')
      .map((line) => `  ${line}`)
      .join('\n');
    return lang ? `[${lang}]\n${lines}` : lines;
  });
  out = out.replace(/`([^`]+)`/g, '$1');
  out = out.replace(/^#{1,3}\s+(.+)$/gm, '$1');
  out = out.replace(/\*\*\*([^*]+)\*\*\*/g, '$1');
  out = out.replace(/\*\*([^*]+)\*\*/g, '$1');
  out = out.replace(/\*([^*]+)\*/g, '$1');
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1');
  out = out.replace(/\n{3,}/g, '\n\n');
  return out.trim();
}

/**
 * 从数组中随机取一项。
 * @param arr 候选数组
 * @returns 随机元素
 */
function pickOne(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** 成功时的短确认语料库（Agent 静默成功时随机选一句回发） */
const SUCCESS_REPLIES = [
  '搞定了',
  '收到',
  '好的',
  '已处理',
  '没问题',
  '安排上了',
  '完成',
  '好了',
  'OK',
  '办妥了',
  '处理好了',
  '照你说的做了',
  '搞定',
  '这就好',
  '行',
  '收到了',
  '好嘞',
  '得令',
  '马上去办',
  '来了',
];

/** 失败时的短回复语料库（Agent 失败且无文案时随机选一句回发） */
const FAIL_REPLIES = [
  '没成功，请重试',
  '出了点问题，再试一下',
  '没反应，换个说法试试',
  '没搞定，再试一次',
  '好像不太对，重试一下',
  '没办成，再试试看',
  '没反应，设备可能不在线',
  '出了点状况，请重试',
];

/**
 * 将 Agent 结果转为 IM 口语回复；success 静默时可返回短确认语。
 *
 * 转换规则：
 * - `success`：优先返回 Agent 给出的 reply；为空时随机选一句短确认。
 * - `answer`：直接回答类，必须返回 reply（无则退化为短确认）。
 * - `blocked`：被安全策略拦截，返回 reply 或默认拦截提示。
 * - `failed` / 其他：返回 reply 或随机一句失败提示。
 *
 * @param result Agent 对话结果，至少包含 outcome 与 reply
 * @param opts 可选配置；pick 可注入自定义选择函数（用于测试）
 * @returns 适合 IM 回发的文本
 */
export function formatChannelReply(
  result: Pick<AgentChatResponse, 'outcome' | 'reply'>,
  opts?: { pick?: (arr: string[]) => string },
): string {
  const choose = opts?.pick ?? pickOne;
  let raw: string;
  switch (result.outcome) {
    case 'success':
      // 有明确文案就用，否则随机短确认
      raw = (result.reply && result.reply.trim()) || choose(SUCCESS_REPLIES);
      break;
    case 'answer':
      raw = result.reply || choose(SUCCESS_REPLIES);
      break;
    case 'blocked':
      // 安全拦截：保留 Agent 文案，否则用默认提示
      raw = result.reply || '出于安全考虑，这个操作被拦截了。';
      break;
    case 'failed':
    default:
      raw = result.reply ? result.reply : choose(FAIL_REPLIES);
      break;
  }
  return stripMarkdownForChannel(raw);
}