/**
 * @file template-yaml-text.util.ts
 * @module shared/ha
 *
 * HA Template YAML 纯文本行级截取工具：
 *  - extractTemplateBlockLinesFromText（内部依赖 locateTemplateBlockRangeInText 定位行范围）
 *
 * 外部依赖：
 *  - ../../common/utils/regex.util：正则转义
 */
import { escapeRegExp } from '../../common/utils/regex.util';

/** 构造匹配 unique_id: <uniqueId> 的正则（忽略大小写、引号可选）。 */
function uniqueIdPattern(uniqueId: string): RegExp {
  return new RegExp(`unique_id\\s*:\\s*['"]?${escapeRegExp(uniqueId)}['"]?`, 'i');
}

/**
 * 构造匹配 entity_id / default_entity_id / object_id / name 字段值为 entityId 或其 slug 的正则。
 * slug 为 entityId 去掉 domain 前缀后的部分（如 'sensor.kitchen_temp' → 'kitchen_temp'）。
 */
function entityIdYamlPattern(entityId: string): RegExp {
  const full = escapeRegExp(entityId);
  const slug = escapeRegExp(entityId.replace(/^[^.]+\./, ''));
  return new RegExp(
    `(?:default_entity_id|entity_id|object_id|name)\\s*:\\s*['"]?(?:${full}|${slug})['"]?`,
    'i',
  );
}

/** 构造匹配 entity slug（去 domain 前缀）作为独立单词的正则。 */
function entitySlugLinePattern(entityId: string): RegExp {
  const slug = escapeRegExp(entityId.replace(/^[^.]+\./, ''));
  return new RegExp(`\\b${slug}\\b`, 'i');
}

/**
 * 在 configuration.yaml 文本中定位含 unique_id（或 entity_id）的 template 列表项行范围 [start, end)。
 *
 * @param text configuration.yaml 文本
 * @param uniqueId 目标 unique_id（长度 <= 2 时跳过 unique_id 匹配）
 * @param entityId 可选的辅助匹配 entity_id
 * @returns 行范围 { start, end }；未找到返回 null
 *
 * 算法：
 *  1. 优先用 unique_id 正则定位命中行；不行则用 entity_id 正则；再不行用 slug 模糊匹配
 *  2. 从命中行向上回溯找最浅缩进的列表项起始行（`- ` 开头）作为 start
 *  3. 从 start 向下找同级缩进的下一个列表项作为 end
 *  4. 兜底：若无法确定列表边界，返回命中行 ±12/20 行的保守范围
 */
function locateTemplateBlockRangeInText(
  text: string,
  uniqueId: string,
  entityId?: string,
): { start: number; end: number } | null {
  const lines = text.split(/\r?\n/);
  const useUid = uniqueId && uniqueId.length > 2;
  const uidRe = useUid ? uniqueIdPattern(uniqueId) : null;
  const eidRe = entityId ? entityIdYamlPattern(entityId) : null;
  const slugRe = entityId ? entitySlugLinePattern(entityId) : null;
  let templateLine = -1;
  let hitLine = -1;
  // 第一遍：定位 template: 行与命中行
  for (let i = 0; i < lines.length; i++) {
    if (templateLine < 0 && /^template\s*:/.test(lines[i])) templateLine = i;
    if (hitLine < 0 && ((uidRe && uidRe.test(lines[i])) || (eidRe && eidRe.test(lines[i]))))
      hitLine = i;
  }
  // 命中行未找到且 slug 正则可用：在 template: 之后做 slug 模糊匹配
  if (hitLine < 0 && slugRe && templateLine >= 0) {
    for (let i = templateLine + 1; i < lines.length; i++) {
      // 遇到顶层非 template: 键则停止（已离开 template 块）
      if (/^\S/.test(lines[i]) && !/^template\s*:/.test(lines[i])) break;
      if (slugRe.test(lines[i])) {
        hitLine = i;
        break;
      }
    }
  }
  if (hitLine < 0) return null;

  // 从命中行向上找最浅缩进的列表项作为块起始
  const floor = templateLine >= 0 ? templateLine + 1 : 0;
  let start = hitLine;
  let listIndent = '';
  let shallowest = Infinity;
  for (let i = hitLine; i >= floor; i--) {
    const m = lines[i].match(/^(\s+)- \S/);
    if (!m) continue;
    const len = m[1].length;
    if (len < shallowest) {
      shallowest = len;
      start = i;
      listIndent = m[1];
    }
  }
  // 未找到列表项起始：尝试用命中行缩进回溯
  if (!listIndent) {
    const hitIndent = (lines[hitLine].match(/^(\s*)/)?.[1] || '').length;
    for (let i = hitLine; i >= floor; i--) {
      const m = lines[i].match(/^(\s+)- \S/);
      if (m && m[1].length < hitIndent) {
        start = i;
        listIndent = m[1];
        break;
      }
    }
    // 仍找不到：返回命中行 ±保守范围
    if (!listIndent) {
      return { start: Math.max(floor, hitLine - 12), end: Math.min(lines.length, hitLine + 20) };
    }
  }

  // 从 start 向下找同级缩进的下一个列表项作为块结束
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const m = lines[i].match(/^(\s+)- \S/);
    if (m && m[1] === listIndent) {
      end = i;
      break;
    }
  }
  return { start, end };
}

/**
 * 从纯文本 configuration.yaml 截取含 unique_id 的 template 列表项（保留 trigger 与注释邻近结构）。
 * @returns 行数组；未定位返回 null
 */
export function extractTemplateBlockLinesFromText(text: string, uniqueId: string): string[] | null {
  const range = locateTemplateBlockRangeInText(text, uniqueId);
  if (!range) return null;
  return text.split(/\r?\n/).slice(range.start, range.end);
}
