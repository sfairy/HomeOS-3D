/**
 * 设备详情模块的按需加载表。
 */

import { entityDomainFromId } from "../../../../utils/entities.js?v=2609271226";

/** 设备种类 -> 加载器。键同时是调用方要声明的「我需要哪几类」。 */
export const DEVICE_CONTROL_LOADERS = {
  capability: () => import("./capability.js?v=2609271226"),
  "air-purifier": () => import("./air-purifier.js?v=2609271226"),
  "media-player": () => import("./media-player.js?v=2609271226"),
  light: () => import("./light.js?v=2609271226"),
  cover: () => import("./cover.js?v=2609271226"),
  climate: () => import("./climate.js?v=2609271226"),
  "water-heater": () => import("./water-heater.js?v=2609271226"),
  "electric-bed": () => import("./electric-bed.js?v=2609271226"),
  vacuum: () => import("./vacuum.js?v=2609271226"),
  presence: () => import("./presence.js?v=2609271226"),
  camera: () => import("./camera.js?v=2609271226")
};

/** 每个种类导出哪张方法表。名字写错会在加载完成时抛错，不会静默少挂几个方法。 */
const EXPORT_BY_KIND = {
  capability: "capabilityDetailsMethods",
  "air-purifier": "airPurifierDetailsMethods",
  "media-player": "mediaPlayerDetailsMethods",
  light: "lightDetailsMethods",
  cover: "coverDetailsMethods",
  climate: "climateDetailsMethods",
  "water-heater": "waterHeaterDetailsMethods",
  "electric-bed": "electricBedDetailsMethods",
  vacuum: "vacuumDetailsMethods",
  presence: "presenceDetailsMethods",
  camera: "cameraDetailsMethods"
};

/** 由 renderer.js 注入：把方法表挂到 PanelRenderer.prototype（含重名检查）。 */
let mountMethodSets = null;

/** 已挂载的种类。幂等：重复 ensure 不会重复挂载。 */
const mountedKinds = new Set();

/** 在途加载。并发打开同一类面板时只 import 一次。 */
const inflightLoads = new Map();

export function installDeviceControlMounter(mount) {
  mountMethodSets = mount;
}

/**
 * 确保这几类设备控件的方法已挂到原型上。
 * @param {Array<string>} kinds 设备种类；未知种类与空值会被忽略（调用方可以按分支传 null）。
 * @returns {Promise<void>}
 */
export async function ensureDeviceControlMethods(kinds) {
  if (!mountMethodSets) {
    throw new Error("设备控件挂载器尚未安装（renderer.js 未加载即打开了面板）。");
  }
  const wanted = [...new Set(kinds)].filter(kind => kind && DEVICE_CONTROL_LOADERS[kind] && !mountedKinds.has(kind));
  if (!wanted.length) {
    return;
  }
  await Promise.all(
    wanted.map(kind => {
      let task = inflightLoads.get(kind);
      if (!task) {
        task = DEVICE_CONTROL_LOADERS[kind]()
          .then(module => {
            const exportName = EXPORT_BY_KIND[kind];
            const methodTable = module[exportName];
            if (!methodTable) {
              throw new Error("设备控件模块缺少导出 " + exportName + "（种类 " + kind + "）");
            }
            mountMethodSets([methodTable]);
            mountedKinds.add(kind);
          })
          .finally(() => inflightLoads.delete(kind));
        inflightLoads.set(kind, task);
      }
      return task;
    })
  );
}

/**
 * 先确保模块就位，再调用它的方法。
 */
export async function runDeviceControlMethod(kinds, target, methodName, args, onError) {
  try {
    await ensureDeviceControlMethods(kinds);
    if (typeof target[methodName] !== "function") {
      throw new Error("设备控件方法不存在：" + methodName);
    }
    return target[methodName](...args);
  } catch (error) {
    if (typeof onError === "function") {
      onError(error);
      return undefined;
    }
    throw error;
  }
}

/**
 * 由「控件 + 设备画像」推出这一屏可能要用的种类。
 */
export function detailsDeviceControlKinds(component, deviceProfile) {
  const kinds = new Set();
  const type = String(component?.type || "");
  const deviceType = String(component?.properties?.deviceType || deviceProfile?.deviceType || "");
  const entityId = String(component?.bindings?.entity?.entityId || "");
  const domain = entityId ? entityDomainFromId(entityId) : "";
  if (type === "presence-sensor") kinds.add("presence");
  if (deviceType === "electric-bed" || type === "electric-bed") kinds.add("electric-bed");
  if (type === "media-player" || domain === "media_player" || deviceType === "media-player") kinds.add("media-player");
  if (type === "air-purifier") kinds.add("air-purifier");
  if (type === "vacuum-control" || entityId.startsWith("vacuum.")) kinds.add("vacuum");
  if (type === "light" || domain === "light") kinds.add("light");
  if (type === "cover" || domain === "cover") kinds.add("cover");
  if (
    type === "air-conditioner" ||
    type === "water-heater" ||
    type === "bath-heater" ||
    ["climate", "water_heater", "fan"].includes(domain)
  ) {
    kinds.add("climate");
    kinds.add("water-heater");
  }
  if (type === "camera" || domain === "camera") kinds.add("camera");
  return [...kinds];
}

/** 由一批控件推出种类（摄像头 / 扫地机预览等按控件派发的调用点用）。 */
export function componentsDeviceControlKinds(components) {
  const kinds = new Set();
  for (const component of components || []) {
    for (const kind of detailsDeviceControlKinds(component, null)) kinds.add(kind);
  }
  return [...kinds];
}

/**
 * 由弹窗定义推出种类。
 */
export function popupDeviceControlKinds(popupDefinition) {
  const kinds = new Set();
  for (const module of popupDefinition?.modules || []) {
    const component = module?.component || module;
    for (const kind of detailsDeviceControlKinds(component, null)) kinds.add(kind);
    const moduleType = String(module?.type || component?.type || "");
    const moduleDeviceType = String(component?.properties?.deviceType || module?.deviceType || "");
    if (moduleType === "electric-bed" || moduleDeviceType === "electric-bed") {
      kinds.add("electric-bed");
      kinds.add("capability");
    }
    if (moduleType === "media-player" || moduleDeviceType === "media-player") kinds.add("media-player");
  }
  return [...kinds];
}

/**
 * 把三个「预取入口」挂到 PanelRenderer.prototype 上。
 */
export function attachDeviceControlPreparers(prototype) {
  const define = (name, derive) => {
    Object.defineProperty(prototype, name, {
      value: function (input, deviceProfile) {
        return ensureDeviceControlMethods(derive(input, deviceProfile));
      },
      writable: true,
      enumerable: false,
      configurable: true
    });
  };
  define("prepareDeviceControlsForDetails", (component, deviceProfile) => detailsDeviceControlKinds(component, deviceProfile));
  define("prepareDeviceControlsForComponents", components => componentsDeviceControlKinds(components));
  define("prepareDeviceControlsForPopup", popupDefinition => popupDeviceControlKinds(popupDefinition));
}
