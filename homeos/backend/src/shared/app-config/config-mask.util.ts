/**
 * 应用配置脱敏与角色裁剪工具。
 *
 * 职责：
 *   - maskSensitiveFieldsByKey：按 key 正则递归脱敏对象中的敏感字段（password/token/secret 等）；
 *   - applyImportReplacePreservingSecrets：全量 replace 导入时保留当前配置中对应脱敏字段的真实值
 *     （导入带占位符的备份不会覆盖 HA Token 等密钥）；
 *   - stripMaskedPlaceholders：PUT 时剔除脱敏占位符与空/null 敏感字段，避免覆盖真实密钥；
 *     递归进入对象数组（如 clientPower.clients）；
 *   - restoreClientPowerReportTokens：保存 clients 数组时按 id 回填已有 reportToken；
 *   - pickConfigForRole：按角色（admin/adult/访客/儿童）裁剪 GET /system/config 下发内容。
 * 关键依赖：./constants#PUBLIC_CONFIG_SECTIONS（公开分区白名单）。
 */
import { PUBLIC_CONFIG_SECTIONS } from './constants';

/** 敏感字段 key 正则（password/token/secret 等） */
const SENSITIVE_FIELD_RE = /password|token|secret|apikey|webhook|key$/i;

/** 管理员 GET 时下发的敏感字段占位符（PUT 时原样回传则跳过更新） */
export const CONFIG_MASK_PLACEHOLDER = '••••••••';

/** adult 可读 security 分区字段（Dashboard/安防页只读消费） */
const ADULT_SECURITY_READ_KEYS = [
  'sensorAlertCooldownSec',
  'requireConfiguredPersons',
  'autoArmOnEveryoneLeft',
  'autoUpgradeToAwayOnEveryoneLeft',
  'autoDisarmOnFirstHome',
  'presencePersons',
  'linkAwaySimOnArmAway',
  'linkHomeModeOnSecurityChange',
  'frigatePersonAlarmModes',
  'frigateMaxEvents',
  'frigateDedupMs',
] as const;

/** adult 可读 energy 分区字段 */
const ADULT_ENERGY_READ_KEYS = [
  'meterEntityId',
  'circuitEntityIds',
  'learningPeriodDays',
  'learningStartedAt',
] as const;

/** 是否为脱敏占位值（导出备份或 GET 脱敏后回传） */
export function isMaskedValue(val: unknown): boolean {
  return val === CONFIG_MASK_PLACEHOLDER || val === '********';
}

type ClientPowerTokenClient = { id?: string; reportToken?: string };
type ClientPowerTokenSection = { clients?: ClientPowerTokenClient[] };

/**
 * 保存 clients 数组时按 id 回填已有 reportToken。
 * 前端归一化会丢掉密钥，GET 脱敏占位符也不能当新密钥写入。
 */
export function restoreClientPowerReportTokens(
  next: ClientPowerTokenSection | undefined,
  prev: ClientPowerTokenSection | undefined,
): void {
  if (!next?.clients?.length) return;
  const prevById = new Map(
    (prev?.clients || []).map(
      (c) => [String(c.id || '').trim(), String(c.reportToken || '').trim()] as const,
    ),
  );
  for (const client of next.clients) {
    const id = String(client.id || '').trim();
    if (!id) continue;
    const current = String(client.reportToken || '').trim();
    if (current && !isMaskedValue(current)) continue;
    const kept = prevById.get(id);
    if (kept) client.reportToken = kept;
    else if (isMaskedValue(client.reportToken)) client.reportToken = '';
  }
}

/** 按 key 正则递归脱敏对象中的敏感字段 */
export function maskSensitiveFieldsByKey(
  obj: Record<string, unknown>,
  placeholder = CONFIG_MASK_PLACEHOLDER,
  depth = 0,
  maxDepth = 4,
) {
  if (!obj || typeof obj !== 'object' || depth > maxDepth) return;
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (Array.isArray(val)) {
      for (const item of val) {
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          maskSensitiveFieldsByKey(
            item as Record<string, unknown>,
            placeholder,
            depth + 1,
            maxDepth,
          );
        }
      }
    } else if (val && typeof val === 'object') {
      maskSensitiveFieldsByKey(val as Record<string, unknown>, placeholder, depth + 1, maxDepth);
    } else if (SENSITIVE_FIELD_RE.test(key) && val != null && String(val).length > 0) {
      obj[key] = placeholder;
    }
  }
}

/**
 * 全量 replace 导入：保留当前配置中对应脱敏字段的真实值
 * （导入带 •••••••• 的备份不会覆盖 HA Token 等密钥）
 */
export function applyImportReplacePreservingSecrets<T extends Record<string, unknown>>(
  imported: T,
  current: Record<string, unknown>,
): T {
  const out = structuredClone(imported) as Record<string, unknown>;
  const restore = (
    target: Record<string, unknown>,
    srcImp: Record<string, unknown>,
    srcCur: Record<string, unknown>,
  ) => {
    for (const key of Object.keys(srcImp)) {
      const impVal = srcImp[key];
      const curVal = srcCur[key];
      if (impVal && typeof impVal === 'object' && !Array.isArray(impVal)) {
        if (!target[key] || typeof target[key] !== 'object') target[key] = {};
        const curChild =
          curVal && typeof curVal === 'object' && !Array.isArray(curVal)
            ? (curVal as Record<string, unknown>)
            : {};
        restore(
          target[key] as Record<string, unknown>,
          impVal as Record<string, unknown>,
          curChild,
        );
      } else if (isMaskedValue(impVal) && curVal != null) {
        target[key] = curVal;
      }
    }
  };
  restore(out, imported, current);
  return out as T;
}

/** PUT 时剔除脱敏占位符与空敏感字段，避免覆盖真实密钥 */
export function stripMaskedPlaceholders<T extends Record<string, unknown>>(partial: T): T {
  const out = structuredClone(partial) as Record<string, unknown>;
  walkStripMasked(out, partial);
  return out as T;
}

function shouldStripSecretValue(key: string, val: unknown): boolean {
  if (isMaskedValue(val)) return true;
  if (!SENSITIVE_FIELD_RE.test(key)) return false;
  return val == null || val === '';
}

function walkStripMasked(target: unknown, source: unknown): void {
  if (!source || typeof source !== 'object') return;
  if (Array.isArray(source)) {
    if (!Array.isArray(target)) return;
    for (let i = 0; i < source.length; i++) {
      const srcItem = source[i];
      if (srcItem && typeof srcItem === 'object') {
        walkStripMasked(target[i], srcItem);
      }
    }
    return;
  }
  const src = source as Record<string, unknown>;
  const tgt = target as Record<string, unknown>;
  for (const key of Object.keys(src)) {
    const val = src[key];
    if (val && typeof val === 'object') {
      if (!tgt[key] || typeof tgt[key] !== 'object') {
        tgt[key] = Array.isArray(val) ? [] : {};
      }
      walkStripMasked(tgt[key], val);
    } else if (shouldStripSecretValue(key, val)) {
      Reflect.deleteProperty(tgt, key);
    } else {
      tgt[key] = val;
    }
  }
}

/** 非 admin GET /system/config 时裁剪敏感字段 */
function maskConfigForNonAdmin<T extends Record<string, unknown>>(config: T): T {
  return structuredClone(config);
}

function pickPartialSection(
  source: Record<string, unknown> | undefined,
  keys: readonly string[],
): Record<string, unknown> | undefined {
  if (!source) return undefined;
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (key in source) out[key] = source[key];
  }
  return Object.keys(out).length ? out : undefined;
}

function pickPublicSections(config: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const section of PUBLIC_CONFIG_SECTIONS) {
    if (section in config) out[section] = structuredClone(config[section]);
  }
  return out;
}

/** 按角色裁剪 GET /system/config 下发内容 */
export function pickConfigForRole(
  config: Record<string, unknown>,
  role?: string,
): Record<string, unknown> {
  if (role === 'admin') return config;

  if (role === 'adult') {
    const out = pickPublicSections(config);
    if (config.envSensorMap) out.envSensorMap = structuredClone(config.envSensorMap);
    const energy = pickPartialSection(
      config.energy as Record<string, unknown>,
      ADULT_ENERGY_READ_KEYS,
    );
    if (energy) out.energy = energy;
    const security = pickPartialSection(
      config.security as Record<string, unknown>,
      ADULT_SECURITY_READ_KEYS,
    );
    if (security) out.security = security;
    return maskConfigForNonAdmin(out);
  }

  // 访客 / 儿童 / 未定义角色
  return maskConfigForNonAdmin(pickPublicSections(config));
}
