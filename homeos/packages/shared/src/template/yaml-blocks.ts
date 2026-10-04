/**
 * @file yaml-blocks.ts
 * @module @homeos/shared/template
 * @brief HA template YAML 块结构与 trigger-based 判定（前后端共用）。
 *
 * 职责：
 *  - 归一化 template 根为块数组（collectTemplateBlocks，兼容数组 / 单对象）；
 *  - 判断已解析 YAML 是否为 trigger-based template（isTriggerBasedTemplateParsed）；
 *  - 从 trigger-based 或普通 template 块提取首个平台实体项（extractFirstTemplateItemFromParsed）；
 *  - 归一化 template 根为 { sensor: [...], fan: [...] }（剔除 trigger 段）。
 *
 * 关键依赖：
 *  - meta-keys 提供 TEMPLATE_META_KEYS 用于跳过非平台段；
 *  - appliance-type-infer 调用本模块判定 trigger-based 与提取平台项。
 *
 * 约定：
 *  - 跳过 TEMPLATE_META_KEYS 中的键，剩余键视为平台段（sensor / fan / switch 等）；
 *  - normalizeTemplateRoot 在缺少 template 根节点时抛出"缺少 template 根节点"。
 */
import { TEMPLATE_META_KEYS } from './meta-keys';

type TemplateBlock = Record<string, unknown>;

/** 归一化 template 根为块数组 */
export function collectTemplateBlocks(templateRoot: unknown): TemplateBlock[] {
  if (!templateRoot) return [];
  if (Array.isArray(templateRoot)) {
    return templateRoot.filter(
      (b): b is TemplateBlock => Boolean(b) && typeof b === 'object' && !Array.isArray(b),
    );
  }
  if (typeof templateRoot === 'object') return [templateRoot as TemplateBlock];
  return [];
}

/** 从已解析 YAML 对象判断是否为 trigger-based template */
export function isTriggerBasedTemplateParsed(parsed: unknown, yamlStrFallback = ''): boolean {
  if (!parsed || typeof parsed !== 'object') {
    return /\btrigger\s*:/m.test(yamlStrFallback);
  }
  const root = parsed as Record<string, unknown>;
  if (!root.template) return /\btrigger\s*:/m.test(yamlStrFallback);
  return collectTemplateBlocks(root.template).some((b) => 'trigger' in b);
}

/** 从 trigger-based 或普通 template 块提取第一个平台实体项 */
export function extractFirstTemplateItemFromParsed(
  parsed: Record<string, unknown>,
): { platform: string; item: Record<string, unknown> } | null {
  if (!parsed?.template) return null;
  for (const block of collectTemplateBlocks(parsed.template)) {
    for (const [platform, items] of Object.entries(block)) {
      if (TEMPLATE_META_KEYS.has(platform) || !Array.isArray(items) || !items.length) continue;
      const raw = items[0];
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        return { platform, item: { ...(raw as Record<string, unknown>) } };
      }
    }
  }
  return null;
}

/** 归一化 template 根为 { sensor: [...], fan: [...] }（不含 trigger 段） */
export function normalizeTemplateRoot(parsed: Record<string, unknown>): Record<string, unknown> {
  let root: unknown = parsed.template ?? parsed;
  if (Array.isArray(root)) {
    const merged: Record<string, unknown> = {};
    for (const entry of root) {
      if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
        for (const [key, val] of Object.entries(entry as Record<string, unknown>)) {
          if (TEMPLATE_META_KEYS.has(key)) continue;
          merged[key] = val;
        }
      }
    }
    root = merged;
  }
  if (!root || typeof root !== 'object' || Array.isArray(root)) {
    throw new Error('缺少 template 根节点');
  }
  return root as Record<string, unknown>;
}
