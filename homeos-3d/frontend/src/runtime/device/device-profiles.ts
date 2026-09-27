/**
 * 通用设备（冰箱 / 冰柜 / 洗碗机 / 洗衣机 / 烘干机 / 绿植）的品类登记表。
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

export type GenericDeviceKind = keyof typeof GENERIC_DEVICE_PROFILES;

export const GENERIC_DEVICE_KINDS = Object.freeze(
  Object.keys(GENERIC_DEVICE_PROFILES) as GenericDeviceKind[],
);

export const GENERIC_DEVICE_COLLECTIONS = Object.freeze(
  GENERIC_DEVICE_KINDS.map(deviceKind => GENERIC_DEVICE_PROFILES[deviceKind].collection)
);

export const isGenericDeviceKind = (deviceKind: unknown): deviceKind is GenericDeviceKind =>
  typeof deviceKind === "string" && Object.hasOwn(GENERIC_DEVICE_PROFILES, deviceKind);

export const genericDeviceProfile = (deviceKind: unknown) =>
  isGenericDeviceKind(deviceKind) ? GENERIC_DEVICE_PROFILES[deviceKind] : null;

type SceneModel = {
  id?: string;
  type?: string;
  name?: string;
  x?: number;
  y?: number;
  elevation?: number | string | null;
  height?: number | string | null;
  [key: string]: unknown;
};

/**
 * 把场景模型清单按品类归到各自的集合下，交给编辑器当候选列表。
 */
export function genericDeviceMetadata(models: SceneModel[] = []) {
  return Object.fromEntries(
    GENERIC_DEVICE_KINDS.map(deviceKind => {
      const profile = genericDeviceProfile(deviceKind)!;
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
