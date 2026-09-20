/**
 * 实体元数据可用性判定：各 runtime 在决定「是否渲染真实状态」前统一调用，避免判定口径分歧。
 *
 * 约定：后端同步 HA 实体时写入 metadata.status，管理员手动停用某实体的绑定项时写入 metadata.disabledBy。
 */

/**
 * 判断元数据是否指向一个真实可用、且未被停用的实体。
 * 任一情况视为不可用（调用方回落占位 / 空态）：无 entityId；存在 disabledBy（被管理员从绑定项停用）；
 * status 为 missing（HA 里找不到）；status 为 disabled（HA 侧被禁用）。
 * @returns {boolean} 可用返回 true，否则 false。
 */
export function entityMetadataIsAvailable(metadata) {
  return (
    !!metadata?.entityId &&
    !metadata.disabledBy &&
    metadata.status !== "missing" &&
    metadata.status !== "disabled"
  );
}
