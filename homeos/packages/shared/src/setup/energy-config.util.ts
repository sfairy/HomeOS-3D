/**
 * @file energy-config.util.ts
 * @module @homeos/shared/setup
 * @brief 跨端最小能源配置契约（convention / entity / multi 三模式）。
 *
 * 职责：
 *  - 定义能源源配置结构（EnergySourceConfig）与 statsSensors 形状（StatsSensorsLike）；
 *  - 从 statsSensors.energySources 解析类别配置（normalizeEnergySource）；
 *  - 判断类别是否已配置（hasEnergyConfig，覆盖三种模式与多账户条目）。
 *
 * 关键依赖：
 *  - 运行时字段解析（accountEntries 同步、attrMap 等）以 frontend `source.util` 为准；
 *  - 本模块只负责"是否已配置"与轻量 normalize，供 shared 与前后端共用；
 *  - bindings-gaps.util 通过 hasEnergyConfig 统计能源账户缺口。
 *
 * 约定：
 *  - convention 模式以 account 或 accountEntries 任一非空为准；
 *  - entity 模式以 accountEntities 任一 entityId 或顶层 entityId 非空为准；
 *  - multi 模式以 multiAccounts 任一行 entityId 或 entityMap 任一值非空为准。
 */
/** 能源绑定辅助函数使用的结构形状（避免 Record 索引签名摩擦）。 */
export type StatsSensorsLike = {
  energySources?: unknown;
};

/**
 * 单个能源类别的绑定配置（convention / entity / multi 三种模式，与前端表单字段一一对应）。
 * convention：户号（单值或多账户条目数组）；entity：单 entityId 或 accountEntities 数组；multi：多账户（entityId + entityMap）。
 */
export type EnergySourceConfig = {
  mode: 'convention' | 'entity' | 'multi';
  account?: string;
  /** convention 多账户条目（与前端 accountEntries 对齐） */
  accountEntries?: Array<{ number?: string; label?: string }>;
  entityId?: string;
  entityMap?: Record<string, string>;
  accountEntities?: Array<{ entityId?: string; label?: string }>;
  multiAccounts?: Array<{ entityId?: string; label?: string; entityMap?: Record<string, string> }>;
};

function createDefaultEnergySource(): EnergySourceConfig {
  return { mode: 'convention', account: '', entityId: '', entityMap: {} };
}

/**
 * 从户号字符串（可能逗号拼接多个）中取第一个非空户号（前端表单支持「多账户逗号分隔」旧写法时使用）。
 *
 * @param raw 户号原始字符串（可 null/undefined）
 * @returns 第一个户号 trim 后字符串；空/非法返回空串
 */
export function getFirstAccount(raw: string | null | undefined) {
  return raw ? String(raw).split(',')[0].trim() : '';
}

function firstConfiguredAccountNumber(cfg: EnergySourceConfig): string {
  const fromEntries = (cfg.accountEntries || [])
    .map((e) => String(e?.number || '').trim())
    .find(Boolean);
  if (fromEntries) return fromEntries;
  return getFirstAccount(cfg.account);
}

/** 从 statsSensors.energySources 解析类别配置（setup 最小契约） */
export function normalizeEnergySource(
  statsSensors: StatsSensorsLike | null | undefined,
  cat: string,
): EnergySourceConfig {
  const stats = statsSensors || {};
  const raw = (
    stats.energySources as Record<string, Record<string, unknown> | undefined> | undefined
  )?.[cat];
  const base: Record<string, unknown> = { ...createDefaultEnergySource(), ...(raw || {}) };
  if (base.mode === 'convention') {
    return { ...base, account: String(base.account ?? '').trim() } as EnergySourceConfig;
  }
  return base as EnergySourceConfig;
}

/** 类别是否已配置（convention / entity / multi 三模式） */
export function hasEnergyConfig(cat: string, statsSensors: StatsSensorsLike | null | undefined) {
  const cfg = normalizeEnergySource(statsSensors, cat);
  if (cfg.mode === 'convention') return !!firstConfiguredAccountNumber(cfg);
  if (cfg.mode === 'entity') {
    const rows = cfg.accountEntities;
    if (Array.isArray(rows) && rows.some((r) => String(r?.entityId || '').trim())) return true;
    return !!String(cfg.entityId || '').trim();
  }
  if (cfg.mode === 'multi') {
    const rows = cfg.multiAccounts;
    if (Array.isArray(rows)) {
      const hasRow = rows.some((r) => {
        if (String(r?.entityId || '').trim()) return true;
        return Object.values(r?.entityMap || {}).some((v) => String(v || '').trim());
      });
      if (hasRow) return true;
    }
    return Object.values(cfg.entityMap || {}).some((v) => String(v || '').trim());
  }
  return false;
}
