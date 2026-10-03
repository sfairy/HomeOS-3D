/**
 * 联动器同步预览用的简易行级 diff 工具（无外部依赖）。
 *
 * 所属模块：backend/src/shared/orchestrator
 * 职责：
 *   - buildLineDiff：逐行对比本地与 HA 侧 YAML，统计增删改行数并生成预览片段；
 *   - assembleSyncPreview：组装同步预览响应（含 diff、hasChanges 标记）。
 * 关键依赖：无外部依赖，纯函数。
 */
/** 简易行级 diff（联动器同步预览用，无外部依赖） */
interface LineDiffResult {
  localLines: number;
  haLines: number;
  added: number;
  removed: number;
  changed: number;
  preview: string[];
}

/** 逐行对比本地与 HA 侧 YAML，统计增删改行数并生成预览片段（截断至 maxPreviewLines） */
function buildLineDiff(local: string, ha: string, maxPreviewLines = 40): LineDiffResult {
  const localArr = String(local || '').split('\n');
  const haArr = String(ha || '').split('\n');
  const max = Math.max(localArr.length, haArr.length);
  const preview: string[] = [];
  let added = 0;
  let removed = 0;
  let changed = 0;

  for (let i = 0; i < max; i++) {
    const l = localArr[i];
    const h = haArr[i];
    if (l === h) continue;
    if (l === undefined) {
      added++;
      if (preview.length < maxPreviewLines) preview.push(`+ ${h}`);
    } else if (h === undefined) {
      removed++;
      if (preview.length < maxPreviewLines) preview.push(`- ${l}`);
    } else {
      changed++;
      if (preview.length < maxPreviewLines) {
        preview.push(`- ${l}`);
        preview.push(`+ ${h}`);
      }
    }
  }

  return {
    localLines: localArr.length,
    haLines: haArr.length,
    added,
    removed,
    changed,
    preview,
  };
}

/** 判断本地与 HA 侧 YAML 是否存在差异（trim 后比较） */
function hasLineDiff(local: string, ha: string): boolean {
  return String(local || '').trim() !== String(ha || '').trim();
}

/** 组装同步预览响应：合并状态、双端 YAML、行级 diff 与 hasChanges 标记 */
export function assembleSyncPreview(
  status: Record<string, unknown>,
  localContent: string,
  haContent: string,
) {
  const diff = buildLineDiff(localContent, haContent);
  return {
    ...status,
    localYaml: localContent,
    haYaml: haContent,
    diff,
    hasChanges: hasLineDiff(localContent, haContent),
  };
}
