/**
 * 设备指纹稳定生成工具：按优先级采集 /etc/machine-id、macOS IOPlatformUUID、
 * Windows MachineGuid，全部失败时落盘随机 device.id。
 */

import { createHash, randomBytes } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import {
  LICENSE_HWID_SALT,
  LICENSE_HWID_SALT_MAC,
  LICENSE_HWID_SALT_WIN,
} from './license.constants';

/** 指纹生成的可注入依赖（便于替换 fs/exec 与平台行为） */
type FingerprintDeps = {
  machineIdPath?: string;
  internalDir: string;
  readFile?: (path: string, enc: BufferEncoding) => string;
  exists?: (path: string) => boolean;
  writeFile?: (path: string, data: string) => void;
  mkdir?: (path: string) => void;
  execMacUuid?: () => string | null;
  execWinMachineGuid?: () => string | null;
  bypassFingerprint?: string | null;
};

/** 默认 macOS 平台读取 IOPlatformUUID（非 darwin 返回 null） */
function defaultExecMacUuid(): string | null {
  if (process.platform !== 'darwin') return null;
  try {
    const out = execSync('ioreg -rd1 -c IOPlatformExpertDevice', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const match = out.match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

/** 读取 Windows 机器 GUID（同 OS 安装下稳定，优于随机 device.id） */
function defaultExecWinMachineGuid(): string | null {
  if (process.platform !== 'win32') return null;
  try {
    const out = execSync(
      'reg query "HKLM\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid',
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        windowsHide: true,
      },
    );
    const match = out.match(/MachineGuid\s+REG_SZ\s+(\S+)/i);
    return match?.[1]?.trim() || null;
  } catch {
    return null;
  }
}

/** 将任意设备材料规范为 64 位 hex，便于签发 CLI 校验 */
function toHwidHex(material: string, salt: string): string {
  return createHash('sha256').update(material + salt).digest('hex');
}

/**
 * 读取已持久化的 device.id（随机材料），并以落盘盐值再做一次哈希得到 HWID。
 * 落盘值本身是原始随机材料，故此处必然需要再哈希；优先复用持久化值可避免
 * 升级后改用 MachineGuid 造成 HWID 突变。
 */
function readPersistedDeviceId(
  deps: FingerprintDeps,
  exists: (path: string) => boolean,
  readFile: (path: string, enc: BufferEncoding) => string,
): string | null {
  try {
    const fallbackPath = join(deps.internalDir, 'device.id');
    if (!exists(fallbackPath)) return null;
    const rawId = readFile(fallbackPath, 'utf8').trim();
    if (!rawId) return null;
    return toHwidHex(rawId, LICENSE_HWID_SALT);
  } catch {
    return null;
  }
}

/**
 * 生成硬件指纹：按优先级尝试各平台材料，第一个命中即返回。
 * 优先级：bypass → machine-id → mac UUID → 已有 device.id → Windows MachineGuid → 新建 device.id。
 * 全部失败时新建随机 device.id 落盘；落盘也失败时回退 'UNIDENTIFIED'。
 */
export function generateHardwareFingerprint(deps: FingerprintDeps): string {
  if (deps.bypassFingerprint) return deps.bypassFingerprint;

  const exists = deps.exists ?? existsSync;
  const readFile = deps.readFile ?? ((p, enc) => readFileSync(p, enc));
  const writeFile =
    deps.writeFile ??
    ((p, data) => writeFileSync(p, data, { encoding: 'utf8', mode: 0o600 }));
  const mkdir = deps.mkdir ?? ((p) => mkdirSync(p, { recursive: true }));
  const machineIdPath = deps.machineIdPath ?? '/etc/machine-id';
  const execMacUuid = deps.execMacUuid ?? defaultExecMacUuid;
  const execWinMachineGuid = deps.execWinMachineGuid ?? defaultExecWinMachineGuid;

  try {
    if (exists(machineIdPath)) {
      const machineId = readFile(machineIdPath, 'utf8').trim();
      if (machineId) {
        return toHwidHex(machineId, LICENSE_HWID_SALT);
      }
    }
  } catch {
    /* 落入下一分支 */
  }

  const macUuid = execMacUuid();
  if (macUuid) {
    return toHwidHex(macUuid, LICENSE_HWID_SALT_MAC);
  }

  const persisted = readPersistedDeviceId(deps, exists, readFile);
  if (persisted) return persisted;

  const winGuid = execWinMachineGuid();
  if (winGuid) {
    return toHwidHex(winGuid, LICENSE_HWID_SALT_WIN);
  }

  try {
    if (!exists(deps.internalDir)) mkdir(deps.internalDir);
    const fallbackPath = join(deps.internalDir, 'device.id');
    const rawId = randomBytes(16).toString('hex');
    writeFile(fallbackPath, rawId);
    return toHwidHex(rawId, LICENSE_HWID_SALT);
  } catch {
    return toHwidHex('UNIDENTIFIED', LICENSE_HWID_SALT);
  }
}
