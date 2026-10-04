/**
 * 职责：
 *  - 启动期向授权商店取回授权公钥（Ed25519 验签公钥 + X25519 传输公钥）并落盘。
 * 关键依赖：
 *  - Node 内置 fetch / fs。
 * 约定：
 *  - 移植自 ops/docker/bootstrap_keys.py，指纹口径与商店侧 key_id_from_public 一致；
 *  - 公钥不是秘密（租约真伪由 Ed25519 验签保证），此端点是商店唯一的明文授权端点。
 */

import { createHash } from 'crypto';
import {
  chmodSync,
  mkdirSync,
  openSync,
  closeSync,
  readFileSync,
  renameSync,
  writeSync,
} from 'fs';
import { basename, dirname, join } from 'path';
import { publicKeySha256, deriveKeyId } from './crypto';

export const SIGNING_PUBLIC_KEY_FILENAME = 'license-public.pem';
export const TRANSPORT_PUBLIC_KEY_FILENAME = 'license-transport-public.pem';

const PUBLIC_KEY_MARKER = '-----BEGIN PUBLIC KEY-----';
const MAX_PEM_BYTES = 4096;
const KEYS_PATH = '/v2/keys';
const FETCH_TIMEOUT_MS = 10_000;

/** 取回授权公钥失败（网络、格式、指纹或一致性校验不通过）。 */
class LicenseKeyFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LicenseKeyFetchError';
  }
}

function isPem(path: string): boolean {
  try {
    const payload = readFileSync(path);
    return payload.length > 0 && payload.includes(PUBLIC_KEY_MARKER);
  } catch {
    return false;
  }
}

/** 目录里是否已有可用的两个公钥。 */
export function keysReady(directory: string): boolean {
  return (
    isPem(join(directory, SIGNING_PUBLIC_KEY_FILENAME)) &&
    isPem(join(directory, TRANSPORT_PUBLIC_KEY_FILENAME))
  );
}

/** 原子写公钥（0644）：容器里换用户跑时权限错会让下次启动读不到。 */
function writePublic(path: string, payload: Buffer): void {
  const temporary = join(dirname(path), `.${basename(path)}.tmp`);
  const descriptor = openSync(temporary, 'w', 0o644);
  try {
    writeSync(descriptor, payload);
  } finally {
    closeSync(descriptor);
  }
  chmodSync(temporary, 0o644);
  renameSync(temporary, path);
}

function decodePem(value: unknown, label: string): Buffer {
  if (typeof value !== 'string' || !value.includes(PUBLIC_KEY_MARKER)) {
    throw new LicenseKeyFetchError(`授权服务器返回的${label}不是 PEM 公钥。`);
  }
  const payload = Buffer.from(value, 'utf8');
  if (payload.length > MAX_PEM_BYTES) {
    throw new LicenseKeyFetchError(`授权服务器返回的${label}异常偏大（${payload.length} 字节）。`);
  }
  return payload;
}

function checkFingerprint(payload: Record<string, unknown>, field: string, actual: string, label: string): void {
  const declared = payload[field];
  if (typeof declared !== 'string' || !declared.trim()) {
    throw new LicenseKeyFetchError(`授权服务器没有声明${label}的指纹，拒绝采用。`);
  }
  if (declared.trim().toLowerCase() !== actual) {
    throw new LicenseKeyFetchError(`授权服务器返回的${label}与它声明的指纹不一致，拒绝采用。`);
  }
}

/** 向授权服务器取一份公钥响应（明文 GET）。 */
async function fetchLicenseKeys(licenseServerUrl: string): Promise<Record<string, unknown>> {
  const url = `${licenseServerUrl.replace(/\/+$/, '')}${KEYS_PATH}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
  } catch (error) {
    const hint = url.startsWith('https://')
      ? ' 若跨机部署用的是商店内置反代的 HTTPS 端口，它用的是自签证书，本进程默认不信任；请改用商店的 HTTP 端口（如 http://<商店IP>:8802）。'
      : '';
    throw new LicenseKeyFetchError(
      `无法连接授权服务器取回公钥（${url}）：${error instanceof Error ? error.message : String(error)}${hint}`,
    );
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    let detail = '';
    try {
      const body = (await response.json()) as { detail?: unknown };
      if (body && typeof body.detail === 'string') detail = body.detail.trim();
    } catch {
      detail = '';
    }
    throw new LicenseKeyFetchError(
      `授权服务器拒绝公钥请求（HTTP ${response.status}）${detail ? `：${detail}` : '。'}`,
    );
  }
  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    throw new LicenseKeyFetchError(`授权服务器返回的公钥响应不是合法 JSON（${url}）。`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new LicenseKeyFetchError(`授权服务器返回的公钥响应格式无效（${url}）。`);
  }
  return parsed as Record<string, unknown>;
}

/** 校验并把取回的公钥落到目录；校验不通过时绝不改动任何已有文件。 */
function applyLicenseKeys(
  directory: string,
  payload: Record<string, unknown>,
  log: (message: string) => void,
): boolean {
  const signing = decodePem(payload.licensePublicKey, '签名公钥');
  const transport = decodePem(payload.licenseTransportPublicKey, '传输公钥');
  const signingSha256 = createHash('sha256').update(signing).digest('hex');
  const transportSha256 = createHash('sha256').update(transport).digest('hex');
  checkFingerprint(payload, 'licensePublicKeySha256', signingSha256, '签名公钥');
  checkFingerprint(payload, 'licenseTransportPublicKeySha256', transportSha256, '传输公钥');

  const signingPath = join(directory, SIGNING_PUBLIC_KEY_FILENAME);
  const transportPath = join(directory, TRANSPORT_PUBLIC_KEY_FILENAME);

  const signingChanged = !(isPem(signingPath) && publicKeySha256(signingPath) === signingSha256);
  mkdirSync(directory, { recursive: true });
  const wanted: Array<[string, Buffer]> = [[transportPath, transport]];
  if (signingChanged) wanted.push([signingPath, signing]);
  for (const [path, content] of wanted) {
    if (isPem(path) && readFileSync(path).equals(content)) continue;
    writePublic(path, content);
  }
  log(
    `授权公钥已同步：keyId=${deriveKeyId(signingPath)}` +
      ` 签名 sha256=${signingSha256.slice(0, 16)}… 传输 sha256=${transportSha256.slice(0, 16)}…`,
  );
  return signingChanged;
}

function fetchEnabled(env: NodeJS.ProcessEnv): boolean {
  const raw = (env.APP_CLIENT_KEYS_FETCH ?? '').trim().toLowerCase();
  return !['0', 'false', 'no', 'off'].includes(raw);
}

/**
 * 确保目录里有可用的授权公钥。
 *
 * 只读目录（同机部署时商店写出的共享卷）一律不动；本地已有公钥时取回失败也能离线放行。
 */
export async function ensureClientKeys(
  directory: string,
  options: {
    licenseServerUrl: string;
    env?: NodeJS.ProcessEnv;
    retrySeconds?: number;
    log: (message: string) => void;
  },
): Promise<boolean> {
  const env = options.env ?? process.env;
  try {
    mkdirSync(directory, { recursive: true });
  } catch {
    /* 只读目录在下面按 keysReady 处理 */
  }
  const ready = keysReady(directory);
  if (!fetchEnabled(env)) {
    options.log('已按 APP_CLIENT_KEYS_FETCH 关闭公钥自动取回。');
    return ready;
  }
  if (!options.licenseServerUrl) {
    options.log('未配置 APP_LICENSE_SERVER_URL：无法自动取回授权公钥。');
    return ready;
  }
  if (ready) {
    options.log(`授权公钥已在本地：${directory}`);
  }
  try {
    const payload = await fetchLicenseKeys(options.licenseServerUrl);
    applyLicenseKeys(directory, payload, options.log);
    return true;
  } catch (error) {
    if (ready) {
      options.log(
        `警告：${error instanceof Error ? error.message : String(error)} 沿用本地已有的授权公钥。`,
      );
      return true;
    }
    throw error;
  }
}
