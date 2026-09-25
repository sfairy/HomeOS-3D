/**
 * 通用设备实体的「目录 + 能力位」适配层（编辑器侧）。
 *
 * 通用设备（冰箱 / 洗碗机 / 洗衣机 / 烘干机 / 绿植）在 3D 场景里没有专属模块，
 * 它们的附加控件与状态规则都由编辑器现场从 HA 实体注册表里挑实体来配置。本模块
 * 负责把那批实体枚举成一份稳定的目录：
 *
 *   1. entityCapabilities —— 按域给单个实体标出它具备哪些能力（toggle / select / press…）；
 *   2. deviceEntityCatalog —— 按 deviceId 过滤、排序，产出整台设备的实体清单；
 *   3. registerDeviceCapabilityAdapter —— 允许某个域注册外部适配器覆盖默认词表，
 *      给后续扩展留口子，而不必改内置词表。
 *
 * 「域 → 能力」这份词表必须与后端 backend/modules/interaction3d/device_entities.py 的
 * DOMAIN_CAPABILITIES 逐字一致：前端据此渲染按钮，后端据同一条词表复核命令，
 * 两侧任何一处单独改动都会让「按钮出现」与「命令放行」对不上。
 *
 * 本模块只做纯数据折算，不依赖 static 助手，也不引入其他 runtime 模块。
 */

// 域 → 该域允许的控制能力。空数组表示只读域（sensor / binary_sensor），
// 显式列出而不是省略，是为了让「只读」成为一个查表得到的结论，而不是查表失败的副作用。
// 词表内容与 backend/modules/interaction3d/device_entities.py 的 DOMAIN_CAPABILITIES 一一对应。
const DOMAIN_CAPABILITIES = {
  switch: ["toggle"],
  input_boolean: ["toggle"],
  light: ["toggle"],
  select: ["select"],
  input_select: ["select"],
  number: ["number"],
  input_number: ["number"],
  button: ["press"],
  input_button: ["press"],
  climate: ["climate"],
  fan: ["fan"],
  cover: ["cover"],
  media_player: ["media_player"],
  sensor: [],
  binary_sensor: []
};

// 运行期注册的域适配器。用 Map 而不是往词表里直接改，是为了让「内置词表」始终只读，
// 外部扩展可随时注销，也便于排查是谁覆盖了某个域的判定。
const capabilityAdapters = new Map();

/**
 * 为某个域注册一个能力适配器，返回注销函数。
 *
 * 适配器形如 { name, capabilities }：capabilities 会整体覆盖该域的内置词表。
 * 入参不合法（域为空 / 适配器不是对象）时返回一个空操作 —— 调用方不必先做校验，
 * 沿用注销函数的形式即可无脑 try/finally，避免分支。
 */
export function registerDeviceCapabilityAdapter(domain, adapter) {
  if (!domain || !adapter || typeof adapter !== "object") {
    return () => {};
  }
  capabilityAdapters.set(String(domain), adapter);
  return () => capabilityAdapters.delete(String(domain));
}

/**
 * 取某个域当前生效的适配器；没注册过返回 null。
 *
 * 归一成 null 而不是 undefined，是为了让调用方（entityCapabilities）用可选链
 * 一次判空即可，不必区分「没注册」和「注册了 undefined」。
 */
export function deviceCapabilityAdapter(domain) {
  return capabilityAdapters.get(String(domain || "")) || null;
}

// 实体在场景里只能承担这三种角色：弹窗控制条目、只读状态展示、状态判断依据。
// 之外的角色一律被 normalizeDeviceEntitySelection 丢弃。
const EDITABLE_ROLES = new Set(["control", "state", "status"]);

// 从实体 ID 的前缀解析所属域（HA 的 entity_id 形如 "<domain>.<object_id>"）。
const resolveDomain = entityId => String(entityId || "").split(".")[0];

/**
 * 描述一个实体能做什么。
 *
 * 能力来源按优先级：域适配器 > 内置词表 > 空。空能力即只读，writable 随之取反。
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
  const adapter = deviceCapabilityAdapter(domain);
  // 复制一份能力数组：调用方可能会就地排序 / 增删，不能污染词表或适配器对象。
  const capabilities = [...(adapter?.capabilities || DOMAIN_CAPABILITIES[domain] || [])];
  const supportedFeatures = attributes.supported_features;
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
    capabilities,
    writable: capabilities.length > 0,
    // 只要实体在表里，读属性总是允许的；写才受能力位约束。
    readable: true,
    attributes,
    // supported_features 是位掩码：只有真正的整数才可信，字符串 / 布尔一律按 0，
    // 让「不确定」表现为「没有额外能力」，而不是随机放行。
    supportedFeatures: Number.isInteger(supportedFeatures) ? supportedFeatures : 0,
    adapter: adapter?.name || null
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

/**
 * 把编辑器保存的实体选择归一成目录能接受的形态。
 *
 * 三步：① 只保留角色合法、未重复（同实体同角色）、且确实存在于当前目录里的条目；
 * ② 控制角色落到只读实体上时降级成 state —— 否则弹窗会渲染一个永远点不动的按钮；
 * ③ 只回填目录里的权威字段（entityId / capabilities），丢掉选择里可能残留的陈旧快照。
 *
 * 第①步的「目录外条目直接丢弃」是刻意的：设备换过实体后，草稿里会留下已不存在的 ID，
 * 与其带着它去订阅、渲染空按钮，不如在归一这一步就清掉。
 *
 * @param {Array} selection 草稿里的实体选择，形如 { entityId, role }。
 * @param {Array} catalog deviceEntityCatalog 产出的实体目录。
 */
export function normalizeDeviceEntitySelection(selection = [], catalog = []) {
  const catalogById = new Map(catalog.map(item => [item.entityId, item]));
  const seen = new Set();
  return selection
    .filter(item => {
      const key = item?.entityId + ":" + item?.role;
      if (!EDITABLE_ROLES.has(item?.role)) {
        return false;
      }
      if (seen.has(key)) {
        return false;
      }
      if (!catalogById.has(item.entityId)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .map(item => {
      const catalogEntry = catalogById.get(item.entityId);
      const role = item.role === "control" && !catalogEntry.writable ? "state" : item.role;
      return {
        entityId: catalogEntry.entityId,
        role,
        capabilities: [...catalogEntry.capabilities]
      };
    });
}

// 三种角色在编辑器里的中文说法；表里没有的一律显示为「不显示」。
const ROLE_LABELS = {
  control: "弹窗控制",
  state: "只读状态",
  status: "状态判断"
};

/**
 * 角色的中文标签，供编辑器下拉与列表展示。
 *
 * 未知角色回落成「不显示」而不是抛错或回显原始英文：编辑器可能在旧草稿里读到
 * 已废弃的角色名，此时静默地不展示比中断渲染更合适。
 */
export function deviceEntityRoleLabel(role) {
  return ROLE_LABELS[role] || "不显示";
}
