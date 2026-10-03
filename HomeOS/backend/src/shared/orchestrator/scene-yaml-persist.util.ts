/**
 * 所属模块：backend/shared/orchestrator
 * 职责：
 *  - 场景 YAML↔DB 互转工具；
 * 关键依赖：
 *  - js-yaml, snapshot-restore.util；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

/**
 * 场景 yaml 写入契约：显式传入则落库；仅改 entities 且未带 yaml 时保留库内原 yaml（不写 null）。
 * 调用方若要清空 yaml，须显式传 `yaml: null`（或空字符串）。
 */
export function normalizeSceneYamlPersistPayload(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const hasYaml = Object.prototype.hasOwnProperty.call(payload, 'yaml');
  if (hasYaml) {
    const raw = payload.yaml;
    if (raw == null || (typeof raw === 'string' && !raw.trim())) {
      payload.yaml = null;
    } else {
      payload.yaml = String(raw);
    }
  }
  // 仅 entities、未传 yaml → 不改动 yaml 字段（由 Prisma 保留旧值）
  return payload;
}
