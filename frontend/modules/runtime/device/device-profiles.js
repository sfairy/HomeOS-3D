/**
 * 通用设备（冰箱 / 冰柜 / 洗碗机 / 洗衣机 / 烘干机 / 绿植）的品类登记表。
 *
 * 「通用设备」这一类的共同点是：它们没有专属的交互模块（不像电视有信号源、空调有模式
 * 历史），场景里只需要一个模型 + 一个状态灯 + 一张由后端枚举出的实体控制卡片。所以
 * 品类的差异全部收敛成这里的一张表，运行时的 device-panel / device-status、编辑器的
 * device-entity-config、以及工作室的素材分类都从这一张表取，不再各自硬编码品类名。
 *
 * 表里四项的分工：
 *   collection   —— 配置里这一类的集合名（config.devices[collection]）
 *   modelType    —— 场景模型 / 素材库里的 type，也是「模型→绑定」按类型配对时的凭据
 *   label / icon —— 编辑器里没有单独命名时的兜底中文名与缺省图标
 *   height       —— 缺少模型高度时用来推算弹窗锚点高度的一半值
 *   statusIndicator —— 是否要在模型上方挂状态灯（绿植没有开关状态，挂了反而是噪音）
 *
 * 本模块是纯数据 + 纯函数、零依赖：显示热路径（stage.js）与编辑器都要 import 它，
 * 任何外部依赖都会把两条路一起拖慢。
 */

export const GENERIC_DEVICE_PROFILES = Object.freeze({
  fridge: Object.freeze({
    collection: "fridges",
    modelType: "fridge",
    label: "冰箱",
    icon: "mdi:fridge-outline",
    height: 1.85
  }),
  freezer: Object.freeze({
    collection: "freezers",
    modelType: "freezer",
    label: "冰柜",
    icon: "mdi:fridge-bottom",
    height: 0.85
  }),
  dishwasher: Object.freeze({
    collection: "dishwashers",
    modelType: "dishwasher",
    label: "洗碗机",
    icon: "mdi:dishwasher",
    height: 0.82
  }),
  washer: Object.freeze({
    collection: "washers",
    modelType: "washer",
    label: "洗衣机",
    icon: "mdi:washing-machine",
    height: 0.85
  }),
  dryer: Object.freeze({
    collection: "dryers",
    modelType: "dryer",
    label: "烘干机",
    icon: "mdi:tumble-dryer",
    height: 0.85
  }),
  plant: Object.freeze({
    collection: "plants",
    modelType: "plant",
    label: "绿植",
    icon: "mdi:flower",
    height: 1.6,
    // 绿植没有「开 / 关」语义，顶部状态灯永远只是多一个绿点，故关掉。
    statusIndicator: false
  })
});

export const GENERIC_DEVICE_KINDS = Object.freeze(Object.keys(GENERIC_DEVICE_PROFILES));

export const GENERIC_DEVICE_COLLECTIONS = Object.freeze(
  GENERIC_DEVICE_KINDS.map(deviceKind => GENERIC_DEVICE_PROFILES[deviceKind].collection)
);

export const isGenericDeviceKind = deviceKind =>
  Object.hasOwn(GENERIC_DEVICE_PROFILES, deviceKind);

export const genericDeviceProfile = deviceKind =>
  isGenericDeviceKind(deviceKind) ? GENERIC_DEVICE_PROFILES[deviceKind] : null;

/**
 * 把场景模型清单按品类归到各自的集合下，交给编辑器当候选列表。
 *
 * 每个候选带上 x / y 与「几何中心高度」——后者让弹窗锚点落在模型腰上而不是脚下；
 * 模型没写高度时退回品类缺省高度，所以这里必须读 profile.height 而不是写死常数。
 */
export function genericDeviceMetadata(models = []) {
  return Object.fromEntries(
    GENERIC_DEVICE_KINDS.map(deviceKind => {
      const profile = genericDeviceProfile(deviceKind);
      return [
        profile.collection,
        models
          .filter(model => model.type === profile.modelType)
          .map((model, index) => ({
            id: model.id,
            type: model.type,
            name: model.name || profile.label + " " + (index + 1),
            x: model.x,
            y: model.y,
            height: (Number(model.elevation) || 0) + (Number(model.height) || profile.height) / 2
          }))
      ];
    })
  );
}
