/**
 * @module shared/ha
 * @file ha-config-access.util.ts
 * @brief HA 配置目录（haConfigDir）的 SMB / UNC 访问辅助工具。
 *
 * 职责：
 *  - 探测 UNC 网络路径可读性（带超时，避免无凭据时长时间阻塞）；
 *  - 解析 SMB 凭据（来自 DB 参数或环境变量）；
 *  - 在 Windows 上通过 net use 建立 SMB 会话，Linux/Docker 需用户预先 cifs 挂载；
 *  - 缓存已建立会话的 UNC 共享根，避免重复 net use。
 *
 * 关键依赖：
 *  - fs / fs/promises：路径可读性探测；
 *  - child_process.execFile：调用 net use 建立会话；
 *  - HaConfigCredentials：SMB 凭据结构。
 *
 * 注意：net use 仅在 Windows 可用；Linux/Docker 必须使用本地挂载点。
 */
import { getErrorMessage } from '../../common/utils';
import { constants as fsConstants } from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';

const execFileAsync = promisify(execFile);

/**
 * 带超时的异步操作（超时返回 undefined）。
 *
 * @param promise 待执行的异步任务。
 * @param ms 超时毫秒数。
 * @returns promise 的结果；超时则返回 undefined（不抛错，便于调用方降级处理）。
 */
export async function withAsyncTimeout<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<undefined>((resolve) => {
        timer = setTimeout(() => resolve(undefined), ms);
      }),
    ]);
  } finally {
    // 无论成功或超时，都清理定时器避免泄漏
    if (timer) clearTimeout(timer);
  }
}

/**
 * 探测路径是否可读（UNC 无凭据时用于避免长时间阻塞）。
 *
 * @param configPath 待探测的目录或文件路径。
 * @param timeoutMs 超时毫秒数，默认 4000。
 * @returns true 表示路径可读；false 表示不可读或超时。
 */
/** 探测路径是否可读（UNC 无凭据时用于避免长时间阻塞） */
async function probePathAccessible(configPath: string, timeoutMs = 4000): Promise<boolean> {
  const dir = String(configPath || '').trim();
  if (!dir) return false;
  const ok = await withAsyncTimeout(
    fs
      .access(dir, fsConstants.R_OK)
      .then(() => true)
      .catch(() => false),
    timeoutMs,
  );
  return ok === true;
}

/** 已建立会话的 UNC 共享根（\\server\share）集合，进程级缓存，避免重复 net use */
const connectedShares = new Set<string>();

/**
 * SMB 凭据结构。
 * user / password 来自 DB 参数或环境变量 HA_CONFIG_DIR_USER / HA_CONFIG_DIR_PASSWORD。
 */
interface HaConfigCredentials {
  /** SMB 用户名 */
  user: string;
  /** SMB 密码 */
  password: string;
}

/**
 * 从系统参数 / 环境变量解析 SMB 凭据。
 *
 * 优先使用 DB 中存储的参数，其次回退到环境变量。
 *
 * @param dbUser 数据库中配置的用户名（可空）。
 * @param dbPassword 数据库中配置的密码（可空）。
 * @returns HaConfigCredentials；若均未配置则 user/password 为空字符串。
 */
/** 从系统参数 / 环境变量解析 SMB 凭据 */
export function resolveHaConfigCredentials(
  dbUser?: string | null,
  dbPassword?: string | null,
): HaConfigCredentials {
  return {
    user: String(dbUser || process.env.HA_CONFIG_DIR_USER || '').trim(),
    password: String(dbPassword || process.env.HA_CONFIG_DIR_PASSWORD || '').trim(),
  };
}

/**
 * 是否为 UNC 网络路径（\\server\share 或 //server/share）。
 *
 * @param configPath 待判断的路径。
 * @returns true 表示为 UNC 路径（正斜杠会归一化为反斜杠后再判断）。
 */
/** 是否为 UNC 网络路径（\\server\share 或 //server/share） */
export function isUncConfigPath(configPath: string): boolean {
  const p = String(configPath || '')
    .trim()
    .replace(/\//g, '\\');
  return p.startsWith('\\\\') && p.length > 2;
}

/**
 * 从目录或文件路径提取 UNC 共享根 \\server\share。
 *
 * @param configPath 完整的 UNC 路径（如 \\server\share\config\configuration.yaml）。
 * @returns \\server\share 形式的共享根；非 UNC 路径或层级不足时返回 null。
 */
/** 从目录或文件路径提取 UNC 共享根 \\server\share */
function extractUncShareRoot(configPath: string): string | null {
  const normalized = String(configPath || '')
    .trim()
    .replace(/\//g, '\\');
  if (!isUncConfigPath(normalized)) return null;
  const body = normalized.slice(2);
  const parts = body.split('\\').filter(Boolean);
  // 至少需要 server + share 两段
  if (parts.length < 2) return null;
  return `\\${parts[0]}\${parts[1]}`;
}

/**
 * 判断当前是否 Windows 平台。
 * net use 仅在 Windows 可用。
 */
function isWindows(): boolean {
  return process.platform === 'win32';
}

/**
 * Windows: net use 建立 SMB 会话。
 *
 * @param share UNC 共享根，如 \\server\share。
 * @param user SMB 用户名。
 * @param password SMB 密码（为空时不传，依赖系统当前凭据）。
 * @throws net use 执行失败时抛出异常（由调用方捕获并降级）。
 */
/** Windows: net use 建立 SMB 会话 */
async function netUseWindows(share: string, user: string, password: string): Promise<void> {
  const args = ['use', share];
  if (password) args.push(password);
  args.push(`/user:${user}`, '/persistent:no');
  await execFileAsync('net', args, { windowsHide: true, timeout: 30000 });
}

/**
 * 为 UNC 路径建立 SMB 访问（凭据为空时依赖系统已映射的网络盘）。
 *
 * 决策流程：
 *  1. 非 UNC 路径：直接返回 ok（本地路径无需 SMB）；
 *  2. UNC 但无用户名：探测可读性，可读则降级使用系统凭据，不可读则提示配置凭据；
 *  3. UNC 且有用户名但非 Windows：提示 Linux/Docker 使用 cifs 挂载；
 *  4. UNC 且有用户名且 Windows：net use 建立会话（已建立则跳过）。
 *
 * @param configPath HA 配置目录路径。
 * @param creds 可选的 SMB 凭据。
 * @returns { ok, share?, message, skipped? }；ok 为是否可访问，message 为提示信息。
 */
/** 为 UNC 路径建立 SMB 访问（凭据为空时依赖系统已映射的网络盘） */
export async function ensureHaConfigSmbAccess(
  configPath: string,
  creds?: HaConfigCredentials,
): Promise<{ ok: boolean; share?: string; message: string; skipped?: boolean }> {
  const share = extractUncShareRoot(configPath);
  // 分支 1：本地路径，无需 SMB 认证
  if (!share) {
    return { ok: true, message: '本地路径，无需 SMB 认证', skipped: true };
  }

  const user = creds?.user || '';
  const password = creds?.password || '';
  // 分支 2：UNC 路径但未配置用户名，探测是否可读
  if (!user) {
    const accessible = await probePathAccessible(configPath, 4000);
    if (!accessible) {
      return {
        ok: false,
        share,
        message:
          'UNC 路径不可访问：请在联动器或「高级运行参数」配置 haConfigDirUser / haConfigDirPassword',
      };
    }
    return {
      ok: true,
      share,
      message: 'UNC 路径未配置用户名，将使用系统当前网络凭据',
      skipped: true,
    };
  }

  // 分支 3：配置了用户名但非 Windows，无法使用 net use
  if (!isWindows()) {
    return {
      ok: false,
      share,
      message:
        'Linux/Docker 请先用 cifs 将 SMB 挂载到本地目录（如 /mnt/ha-config），haConfigDir 填写挂载点而非 UNC 路径',
    };
  }

  // 分支 4：Windows 且已配置凭据，若该共享已建立会话则跳过
  if (connectedShares.has(share)) {
    return { ok: true, share, message: `SMB 共享已连接: ${share}` };
  }

  try {
    await netUseWindows(share, user, password);
    connectedShares.add(share);
    return { ok: true, share, message: `已连接 SMB 共享 ${share}` };
  } catch (e: unknown) {
    const msg = getErrorMessage(e);
    return { ok: false, share, message: `SMB 连接失败 (${share}): ${msg}` };
  }
}