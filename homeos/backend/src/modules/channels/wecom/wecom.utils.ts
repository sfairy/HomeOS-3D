/**
 * @file wecom.utils.ts
 * @module ChannelsModule
 *
 * 企业微信文本格式化与分片工具集。
 *
 * 职责：
 * - 将 Agent 回复中的 Markdown 转换为企微可正常显示的纯文本（去语法符号 + 标题前缀）
 * - 按企微单条消息 2000 字节上限对长文本进行自然断点分片
 * - 提供 sleep 工具用于分片之间插入发送间隔，规避企微频控
 *
 * 依赖：无外部依赖（仅使用 Node Buffer 计算字节长度）
 */

/** 计算字符串在 UTF-8 编码下的字节长度（企微按字节计限） */
function getByteLength(str: string): number {
  return Buffer.byteLength(str, 'utf8');
}

/** 企微单条文本消息的字节上限（与官方文档一致） */
const WECOM_TEXT_BYTE_LIMIT = 2000;

/**
 * 将 Markdown 转换为企微可读纯文本。
 *
 * 转换规则：
 * - 代码块：保留缩进，带语言标签的加 `[lang]` 前缀
 * - 行内代码：去除反引号
 * - 三级/二级/一级标题：分别加 ▸ / ■ / ◆ 前缀
 * - 粗体/斜体：去除 `*` 包裹
 * - 链接：`[text](url)` → `text (url)`
 * - 列表项：`-` / `*` 开头转为 `•`
 * - 分割线：`---` 等转为长破折号
 * - 图片：`![alt](url)` → `[图片: alt]`
 * - 合并多余空行（≥3 个换行压缩为 2 个）
 *
 * @param markdown 原始 Markdown 文本
 * @returns 转换后的纯文本
 */
export function markdownToWecomText(markdown: string): string {
  if (!markdown) return markdown;
  let text = markdown;
  text = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, lang: string, code: string) => {
    const lines = code
      .trim()
      .split('\n')
      .map((line) => `  ${line}`)
      .join('\n');
    return lang ? `[${lang}]\n${lines}` : lines;
  });
  text = text.replace(/`([^`]+)`/g, '$1');
  text = text.replace(/^### (.+)$/gm, '▸ $1');
  text = text.replace(/^## (.+)$/gm, '■ $1');
  text = text.replace(/^# (.+)$/gm, '◆ $1');
  text = text.replace(/\*\*\*([^*]+)\*\*\*/g, '$1');
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
  text = text.replace(/\*([^*]+)\*/g, '$1');
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)');
  text = text.replace(/^[-*] /gm, '• ');
  text = text.replace(/^[-*_]{3,}$/gm, '────────────');
  text = text.replace(/!\[([^\]]*)\]\([^)]+\)/g, '[图片: $1]');
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
}

/**
 * 按字节上限对长文本进行自然断点分片。
 *
 * 算法：
 * - 文本总字节 ≤ byteLimit 时直接返回单元素数组
 * - 否则用二分查找定位字节上限对应的最大字符下标 splitIndex
 * - 在 splitIndex 前 200 字符范围内优先按 `\n\n` → `\n` → `。` 寻找自然断点，
 *   命中则将 splitIndex 回退到自然断点位置，避免在词或句子中间切断
 * - 自然断点无效时回退到按字节上限 1/3 处强制切分
 * - 每片 trim 后推入结果数组，循环处理剩余部分
 *
 * @param text 待分片的纯文本（建议先经 markdownToWecomText 处理）
 * @param byteLimit 单片字节上限，默认 2000（企微单条消息上限）
 * @returns 分片后的字符串数组
 */
export function splitWecomText(text: string, byteLimit = WECOM_TEXT_BYTE_LIMIT): string[] {
  if (getByteLength(text) <= byteLimit) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (getByteLength(remaining) <= byteLimit) {
      chunks.push(remaining);
      break;
    }
    let low = 1;
    let high = remaining.length;
    while (low < high) {
      const mid = Math.floor((low + high + 1) / 2);
      if (getByteLength(remaining.slice(0, mid)) <= byteLimit) low = mid;
      else high = mid - 1;
    }
    let splitIndex = low;
    const searchStart = Math.max(0, splitIndex - 200);
    const searchText = remaining.slice(searchStart, splitIndex);
    let naturalBreak = searchText.lastIndexOf('\n\n');
    if (naturalBreak === -1) naturalBreak = searchText.lastIndexOf('\n');
    if (naturalBreak === -1) {
      naturalBreak = searchText.lastIndexOf('。');
      if (naturalBreak !== -1) naturalBreak += 1;
    }
    if (naturalBreak !== -1 && naturalBreak > 0) {
      splitIndex = searchStart + naturalBreak;
    }
    if (splitIndex <= 0) {
      splitIndex = Math.min(remaining.length, Math.floor(byteLimit / 3));
    }
    chunks.push(remaining.slice(0, splitIndex).trim());
    remaining = remaining.slice(splitIndex);
  }
  return chunks;
}
