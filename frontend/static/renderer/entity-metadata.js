/**
 * 实体元数据可用性判定。
 *
 * 渲染体系里每个控件都会带一份 metadata（实体 ID、状态、禁用来源等），
 * 各 runtime 在决定「是否渲染真实状态」之前统一调用本模块，
 * 避免各处重复写同一组判定条件而出现口径分歧。
 *
 * 约定：后端在同步 Home Assistant 实体时写入 metadata.status，
 * 并在管理员手动停用某个实体的绑定项时写入 metadata.disabledBy。
 */

/**
 * 判断元数据是否指向一个真实可用、且未被停用的实体。
 *
 * 以下任一情况都视为不可用，调用方应回落到占位 / 空态渲染：
 * - 没有 entityId：控件尚未绑定实体，或后端未回填；
 * - 存在 disabledBy：被管理员从绑定项里停用，即便实体存在也不应用它；
 * - status 为 missing：Home Assistant 里已找不到该实体（例如已删除）；
 * - status 为 disabled：HA 侧实体被禁用。
 *
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
