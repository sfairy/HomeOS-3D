import {
  EDITOR_PICKER_PAGE_SIZES,
  editorEntityPickerInitialPage,
  editorEntityPickerPage,
} from "../../editor-picker-pagination.js?v=20260830-editor-picker-pagination-v1";
import { createEditorPickerQueries } from "../../editor-picker-queries.js?v=20260830-editor-picker-queries-v1";
import { vacuumProfiles } from "./vacuum-catalog.js";
import { nasProfiles } from "./nas-catalog.js?v=20260918-review-1234-v2";
import {
  matchesTemperatureHumidityEntity,
  ENVIRONMENT_SENSORS,
} from "./temperature-humidity.js?v=20260925-environment-label-v1";
const U = "mdi:lightbulb-outline",
  ee = (arg1) => typeof arg1 == "string" && /^mdi:[a-z0-9][a-z0-9-]{0,119}$/.test(arg1),
  q = (arg2) =>
    arg2 &&
    arg2.disabledBy == null &&
    arg2.disabled_by == null &&
    arg2.enabled !== false &&
    !["missing", "disabled"].includes(String(arg2.status || "").toLowerCase());
export function presenceDeviceProfiles(arg3 = [], arg4 = [], arg5 = () => null) {
  const map1 = new Map();
  for (const value1 of arg3) {
    if (
      value1.disabledBy != null ||
      value1.disabled_by != null ||
      value1.enabled === false ||
      ["missing", "disabled"].includes(value1.status) ||
      !/^(binary_sensor|event)\.[a-z0-9_]+$/.test(value1.entityId || "")
    )
      continue;
    const value2 =
      value1.deviceClass ||
      value1.device_class ||
      value1.attributes?.device_class ||
      arg5(value1.entityId)?.attributes?.device_class;
    if (
      (value2 && !["occupancy", "presence", "motion"].includes(value2)) ||
      (!value2 &&
        !/occupancy|presence|motion|(?:^|_)pir(?:_|$)|有人|无人|移动检测|运动检测|人体检测/i.test(
          value1.entityId + " " + (value1.name || ""),
        )) ||
      ["diagnostic", "config"].includes(value1.entityCategory || value1.entity_category)
    )
      continue;
    const value3 = value1.deviceId || value1.device_id;
    if (!value3) continue;
    const value4 = arg4.find((arg6) => (arg6.id || arg6.deviceId) === value3);
    value4?.disabledBy != null ||
      value4?.disabled_by != null ||
      (map1.has(value3) ||
        map1.set(value3, {
          deviceId: value3,
          name: value4?.nameByUser || value4?.name_by_user || value4?.name || value1.name || value3,
          entities: [],
        }),
      map1.get(value3).entities.push({
        entityId: value1.entityId,
        name: value1.name || value1.entityId,
        rank: value2 === "occupancy" || value2 === "presence" ? 0 : value2 === "motion" ? 1 : 2,
      }));
  }
  return [...map1.values()].map((arg7) => ({
    ...arg7,
    entities: arg7.entities.sort(
      (arg8, arg9) => arg8.rank - arg9.rank || arg8.entityId.localeCompare(arg9.entityId),
    ),
  }));
}
export function createInteraction3dEditorPickers({
  openPicker: arg10,
  fetchIcons: arg11,
  getEntities: arg12,
  getState: arg16 = () => null,
  ensureEntities: arg13,
  entityPickerText: arg14,
  elements: arg15,
  deviceKind: arg17 = "light",
  fetchAreas: arg18 = async () => {
    const value5 = await fetch("/api/v1/ha/areas");
    if (!value5.ok) throw new Error("房间目录暂时不可用");
    return (await value5.json()).items || [];
  },
  fetchDevices: arg19 = async () => {
    const value6 = await fetch("/api/v1/ha/devices");
    if (!value6.ok) throw new Error("设备目录暂时不可用，请稍后重试。");
    return (await value6.json()).items || [];
  },
}) {
  const fn1 = () =>
    arg12().map((arg20) => {
      const value7 = arg16(arg20.entityId),
        value8 = value7?.newState || value7;
      return {
        ...arg20,
        attributes: {
          ...arg20.attributes,
          ...value8?.attributes,
        },
      };
    });
  async function fn2() {
    const [value9, value10] = await Promise.all([arg19(), arg18().catch(() => null)]),
      map2 = new Map((value10 || []).map((arg21) => [arg21.areaId || arg21.id, arg21.name])),
      map3 = new Map();
    for (const value11 of arg12()) {
      if (!q(value11)) continue;
      const value12 = value11.deviceId || value11.device_id;
      value12 &&
        value11.platform &&
        (map3.has(value12) || map3.set(value12, new Set()),
        map3.get(value12).add(value11.platform));
    }
    return value9.filter(q).map((arg22) => ({
      ...arg22,
      integrationName:
        [...(map3.get(arg22.deviceId || arg22.id) || [])].sort().join("、") || "未知集成",
      roomName:
        map2.get(arg22.areaId || arg22.area_id) ||
        (arg22.areaId || arg22.area_id ? "房间名称暂不可用" : "未分配房间"),
    }));
  }
  function fn3(arg23, arg24) {
    return (
      arg24.find((arg25) => (arg25.deviceId || arg25.id) === arg23.deviceId)?.roomName ||
      "未分配房间"
    );
  }
  function fn4(arg26, arg27) {
    return (
      arg27.find((arg28) => (arg28.deviceId || arg28.id) === arg26.deviceId)?.integrationName ||
      "未知集成"
    );
  }
  const fn5 = (arg29) => "房间：" + arg29.roomName + " · 集成：" + arg29.integrationName;
  function fn6(arg30, arg31, arg32 = "设备") {
    const value13 = arg15.createEditorEntityPickerOption(arg30, arg31),
      value14 = value13.querySelector?.(".inspector-entity-kind"),
      value15 = value13.querySelector?.(".inspector-entity-id");
    return (
      value14 && (value14.textContent = "[" + arg32 + "] "),
      value15 && (value15.textContent = fn5(arg30)),
      value13
    );
  }
  function fn7(arg33) {
    const value16 = arg15.createEditorPickerCurrentEntity(arg33),
      value17 = value16.querySelector?.(".editor-paged-picker-current-entity-id");
    return (value17 && arg33 && (value17.textContent = fn5(arg33)), value16);
  }
  return {
    entityCatalog: fn1,
    async loadEntities() {
      return (await arg13(), fn1());
    },
    presenceEntities(arg34) {
      return (
        presenceDeviceProfiles(arg12(), [], arg16).find((arg35) => arg35.deviceId === arg34)
          ?.entities || []
      );
    },
    async device({
      trigger: arg36,
      current: arg38 = "",
      deviceIcon: arg39 = "mdi:devices",
      onSelect: arg37,
      title: arg40 = "选择设备",
      deviceFilter: arg41 = () => true,
    }) {
      await arg13();
      const value18 = await fn2();
      if (!arg36.isConnected) return null;
      const value19 = value18
          .filter((arg42) =>
            arg41(
              arg42,
              arg12().filter(
                (arg43) => (arg43.deviceId || arg43.device_id) === (arg42.deviceId || arg42.id),
              ),
            ),
          )
          .map((arg44) => ({
            entityId: arg44.deviceId || arg44.id,
            name:
              arg44.nameByUser || arg44.name_by_user || arg44.name || arg44.deviceId || arg44.id,
            roomName: arg44.roomName,
            integrationName: arg44.integrationName,
            domain: "device",
            icon: arg39,
          })),
        value20 =
          value19.find((arg45) => arg45.entityId === arg38) ||
          (arg38
            ? {
                entityId: arg38,
                name: arg38 + "（当前未找到）",
                roomName: "—",
                integrationName: "—",
                domain: "device",
                icon: arg39,
                status: "missing",
              }
            : null);
      return arg10({
        kind: "entity",
        title: arg40,
        subtitle: "按 HA 设备归属选择相关实体。",
        searchPlaceholder: "搜索设备、房间或集成",
        triggerButton: arg36,
        pageSize: EDITOR_PICKER_PAGE_SIZES.entity,
        itemClass: "entity-list",
        emptyText: "暂无设备，请先同步 Home Assistant 设备目录。",
        getPage: ({ query: arg46, page: arg47 }) =>
          editorEntityPickerPage(
            value19.filter((arg48) =>
              Object.values(arg48)
                .join(" ")
                .toLowerCase()
                .includes(String(arg46 || "").toLowerCase()),
            ),
            arg47,
            null,
          ),
        renderSelectedContent: () => [fn7(value20)],
        renderSelectedActions: () => [arg15.editorPickerClearAction("不绑定设备", !arg38)],
        renderItem: (arg49) => fn6(arg49, arg38),
        onSelect: (arg50) => {
          const value21 = value19.find((arg51) => arg51.entityId === arg50);
          (!arg50 || value21) &&
            arg37(
              value21
                ? {
                    deviceId: arg50,
                    name: value21.name,
                    entities: arg12()
                      .filter((arg52) => (arg52.deviceId || arg52.device_id) === arg50)
                      .map((arg53) => {
                        const value22 = arg16(arg53.entityId || arg53.entity_id),
                          value23 = value22?.newState || value22;
                        return {
                          ...arg53,
                          attributes: {
                            ...arg53.attributes,
                            ...value23?.attributes,
                          },
                        };
                      }),
                  }
                : null,
            );
        },
      });
    },
    async presence({ trigger: arg54, current: arg56 = "", onSelect: arg55 }) {
      await arg13();
      const value24 = await fn2();
      if (!arg54.isConnected) return null;
      const value25 = presenceDeviceProfiles(arg12(), value24, arg16),
        value26 = value25.map((arg57) => ({
          entityId: arg57.deviceId,
          name: arg57.name,
          roomName: fn3(arg57, value24),
          integrationName: fn4(arg57, value24),
          icon: "mdi:motion-sensor",
          domain: "binary_sensor",
        }));
      return arg10({
        kind: "entity",
        title: "选择人体传感器设备",
        subtitle: "按设备匹配人在或移动检测实体；多实体可在设备内选择。",
        searchPlaceholder: "搜索设备名称、房间或集成",
        triggerButton: arg54,
        pageSize: EDITOR_PICKER_PAGE_SIZES.entity,
        itemClass: "entity-list",
        emptyText: "没有找到可用的人体传感器设备；无设备归属的模板实体可手动绑定。",
        getPage: ({ query: arg58, page: arg59 }) =>
          editorEntityPickerPage(
            value26.filter((arg60) =>
              (
                arg60.name +
                " " +
                (arg60.roomName || "") +
                " " +
                (arg60.integrationName || "") +
                " " +
                arg60.entityId
              )
                .toLowerCase()
                .includes(String(arg58 || "").toLowerCase()),
            ),
            arg59,
            null,
          ),
        renderSelectedContent: () => [fn7(value26.find((arg61) => arg61.entityId === arg56))],
        renderSelectedActions: () => [arg15.editorPickerClearAction("不绑定设备", !arg56)],
        renderItem: (arg62) => fn6(arg62, arg56),
        onSelect: (arg63) => {
          const value27 = value25.find((arg64) => arg64.deviceId === arg63);
          (!arg63 || value27) && arg55(value27 ? structuredClone(value27) : null);
        },
      });
    },
    async vacuum({ trigger: arg65, current: arg67 = "", onSelect: arg66 }) {
      await arg13();
      const value28 = await fn2();
      if (!arg65.isConnected) return null;
      const value29 = vacuumProfiles(arg12(), value28),
        value30 = value29.map((arg68) => ({
          entityId: arg68.deviceId,
          name: arg68.name,
          roomName: fn3(arg68, value28),
          integrationName: fn4(arg68, value28),
          domain: "vacuum",
          icon: "mdi:robot-vacuum",
        }));
      return arg10({
        kind: "entity",
        title: "选择扫地机设备",
        subtitle: "自动识别主实体、地图和相关状态；支持多台设备独立配置。",
        searchPlaceholder: "搜索设备名称、房间或集成",
        triggerButton: arg65,
        pageSize: EDITOR_PICKER_PAGE_SIZES.entity,
        itemClass: "entity-list",
        emptyText: "没有找到扫地机，请先在 Home Assistant 中接入设备并启用 vacuum 实体。",
        getPage: ({ query: arg69, page: arg70 }) =>
          editorEntityPickerPage(
            value30.filter((arg71) =>
              (
                arg71.name +
                " " +
                (arg71.roomName || "") +
                " " +
                (arg71.integrationName || "") +
                " " +
                arg71.entityId
              )
                .toLowerCase()
                .includes(String(arg69 || "").toLowerCase()),
            ),
            arg70,
            null,
          ),
        renderSelectedContent: () => [fn7(value30.find((arg72) => arg72.entityId === arg67))],
        renderSelectedActions: () => [arg15.editorPickerClearAction("不绑定设备", !arg67)],
        renderItem: (arg73) => fn6(arg73, arg67),
        onSelect: (arg74) => {
          const value31 = value29.find((arg75) => arg75.deviceId === arg74);
          (!arg74 || value31) && arg66(value31 ? structuredClone(value31) : null);
        },
      });
    },
    async nas({ trigger: arg76, current: arg78 = "", onSelect: arg77 }) {
      await arg13();
      const value32 = await fn2();
      if (!arg76.isConnected) return null;
      const value33 = nasProfiles(arg12(), value32),
        value34 = value33.map((arg79) => ({
          entityId: arg79.deviceId,
          name:
            arg79.name +
            " · " +
            (arg79.metrics.length ? arg79.metrics.length + " 项状态" : "暂无状态指标"),
          roomName: fn3(arg79, value32),
          integrationName: fn4(arg79, value32),
          domain: "sensor",
          icon: "mdi:nas",
        }));
      return arg10({
        kind: "entity",
        title: "选择 NAS 数据来源",
        subtitle: "选择整台 NAS，自动匹配它的状态实体。",
        searchPlaceholder: "搜索 NAS 名称、房间或集成",
        triggerButton: arg76,
        pageSize: EDITOR_PICKER_PAGE_SIZES.entity,
        itemClass: "entity-list",
        emptyText:
          "未找到飞牛或群晖设备。请确认 Home Assistant 已接入对应集成，并在 HA Bridge 同步设备目录。",
        getPage: ({ query: arg80, page: arg81 }) =>
          editorEntityPickerPage(
            value34.filter((arg82) =>
              (
                arg82.name +
                " " +
                (arg82.roomName || "") +
                " " +
                (arg82.integrationName || "") +
                " " +
                arg82.entityId
              )
                .toLowerCase()
                .includes(String(arg80 || "").toLowerCase()),
            ),
            arg81,
            null,
          ),
        renderSelectedContent: () => [fn7(value34.find((arg83) => arg83.entityId === arg78))],
        renderSelectedActions: () => [arg15.editorPickerClearAction("不使用数据来源", !arg78)],
        renderItem: (arg84) => fn6(arg84, arg78, "NAS"),
        onSelect: (arg85) => {
          const value35 = value33.find((arg86) => arg86.deviceId === arg85);
          (!arg85 || value35) && arg77(value35 ? structuredClone(value35) : null);
        },
      });
    },
    icon({ trigger: arg87, current: arg88, onSelect: arg89, deviceKind: arg90 = arg17 }) {
      return (
        (arg88 ||=
          arg90 === "speaker"
            ? "mdi:speaker"
            : arg90 === "water-heater"
              ? "mdi:water-boiler"
              : arg90 === "fan"
                ? "mdi:fan"
                : arg90 === "purifier"
                  ? "mdi:air-purifier"
                  : arg90 === "camera"
                    ? "mdi:cctv"
                    : arg90 === "lock"
                      ? "mdi:door-closed"
                      : arg90 === "vacuum"
                        ? "mdi:robot-vacuum"
                        : arg90 === "television"
                          ? "mdi:television"
                          : arg90 === "nas"
                            ? "mdi:nas"
                            : arg90 === "cover"
                              ? "mdi:curtains"
                              : arg90 === "climate"
                                ? "mdi:air-conditioner"
                                : U),
        arg10({
          kind: "icon",
          title:
            arg90 === "speaker"
              ? "选择智能音响按钮图标"
              : arg90 === "water-heater"
                ? "选择热水器按钮图标"
                : arg90 === "fan"
                  ? "选择电风扇按钮图标"
                  : arg90 === "purifier"
                    ? "选择空气净化器按钮图标"
                    : arg90 === "camera"
                      ? "选择摄像头按钮图标"
                      : arg90 === "lock"
                        ? "选择门按钮图标"
                        : arg90 === "vacuum"
                          ? "选择扫地机按钮图标"
                          : arg90 === "television"
                            ? "选择电视按钮图标"
                            : arg90 === "nas"
                              ? "选择NAS按钮图标"
                              : arg90 === "cover"
                                ? "选择窗帘按钮图标"
                                : arg90 === "climate"
                                  ? "选择空调按钮图标"
                                  : "选择灯光按钮图标",
          searchPlaceholder: "搜索图标名称",
          triggerButton: arg87,
          pageSize: EDITOR_PICKER_PAGE_SIZES.icon,
          emptyText: "没有匹配的图标",
          itemClass: "icon-grid",
          async getPage({ query: arg91, page: arg92, pageSize: arg93 }) {
            const value36 = await arg11(arg91, arg93, (arg92 - 1) * arg93);
            return {
              items: value36.items || [],
              total: Number(value36.total) || 0,
            };
          },
          renderSelectedActions: () => [arg15.createEditorPickerCurrentIcon(arg88 || U)],
          renderItem: (arg94) => arg15.createIconPickerOption(arg94, arg88, "editorPickerValue"),
          onSelect: (arg95) => {
            ee(arg95) && arg89(arg95);
          },
        })
      );
    },
    async entity({
      trigger: arg96,
      current: arg101 = "",
      onSelect: arg97,
      deviceKind: arg102 = arg17,
      domain: arg98,
      entityFilter: arg99,
      title: arg100,
    }) {
      const value37 = arg102 === "speaker",
        value38 = arg102 === "nas",
        value39 = arg102 === "device-status",
        value40 = arg102 === "lock-door",
        value41 = arg102 === "lock-battery",
        value42 = arg102 === "television",
        value43 = arg102 === "television-power",
        value44 = ENVIRONMENT_SENSORS.some((arg103) => arg103.key === arg98) ? arg98 : "",
        value45 = ["cover", "airer"].includes(arg102) || arg98 === "cover",
        value46 = !value45 && (arg102 === "climate" || arg98 === "climate"),
        value47 = arg102 === "light" && !value45 && !value46,
        value48 =
          arg102 === "bath-heater"
            ? /^(climate|fan)\.[a-z0-9_]+$/
            : value44
              ? /^sensor\.[a-z0-9_]+$/
              : value40
                ? /^(binary_sensor|sensor)\.[a-z0-9_]+$/
                : value41
                  ? /^sensor\.[a-z0-9_]+$/
                  : value39 || arg102 === "vacuum-room"
                    ? /^[a-z_]+\.[a-z0-9_]+$/
                    : arg102 === "water-heater"
                      ? /^water_heater\.[a-z0-9_]+$/
                      : ["fan", "purifier"].includes(arg102)
                        ? /^fan\.[a-z0-9_]+$/
                        : value47 || value43 || arg102 === "presence"
                          ? /^[a-z_]+\.[a-z0-9_]+$/
                          : arg102 === "camera"
                            ? /^camera\.[a-z0-9_]+$/
                            : arg102 === "vacuum"
                              ? /^vacuum\.[a-z0-9_]+$/
                              : arg102 === "vacuum-map"
                                ? /^(camera|image)\.[a-z0-9_]+$/
                                : value42 || value37
                                  ? /^media_player\.[a-z0-9_]+$/
                                  : value38
                                    ? /^(binary_sensor|switch|input_boolean)\.[a-z0-9_]+$/
                                    : value45
                                      ? /^cover\.[a-z0-9_]+$/
                                      : value46
                                        ? /^climate\.[a-z0-9_]+$/
                                        : /^(light|switch)\.[a-z0-9_]+$/,
        { editorEntityMatches: value49 } = createEditorPickerQueries({
          entityPickerConfig: () => ({
            recommended: (arg104) =>
              value37
                ? (arg104.deviceClass ||
                    arg104.device_class ||
                    arg104.attributes?.device_class ||
                    arg16(arg104.entityId)?.attributes?.device_class) === "speaker"
                  ? 2
                  : 1
                : value47
                  ? arg104.entityId.startsWith("light.")
                    ? 2
                    : arg104.entityId.startsWith("switch.")
                      ? 1
                      : 0
                  : value43
                    ? ["switch.", "media_player.", "binary_sensor.", "input_boolean."].some(
                        (arg105) => arg104.entityId.startsWith(arg105),
                      )
                      ? 1
                      : 0
                    : arg102 === "presence"
                      ? ["occupancy", "motion", "presence"].includes(
                          arg104.deviceClass ||
                            arg104.device_class ||
                            arg104.attributes?.device_class ||
                            arg16(arg104.entityId)?.attributes?.device_class,
                        )
                      : arg104.entityId.startsWith(
                          arg102 === "water-heater"
                            ? "water_heater."
                            : ["fan", "purifier"].includes(arg102)
                              ? "fan."
                              : value42 || value43
                                ? "media_player."
                                : value38 || arg102 === "presence"
                                  ? "binary_sensor."
                                  : value45
                                    ? "cover."
                                    : value46
                                      ? "climate."
                                      : arg102 === "camera"
                                        ? "camera."
                                        : "light.",
                        ),
          }),
          pickerEntitiesForComponentType: () =>
            fn1().filter(
              (arg106) =>
                value48.test(arg106.entityId) &&
                (!value44 ||
                  matchesTemperatureHumidityEntity(arg106, value44, arg16(arg106.entityId))) &&
                (!arg99 || arg99(arg106)),
            ),
          entityPickerText: arg14,
          entityDomain: (arg107) => arg107.entityId.split(".")[0],
        });
      if ((await arg13(), !arg96.isConnected)) return null;
      const value50 =
          arg101 && value48.test(arg101) && !arg12().some((arg108) => arg108.entityId === arg101)
            ? {
                entityId: arg101,
                name: arg101 + "（当前未找到）",
              }
            : null,
        fn8 = (arg109) => {
          const value53 = value49("interaction3d", arg109);
          return (
            value50 &&
              (!arg109 ||
                arg14(value50)
                  .toLocaleLowerCase("zh-CN")
                  .includes(String(arg109).trim().toLocaleLowerCase("zh-CN"))) &&
              value53.push(value50),
            value53
          );
        },
        value51 = fn8(""),
        value52 =
          value51.find((arg110) => arg110.entityId === arg101) ||
          (value44 && arg101
            ? {
                entityId: arg101,
                name: arg101 + "（当前不可选，可清除后重新绑定）",
              }
            : null);
      return arg10({
        kind: "entity",
        title:
          arg100 ||
          (arg102 === "bath-heater"
            ? "选择浴霸主实体（可不选）"
            : value44
              ? "选择" + ENVIRONMENT_SENSORS.find((arg111) => arg111.key === value44).label + "实体"
              : value40
                ? "选择门状态传感器"
                : value41
                  ? "选择电量传感器"
                  : arg102 === "device-status"
                    ? "选择状态实体"
                    : arg102 === "airer"
                      ? "选择晾衣架升降实体"
                      : arg102 === "water-heater"
                        ? "选择热水器实体"
                        : arg102 === "fan"
                          ? "选择电风扇实体"
                          : arg102 === "purifier"
                            ? "选择空气净化器实体"
                            : arg102 === "camera"
                              ? "选择摄像头实体"
                              : arg102 === "presence"
                                ? "选择人在传感器"
                                : arg102 === "vacuum"
                                  ? "选择扫地机实体"
                                  : arg102 === "vacuum-map"
                                    ? "选择扫地机地图"
                                    : arg102 === "vacuum-room"
                                      ? "选择房间快捷指令"
                                      : value37
                                        ? "选择智能音响媒体实体"
                                        : value42
                                          ? "选择电视媒体实体（Apple TV）"
                                          : value43
                                            ? "选择电视电源状态"
                                            : value38
                                              ? "选择 NAS 指示灯状态实体（旧版兼容）"
                                              : value45
                                                ? "选择窗帘实体"
                                                : value46
                                                  ? "选择空调实体"
                                                  : "选择灯光实体"),
        searchPlaceholder: "搜索实体名称或 ID",
        triggerButton: arg96,
        pageSize: EDITOR_PICKER_PAGE_SIZES.entity,
        initialPage: editorEntityPickerInitialPage(
          value51.findIndex((arg112) => arg112.entityId === arg101),
          null,
        ),
        selectedText: arg101 || "不使用实体",
        emptyText: value44
          ? "没有匹配的" +
            ENVIRONMENT_SENSORS.find((arg113) => arg113.key === value44).label +
            "传感器，请检查 Home Assistant 的实体类型或名称"
          : value40
            ? "没有匹配的门状态传感器，请检查设备的门/开合实体"
            : value41
              ? "没有匹配的电量传感器，请检查设备的 battery 实体"
              : arg102 === "water-heater"
                ? "没有匹配的热水器（water_heater）实体，请先在 Home Assistant 接入设备"
                : ["fan", "purifier"].includes(arg102)
                  ? "没有匹配的风扇（fan）实体，请先在 Home Assistant 接入设备"
                  : arg102 === "camera"
                    ? "没有匹配的摄像头实体，请先在 Home Assistant 接入设备"
                    : arg102 === "presence"
                      ? "没有匹配的人在传感器或移动事件，请先在 Home Assistant 接入设备"
                      : arg102.startsWith("vacuum")
                        ? "没有匹配的实体，请先在 Home Assistant 中接入"
                        : value37
                          ? "没有匹配的 media_player 实体，请先在 Home Assistant 接入音响"
                          : value42
                            ? "没有匹配的媒体播放器，请先在 Home Assistant 接入 Apple TV"
                            : value43
                              ? "没有匹配的电源状态实体"
                              : value38
                                ? "没有匹配的开关或二元传感器"
                                : value45
                                  ? "没有匹配的窗帘"
                                  : value46
                                    ? "没有匹配的空调"
                                    : "没有匹配的灯光或开关",
        itemClass: "entity-list",
        getPage: ({ query: arg114, page: arg115 }) =>
          editorEntityPickerPage(fn8(arg114), arg115, null),
        renderSelectedContent: () => [arg15.createEditorPickerCurrentEntity(value52)],
        renderSelectedActions: () => [arg15.editorPickerClearAction("不使用实体", !arg101)],
        renderItem: (arg116) => arg15.createEditorEntityPickerOption(arg116, arg101),
        onSelect: (arg117) => {
          const value54 = fn1().find((arg118) => arg118.entityId === arg117);
          (!arg117 ||
            (!value44 && !arg99 && arg117 === value50?.entityId) ||
            (value54 &&
              value48.test(arg117) &&
              (!value44 || matchesTemperatureHumidityEntity(value54, value44, arg16(arg117))) &&
              (!arg99 || arg99(value54)))) &&
            arg97(arg117, value54);
        },
      });
    },
  };
}
