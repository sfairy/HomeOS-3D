/**
 * @file account-binding-categories.util.ts
 * @module @homeos/shared/setup
 * @brief 生活账户绑定类别标签 / 通信运营商分类 / 底栏账户引用聚合（首装健康检查共用）。
 *
 * 职责：
 *  - 维护 source key → 简短中文标签（电网 / 燃气 / 水务 / 电信 / 联通）；
 *  - 区分通信账户（COMM_*）与能源公用事业账户（ENERGY_*）；
 *  - 提供底栏项启用且使用账户绑定的 source 集合（collectFooterAccountSources）；
 *  - 提供完整性检查所需账户类别（默认电网 + 底栏引用）与深链路由解析。
 *
 * 关键依赖：
 *  - bindings-gaps.util.ts 调用本模块统计能源账户缺口；
 *  - 底栏项 DashboardFooterItemLike 为最小接口，由调用方传入完整结构。
 */

/** 底栏项最小接口（绑定缺口 / 账户类别推断） */
export interface DashboardFooterItemLike {
  enabled?: boolean;
  kind?: string;
  primaryField?: string;
  source?: string;
}

/**
 * 生活账户绑定类别 → 简短中文标签映射（电网/燃气/水务/电信/联通），供设置页展示与缺口提示使用。
 */
export const ACCOUNT_BINDING_SOURCE_LABELS: Record<string, string> = {
  grid: '电网',
  gas: '燃气',
  water: '水务',
  ct: '电信',
  cu: '联通',
};

/**
 * 通信运营商账户类别（ct=中国电信、cu=中国联通），与账单解析模块共用分类。
 */
export const COMM_ACCOUNT_BINDING_CATEGORIES = ['ct', 'cu'] as const;

/**
 * 能源与公用事业账户类别（grid=电网、gas=燃气、water=水务），供首装健康检查缺口统计使用。
 */
export const ENERGY_ACCOUNT_BINDING_CATEGORIES = ['grid', 'gas', 'water'] as const;

const COMM_ACCOUNT_BINDING_SET = new Set<string>(COMM_ACCOUNT_BINDING_CATEGORIES);

/**
 * 判断账户类别字符串是否属于通信运营商（ct / cu）。
 *
 * @param cat 待判断类别字符串
 * @returns cat ∈ COMM_ACCOUNT_BINDING_CATEGORIES 时 true；否则 false（大小写敏感）
 */
export function isCommAccountBindingCategory(cat: string): boolean {
  return COMM_ACCOUNT_BINDING_SET.has(cat);
}

/** 账户绑定缺口 / 深链 → 生活账户 */
export function resolveAccountBindingSettingsRoute(_cat: string): string {
  return '/settings?tab=life-accounts';
}

/** 底栏中启用且使用账户绑定的 source 集合 */
export function collectFooterAccountSources(
  items: DashboardFooterItemLike[] | null | undefined,
): string[] {
  const set = new Set<string>();
  for (const it of items || []) {
    if (it.enabled && it.kind !== 'entity' && String(it.primaryField || '').trim() && it.source) {
      set.add(String(it.source));
    }
  }
  return [...set];
}

/** 完整性检查：能源 Widget 默认电网 + 底栏引用的账户类别 */
export function collectRequiredAccountBindingCategories(
  footerItems: DashboardFooterItemLike[] | null | undefined,
): string[] {
  const set = new Set<string>(['grid']);
  for (const src of collectFooterAccountSources(footerItems)) set.add(src);
  return [...set];
}

/**
 * 格式化账户类别为中文展示标签（未命中映射表时原样返回 cat）。
 *
 * @param cat 账户类别键，如 grid / gas / water / ct / cu
 * @returns 对应中文标签，如 "电网" / "燃气"；未知键直接返回原值
 */
export function formatAccountBindingLabel(cat: string): string {
  return ACCOUNT_BINDING_SOURCE_LABELS[cat] || cat;
}
