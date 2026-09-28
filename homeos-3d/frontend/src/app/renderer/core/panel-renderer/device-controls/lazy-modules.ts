/**
 * 设备详情模块的按需加载表。
 */

type AnyObj = Record<string, any>;

import { entityDomainFromId } from "../../../../utils/entities.js";

/** 设备种类 -> 加载器。键同时是调用方要声明的「我需要哪几类」。 */
const DEVICE_CONTROL_LOADERS: AnyObj = {
  capability: () => import("./capability.js"),
  "air-purifier": () => import("./air-purifier.js"),
  "media-player": () => import("./media-player.js"),
  light: () => import("./light.js"),
  cover: () => import("./cover.js"),
  climate: () => import("./climate.js"),
  "water-heater": () => import("./water-heater.js"),
  "electric-bed": () => import("./electric-bed.js"),
  vacuum: () => import("./vacuum.js"),
  presence: () => import("./presence.js"),
  camera: () => import("./camera.js")
};

/** 每个种类导出哪张方法表。名字写错会在加载完成时抛错，不会静默少挂几个方法。 */
const EXPORT_BY_KIND: AnyObj = {
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
let mountMethodSets: any = null;

/** 已挂载的种类。幂等：重复 ensure 不会重复挂载。 */
const mountedKinds = new Set<any>();

/** 在途加载。并发打开同一类面板时只 import 一次。 */
const inflightLoads = new Map<any, any>();

export function installDeviceControlMounter(mount: any) {
  mountMethodSets = mount;
}

/**
 * 确保这几类设备控件的方法已挂到原型上。
 * @param {Array<string>} kinds 设备种类；未知种类与空值会被忽略（调用方可以按分支传 null）。
 * @returns {Promise<void>}
 */
export async function ensureDeviceControlMethods(kinds: any) {
  if (!mountMethodSets) {
    throw new Error("设备控件挂载器尚未安装（renderer.js 未加载即打开了面板）。");
  }
  const wanted = [...new Set(kinds)].filter((kind: any) => kind && DEVICE_CONTROL_LOADERS[kind] && !mountedKinds.has(kind));
  if (!wanted.length) {
    return;
  }
  await Promise.all(
    wanted.map((kind: any) => {
      let task = inflightLoads.get(kind);
      if (!task) {
        task = DEVICE_CONTROL_LOADERS[kind]()
          .then((module: any) => {
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
 * 已挂载时同步返回（与摄像头弹窗同路径），避免点击后再 await 空转一帧。
 */
export function runDeviceControlMethod(kinds: any, target: any, methodName: any, args: any, onError: any) {
  const invoke = () => {
    if (typeof target[methodName] !== "function") {
      throw new Error("设备控件方法不存在：" + methodName);
    }
    return target[methodName](...args);
  };
  const needed = [...new Set(kinds)].filter(
    (kind: any) => kind && DEVICE_CONTROL_LOADERS[kind] && !mountedKinds.has(kind)
  );
  if (!needed.length) {
    try {
      return invoke();
    } catch (error: any) {
      if (typeof onError === "function") {
        onError(error);
        return undefined;
      }
      throw error;
    }
  }
  return ensureDeviceControlMethods(kinds)
    .then(invoke)
    .catch(error => {
      if (typeof onError === "function") {
        onError(error);
        return undefined;
      }
      throw error;
    });
}

/**
 * 由「控件 + 设备画像」推出这一屏可能要用的种类。
 */
function detailsDeviceControlKinds(component: any, deviceProfile: any) {
  const kinds = new Set<any>();
  const type = String(component?.type || "");
  const deviceType = String(component?.properties?.deviceType || deviceProfile?.deviceType || "");
  const entityId = String(component?.bindings?.entity?.entityId || "");
  const domain = entityId ? entityDomainFromId(entityId) : "";
  if (type === "presence-sensor") kinds.add("presence");
  if (deviceType === "electric-bed" || type === "electric-bed") kinds.add("electric-bed");
  if (type === "media-player" || domain === "media_player" || deviceType === "media-player") kinds.add("media-player");
  if (type === "air-purifier" || deviceType === "air-purifier") {
    kinds.add("air-purifier");
    // 净化器详情复用 createWaterHeaterExtensionControls 画关联实体扩展区。
    kinds.add("water-heater");
  }
  if (
    type === "vacuum-control" ||
    deviceType === "vacuum" ||
    entityId.startsWith("vacuum.")
  ) {
    kinds.add("vacuum");
    // 扫地机详情同样复用热水器扩展控件方法。
    kinds.add("water-heater");
  }
  if (type === "light" || domain === "light") kinds.add("light");
  if (type === "cover" || domain === "cover") kinds.add("cover");
  if (
    type === "air-conditioner" ||
    type === "water-heater" ||
    type === "bath-heater" ||
    deviceType === "air-conditioner" ||
    deviceType === "water-heater" ||
    deviceType === "bath-heater" ||
    ["climate", "water_heater", "fan"].includes(domain)
  ) {
    kinds.add("climate");
    kinds.add("water-heater");
  }
  if (type === "camera" || domain === "camera") kinds.add("camera");
  return [...kinds];
}

/** 由一批控件推出种类（摄像头 / 扫地机预览等按控件派发的调用点用）。 */
function componentsDeviceControlKinds(components: any) {
  const kinds = new Set<any>();
  for (const component of components || []) {
    for (const kind of detailsDeviceControlKinds(component, null)) kinds.add(kind);
  }
  return [...kinds];
}

/**
 * 由弹窗定义推出种类。
 */
function popupDeviceControlKinds(popupDefinition: any) {
  const kinds = new Set<any>();
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
export function attachDeviceControlPreparers(prototype: any) {
  const define = (name: any, derive: any) => {
    Object.defineProperty(prototype, name, {
      value: function (input: any, deviceProfile: any) {
        return ensureDeviceControlMethods(derive(input, deviceProfile));
      },
      writable: true,
      enumerable: false,
      configurable: true
    });
  };
  define("prepareDeviceControlsForDetails", (component: any, deviceProfile: any) => detailsDeviceControlKinds(component, deviceProfile));
  define("prepareDeviceControlsForComponents", (components: any) => componentsDeviceControlKinds(components));
  define("prepareDeviceControlsForPopup", (popupDefinition: any) => popupDeviceControlKinds(popupDefinition));
}
