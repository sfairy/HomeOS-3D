import { entityMetadataIsAvailable } from "./entity-metadata.js?v=20260901-renderer-entity-metadata-v1";
const _ = Object.freeze({
  turn_on: 1,
  turn_off: 2,
  pause: 4,
  stop: 8,
  return_to_base: 16,
  locate: 512,
  clean_spot: 1024,
  start: 8192,
});
export function vacuumSupportedActions(arg1) {
  const value1 = arg1?.attributes?.supported_features;
  if (value1 == null || value1 === "") return ["start", "pause", "return_to_base"];
  const value2 = Number(value1);
  if (!Number.isFinite(value2)) return ["start", "pause", "return_to_base"];
  const list1 = [];
  return (
    (value2 & _.start || value2 & _.turn_on) && list1.push("start"),
    value2 & _.pause && list1.push("pause"),
    (value2 & _.stop || value2 & _.turn_off) && list1.push("stop"),
    value2 & _.return_to_base && list1.push("return_to_base"),
    value2 & _.locate && list1.push("locate"),
    value2 & _.clean_spot && list1.push("clean_spot"),
    list1
  );
}
export function vacuumActionService(arg2, arg3) {
  const value3 = Number(arg2?.attributes?.supported_features);
  return Number.isFinite(value3)
    ? arg3 === "start" && !(value3 & _.start) && value3 & _.turn_on
      ? "turn_on"
      : arg3 === "stop" && !(value3 & _.stop) && value3 & _.turn_off
        ? "turn_off"
        : arg3
    : arg3;
}
function w(arg4) {
  return arg4?.newState || arg4 || null;
}
const v = {
    cleaning: "清扫中",
    sweeping: "扫地中",
    mopping: "拖地中",
    sweeping_and_mopping: "扫拖中",
    mopping_after_sweeping: "先扫后拖中",
    spot_cleaning: "局部清扫中",
    zone_cleaning: "区域清扫中",
    segment_cleaning: "房间清扫中",
    auto_cleaning: "自动清扫中",
    second_cleaning: "二次清洁中",
    extra_cleaning: "加强清洁中",
    heading_to_extra_cleaning: "前往加强清洁",
    initial_deep_cleaning: "深度清洁中",
    returning: "回充中",
    returning_to_wash: "返回清洗拖布",
    returning_to_wash_paused: "返回清洗已暂停",
    returning_paused: "回充已暂停",
    returning_auto_empty: "返回集尘",
    returning_install_mop: "返回安装拖布",
    returning_remove_mop: "返回拆卸拖布",
    returning_to_drain: "返回排水",
    washing: "清洗拖布",
    washing_paused: "清洗已暂停",
    drying: "烘干拖布",
    drying_paused: "烘干已暂停",
    auto_emptying: "集尘中",
    station_cleaning: "基站自清洁",
    station_reset: "基站复位中",
    clean_add_water: "补水中",
    water_check: "水路检查中",
    draining: "排水中",
    auto_water_draining: "自动排水中",
    emptying: "排空水箱中",
    dust_bag_drying: "尘袋烘干中",
    dust_bag_drying_paused: "尘袋烘干已暂停",
    installing_mop: "安装拖布中",
    uninstalling_mop: "拆卸拖布中",
    changing_mop: "更换拖布中",
    changing_mop_paused: "更换拖布已暂停",
    sanitizing: "消毒中",
    sanitizing_with_dry: "消毒烘干中",
    charging: "充电中",
    charging_completed: "充电完成",
    smart_charging: "智能充电",
    intelligent_recharging: "智能回充中",
    docked: "已回充",
    idle: "待机",
    paused: "已暂停",
    stopped: "已停止",
    sleeping: "休眠中",
    waiting_for_task: "等待任务",
    upgrading: "固件升级中",
    mapping: "建图中",
    remote_control: "遥控中",
    monitoring: "巡航中",
    monitoring_paused: "巡航已暂停",
    finding_pet: "寻找宠物中",
    finding_pet_paused: "寻找宠物已暂停",
    human_following: "跟随中",
    pet_guarding: "宠物看护中",
    pet_guarding_paused: "宠物看护已暂停",
    clean_summon: "前往指定位置清洁",
    shortcut: "快捷任务中",
    floor_maintaining: "地板养护中",
    floor_maintaining_paused: "地板养护已暂停",
    initial_deep_cleaning_paused: "深度清洁已暂停",
    remote_pickup: "遥控拾取中",
    arranging_items: "整理物品中",
    assisted_cleaning: "辅助清洁中",
    entering_dock: "进入基站",
    leaving_dock: "离开基站",
    navigating_to_climber: "前往爬楼装置",
    docking_to_climber: "连接爬楼装置",
    climber_docked: "已连接爬楼装置",
    climber_navigating: "爬楼装置移动中",
    climbing_stairs: "爬楼中",
    climbing_stairs_completed: "爬楼完成",
    climber_at_dock: "爬楼装置已停靠",
    climber_leaving_dock: "爬楼装置离站中",
    error: "设备异常",
    unavailable: "设备离线",
    unknown: "等待状态",
  },
  K = {
    vacuuming: "cleaning",
    standby: "idle",
    ready: "idle",
    off: "stopped",
    returning_to_base: "returning",
    returning_home: "returning",
    back_home: "returning",
    return_to_charge: "returning",
    returning_to_washing: "returning_to_wash",
    mop_washing: "washing",
    self_washing: "washing",
    cleaning_mop: "washing",
    mop_drying: "drying",
    drying_mop: "drying",
    building: "mapping",
    fast_mapping: "mapping",
    automatic: "auto_cleaning",
    zone: "zone_cleaning",
    segment: "segment_cleaning",
    spot: "spot_cleaning",
    cleaning_paused: "paused",
    docking_paused: "returning_paused",
    auto_docking_paused: "returning_paused",
    segment_docking_paused: "returning_paused",
    zone_docking_paused: "returning_paused",
    auto_cleaning_paused: "paused",
    segment_cleaning_paused: "paused",
    zone_cleaning_paused: "paused",
    spot_cleaning_paused: "paused",
    mopping_paused: "paused",
    zone_mopping_paused: "paused",
    segment_mopping_paused: "paused",
    auto_mopping_paused: "paused",
    map_cleaning_paused: "paused",
    adding_water: "clean_add_water",
    room_cleaning: "segment_cleaning",
    follow_wall_cleaning: "cleaning",
    cruising_path: "monitoring",
    cruising_point: "monitoring",
    cruising_path_paused: "monitoring_paused",
    cruising_point_paused: "monitoring_paused",
    summon_clean: "clean_summon",
    person_follow: "human_following",
    ota: "upgrading",
    power_off: "stopped",
    pet_finding: "finding_pet",
  },
  R = new Set(
    "cleaning sweeping mopping sweeping_and_mopping mopping_after_sweeping spot_cleaning zone_cleaning segment_cleaning auto_cleaning second_cleaning extra_cleaning heading_to_extra_cleaning initial_deep_cleaning returning returning_to_wash returning_auto_empty returning_install_mop returning_remove_mop returning_to_drain intelligent_recharging mapping remote_control monitoring finding_pet human_following pet_guarding clean_summon shortcut floor_maintaining remote_pickup arranging_items assisted_cleaning entering_dock leaving_dock navigating_to_climber docking_to_climber climber_navigating climbing_stairs climber_leaving_dock".split(
      " ",
    ),
  ),
  T = new Set(
    "washing drying auto_emptying station_cleaning station_reset clean_add_water water_check draining auto_water_draining emptying dust_bag_drying installing_mop uninstalling_mop changing_mop sanitizing sanitizing_with_dry".split(
      " ",
    ),
  ),
  b = new Set(["docked", "charging", "charging_completed", "smart_charging"]),
  W = [
    "self_wash_base_status",
    "auto_empty_status",
    "charging_status",
    "task_status",
    "state",
    "status",
  ],
  y = (arg5) => {
    const value4 = String(arg5 ?? "")
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_");
    return K[value4] || value4;
  },
  u = (arg6) =>
    arg6 === true || arg6 === 1 || ["true", "on", "1"].includes(String(arg6).toLowerCase());
export function vacuumStatusRole(arg7 = {}) {
  if ((arg7.domain || arg7.entityId?.split(".")[0]) !== "sensor") return "";
  const value5 = arg7.translationKey || arg7.translation_key;
  return value5
    ? W.includes(value5)
      ? value5
      : ""
    : W.find((arg8) =>
        new RegExp("(?:^|_)" + arg8 + "(?:_\\d+)?$").test(arg7.entityId?.split(".")[1] || ""),
      ) || "";
}
export function relatedVacuumStatusEntities(arg9, arg10) {
  const value6 = arg9?.get(arg10);
  return value6?.deviceId
    ? [...arg9.values()].filter(
        (arg11) =>
          arg11.deviceId === value6.deviceId &&
          entityMetadataIsAvailable(arg11) &&
          !arg11.disabled_by &&
          arg11.enabled !== false &&
          vacuumStatusRole(arg11),
      )
    : [];
}
export function vacuumStatusBinding(arg12, arg13) {
  const value7 = relatedVacuumStatusEntities(arg13, arg12.entityId);
  return !value7.length && !arg13?.get(arg12.entityId)?.deviceId
    ? arg12
    : {
        ...arg12,
        relatedEntityIds: [
          ...new Set([...(arg12.relatedEntityIds || []), ...value7.map((arg14) => arg14.entityId)]),
        ],
        statusEntityRoles: Object.fromEntries(
          value7.map((arg15) => [arg15.entityId, vacuumStatusRole(arg15)]),
        ),
      };
}
export function vacuumStatus(arg16, arg17 = []) {
  const value8 = w(arg16),
    value9 = value8?.attributes || {},
    value10 = y(value8?.state || "unknown"),
    value11 = !["unknown", "unavailable"].includes(value10),
    object1 = {},
    set1 = new Set();
  for (const value27 of arg17) {
    const value28 = value27.role === undefined ? vacuumStatusRole(value27) : value27.role,
      value29 = w(value27.state),
      value30 = y(value29?.state);
    !value28 ||
      !value30 ||
      ["unknown", "unavailable"].includes(value30) ||
      (["state", "status", "task_status"].includes(value28) &&
        !v[value30] &&
        !/[\u3400-\u9fff]/.test(value30)) ||
      (object1[value28] && object1[value28] !== value30
        ? set1.add(value28)
        : (object1[value28] = value30));
  }
  for (const value31 of set1) delete object1[value31];
  const fn1 = (arg18) => {
      const value32 = y(arg18);
      return !["unknown", "unavailable"].includes(value32) &&
        (v[value32] || /[\u3400-\u9fff]/.test(value32))
        ? value32
        : "";
    },
    value12 = fn1(value9.vacuum_state) || object1.state,
    value13 = value12 || fn1(value9.status) || object1.status || object1.task_status;
  let value14 = value13 || value10;
  const value15 = object1.self_wash_base_status || y(value9.self_wash_base_status),
    value16 =
      !!value13 &&
      (T.has(value14) ||
        value14 === "paused" ||
        value14.endsWith("_paused") ||
        (R.has(value14) && !["cleaning", "returning"].includes(value14)) ||
        (value12 &&
          [
            "idle",
            "stopped",
            "sleeping",
            "waiting_for_task",
            "charging_completed",
            "smart_charging",
            "upgrading",
          ].includes(value14))),
    value17 = !value16 || value10 === "paused",
    value18 = ["returning", "returning_for_wash", "returning_for_dry_mop"].includes(value15),
    value19 =
      value14 === "returning_to_wash" || (!value16 && (u(value9.returning_to_wash) || value18)),
    value20 = value17 && u(value9.returning_to_wash_paused),
    value21 =
      value14 === "washing_paused" ||
      (value17 && (u(value9.washing_paused) || value15 === "paused")),
    value22 =
      value10 === "paused" ||
      value14 === "paused" ||
      value21 ||
      value14.endsWith("_paused") ||
      (value17 && (u(value9.paused) || value20 || u(value9.returning_paused)));
  value11
    ? value10 === "error" || value14 === "error" || u(value9.has_error)
      ? (value14 = "error")
      : value20 || (value22 && value19)
        ? (value14 = "returning_to_wash_paused")
        : value21
          ? (value14 = "washing_paused")
          : value22
            ? (value14 =
                value14.endsWith("_paused") && v[value14]
                  ? value14
                  : u(value9.returning_paused)
                    ? "returning_paused"
                    : "paused")
            : !value16 && value19
              ? (value14 = "returning_to_wash")
              : !value16 && u(value9.draining)
                ? (value14 = "draining")
                : value16 ||
                  (u(value9.washing) || value15 === "washing"
                    ? (value14 = "washing")
                    : u(value9.drying) || value15 === "drying"
                      ? (value14 = "drying")
                      : T.has(value15)
                        ? (value14 = value15)
                        : ["active", "emptying", "auto_emptying"].includes(
                              object1.auto_empty_status || y(value9.auto_empty_status),
                            )
                          ? (value14 = "auto_emptying")
                          : u(value9.mapping)
                            ? (value14 = "mapping")
                            : u(value9.returning) && (!value13 || value14 === "returning")
                              ? (value14 = "returning")
                              : b.has(value10) &&
                                (!value13 || b.has(value14)) &&
                                b.has(object1.charging_status) &&
                                (value14 = object1.charging_status))
    : (value14 = value10);
  const value23 =
      !value11 || value14 === "error" || value14 === "paused" || value14.endsWith("_paused"),
    value24 = !value23 && R.has(value14),
    value25 = !value23 && T.has(value14),
    value26 =
      value11 &&
      !value24 &&
      (b.has(value14) ||
        value25 ||
        [
          "washing_paused",
          "drying_paused",
          "dust_bag_drying_paused",
          "changing_mop_paused",
        ].includes(value14) ||
        b.has(value10) ||
        (!value22 && (u(value9.docked) || u(value9.charging))));
  return {
    key: value14,
    status:
      v[value14] ||
      (/[\u3400-\u9fff]/.test(value14) ? String(value13 || value8?.state).trim() : "状态更新中"),
    available: value11,
    active: !value23 && (value24 || value25),
    moving: value24,
    stationWorking: value25,
    docked: value26,
    paused: value11 && value14 !== "error" && (value14 === "paused" || value14.endsWith("_paused")),
    returning: value24 && (value14.startsWith("returning") || value14 === "intelligent_recharging"),
  };
}
function z(arg19) {
  if (arg19 == null || String(arg19).trim() === "") return null;
  const value33 = Number.parseFloat(String(arg19));
  return Number.isFinite(value33) ? Math.max(0, Math.min(100, value33)) : null;
}
export function vacuumBatteryPercent(arg20, arg21 = null) {
  const value34 = w(arg20)?.attributes || {};
  for (const value35 of [value34.battery_level, value34.battery_percentage, value34.battery]) {
    const value36 = z(value35);
    if (value36 !== null) return value36;
  }
  return z(w(arg21)?.state);
}
export function relatedVacuumBatteryEntity(arg22, arg23, arg24) {
  const value37 = arg22.get(arg24);
  return (
    (value37?.deviceId &&
      [...arg22.values()]
        .filter(
          (arg25) =>
            arg25.deviceId === value37.deviceId &&
            arg25.domain === "sensor" &&
            entityMetadataIsAvailable(arg25),
        )
        .map((arg26) => {
          const value38 = w(arg23.get(arg26.entityId)),
            value39 = value38?.attributes || {},
            value40 = (
              (arg26.entityId || "") +
              " " +
              (arg26.name || "") +
              " " +
              (arg26.originalName || "") +
              " " +
              (arg26.translationKey || "") +
              " " +
              (arg26.icon || "")
            ).toLowerCase(),
            value41 = String(value39.device_class || "").toLowerCase(),
            value42 = String(value39.unit_of_measurement || "").trim();
          let value43 = 0;
          return (
            value41 === "battery" && (value43 += 240),
            String(arg26.translationKey || "").toLowerCase() === "battery" && (value43 += 210),
            /(?:^|[._\s-])battery(?:_level|_percentage)?(?:$|[._\s-])|电池电量|剩余电量|电量/.test(
              value40,
            ) && (value43 += 150),
            /mdi:battery/.test(value40) && (value43 += 60),
            value42 === "%" && (value43 += 25),
            /filter|brush|mop|consumable|life|尘袋|滤芯|主刷|边刷|拖布|耗材/.test(value40) &&
              (value43 -= 260),
            z(value38?.state) === null && (value43 -= 40),
            {
              item: arg26,
              score: value43,
            }
          );
        })
        .filter(({ score: arg27 }) => arg27 > 0)
        .sort(
          (arg28, arg29) =>
            arg29.score - arg28.score ||
            String(arg28.item.entityId || "").length - String(arg29.item.entityId || "").length ||
            String(arg28.item.entityId || "").localeCompare(String(arg29.item.entityId || "")),
        )[0]?.item) ||
    null
  );
}
