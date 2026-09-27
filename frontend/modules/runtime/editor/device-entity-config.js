/**
 * 通用设备实体的「目录」折算层（编辑器侧）。
 *
 * 通用设备（冰箱 / 冰柜 / 洗碗机 / 洗衣机 / 烘干机 / 绿植）在 3D 场景里没有专属模块，
 * 它们的附加控件与状态规则都由编辑器现场从 HA 实体注册表里挑实体来配置。本模块把那批
 * 实体折算成一份稳定的目录：
 *
 *   1. entityCapabilities —— 把一个实体的注册项与实时状态合并成一条统一的目录项
 *      （HA 侧 snake_case 与面板侧 camelCase 两套字段名都在这一层收口）；
 *   2. deviceEntityCatalog —— 按 deviceId 过滤、排序，产出整台设备的实体清单。
 *
 * 「域 → 卡片形态」的词表**不在本模块**：它只属于真正渲染卡片的那一层，见
 * `frontend/modules/runtime/climate/purifier-extras.js` 的 `extraTypes()`。后端复核那份词表
 * 读的是 `apps/server/modules/interaction3d/purifier.py` 的 `EXTRA_TYPES` —— 这两个才是
 * 「按钮可点 / 命令放行」的同一份契约，由 check_invariants 的「附加实体域词表两端同源」盯着。
 *
 * 本模块只做纯数据折算，不依赖 static 助手，也不引入其他 runtime 模块。
 */

// 从实体 ID 的前缀解析所属域（HA 的 entity_id 形如 "<domain>.<object_id>"）。
const resolveDomain = entityId => String(entityId || "").split(".")[0];

/**
 * 把一个实体折算成统一的目录项。
 *
 * 同时把 HA 侧（snake_case）与面板侧（camelCase）的字段名一并认下来 —— 两条数据流
 * 在本层交汇，收口在这里比让每个调用方各写一份兼容逻辑更不容易漂移。
 *
 * @param {object} entity 实体注册项（可能来自 HA，也可能来自面板草稿）。
 * @param {object|Map} [state] 实时状态；兼容 { newState } 包装与裸状态对象两种形态。
 */
export function entityCapabilities(entity, state = null) {
  const entityId = entity?.entityId || entity?.entity_id || "";
  const domain = entity?.domain || resolveDomain(entityId);
  // 状态可能被包在 { newState } 里；拆不出属性时回落到实体自身的 attributes。
  const liveState = state?.newState || state || {};
  const attributes = liveState.attributes || entity?.attributes || {};
  return {
    entityId,
    domain,
    deviceId: entity?.deviceId || entity?.device_id || "",
    disabledBy: entity?.disabledBy || entity?.disabled_by || null,
    // 只有显式 false 才算禁用；字段缺失时按启用处理，否则新建实体一进来就被标灰。
    enabled: entity?.enabled !== false,
    status: entity?.status || entity?.syncStatus || "",
    name: entity?.name || entity?.friendlyName || attributes.friendly_name || entityId,
    // 实时状态明确 available:false，或状态字面量是 unknown / unavailable，都视为不可用。
    available:
      liveState.available !== false &&
      !["unknown", "unavailable"].includes(String(liveState.state || "").toLowerCase()),
    // 原始属性表照原样带上：状态判定的口径（device-status.js）直接读它。
    attributes
  };
}

/**
 * 列出归属某台设备的全部实体，按域、名称、实体 ID 三级排序。
 *
 * deviceId 为空时返回空数组：调用方多半是「还没选中设备」，返回全量目录会让人误选到别的设备。
 * 排序保证同一份注册表每次渲染顺序一致，避免下拉列表跳位。
 *
 * @param {Array} entities 实体注册项列表。
 * @param {string} deviceId 目标设备 ID。
 * @param {Map|object} [states] 实体 ID → 实时状态；兼容 Map 与普通对象两种索引方式。
 */
export function deviceEntityCatalog(entities = [], deviceId = "", states = new Map()) {
  if (!deviceId) {
    return [];
  }
  return entities
    .filter(entity => (entity.deviceId || entity.device_id) === deviceId)
    .map(entity =>
      entityCapabilities(
        entity,
        states instanceof Map ? states.get(entity.entityId) : (states || {})[entity.entityId]
      )
    )
    // 丢掉没能解析出实体 ID 的残项，它们在场景里无法绑定任何状态。
    .filter(capability => capability.entityId)
    .sort(
      (a, b) =>
        a.domain.localeCompare(b.domain) ||
        a.name.localeCompare(b.name) ||
        a.entityId.localeCompare(b.entityId)
    );
}
