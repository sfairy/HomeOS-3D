/**
 * 设备型号档案（0.7.8 `modules/interaction3d/device-profiles.js`）。
 *
 * 与后端 `DEVICE_PROFILES` 保持同一份口径：`collection` 是 3D 配置
 * `devices` 分区里的集合名，`modelType/modelTypes` 是场景模型类型。
 * 展示名、图标、默认高度与模型别名只在这里维护，避免两端各写一份白名单。
 */

export type DeviceProfile = {
  collection: string;
  modelType: string;
  modelTypes?: readonly string[];
  /** 一个集合收纳多种模型时，按模型类型覆盖展示名（0.7.8 `modelLabels`）。 */
  modelLabels?: Readonly<Record<string, string>>;
  label: string;
  icon?: string;
  height?: number;
  statusIndicator?: boolean;
  /** 电脑屏幕：允许把画面贴到模型屏幕上。 */
  screen?: boolean;
};

/** 绿植集合收纳的 11 种室内植物模型（0.7.8 `INDOOR_PLANT_MODEL_TYPES`）。 */
export const INDOOR_PLANT_MODEL_TYPES = Object.freeze([
  "decor-small-plant",
  "plant",
  "plant-monstera",
  "plant-snake",
  "plant-palm",
  "plant-rubber",
  "plant-pothos",
  "flower-orchid",
  "flower-peace-lily",
  "flower-anthurium",
  "flower-hydrangea",
]);

/** 床集合收纳的两种模型（0.7.8 `INDOOR_BED_MODEL_TYPES`）。 */
export const INDOOR_BED_MODEL_TYPES = Object.freeze(["bed", "round-double-bed"]);

/**
 * 沙发集合收纳的三种模型（0.7.9 `INDOOR_SOFA_MODEL_TYPES`）。
 *
 * `sofa-l` 的贵妃位朝向由 `sofaChaiseSide`（`left` / `right`）决定，
 * 该字段与朝向逻辑在 0.7.8 已存在，0.7.9 只是把沙发并入设备档案表。
 */
export const INDOOR_SOFA_MODEL_TYPES = Object.freeze(["sofa", "sofa-single", "sofa-l"]);

/** 场景模型（车、绿植、床、电脑）：高度取自模型自身，不参与状态灯扫描。 */
const SCENE_DEVICE_PROFILES: Record<string, DeviceProfile> = {
  smallcar: {
    collection: "cars",
    modelType: "smallcar",
    modelTypes: Object.freeze(["smallcar", "suv", "scooter"]),
    label: "汽车",
    icon: "mdi:car-electric",
    height: 1.5,
    statusIndicator: false,
  },
  plant: {
    collection: "plants",
    modelType: "plant",
    modelTypes: INDOOR_PLANT_MODEL_TYPES,
    label: "绿植",
    icon: "mdi:flower",
    height: 1.6,
    statusIndicator: false,
  },
  bed: {
    collection: "beds",
    modelType: "bed",
    modelTypes: INDOOR_BED_MODEL_TYPES,
    modelLabels: Object.freeze({
      bed: "双人床",
      "round-double-bed": "圆形双人床",
    }),
    label: "床",
    icon: "mdi:bed-king-outline",
    height: 1.02,
    statusIndicator: false,
  },
  computer: {
    collection: "computers",
    modelType: "desktop",
    modelTypes: Object.freeze(["desktop", "laptop"]),
    label: "电脑",
    icon: "mdi:desktop-classic",
    height: 0.5,
    statusIndicator: false,
    screen: true,
  },
  sofa: {
    collection: "sofas",
    modelType: "sofa",
    modelTypes: INDOOR_SOFA_MODEL_TYPES,
    modelLabels: Object.freeze({
      sofa: "沙发",
      "sofa-single": "单人沙发",
      "sofa-l": "L 型沙发",
    }),
    label: "沙发",
    icon: "mdi:sofa-outline",
    height: 0.82,
    statusIndicator: false,
  },
};

/** 家用电器：冰箱 / 清洁 / 厨房 / 环境类。 */
const HOUSEHOLD_DEVICE_PROFILES: Record<string, DeviceProfile> = {
  fridge: {
    collection: "fridges",
    modelType: "fridge",
    label: "冰箱",
    icon: "mdi:fridge-outline",
    height: 1.85,
  },
  "water-purifier": {
    collection: "waterPurifiers",
    modelType: "water-purifier",
    label: "净水器",
    icon: "mdi:water-pump",
    height: 0.415,
  },
  dishwasher: {
    collection: "dishwashers",
    modelType: "dishwasher",
    label: "洗碗机",
    icon: "mdi:dishwasher",
    height: 0.82,
  },
  washer: {
    collection: "washers",
    modelType: "washer",
    label: "洗衣机",
    icon: "mdi:washing-machine",
    height: 0.85,
  },
  rangehood: {
    collection: "rangehoods",
    modelType: "rangehood",
    label: "油烟机",
    icon: "mdi:air-filter",
    height: 0.55,
    statusIndicator: false,
  },
  dryer: {
    collection: "dryers",
    modelType: "dryer",
    label: "烘干机",
    icon: "mdi:tumble-dryer",
    height: 0.85,
  },
  humidifier: {
    collection: "humidifiers",
    modelType: "humidifier",
    label: "加湿器",
    icon: "mdi:air-humidifier",
    height: 0.323,
  },
  "aroma-diffuser": {
    collection: "aromaDiffusers",
    modelType: "aroma-diffuser",
    label: "香氛机",
    icon: "mdi:spray",
    height: 0.1745,
  },
  "disinfection-cabinet": {
    collection: "disinfectionCabinets",
    modelType: "disinfection-cabinet",
    label: "消毒柜",
    icon: "mdi:cupboard-outline",
    height: 0.41,
  },
  toilet: {
    collection: "toilets",
    modelType: "toilet",
    label: "智能马桶",
    icon: "mdi:toilet",
    height: 0.52,
  },
};

/** 厨房小家电。 */
const KITCHEN_DEVICE_PROFILES: Record<string, DeviceProfile> = {
  ricecooker: {
    collection: "riceCookers",
    modelType: "ricecooker",
    label: "电饭煲",
    icon: "mdi:rice",
    height: 0.25,
  },
  steamoven: {
    collection: "steamOvens",
    modelType: "steamoven",
    label: "蒸烤箱",
    icon: "mdi:stove",
    height: 0.6,
  },
  "air-fryer": {
    collection: "airFryers",
    modelType: "air-fryer",
    label: "空气炸锅",
    icon: "mdi:pot-steam",
    height: 0.34,
  },
  "pressure-cooker": {
    collection: "pressureCookers",
    modelType: "pressure-cooker",
    label: "电压力锅",
    icon: "mdi:pot-steam",
    height: 0.3555,
  },
  tea_bar_machine: {
    collection: "teaBarMachines",
    modelType: "tea_bar_machine",
    label: "茶吧机",
    icon: "mdi:kettle",
    height: 1.8,
  },
  pipelinewaterpurifier: {
    collection: "pipelineWaterPurifiers",
    modelType: "pipelinewaterpurifier",
    label: "管线机",
    icon: "mdi:water-pump",
    height: 0.68,
  },
  juicer: {
    collection: "juicers",
    modelType: "juicer",
    label: "榨汁机",
    icon: "mdi:blender",
    height: 0.529,
  },
  "bread-maker": {
    collection: "breadMakers",
    modelType: "bread-maker",
    label: "面包机",
    icon: "mdi:bread-slice-outline",
    height: 0.346872,
  },
  "power-blender": {
    collection: "powerBlenders",
    modelType: "power-blender",
    label: "破壁机",
    icon: "mdi:blender",
    height: 0.495,
  },
  microwave: {
    collection: "microwaves",
    modelType: "microwave",
    label: "微波炉",
    icon: "mdi:microwave",
    height: 0.32,
  },
  "coffee-machine": {
    collection: "coffeeMachines",
    modelType: "coffee-machine",
    label: "咖啡机",
    icon: "mdi:coffee-maker",
    height: 0.418,
  },
};

/** 宠物、办公与网络设备。 */
const OTHER_DEVICE_PROFILES: Record<string, DeviceProfile> = {
  "pet-feeder": {
    collection: "petFeeders",
    modelType: "pet-feeder",
    label: "自动喂食器",
    icon: "mdi:food-drumstick",
    height: 0.33,
  },
  "pet-fountain": {
    collection: "petFountains",
    modelType: "pet-fountain",
    label: "宠物饮水机",
    icon: "mdi:fountain",
    height: 0.200819,
  },
  "pet-dryer": {
    collection: "petDryers",
    modelType: "pet-dryer",
    label: "宠物烘干机",
    icon: "mdi:cat",
    height: 0.562,
  },
  printer: {
    collection: "printers",
    modelType: "printer",
    label: "打印机",
    icon: "mdi:printer",
    height: 0.3,
  },
  "3d-printer": {
    collection: "printers3d",
    modelType: "3d-printer",
    label: "3D打印机",
    icon: "mdi:printer-3d",
    height: 0.694,
  },
  router: {
    collection: "routers",
    modelType: "router",
    label: "路由器",
    icon: "mdi:router-wireless",
    height: 0.205,
  },
  "home-network-cabinet": {
    collection: "networkCabinets",
    modelType: "home-network-cabinet",
    label: "机柜",
    icon: "mdi:server-network",
    height: 0.64,
  },
  "smart-socket-86": {
    collection: "smartSockets86",
    modelType: "smart-socket-86",
    label: "86型智能插座",
    icon: "mdi:power-socket-eu",
    height: 0.086,
  },
};

/** 合并后的设备型号档案表（33 类，与后端 `DEVICE_PROFILES` 同口径；沙发为 0.7.9 新增）。 */
export const DEVICE_PROFILE_TABLE: Readonly<Record<string, DeviceProfile>> = Object.freeze({
  ...SCENE_DEVICE_PROFILES,
  ...HOUSEHOLD_DEVICE_PROFILES,
  ...KITCHEN_DEVICE_PROFILES,
  ...OTHER_DEVICE_PROFILES,
});

/** 设备类型列表。 */
export const DEVICE_KINDS = Object.freeze(Object.keys(DEVICE_PROFILE_TABLE));

export function deviceProfile(deviceKind: any): DeviceProfile | null {
  return Object.hasOwn(DEVICE_PROFILE_TABLE, deviceKind)
    ? (DEVICE_PROFILE_TABLE as any)[deviceKind]
    : null;
}

export function isDeviceKind(candidateKind: any) {
  return Object.hasOwn(DEVICE_PROFILE_TABLE, candidateKind);
}

/** 某个设备类型在场景里的全部模型类型（`modelTypes` 优先）。 */
export function deviceModelTypes(deviceKind: any): readonly string[] {
  const profile = deviceProfile(deviceKind);
  return profile ? profile.modelTypes || [profile.modelType] : [];
}
