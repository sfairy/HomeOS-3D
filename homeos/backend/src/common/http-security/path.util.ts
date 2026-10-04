/**
 * @file path.util.ts
 * @module common/http-security
 *
 * 路径安全解析与上传 SVG 消毒工具。
 *
 * 职责：
 * - 将用户提供的路径段解析到 configDir 之下，拒绝目录穿越（../ 攻击）。
 * - 对上传的 SVG 文件做基础消毒，移除脚本、事件处理器与高危嵌入标签，防止存储型
 *   XSS。
 *
 * 关键依赖：
 * - Node.js path（路径解析与相对路径计算）
 *
 * 安全相关：路径校验失败返回 null（由调用方决定如何拒绝）；SVG 消毒失败抛出异常
 * 中断上传。两者均为安全关键路径，修改需同步评估攻击面。
 */
import * as path from 'path';
import { badRequest } from '../utils/business-exception';

// ── 安全路径 ── ────────────────────

/**
 * 将路径段解析到 configDir 之下，拒绝目录穿越。
 *
 * 安全意图：用户可能通过 `../../etc/passwd` 等路径穿越到 configDir 之外读取/覆盖
 * 任意文件。本函数先 resolve 再计算相对路径，若结果以 `..` 开头或为绝对路径，说明
 * 已逃逸出 configDir，返回 null 拒绝。
 *
 * @param configDir 配置目录的绝对/相对路径（基准目录）。
 * @param segments 待拼接的路径段（可能来自用户输入）。
 * @returns 解析后的绝对路径；逃逸 configDir 时返回 null。
 */
export function resolveConfigPath(configDir: string, ...segments: string[]): string | null {
  const normalizedBase = path.resolve(configDir);
  const resolved = path.resolve(normalizedBase, ...segments);
  const relative = path.relative(normalizedBase, resolved);
  // 相对路径以 '..' 开头表示已逃逸基准目录；为绝对路径说明跨盘符（Windows）
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return null;
  }
  return resolved;
}

/**
 * 解析 configDir 下的单个文件名段（用于 readdir 条目）。
 *
 * 安全意图：readdir 返回的文件名可能包含 NULL 字节（\0）用于截断攻击，需先过滤
 * 再交给 resolveConfigPath 做穿越校验。
 *
 * @param configDir 配置目录。
 * @param name 文件名（来自 readdir 条目）。
 * @returns 解析后的绝对路径；空名或含 NULL 字节或逃逸时返回 null。
 */
export function resolveConfigEntryPath(configDir: string, name: string): string | null {
  if (!name || name.includes('\0')) return null;
  return resolveConfigPath(configDir, name);
}

// ── SVG 净化 ── ────────────────────

/**
 * 上传 SVG 基础消毒：匹配到以下任一模式即拒绝。
 *
 * 安全意图：SVG 可内嵌 <script>、事件处理器（onclick 等）、javascript: URI 与
 * foreignObject/iframe 等可执行 HTML 的标签，被浏览器渲染后会形成存储型 XSS。
 */
const BLOCKED_PATTERNS = [
  /<script[\s>]/i,
  /javascript:/i,
  /data:\s*text\/html/i,
  /\bon\w+\s*=/i,
  /<foreignObject[\s>]/i,
  /<iframe[\s>]/i,
  /<embed[\s>]/i,
  /<object[\s>]/i,
  /<use[^>]+href\s*=\s*["']?\s*javascript:/i,
];

/** SVG 根元素校验：文件必须以 <svg> 开头才视为合法 SVG */
const ALLOWED_ROOT = /^<\s*svg[\s>]/i;

/**
 * 对上传的 SVG 内容做基础消毒并返回清洗后的 Buffer。
 *
 * 校验流程：
 * 1. 内容非空；
 * 2. 以 <svg> 根元素开头；
 * 3. 不命中任何 BLOCKED_PATTERNS。
 *
 * 安全意图：这是存储型 XSS 的最后一道防线，任何一条不满足即抛异常拒绝上传。
 * 注意：正则消毒无法覆盖所有 SVG 攻击向量（如编码绕过），生产环境建议配合 CSP。
 *
 * @param buffer 原始上传内容。
 * @returns 消毒后的 UTF-8 Buffer。
 * @throws {BusinessException} 400 内容为空 / 根元素非 svg / 含有不允许的脚本或嵌入内容。
 */
export function sanitizeUploadedSvg(buffer: Buffer): Buffer {
  const text = buffer.toString('utf8').trim();
  if (!text) {
    badRequest('SVG 内容为空');
  }
  if (!ALLOWED_ROOT.test(text)) {
    badRequest('文件须以 <svg> 根元素开头');
  }
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(text)) {
      badRequest('SVG 含有不允许的脚本或嵌入内容');
    }
  }
  return Buffer.from(text, 'utf8');
}