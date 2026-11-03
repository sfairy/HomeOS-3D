/**
 * 导航默认值（0.8.4）：楼层 → 默认分类的规则从 `stage.ts` 迁出，
 * 让「首次进入某楼层」与「切楼层保持分类」共用同一套判断。
 */

export const FLOOR_CATEGORY_CHOICES: ReadonlyArray<readonly [string, string]> = Object.freeze([
  ["light", "灯光"],
  ["environment", "环境"],
  ["devices", "设备"],
  ["vacuum", "扫地机"],
  ["security", "安防"],
] as const);

/** 有配置条目的分类（按楼层过滤；`floorId` 为空表示整屋）。 */
export function configuredModuleKinds(
  moduleConfigSource: Record<string, any> = {},
  floorId = "",
) {
  const hasConfiguredItem = (collection: any) =>
      Array.isArray(collection) && collection.some((item: any) => !floorId || item.floorId === floorId),
    environmentConfig = moduleConfigSource.environment || {},
    deviceConfig = moduleConfigSource.devices || {},
    securityConfig = moduleConfigSource.security || {};
  return [
    /**
     * `overview` 必须排在最前：舞台导航的第一个页签是「3D」（总览），
     * `stage/refresh.ts` 用 `configuredModuleKinds2.indexOf(kind) < 0` 决定页签是否隐藏，
     * 少了这一项，「3D」页签会被无条件隐藏、点击也被 `switchModule` 的
     * `includes` 判断拒掉 —— 表现为「导航里的 3D 按钮不见了」。
     * 它不属于可配置设备分类（不在 `FLOOR_CATEGORY_CHOICES` 里），但确实是一级导航。
     */
    "overview",
    "light",
    ...(["airConditioners", "fans", "exhaustFans", "airPurifiers", "curtains", "windowOpeners", "temperatureHumidity"].some(
      (collectionKey) => hasConfiguredItem(environmentConfig[collectionKey]),
    )
      ? ["environment"]
      : []),
    ...(Object.entries(deviceConfig).some(
      ([deviceCollectionKey, deviceCollection]) =>
        deviceCollectionKey !== "vacuums" && hasConfiguredItem(deviceCollection),
    ) ||
    hasConfiguredItem(environmentConfig.airers) ||
    hasConfiguredItem(environmentConfig.waterHeaters)
      ? ["devices"]
      : []),
    ...(hasConfiguredItem(deviceConfig.vacuums) ? ["vacuum"] : []),
    ...(["locks", "windows", "cameras", "presenceSensors", "alarms"].some((collectionKey) =>
      hasConfiguredItem(securityConfig[collectionKey]),
    )
      ? ["security"]
      : []),
  ];
}

/** 首次打开默认楼层：显式配置优先，多楼层落到「全部」，单楼层落到该层。 */
export function defaultOpeningFloor(floors: any[], componentProperties: Record<string, any> = {}) {
  const configuredFloor = componentProperties.navigationDefaults?.floor;
  return floors.some((floorEntry) => floorEntry.id === configuredFloor)
    ? configuredFloor
    : floors.length > 1
      ? "all"
      : floors[0]?.id;
}

/** 某楼层的默认分类：配置合法才用，否则回落到灯光。 */
export function defaultFloorCategory(componentProperties: Record<string, any> = {}, floorId: string) {
  if (floorId === "all") return "overview";
  const configuredCategory = componentProperties.navigationDefaults?.categories?.[floorId];
  return configuredModuleKinds(componentProperties, floorId).includes(configuredCategory)
    ? configuredCategory
    : "light";
}

/** 切楼层时分类的保持策略：`same` 保持当前分类，`default` 回到该层默认分类。 */
export function floorSwitchMode(componentProperties: Record<string, any> = {}) {
  return ["same", "remember"].includes(componentProperties.navigationDefaults?.floorSwitch)
    ? "same"
    : "default";
}

/** 进入楼层后的分类：`all` 恒为总览；`same` 模式在「全部 → 具体楼层」时仍回默认分类。 */
export function enteringFloorCategory(
  componentProperties: Record<string, any> = {},
  floorId: string,
  currentCategory = "",
  previousFloorId = "",
) {
  if (floorId === "all") return "overview";
  const resetFromAll =
    previousFloorId === "all" &&
    componentProperties.navigationDefaults?.resetCategoryFromAll === true;
  return floorSwitchMode(componentProperties) === "same" &&
    !resetFromAll &&
    configuredModuleKinds(componentProperties).includes(currentCategory)
    ? currentCategory
    : defaultFloorCategory(componentProperties, floorId);
}
