/**
 * @file structured-logger.ts
 * @module common/observability
 *
 * NestJS 应用日志器：
 * - 始终将日志写入进程内环形缓冲，供管理端「运行日志」查询。
 * - LOG_FORMAT=json 时输出结构化 JSON 行（便于 Loki / ELK）；否则走 ConsoleLogger。
 * - 自动注入当前请求的 traceId。
 * - log/warn/debug/verbose 默认做状态去重（见 status-log-dedupe.util）；error 不去重。
 * - 打印前：全角标点转半角，并收紧中英文/数字边界多余空格。
 */

import { ConsoleLogger, LogLevel, LoggerService } from '@nestjs/common';
import { getTraceId } from './trace-context';
import { pushRuntimeLog, type RuntimeLogLevel } from './runtime-log-buffer.helper';
import { shouldEmitStatusLog } from './status-log-dedupe.util';
import { localizeLoggerContext } from './logger-context-zh.util';

type JsonLog = {
  level: string;
  context?: string;
  message: unknown;
  ts: string;
  traceId?: string;
};

/** Nest 框架内置英文启动日志 → 中文映射 */
const NEST_FRAMEWORK_LOG_ZH: Record<string, string> = {
  'Nest application successfully started': 'Nest应用已成功启动',
  'Starting Nest application...': '正在启动Nest应用...',
};

/** 控制台日志全角标点 → 半角 */
const FULLWIDTH_PUNCT_MULTI: Array<[string, string]> = [
  ['…', '...'],
  ['——', '--'],
];

const FULLWIDTH_PUNCT_MAP: Record<string, string> = {
  '：': ':',
  '，': ',',
  '。': '.',
  '（': '(',
  '）': ')',
  '！': '!',
  '？': '?',
  '；': ';',
  '、': ',',
  '【': '[',
  '】': ']',
  '「': '"',
  '」': '"',
  '『': '"',
  '』': '"',
  '—': '-',
  '～': '~',
  '．': '.',
  '＇': '\'',
  '＂': '"',
  '／': '/',
  '％': '%',
  '＋': '+',
  '－': '-',
  '＝': '=',
  '｜': '|',
};

/** 将日志文本中的全角标点转换为半角，统一控制台输出风格 */
function toHalfWidthPunct(text: string): string {
  let out = text;
  for (const [from, to] of FULLWIDTH_PUNCT_MULTI) {
    out = out.split(from).join(to);
  }
  let result = '';
  for (const ch of out) {
    result += FULLWIDTH_PUNCT_MAP[ch] ?? ch;
  }
  return result;
}

/**
 * 收紧控制台日志里中英文/数字边界的多余空格（打印态，不改业务文案源码）。
 * 例：`Redis 未就绪`→`Redis未就绪`，`7 天`→`7天`，`指纹: 4f97`→`指纹:4f97`
 */
function compactLogSpaces(text: string): string {
  return (
    text
      // 拉丁/数字 与 汉字 之间
      .replace(/([A-Za-z0-9_%./+-])\s+(?=[\u4e00-\u9fff])/g, '$1')
      .replace(/([\u4e00-\u9fff])\s+(?=[A-Za-z0-9_%./+-])/g, '$1')
      // 符号 ≤≥≈~ 与汉字
      .replace(/([≤≥≈~])\s+(?=[\u4e00-\u9fff])/g, '$1')
      // 冒号后、中文前的逗号后
      .replace(/:\s+/g, ':')
      .replace(/,\s+(?=[\u4e00-\u9fff])/g, ',')
      // 紧贴括号：条 (过期 → 条(过期；) 已启用 → )已启用
      .replace(/([\u4e00-\u9fff0-9])\s+\(/g, '$1(')
      .replace(/\)\s+(?=[\u4e00-\u9fffA-Za-z0-9])/g, ')')
  );
}

/** 日志消息本地化：框架英文文案转中文 + 全角转半角 + 收紧空格；非字符串原样返回 */
function localizeLogMessage(message: unknown): unknown {
  if (typeof message !== 'string') return message;
  const localized = NEST_FRAMEWORK_LOG_ZH[message] ?? message;
  return compactLogSpaces(toHalfWidthPunct(localized));
}

/** 将一条日志写入运行日志环形缓冲（供管理端查询），并返回 traceId 与时间戳 */
function capture(
  level: RuntimeLogLevel,
  message: unknown,
  context?: string,
  ts = new Date().toISOString(),
) {
  const traceId = getTraceId();
  pushRuntimeLog({
    level,
    message,
    context,
    ts,
    ...(traceId ? { traceId } : {}),
  });
  return { traceId, ts };
}

/** 状态日志去重闸门：委托 shouldEmitStatusLog 决定是否输出该条日志 */
function allow(level: RuntimeLogLevel, message: unknown, context?: string) {
  return shouldEmitStatusLog(level, context, message);
}

/**
 * LOG_FORMAT=json 时输出结构化 JSON，并写入运行日志缓冲。
 */
class StructuredLogger extends ConsoleLogger {
  constructor(context?: string) {
    super(context || 'HomeOS');
  }

  private emit(level: RuntimeLogLevel, message: unknown, context?: string) {
    const ctx = localizeLoggerContext(context || this.context);
    const localized = localizeLogMessage(message);
    if (!allow(level, localized, ctx)) return;
    const { traceId, ts } = capture(level, localized, ctx);
    const payload: JsonLog = {
      level,
      context: ctx,
      message: localized,
      ts,
      ...(traceId ? { traceId } : {}),
    };
    const line = JSON.stringify(payload);
    if (level === 'error' || level === 'warn') {
      process.stderr.write(`${line}\n`);
    } else {
      process.stdout.write(`${line}\n`);
    }
  }

  log(message: unknown, context?: string) {
    this.emit('log', message, context);
  }

  error(message: unknown, stack?: string, context?: string) {
    const localized = localizeLogMessage(message);
    this.emit('error', stack ? { message: localized, stack } : localized, context);
  }

  warn(message: unknown, context?: string) {
    this.emit('warn', message, context);
  }

  debug(message: unknown, context?: string) {
    this.emit('debug', message, context);
  }

  verbose(message: unknown, context?: string) {
    this.emit('verbose', message, context);
  }

  setLogLevels(levels: LogLevel[]) {
    super.setLogLevels(levels);
  }
}

/**
 * 默认控制台日志器：人类可读输出 + 写入运行日志缓冲。
 */
class CapturingConsoleLogger extends ConsoleLogger implements LoggerService {
  constructor(context?: string) {
    super(context || 'HomeOS');
    this.setLogLevels(['log', 'warn', 'error']);
  }

  log(message: unknown, context?: string) {
    const ctx = localizeLoggerContext(context || this.context);
    const localized = localizeLogMessage(message);
    if (!allow('log', localized, ctx)) return;
    capture('log', localized, ctx);
    super.log(localized as string, ctx);
  }

  error(message: unknown, stackOrContext?: string, context?: string) {
    const hasStack = typeof stackOrContext === 'string' && stackOrContext.includes('\n');
    const stack = hasStack ? stackOrContext : undefined;
    const ctxRaw = hasStack ? context : stackOrContext || context;
    const resolved = localizeLoggerContext(ctxRaw || this.context);
    const localized = localizeLogMessage(message);
    const payload = stack ? { message: localized, stack } : localized;
    // error 不去重，但仍走 allow（内部对 error 恒为 true）
    if (!allow('error', payload, resolved)) return;
    capture('error', payload, resolved);
    if (hasStack) {
      super.error(localized as string, stack, resolved);
    } else {
      super.error(localized as string, resolved);
    }
  }

  warn(message: unknown, context?: string) {
    const ctx = localizeLoggerContext(context || this.context);
    const localized = localizeLogMessage(message);
    if (!allow('warn', localized, ctx)) return;
    capture('warn', localized, ctx);
    super.warn(localized as string, ctx);
  }

  debug(message: unknown, context?: string) {
    const ctx = localizeLoggerContext(context || this.context);
    const localized = localizeLogMessage(message);
    if (!allow('debug', localized, ctx)) return;
    capture('debug', localized, ctx);
    super.debug(localized as string, ctx);
  }

  verbose(message: unknown, context?: string) {
    const ctx = localizeLoggerContext(context || this.context);
    const localized = localizeLogMessage(message);
    if (!allow('verbose', localized, ctx)) return;
    capture('verbose', localized, ctx);
    super.verbose(localized as string, ctx);
  }
}

/**
 * 应用引导阶段选用的日志器：始终可捕获，供前端查询。
 */
export function resolveNestLogger(): LoggerService {
  if (process.env.LOG_FORMAT === 'json') {
    return new StructuredLogger();
  }
  return new CapturingConsoleLogger();
}
