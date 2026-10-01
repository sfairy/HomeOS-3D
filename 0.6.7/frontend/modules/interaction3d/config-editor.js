import { purifierState as purifierState2 } from "./purifier-state.js";
import { bathEffectEditor as bathEffectEditor2 } from "./bath-heater-editor.js";
import { appendBackgroundOpacityControl as appendBackgroundOpacityControl2 } from "../../../../bridge-static/modules/interaction3d/label-appearance.js";
import {
  openBatchApply as openBatchApply2,
  copyBatchFields as copyBatchFields2,
} from "../../../../bridge-static/modules/interaction3d/batch-apply.js";
import { withFixedLightEffects as withFixedLightEffects2 } from "../../../../bridge-static/modules/interaction3d/light-effect-policy.js?v=20260918-fixed-effects-v2-review-1234";
import { vacuumMapIdentity as vacuumMapIdentity2 } from "./vacuum-map.js?v=20260925-vacuum-state-v2-reload-diagnostics-v2";
import { openInteraction3dRangeEditor as openInteraction3dRangeEditor2 } from "./range-dialog.js?v=20260912-height-preview-v2";
import { mountInteraction3d as mountInteraction3d2 } from "./runtime.js?v=20260911-workspace-switch-v1-warm-popups-v1-20260923-lazy-stage-v1-20260926-speaker-v1-20260926-fan-v1-20260926-airer-v2-reload-diagnostics-v2";
import { openVacuumMapEditor as openVacuumMapEditor2 } from "./vacuum-map-editor.js?v=20260909-curtain-action-v15-furniture-plan-v1";
import { nasGroups as nasGroups2 } from "./nas-panel.js";
import {
  extraTypes as extraTypes2,
  extraLabels as extraLabels2,
  purifierRelatedEntities as purifierRelatedEntities2,
  purifierDeviceChanged as purifierDeviceChanged2,
} from "./purifier-extras.js?v=20260921-extras-v1-20260926-airer-v2";
import {
  validCurtainGroups as validCurtainGroups2,
  curtainGroupEntryId as curtainGroupEntryId2,
  curtainGroupCandidates as curtainGroupCandidates2,
  createCurtainGroup as createCurtainGroup2,
} from "./cover-groups.js?v=20260920-curtain-group-v1";
import { randomUuid as randomUuid2 } from "../../../../bridge-static/utils/random-id.js?v=20260724-revert-hold-popup-shield-v324";
import { interaction3dPreviewSize as interaction3dPreviewSize2 } from "../../../../bridge-static/modules/interaction3d/preview-layout.js?v=20260906-i3d-preview-layout-v1-20260908-curtains-v1";
import {
  requestInteraction3dAccess as requestInteraction3dAccess2,
  getInteraction3dEditorView as getInteraction3dEditorView2,
  subscribeInteraction3dAccess as subscribeInteraction3dAccess2,
} from "../../../../bridge-static/modules/interaction3d/bridge.js?v=20260926-integration-v1-reload-diagnostics-v2";
import { normalizeInteraction3dLightingMode as normalizeInteraction3dLightingMode2 } from "../../../../bridge-static/modules/interaction3d/definition.js?v=20260909-curtain-action-v15-20260918-review-1234-v2-region-only-v1-20260926-fan-v1-20260926-airer-v2";
import {
  normalizeTemperatureHumidity as normalizeTemperatureHumidity2,
  temperatureHumidityFloorCenter as temperatureHumidityFloorCenter2,
  ENVIRONMENT_METRICS as ENVIRONMENT_METRICS2,
  ENVIRONMENT_BATTERY as ENVIRONMENT_BATTERY2,
} from "../../../../bridge-static/modules/interaction3d/temperature-humidity.js?v=20260925-environment-label-v1";
import {
  carState as carState2,
  carChargingMappingError as carChargingMappingError2,
  standardCarBindings as standardCarBindings2,
} from "./car-state.js";
import { deviceEntityCatalog as deviceEntityCatalog2 } from "./device-entity-config.js";
import {
  deviceStatusChoices as deviceStatusChoices2,
  defaultDeviceStatusRule as defaultDeviceStatusRule2,
} from "./device-status.js";
import {
  GENERIC_DEVICE_KINDS as GENERIC_DEVICE_KINDS2,
  genericDeviceProfile as genericDeviceProfile2,
  isGenericDeviceKind as isGenericDeviceKind2,
} from "./device-profiles.js";
const Wi = [
  [
    "整体",
    [
      ["曝光", "exposure", 0.5, 2, 0.05],
      ["半球光", "hemisphereIntensity", 0, 3, 0.05],
      ["环境光", "ambientIntensity", 0, 2, 0.05],
    ],
  ],
  [
    "主光与阴影",
    [
      ["强度", "mainIntensity", 0, 5, 0.05],
      ["水平角", "mainAzimuth", -180, 180, 5],
      ["高度角", "mainElevation", 5, 89, 5],
      ["阴影浓度", "mainShadowIntensity", 0, 1, 0.05],
    ],
  ],
  [
    "侧面补光",
    [
      ["强度", "fillIntensity", 0, 3, 0.05],
      ["水平角", "fillAzimuth", -180, 180, 5],
      ["高度角", "fillElevation", 0, 89, 5],
    ],
  ],
  [
    "顶部补光",
    [
      ["强度", "topIntensity", 0, 3, 0.05],
      ["水平角", "topAzimuth", -180, 180, 5],
      ["高度角", "topElevation", 0, 89, 5],
    ],
  ],
];
export async function openInteraction3dEditor({
  component: v1,
  document: v2,
  entities: v3 = [],
  states: v4,
  pickers: v5,
  onSave: v6,
  deviceKind: v7 = "light",
  startAdding: v8 = false,
  vacuumId: v9 = "",
  editingFloorId: v10 = "",
}) {
  (await requestInteraction3dAccess2(), v5?.loadEntities && (v3 = await v5.loadEntities()));
  const includes = [
    "environment",
    "climate",
    "fan",
    "purifier",
    "cover",
    "temperature-humidity",
  ].includes(v7);
  v7 === "environment" && (v7 = "climate");
  const includes2 =
    v7 === "airer" ||
    v7 === "water-heater" ||
    v7 === "devices" ||
    v7 === "nas" ||
    v7 === "television" ||
    v7 === "speaker" ||
    GENERIC_DEVICE_KINDS2.includes(v7);
  v7 === "devices" && (v7 = "nas");
  let v11, v12, v13, v14, v15, v16, v17, v18, v19, v20, v21, v22, v23, v24, v25, v26, v27;
  function fn1(arg1) {
    ((v7 = arg1),
      (v11 = v7 === "vacuum-shortcut"),
      (v12 = v7 === "vacuum"),
      (v13 = (includes2 && !["water-heater", "airer"].includes(v7)) || v12 || v11),
      (v14 = v7 === "television"),
      (v15 = v7 === "speaker"),
      (v16 = isGenericDeviceKind2(v7)),
      (v19 = v7 === "airer"),
      (v17 = ["climate", "fan", "purifier", "water-heater"].includes(v7)),
      (v18 = v7 === "cover"),
      (v20 = v7 === "nas"),
      (v21 = v7 === "temperature-humidity"),
      (v22 = v19 || v17 || v18 || v20 || v14 || v15 || v16 || v12 || v11),
      (v23 = v19
        ? "晾衣架"
        : v15
          ? "智能音响"
          : v21
            ? "环境标签"
            : v11
              ? "快捷指令"
              : v12
                ? "扫地机"
                : v16
                  ? genericDeviceProfile2(v7).label
                  : includes2 && v7 !== "water-heater"
                    ? "设备"
                    : v18
                      ? "窗帘"
                      : v17
                        ? v7 === "water-heater"
                          ? "热水器"
                          : v7 === "fan"
                            ? "电风扇"
                            : v7 === "purifier"
                              ? "空气净化器"
                              : "空调/浴霸"
                        : "灯光"),
      (v24 = includes ? "环境" : includes2 ? "设备" : v11 ? "扫地机" : v23),
      (v25 = v19
        ? "airers"
        : v15
          ? "speakers"
          : v16
            ? genericDeviceProfile2(v7).collection
            : v21
              ? "temperatureHumidity"
              : v12 || v11
                ? "vacuums"
                : v14
                  ? "televisions"
                  : v20
                    ? "nas"
                    : v18
                      ? "curtains"
                      : v7 === "water-heater"
                        ? "waterHeaters"
                        : v7 === "fan"
                          ? "fans"
                          : v7 === "purifier"
                            ? "airPurifiers"
                            : "airConditioners"),
      (v26 = v19
        ? "mdi:hanger"
        : v15
          ? "mdi:speaker"
          : v16
            ? genericDeviceProfile2(v7).icon
            : v11
              ? "mdi:broom"
              : v12
                ? "mdi:robot-vacuum"
                : v14
                  ? "mdi:television"
                  : v20
                    ? "mdi:nas"
                    : v18
                      ? "mdi:curtains"
                      : v17
                        ? v7 === "water-heater"
                          ? "mdi:water-boiler"
                          : v7 === "fan"
                            ? "mdi:fan"
                            : v7 === "purifier"
                              ? "mdi:air-purifier"
                              : "mdi:air-conditioner"
                        : "mdi:lightbulb-outline"),
      (v27 = v22 ? "modelId" : "groupId"));
  }
  fn1(v7);
  const v28 = (arg2) => arg2.name || arg2.label || v23,
    v29 = (arg3) =>
      v14
        ? ["focus", "focus-panel", "panel", "turn-on-focus", "turn-on", "turn-on-panel"].includes(
            arg3,
          )
          ? arg3
          : "focus-panel"
        : v13
          ? ["focus", "focus-panel", "panel"].includes(arg3)
            ? arg3
            : "focus-panel"
          : v18 || v19
            ? ["panel", "turn-on-focus", "turn-on", "turn-on-panel"].includes(arg3)
              ? arg3
              : "focus"
            : ["turn-on-focus", "turn-on", "turn-on-panel"].includes(arg3)
              ? arg3
              : "focus",
    element = document.createElement("link");
  ((element.rel = "stylesheet"),
    (element.href =
      "/api/v1/modules/interaction3d/runtime.css?v=20260921-purifier-extra-picker-v2-20260926-fan-v1"),
    document.head.append(element));
  const v30 = (arg4, arg5, arg6) => {
      const element2 = document.createElement(arg4);
      return ((element2.className = arg5 || ""), arg6 && (element2.textContent = arg6), element2);
    },
    v31 = (arg7, arg8) => {
      const element3 = v30("button", "", arg7);
      return ((element3.type = "button"), element3.addEventListener("click", arg8), element3);
    },
    element4 = v30("dialog", "i3d-editor");
  (element4.setAttribute("aria-label", "3D " + v24 + "配置"),
    element4.setAttribute("data-i3d-preview-scope", ""),
    (element4.className += " i3d-unified-settings"));
  const v32 = v30("header"),
    v33 = v30("div", "i3d-editor-body"),
    v34 = v30("div", "i3d-editor-view"),
    element5 = v30("aside"),
    v35 = v30("div", "i3d-editor-aspect"),
    v36 = v30("div", "i3d-editor-stage"),
    element6 = v30("p", "i3d-editor-status");
  (element6.setAttribute("role", "status"), v35.append(v36), v34.append(v35, element6));
  const element7 = v30("p", "i3d-error");
  element7.setAttribute("role", "status");
  let structuredClone2 = structuredClone(v1.properties || {}),
    text = "",
    text2 = "",
    value2 = null,
    value3 = null,
    v37 = false,
    v38 = true,
    floorSelection =
      v10 || (structuredClone2.floorSelection !== "all" ? structuredClone2.floorSelection : "");
  structuredClone2.environment?.temperatureHumidity &&
    (structuredClone2.environment.temperatureHumidity =
      structuredClone2.environment.temperatureHumidity.map(normalizeTemperatureHumidity2));
  let v39 = false,
    value4 = null,
    text3 = "focus",
    v40 = false,
    v41 = false,
    value5 = null,
    num = 0,
    v42 = Promise.resolve(),
    value6 = null,
    value7 = null,
    num2 = 0,
    v43 = false,
    num3 = 0,
    value8 = null,
    v44 = () => {},
    v45 = () => {},
    v46 = () => {},
    v47 = () => {},
    v48 = () => {};
  const map = new Map(),
    v49 = () => structuredClone2.devices?.vacuums?.find((arg9) => arg9.id === v9),
    v50 = () =>
      v11
        ? v49()?.shortcuts || []
        : v13
          ? structuredClone2.devices[v25]
          : v22 || v21
            ? structuredClone2.environment[v25]
            : structuredClone2.lights,
    v51 = (arg10) => {
      v11
        ? v49() && (v49().shortcuts = arg10)
        : v13
          ? (structuredClone2.devices[v25] = arg10)
          : v22 || v21
            ? (structuredClone2.environment[v25] = arg10)
            : (structuredClone2.lights = arg10);
    },
    v52 = () => structuredClone2.environment?.curtainGroups || [],
    v53 = (arg11) => v52().find((arg12) => arg12.memberIds.includes(arg11)),
    v54 = () => {
      const v55 = text2 && v53(text2);
      return v55
        ? curtainGroupEntryId2(v55)
        : ((text2 = ""), v18 && v53(text) ? curtainGroupEntryId2(v53(text)) : text);
    };
  function fn2() {
    structuredClone2.environment?.curtainGroups &&
      (structuredClone2.environment.curtainGroups = validCurtainGroups2(
        structuredClone2.environment,
      ));
  }
  function fn3() {
    if (
      (v13 &&
        (structuredClone2.devices = {
          ...structuredClone2.devices,
          [v25]: structuredClone2.devices?.[v25] || [],
        }),
      v21)
    ) {
      structuredClone2.environment = {
        ...structuredClone2.environment,
        temperatureHumidity: (structuredClone2.environment?.temperatureHumidity || []).map(
          normalizeTemperatureHumidity2,
        ),
      };
      return;
    }
    if (
      (v22 &&
        !v13 &&
        (structuredClone2.environment = {
          ...structuredClone2.environment,
          dimStrength: Number.isFinite(structuredClone2.environment?.dimStrength)
            ? Math.max(0, Math.min(100, structuredClone2.environment.dimStrength))
            : 70,
          [v25]: structuredClone2.environment?.[v25] || [],
          ...(v18
            ? {
                curtainGroups: structuredClone2.environment?.curtainGroups || [],
              }
            : {}),
        }),
      v11)
    ) {
      for (const v56 of structuredClone2.devices.vacuums)
        v56.shortcuts = (v56.shortcuts || []).map((arg13) =>
          arg13.visible === false
            ? {
                ...arg13,
                visible: true,
                buttonHidden: true,
                hiddenClickable: false,
              }
            : arg13,
        );
    }
    ((v9 ||= structuredClone2.devices?.vacuums?.[0]?.id || ""),
      v12 && (text = v9),
      v51(
        (v50() || [])
          .filter((arg14) => v11 || v18 || arg14.visible !== false)
          .map((arg15) => {
            const size = Number.isFinite(arg15.size) && arg15.size > 0 ? arg15.size : 44;
            return {
              ...(v22 || v21 ? arg15 : withFixedLightEffects2(arg15)),
              size: size,
              visible: v11 || v18 ? arg15.visible !== false : true,
              icon: arg15.icon || v26,
              ...(v22 || v21
                ? {}
                : {
                    fadeDuration: arg15.fadeDuration ?? 0.3,
                  }),
              ...(v18
                ? {
                    coverKind: ["standard", "dream", "roller"].includes(arg15.coverKind)
                      ? arg15.coverKind
                      : "standard",
                    coverDirection: ["left", "right", "split"].includes(arg15.coverDirection)
                      ? arg15.coverDirection
                      : "auto",
                    curtainFabric: arg15.curtainFabric === "sheer" ? "sheer" : "cloth",
                    unboundPosition: Number.isFinite(arg15.unboundPosition)
                      ? Math.max(0, Math.min(100, arg15.unboundPosition))
                      : 0,
                  }
                : {}),
              ...(v11
                ? {}
                : {
                    clickAction: v29(arg15.clickAction),
                  }),
              iconSize:
                Number.isFinite(arg15.iconSize) && arg15.iconSize > 0
                  ? arg15.iconSize
                  : Math.min(size, Math.max(4, size - 18)),
            };
          }),
      ));
  }
  fn3();
  for (const v57 of [
    ...(structuredClone2.environment?.airConditioners || []),
    ...(structuredClone2.environment?.airers || []),
    ...(structuredClone2.environment?.fans || []),
    ...(structuredClone2.environment?.airPurifiers || []),
    ...(structuredClone2.environment?.waterHeaters || []),
  ])
    v57.extraControls = (v57.extraControls || []).map(({ label: v58, ...v59 }) => ({
      ...v59,
      type: extraTypes2(v59.entityId)[0],
    }));
  const v60 = () =>
    v7 === "smallcar"
      ? [
          ["cardWidth", "信息框宽度", "px"],
          ["cardFontSize", "文字大小", "px"],
          ["cardOpacity", "背景不透明度", "%"],
          ["buttonVisibility", "卡片显示", ""],
        ]
      : v22
        ? [
            ...(v12 ? [] : [["icon", "图标", ""]]),
            ["size", v12 ? "状态框缩放" : "按钮大小", v12 ? "%" : "px"],
            ["iconSize", v12 ? "文字大小" : "图标大小", "px"],
            ["hitSize", "点击范围", "px"],
            ["buttonVisibility", "按钮显示", ""],
            ...(v12 ? [["backgroundOpacity", "背景不透明度", "%"]] : []),
            ...(v11
              ? [
                  ["fontSize", "文字大小", "px"],
                  ["iconHidden", "隐藏图标", ""],
                  ["labelHidden", "隐藏名称", ""],
                ]
              : []),
          ]
        : [
            ["size", "按钮大小", "px"],
            ["iconSize", "图标大小", "px"],
            ["hitSize", "点击范围", "px"],
            ["fadeDuration", "缓开缓灭", "秒"],
          ];
  let v61 = v60(),
    map2 = new Map(v50().map((arg16) => [arg16.id, structuredClone(arg16)]));
  const map3 = new Map();
  let value9 = null,
    v62 = () => {};
  function fn4(arg17) {
    return v7 === "smallcar"
      ? {
          cardWidth: arg17.cardWidth ?? 180,
          cardFontSize: arg17.cardFontSize ?? 12,
          cardOpacity: arg17.cardOpacity ?? 1,
          buttonVisibility: arg17.buttonHidden
            ? "隐藏（不可点击）"
            : arg17.hiddenClickable
              ? "隐藏（可点击）"
              : "显示",
        }
      : v22
        ? {
            icon: arg17.icon || v26,
            size: arg17.size ?? 44,
            iconSize: arg17.iconSize ?? 26,
            hitSize: arg17.hitSize ?? Math.max(44, arg17.size ?? 44),
            ...(v12
              ? {
                  backgroundOpacity: arg17.backgroundOpacity ?? 1,
                }
              : {}),
            ...(v11
              ? {
                  fontSize: arg17.fontSize ?? 12,
                  iconHidden: arg17.iconHidden === true,
                  labelHidden: arg17.labelHidden === true,
                }
              : {}),
            buttonVisibility:
              arg17.buttonHidden === true
                ? "隐藏（不可点击）"
                : arg17.hiddenClickable === true
                  ? "隐藏（可点击）"
                  : "显示",
          }
        : {
            size: arg17.size ?? 44,
            iconSize: arg17.iconSize ?? 26,
            hitSize: arg17.hitSize ?? Math.max(44, arg17.size ?? 44),
            fadeDuration: arg17.fadeDuration ?? 0.3,
          };
  }
  const v63 = (arg18, arg19) => arg19.split(".").reduce((arg20, arg21) => arg20?.[arg21], arg18);
  function fn5(arg22) {
    map2.has(arg22.id) || map2.set(arg22.id, structuredClone(arg22));
    const v64 = fn4(map2.get(arg22.id)),
      v65 = fn4(arg22);
    return v61.filter(([v66]) => v63(v64, v66) !== v63(v65, v66));
  }
  function fn6(arg23, arg24, arg25) {
    for (const v67 of arg25) {
      if (v67 === "buttonVisibility") {
        ((arg23.buttonHidden = arg24.buttonVisibility === "隐藏（不可点击）"),
          (arg23.hiddenClickable = arg24.buttonVisibility === "隐藏（可点击）"));
        continue;
      }
      arg23[v67] = arg24[v67];
    }
  }
  function fn7() {
    (value9?.close(), value9?.remove(), (value9 = null));
  }
  function fn8(arg26) {
    const statusSource = arg26.statusSource;
    if (!statusSource || v37 || !v38 || v40 || v41 || value9) return;
    const set = new Set(
        statusSource.visibleMetrics || statusSource.metrics.map((arg27) => arg27.entityId),
      ),
      list = [],
      element8 = v30("dialog", "settings-dialog i3d-add-dialog i3d-nas-fields-dialog");
    ((value9 = element8), element8.setAttribute("aria-label", "选择 NAS 显示内容"));
    const v68 = v30("div", "dialog-heading"),
      v69 = v30("h2", "", "选择显示内容"),
      element9 = v31("×", fn7);
    ((element9.className = "icon-button"),
      element9.setAttribute("aria-label", "关闭显示内容选择"),
      v68.append(v69, element9));
    const v70 = v30("div", "i3d-add-dialog-body"),
      v71 = v30("div", "dialog-actions"),
      element10 = v30("span", "i3d-note"),
      v72 = () => {
        element10.textContent = "已选 " + set.size + " 项";
        for (const element11 of list) element11.checked = set.has(element11.value);
      };
    v71.append(
      v31("全选", () => {
        (statusSource.metrics.forEach((arg28) => set.add(arg28.entityId)), v72());
      }),
      v31("全不选", () => {
        (set.clear(), v72());
      }),
      element10,
    );
    const v73 = v30("div", "i3d-nas-fields"),
      filter = nasGroups2(statusSource).filter(([v74]) =>
        statusSource.metrics.some((arg29) => arg29.group === v74),
      ),
      map4 = new Map(),
      v75 = () => {
        filter.forEach(([v76], arg30) => {
          const { section: v77, up: v78, down: v79 } = map4.get(v76);
          ((v78.disabled = arg30 === 0),
            (v79.disabled = arg30 === filter.length - 1),
            v73.append(v77));
        });
      };
    for (const [v80, v81] of filter) {
      const filter2 = statusSource.metrics.filter((arg31) => arg31.group === v80),
        v82 = v30("section"),
        v83 = v30("div", "i3d-nas-fields-heading"),
        v84 = (arg32) => {
          const index = filter.findIndex(([v85]) => v85 === v80),
            v86 = index + arg32;
          v86 < 0 ||
            v86 >= filter.length ||
            (([filter[index], filter[v86]] = [filter[v86], filter[index]]), v75());
        },
        element12 = v31("↑", () => v84(-1)),
        element13 = v31("↓", () => v84(1));
      (element12.setAttribute("aria-label", "上移" + v81 + "分组"),
        element13.setAttribute("aria-label", "下移" + v81 + "分组"),
        (element12.title = "上移分组"),
        (element13.title = "下移分组"),
        v83.append(v30("h4", "", v81), element12, element13),
        v82.append(v83),
        map4.set(v80, {
          section: v82,
          up: element12,
          down: element13,
          metrics: filter2,
        }));
      const map5 = new Map(),
        v87 = () =>
          filter2.forEach((arg33, arg34) => {
            const v88 = map5.get(arg33.entityId);
            ((v88.up.disabled = arg34 === 0),
              (v88.down.disabled = arg34 === filter2.length - 1),
              v82.append(v88.row));
          });
      for (const v89 of filter2) {
        const v90 = v30("div", "i3d-nas-fields-row"),
          v91 = v30("label"),
          element14 = v30("input");
        ((element14.type = "checkbox"),
          (element14.value = v89.entityId),
          element14.setAttribute("aria-label", v89.label),
          (v91.title = v89.entityId),
          element14.addEventListener("change", () => {
            (element14.checked ? set.add(element14.value) : set.delete(element14.value), v72());
          }));
        const v92 = (arg35) => {
            const indexOf = filter2.indexOf(v89),
              v93 = indexOf + arg35;
            v93 < 0 ||
              v93 >= filter2.length ||
              (([filter2[indexOf], filter2[v93]] = [filter2[v93], filter2[indexOf]]), v87());
          },
          element15 = v31("↑", () => v92(-1)),
          element16 = v31("↓", () => v92(1));
        (element15.setAttribute("aria-label", "上移" + v89.label),
          element16.setAttribute("aria-label", "下移" + v89.label),
          (element15.title = "上移内容"),
          (element16.title = "下移内容"),
          map5.set(v89.entityId, {
            row: v90,
            up: element15,
            down: element16,
          }),
          list.push(element14),
          v91.append(element14, v30("span", "", v89.label)),
          v90.append(v91, element15, element16),
          v82.append(v90));
      }
      (v87(), v73.append(v82));
    }
    v75();
    const v94 = v30("div", "dialog-actions"),
      v95 = v31("确定", () => {
        if (v37 || !v38 || arg26.statusSource !== statusSource || !v50().includes(arg26))
          return fn7();
        ((statusSource.metrics = filter.flatMap(([v96]) => map4.get(v96).metrics)),
          (statusSource.visibleMetrics = statusSource.metrics
            .filter((arg36) => set.has(arg36.entityId))
            .map((arg37) => arg37.entityId)),
          (statusSource.groupOrder = filter.map(([v97]) => v97)),
          fn7(),
          fn10(),
          fn29(),
          (element17.textContent = "显示内容已调整，待保存配置"));
      });
    ((v95.className = "primary"),
      v94.append(v31("取消", fn7), v95),
      v70.append(
        v71,
        v73,
        v30("p", "i3d-note", "用 ↑ ↓ 调整分组和组内内容顺序；确定后点击“保存配置”保存。"),
        v94,
      ),
      element8.append(v68, v70),
      document.body.append(element8),
      v72(),
      element8.addEventListener("cancel", (arg38) => {
        (arg38.preventDefault(), fn7());
      }),
      element8.showModal());
  }
  function fn9(arg39, v98 = false) {
    if (v37 || !v38 || v40 || v41 || v39 || value9) return;
    const list2 = v98
        ? [
            ["size", "按钮大小", "px"],
            ["iconSize", "图标大小", "px"],
            ["hitSize", "触控范围", "px"],
            ["buttonVisibility", "按钮显示", ""],
          ]
        : v60(),
      options = {
        ...arg39,
        ...fn4(arg39),
      };
    !v22 &&
      !v98 &&
      (list2.push(["icon", "图标", ""], ["buttonVisibility", "按钮显示", ""]),
      (options.icon = arg39.icon || v26),
      (options.buttonVisibility = arg39.buttonHidden
        ? "隐藏（不可点击）"
        : arg39.hiddenClickable
          ? "隐藏（可点击）"
          : "显示"));
    const v99 = value2?.floors
      .find((arg40) => arg40.id === arg39.floorId)
      ?.[v25]?.find((arg41) => arg41.id === arg39.modelId);
    if (
      ((options.height =
        arg39.height ??
        (v11
          ? 0.08
          : v12
            ? (Number(v99?.elevation) || 0) + (Number(v99?.height) || 0.85) + 0.25
            : v99?.height)),
      list2.push(["height", "高度", " 米"]),
      !v11 && v7 !== "smallcar" && list2.push(["clickAction", "点击行为", ""]),
      v18 &&
        !v98 &&
        list2.push(
          ["iconStateReversed", "图标状态反向", ""],
          ["curtainFabric", "帘布类型", ""],
          ["coverKind", "窗帘类型", ""],
          ["coverDirection", "开合方向", ""],
          ["unboundPosition", "未绑定时展示状态", "%"],
        ),
      v12 &&
        ((options.motionEnabled = arg39.motionEnabled !== false),
        (options.funMessages = arg39.funMessages !== false),
        list2.push(
          ["motionEnabled", "跟随真实位置移动", ""],
          ["funMessages", "工作时趣味短句", ""],
        )),
      v98)
    ) {
      const v100 = v50().find((arg42) => arg42.id === arg39.memberIds?.[0]),
        v101 = value2?.floors
          .find((arg43) => arg43.id === arg39.floorId)
          ?.curtains?.find((arg44) => arg44.id === v100?.modelId);
      ((options.height = arg39.height ?? v100?.height ?? v101?.height),
        (options.clickAction = arg39.clickAction || "focus"),
        (options.panelLayout = arg39.panelLayout || "horizontal"),
        list2.push(["panelLayout", "弹窗布局", ""]));
    }
    v18 &&
      !v98 &&
      ((options.curtainFabric = arg39.curtainFabricOverride
        ? arg39.curtainFabric
        : v99?.curtainFabric || arg39.curtainFabric || "cloth"),
      (options.coverKind = arg39.coverKindOverride
        ? arg39.coverKind
        : v99?.curtainForm === "roller"
          ? "roller"
          : arg39.coverKind || "standard"),
      (options.iconStateReversed = arg39.iconStateReversed === true));
    const set2 = new Set([
        "height",
        "clickAction",
        "coverKind",
        "coverDirection",
        "unboundPosition",
        "motionEnabled",
        "panelLayout",
      ]),
      map6 = list2.map(([v102, v103, v104]) => ({
        key: v102,
        label: v103,
        unit: v104,
        optional: set2.has(v102),
        ...(["cardOpacity", "backgroundOpacity"].includes(v102)
          ? {
              format: (arg45) => Math.round(arg45 * 100),
            }
          : {}),
        ...(v102 === "height"
          ? {
              format: (arg46) => (Number.isFinite(arg46) ? arg46.toFixed(1) : "跟随各自模型"),
            }
          : {}),
        ...(v102 === "buttonVisibility"
          ? {
              write: (arg47, arg48) => {
                ((arg47.buttonHidden = arg48 === "隐藏（不可点击）"),
                  (arg47.hiddenClickable = arg48 === "隐藏（可点击）"));
              },
            }
          : {}),
        ...(v102 === "curtainFabric"
          ? {
              write: (arg49, arg50) => {
                ((arg49.curtainFabric = arg50), (arg49.curtainFabricOverride = true));
              },
            }
          : {}),
        ...(v102 === "coverKind"
          ? {
              write: (arg51, arg52) => {
                ((arg51.coverKind = arg52), (arg51.coverKindOverride = true));
              },
            }
          : {}),
        ...(v102 === "unboundPosition"
          ? {
              compatible: (arg53) => !arg53.entityId,
            }
          : {}),
      })),
      filter3 = (v98 ? structuredClone2.environment.curtainGroups : v50()).filter(
        (arg54) => arg54.id !== arg39.id && (v11 || arg54.floorId === arg39.floorId),
      );
    value9 = openBatchApply2({
      title: v98 ? "应用组合窗帘设置" : "应用" + v23 + "设置",
      source: options,
      targets: filter3,
      fields: map6,
      changed: v98
        ? []
        : [
            ...new Set([
              ...fn5(arg39).map(([v105]) => v105),
              ...map6
                .filter((arg55) => arg39[arg55.key] !== map2.get(arg39.id)?.[arg55.key])
                .map((arg56) => arg56.key),
            ]),
          ],
      onClose: () => {
        value9 = null;
      },
      onApply: async (arg57, arg58) => {
        if ((await requestInteraction3dAccess2(), v37 || !v38 || !value9?.open))
          throw new Error("配置已关闭或授权不可用");
        for (const v106 of arg57) copyBatchFields2(v106, options, arg58);
        (fn10(),
          fn29(),
          (element17.textContent = "已应用到 " + arg57.length + " 个目标，待保存配置"));
      },
    });
  }
  const v107 = () => {
      const v108 = interaction3dPreviewSize2(v1, v2, v34.clientWidth, v34.clientHeight);
      Object.assign(v35.style, {
        width: v108.width + "px",
        height: v108.height + "px",
      });
    },
    resizeObserver = new ResizeObserver(v107);
  resizeObserver.observe(v34);
  const v109 = () => {
      v37 ||
        ((v37 = true),
        fn17(),
        fn7(),
        value4?.close(),
        resizeObserver.disconnect(),
        num2++,
        value7?.close(),
        value3?.(),
        v441(),
        element4.remove(),
        element.remove(),
        document.dispatchEvent(new Event("hb-i3d-preview-scope")));
    },
    element17 = v30("span", "i3d-save-status");
  element17.setAttribute("role", "status");
  const element18 = v31("保存配置", async () => {
    if (v43 || v37 || !v38 || v40 || v41) return;
    for (const v110 of structuredClone2.devices?.cars || []) {
      if (!v110.chargingStates) continue;
      const v111 = carChargingMappingError2(v110.chargingStates);
      if (v111) {
        element7.textContent = (v110.label || v110.deviceName || "汽车") + "：" + v111;
        return;
      }
    }
    const structuredClone3 = structuredClone(structuredClone2);
    !v22 && !v13 && (structuredClone3.lightingMode = "region");
    const v112 = num3;
    ((v43 = true),
      (element17.textContent = "保存中…"),
      (element18.disabled = true),
      (element7.textContent = ""));
    try {
      if ((await requestInteraction3dAccess2(), v37)) return;
      (await v6(structuredClone3),
        v37 || (element17.textContent = v112 === num3 ? "已保存" : "已保存，另有新修改"));
    } catch (v113) {
      v37 || ((element7.textContent = v113.message), (element17.textContent = ""));
    } finally {
      ((v43 = false), v37 || (element18.disabled = !v38 || v40 || v41));
    }
  });
  ((element18.className = "primary"),
    v32.append(v30("strong", "", "3D " + v24 + "配置"), element17, element18, v31("退出", v109)),
    v33.append(v34, element5),
    element4.append(v32, v33),
    document.body.append(element4),
    element4.addEventListener("cancel", (arg59) => {
      (arg59.preventDefault(), v109());
    }));
  const v114 = () => {
    const floorId = v11 && v49() ? v49().floorId : floorSelection,
      camera =
        structuredClone2.floorCameras?.[floorId] ||
        (floorId === structuredClone2.floorSelection ? structuredClone2.camera : null);
    return {
      ...structuredClone2,
      floorSelection: floorId,
      ...(camera === undefined
        ? {}
        : {
            camera: camera,
          }),
    };
  };
  function fn10() {
    (fn2(),
      num3++,
      v43 || (element17.textContent = ""),
      value3?.update(v114(), v11 && text ? "vacuum-room:" + v9 + ":" + text : v54(), {
        module: v7,
        vacuumId: v11 ? v9 : "",
      }),
      v62());
  }
  function fn11(arg60, arg61, arg62) {
    arg62.name = "i3d-" + v7 + "-" + (text || "scene") + "-" + arg61;
    const v115 = v30("label", arg62.type === "checkbox" ? "i3d-setting-toggle" : "");
    return (v115.append(v30("span", "", arg61), arg62), arg60.append(v115), arg62);
  }
  function fn12(arg63, arg64, arg65, arg66, arg67) {
    const element19 = v30("select");
    for (const [v116, v117] of arg65) {
      const v118 = v30("option", "", v117);
      ((v118.value = v116), element19.append(v118));
    }
    return (
      (element19.value = arg66),
      element19.addEventListener("change", () => arg67(element19.value)),
      fn11(arg63, arg64, element19)
    );
  }
  function fn13(arg68, arg69, arg70, arg71, arg72, arg73, arg74, v119 = "number", v120 = false) {
    const endsWith = arg69.endsWith("高度（米）"),
      v121 = (arg75) => (endsWith ? Number(arg75).toFixed(1) : String(arg75)),
      element20 = v30("input");
    return (
      Object.assign(element20, {
        type: v119,
        min: String(arg71),
        max: String(arg72),
        step: String(endsWith ? 0.1 : arg73),
        value: v121(arg70),
      }),
      v120 &&
        v119 === "number" &&
        element20.addEventListener("input", () => {
          const NaN2 = element20.value.trim() === "" ? NaN : Number(element20.value);
          !Number.isFinite(NaN2) ||
            NaN2 < arg71 ||
            NaN2 > arg72 ||
            NaN2 === arg70 ||
            ((arg70 = NaN2), arg74(arg70));
        }),
      element20.addEventListener(v119 === "range" ? "input" : "change", () => {
        const NaN3 = element20.value.trim() === "" ? NaN : Number(element20.value);
        if (!Number.isFinite(NaN3)) {
          element20.value = v121(arg70);
          return;
        }
        const v122 = arg70;
        ((arg70 = Math.max(arg71, Math.min(arg72, NaN3))),
          endsWith && (arg70 = Number(arg70.toFixed(1))),
          (element20.value = v121(arg70)),
          (!v120 || arg70 !== v122) && arg74(arg70));
      }),
      fn11(arg68, arg69, element20)
    );
  }
  function fn14(arg76, arg77, arg78, arg79) {
    const element21 = v30("input");
    return (
      Object.assign(element21, {
        type: "number",
        step: "any",
        value: String(Number(arg78().toPrecision(12))),
      }),
      element21.addEventListener("change", () => {
        const NaN4 = element21.value.trim() === "" ? NaN : Number(element21.value);
        Number.isFinite(NaN4) && NaN4 > 0
          ? ((element21.value = String(NaN4)), arg79(NaN4))
          : (element21.value = String(arg78()));
      }),
      fn11(arg76, arg77, element21)
    );
  }
  function fn15() {
    return (value2?.floors || [])
      .filter((arg80) => arg80.id === floorSelection)
      .flatMap((arg81) =>
        (v22 ? arg81[v25] || [] : arg81.groups || [])
          .filter(
            (arg82) =>
              !v50().some((arg83) => arg83.floorId === arg81.id && arg83[v27] === arg82.id),
          )
          .map((arg84) => ({
            floor: arg81,
            group: arg84,
            key: JSON.stringify([arg81.id, arg84.id]),
          })),
      );
  }
  async function fn16(arg85, v123 = false) {
    if (
      v37 ||
      v43 ||
      !v38 ||
      v40 ||
      v41 ||
      v39 ||
      arg85 === v7 ||
      !(
        includes
          ? ["climate", "fan", "purifier", "cover", "temperature-humidity"]
          : includes2
            ? ["nas", "television", "speaker", "water-heater", "airer", ...GENERIC_DEVICE_KINDS2]
            : ["vacuum", "vacuum-shortcut"]
      ).includes(arg85)
    )
      return;
    (map3.set(v7, {
      selectedId: text,
      scrollTop: element5.scrollTop,
      baselines: map2,
    }),
      v12 && (v9 = text || v9),
      fn17(),
      fn7(),
      num2++,
      value7?.close(),
      (value7 = null),
      num++,
      (v40 = false),
      (v41 = false),
      (value5 = null),
      (text3 = "focus"),
      fn1(arg85),
      fn3());
    const v124 = map3.get(arg85);
    ((text = v12 ? v9 : v124?.selectedId || ""),
      v12 && v49() && (floorSelection = v49().floorId),
      (v61 = v60()),
      (map2 = v124?.baselines || new Map(v50().map((arg86) => [arg86.id, structuredClone(arg86)]))),
      (element7.textContent = ""),
      fn29(),
      fn10(),
      (element5.scrollTop = v124?.scrollTop || 0),
      v123 && fn18());
  }
  function fn17() {
    (value6 && (num2++, value7?.close(), (value7 = null)),
      value6?.close(),
      value6?.remove(),
      (value6 = null));
  }
  function fn18(arg87) {
    if (v37 || !v38 || v40 || v41 || v39 || value6) return;
    if (v11) {
      fn19(arg87?.currentTarget || arg87?.target);
      return;
    }
    const v125 = fn15();
    if (!v125.length) return;
    (num2++, value7?.close());
    const element22 = v30("dialog", "settings-dialog i3d-add-dialog");
    ((value6 = element22),
      element22.setAttribute("aria-label", includes2 ? "添加设备" : "添加" + v23 + "按钮"));
    const v126 = v30("div", "dialog-heading"),
      v127 = v30("div");
    v127.append(
      v30("span", "", "ADD BUTTON"),
      v30("h2", "", includes2 ? "添加设备" : "添加" + v23 + "按钮"),
    );
    const element23 = v31("×", fn17);
    ((element23.className = "icon-button"),
      element23.setAttribute("aria-label", "关闭添加按钮窗口"),
      v126.append(v127, element23));
    const v128 = v30("div", "i3d-add-dialog-body"),
      element24 = v30("p", "i3d-error");
    (element24.setAttribute("role", "status"),
      includes2 &&
        fn12(
          v128,
          "设备类型",
          [
            ["nas", "NAS"],
            ["television", "电视"],
            ["speaker", "智能音响"],
            ["water-heater", "热水器"],
            ["airer", "晾衣架"],
            ...GENERIC_DEVICE_KINDS2.map((arg88) => [arg88, genericDeviceProfile2(arg88).label]),
          ],
          v7,
          (arg89) => {
            arg89 !== v7 && fn16(arg89, true);
          },
        ).setAttribute("aria-label", "设备类型"));
    let text4 = "air-conditioner";
    v7 === "climate" &&
      fn12(
        v128,
        "设备类型",
        [
          ["air-conditioner", "空调"],
          ["bath-heater", "浴霸"],
        ],
        text4,
        (arg90) => {
          text4 = arg90;
        },
      );
    const element25 = fn12(
      v128,
      v22 ? "关联" + v23 + "模型" : "关联灯组",
      v125.map((arg91) => [arg91.key, v28(arg91.group)]),
      v125[0].key,
      () => {
        element24.textContent = "";
      },
    );
    element25.setAttribute("aria-label", v22 ? "关联" + v23 + "模型" : "关联灯组");
    const v129 = v30("div", "dialog-actions");
    let v130 = false;
    const element26 = v31("确定添加", async () => {
      if (v130 || v37 || !v38 || value6 !== element22) return;
      ((v130 = true),
        (element26.disabled = true),
        (element25.disabled = true),
        (element24.textContent = ""));
      const v131 = element25.value;
      try {
        if ((await requestInteraction3dAccess2(), v37 || !v38 || value6 !== element22)) return;
        const v132 = fn15().find((arg92) => arg92.key === v131);
        if (!v132) throw new Error("该对象已添加或不再可用，请关闭窗口后重新选择。");
        const options2 = {
          id: randomUuid2(),
          floorId: v132.floor.id,
          [v27]: v132.group.id,
          entityId: "",
          label: v28(v132.group),
          ...(v22
            ? {}
            : {
                x: v132.group.x,
                y: v132.group.y,
                height: v132.group.height ?? v132.floor.wallHeight ?? 2.8,
                fadeDuration: 0.3,
              }),
          ...(v18
            ? {
                coverDirection: "auto",
                curtainFabric: "cloth",
                unboundPosition: 0,
              }
            : {}),
          size: 44,
          iconSize: 26,
          visible: true,
          icon: v26,
          clickAction: v13 ? "focus-panel" : "focus",
        };
        (v7 === "climate" && (options2.climateType = text4),
          v22 || Object.assign(options2, withFixedLightEffects2(options2)),
          v50().push(options2),
          (text = options2.id),
          fn17(),
          fn10(),
          fn29());
      } catch (v133) {
        value6 === element22 && (element24.textContent = v133.message);
      } finally {
        ((v130 = false), (element26.disabled = false), (element25.disabled = false));
      }
    });
    ((element26.className = "primary"),
      v129.append(v31("取消", fn17), element26),
      v128.append(
        v30("p", "i3d-note", "添加后可继续设置" + v23 + "按钮，最后点击“保存配置”完成保存。"),
        element24,
        v129,
      ),
      element22.append(v126, v128),
      document.body.append(element22),
      element22.addEventListener("cancel", (arg93) => {
        (arg93.preventDefault(), fn17());
      }),
      element22.showModal());
  }
  async function fn19(arg94) {
    const v134 = v49();
    if (!v134) return;
    const v135 = ++num2;
    value7?.close();
    try {
      const entity = await v5.entity({
        trigger: arg94,
        deviceKind: "vacuum-room",
        current: "",
        onSelect(arg95) {
          if (v37 || !v38 || v135 !== num2 || v49() !== v134 || !arg95) return;
          const v136 = v3.find((arg96) => arg96.entityId === arg95),
            v137 = v4?.get?.(arg95),
            v138 = v137?.newState || v137,
            v139 = value2.floors.find((arg97) => arg97.id === v134.floorId),
            v140 = v139?.vacuums?.find((arg98) => arg98.id === v134.modelId),
            flatMap = (v139?.plan?.walls || []).flatMap((arg99) => [arg99.start, arg99.end]),
            v141 = (arg100) =>
              flatMap.length
                ? flatMap.reduce((arg101, arg102) => arg101 + arg102[arg100], 0) / flatMap.length
                : v140?.[arg100] || 0,
            options3 = {
              id: randomUuid2(),
              entityId: arg95,
              label: v136?.name || v138?.attributes?.friendly_name || arg95,
              x: v141("x"),
              y: v141("y"),
              height: 0.08,
              size: 44,
              iconSize: 26,
              fontSize: 12,
              hitSize: 44,
              icon: "mdi:broom",
              visible: true,
            };
          (v51([...v50(), options3]),
            (text = options3.id),
            num2++,
            value7?.close(),
            (value7 = null),
            fn29(),
            fn10());
        },
      });
      v37 || v135 !== num2 ? entity?.close() : (value7 = entity);
    } catch (v142) {
      v37 || (element7.textContent = v142.message);
    }
  }
  function fn20() {
    const v143 = fn22(fn21("配置范围"));
    if (
      (fn12(
        v143,
        "配置内容",
        [
          ["vacuum", "设备与地图"],
          ["vacuum-shortcut", "快捷指令"],
        ],
        v7,
        (arg103) => {
          arg103 !== v7 && fn16(arg103);
        },
      ),
      !value2)
    )
      return;
    const list3 = structuredClone2.devices?.vacuums || [];
    if (!list3.length) {
      element5.append(v30("p", "i3d-note", "请先在扫地机配置中添加并绑定扫地机。"));
      return;
    }
    fn12(
      v143,
      "所属扫地机",
      list3.map((arg104) => [arg104.id, arg104.label || arg104.deviceName || "扫地机"]),
      v9,
      (arg105) => {
        ((v9 = arg105), (text = ""), map2.clear(), fn29(), fn10());
      },
    );
    const v144 = fn21("快捷按钮");
    v144.className += " i3d-compact-list";
    const v145 = v30("div", "i3d-config-list-row"),
      v146 = v31("添加快捷指令", fn18);
    if (
      (v145.append(v146),
      v144.append(v145),
      v50().some((arg106) => arg106.id === text) || (text = v50()[0]?.id || ""),
      !text)
    ) {
      element5.append(
        v30("p", "i3d-note", "添加按钮后，选择全部实体中的清扫指令，在户型中拖动按钮放置。"),
      );
      return;
    }
    fn12(
      v145,
      "当前按钮",
      v50().map((arg107) => [arg107.id, arg107.label]),
      text,
      (arg108) => {
        ((text = arg108), num2++, value7?.close(), fn29(), fn10());
      },
    );
    const v147 = v50().find((arg109) => arg109.id === text),
      v148 = v31("删除此快捷按钮", () => {
        (num2++,
          value7?.close(),
          v51(v50().filter((arg110) => arg110 !== v147)),
          (text = ""),
          fn29(),
          fn10());
      });
    v148.className = "i3d-remove-light";
    const v149 = fn22(fn21("基础绑定")),
      element27 = v30("input");
    ((element27.value = v147.label),
      (element27.maxLength = 128),
      (element27.onchange = () => {
        ((v147.label = element27.value.trim() || "房间清扫"), fn29(), fn10());
      }),
      fn11(v149, "名称", element27));
    const v150 = (arg111, arg112) => {
        const v151 = ++num2;
        Promise.resolve(
          v5[arg111]({
            trigger: arg112,
            deviceKind: "vacuum-room",
            current: arg111 === "icon" ? v147.icon : v147.entityId,
            onSelect(arg113) {
              v37 ||
                !v38 ||
                v151 !== num2 ||
                !v50().includes(v147) ||
                (arg111 === "icon" ? (v147.icon = arg113) : (v147.entityId = arg113),
                fn29(),
                fn10());
            },
          }),
        )
          .then((arg114) => {
            v37 || v151 !== num2 ? arg114?.close() : (value7 = arg114);
          })
          .catch((arg115) => {
            element7.textContent = arg115.message;
          });
      },
      v152 = v31(v147.entityId || "选择实体（全部）", () => v150("entity", v152));
    ((v152.className = "i3d-picker-button"),
      (v152.title = v147.entityId || ""),
      fn11(v149, "指令实体", v152));
    const v153 = fn21("按钮外观"),
      v154 = fn22(v153),
      v155 = v31("", () => v150("icon", v155));
    v155.className = "i3d-picker-button i3d-icon-picker-button";
    const element28 = v30("i");
    ((element28.style.maskImage =
      "url('/bridge-static/vendor/mdi/7.4.47/svg/" + (v147.icon || v26).slice(4) + ".svg')"),
      (element28.style.webkitMaskImage = element28.style.maskImage),
      v155.append(element28, v30("span", "", v147.icon || v26)),
      fn11(v154, "图标", v155));
    const v156 = v30("div", "i3d-button-visibility-row i3d-shortcut-visibility");
    v153.append(v156);
    for (const [v157, v158] of [
      ["hiddenClickable", "隐藏（可点击）"],
      ["buttonHidden", "隐藏（不可点击）"],
    ]) {
      const element29 = v30("input");
      ((element29.type = "checkbox"),
        (element29.checked = v147[v157] === true),
        (element29.onchange = () => {
          ((v147[v157] = element29.checked),
            element29.checked &&
              (v147[v157 === "buttonHidden" ? "hiddenClickable" : "buttonHidden"] = false),
            fn29(),
            fn10());
        }),
        fn11(v156, v158, element29));
    }
    for (const [v159, v160] of [
      ["iconHidden", "隐藏图标"],
      ["labelHidden", "隐藏名称"],
    ]) {
      const element30 = v30("input");
      ((element30.type = "checkbox"),
        (element30.checked = v147[v159] === true),
        (element30.onchange = () => {
          ((v147[v159] = element30.checked), fn10());
        }),
        fn11(v156, v160, element30));
    }
    const v161 = v30("div", "i3d-coordinate-grid i3d-size-grid i3d-shortcut-size-grid"),
      v162 = v30("details");
    (v162.append(v30("summary", "", "更多尺寸设置"), v161), v153.append(v162));
    for (const [v163, v164, v165] of [
      ["size", "按钮大小（px）", 44],
      ["iconSize", "图标大小（px）", 26],
      ["fontSize", "文字大小（px）", 12],
      ["hitSize", "触控范围（px）", 44],
    ])
      fn14(
        v163 === "size" ? v154 : v161,
        v164,
        () => v147[v163] || v165,
        (arg116) => {
          ((v147[v163] = arg116), fn10());
        },
      );
    const v166 = fn21("按钮位置"),
      v167 = v30("div", "i3d-coordinate-grid");
    v166.append(v167);
    for (const v168 of ["x", "y"])
      fn13(v167, "位置 " + v168.toUpperCase(), v147[v168], -1000000, 1000000, 1, (arg117) => {
        ((v147[v168] = arg117), fn10());
      });
    (fn13(v167, "高度（米）", v147.height ?? 0.08, 0, 20, 0.1, (arg118) => {
      ((v147.height = arg118), fn10());
    }),
      v166.append(
        v30(
          "p",
          "i3d-note",
          "拖动按钮调整位置，拖动空白处旋转户型。点击只执行绑定指令，不弹窗、不聚焦。",
        ),
      ));
    const v169 = v30("section", "navigation-batch-section i3d-light-batch"),
      v170 = v31("一键应用到其他快捷按钮", () => fn9(v147));
    (v169.append(v30("h4", "", v7 === "smallcar" ? "卡片设置一键应用" : "图标设置一键应用"), v170),
      element5.append(v169),
      (v62 = () => {
        v170.disabled = !v38;
      }),
      v62(),
      fn21("绑定管理").append(v148));
  }
  function fn21(arg119) {
    const v171 = v30("section", "i3d-config-section");
    return (v171.append(v30("h4", "", arg119)), element5.append(v171), v171);
  }
  function fn22(arg120) {
    const v172 = v30("div", "i3d-config-row");
    return (arg120.append(v172), v172);
  }
  function fn23(
    arg121,
    arg122,
    { deviceId: v173 = arg122.deviceId, standardOnly: v174 = false } = {},
  ) {
    ((arg121.className += " i3d-status-settings"),
      arg121.append(
        v30(
          "p",
          "i3d-note",
          "正常绿灯、提醒橙灯，均为呼吸效果；未知状态显示稳定灰灯。未设置任何规则时不显示指示灯。",
        ),
      ));
    const v175 =
        typeof deviceStatusChoices2 == "function"
          ? deviceStatusChoices2
          : (v176 = {}) => {
              const v177 = String(v176.entityId || "").split(".")[0];
              return ["binary_sensor", "switch", "input_boolean", "light", "fan"].includes(v177)
                ? {
                    options: [
                      {
                        value: "on",
                        label: "开启",
                      },
                      {
                        value: "off",
                        label: "关闭",
                      },
                    ],
                    reminderValue: "on",
                  }
                : null;
            },
      v178 =
        typeof defaultDeviceStatusRule2 == "function"
          ? defaultDeviceStatusRule2
          : (arg123, arg124, arg125) => {
              const v179 = v175(arg123, arg124);
              if (!v179) return null;
              const reminderValue =
                arg125 === "health" ? v179.reminderValue : v179.options[0].value;
              return {
                entityId: arg123.entityId,
                active: reminderValue,
                inactive: v179.options.find((arg126) => arg126.value !== reminderValue).value,
              };
            },
      v180 = () =>
        Array.isArray(arg122.statusRules?.health)
          ? arg122.statusRules.health
          : arg122.statusRules?.health
            ? [arg122.statusRules.health]
            : [],
      v181 = (arg127) =>
        v3.find((arg128) => arg128.entityId === arg127) || {
          entityId: arg127,
        },
      v182 = (arg129) =>
        value8?.get?.(arg129) ?? value8?.[arg129] ?? v4?.get?.(arg129) ?? v4?.[arg129],
      v183 = () => {
        const scrollTop = element5.scrollTop;
        (fn10(), fn29(), (element5.scrollTop = scrollTop));
      },
      v184 = (arg130) => !v37 && v38 && arg130 === num2 && v50().includes(arg122),
      v185 = (arg131, arg132, arg133) => {
        const options4 = {
          ...arg122.statusRules,
        };
        if (arg131 === "power") arg133 ? (options4.power = arg133) : delete options4.power;
        else {
          const slice = v180().slice();
          (arg133 ? (slice[arg132] = arg133) : slice.splice(arg132, 1),
            slice.length ? (options4.health = slice) : delete options4.health);
        }
        (Object.keys(options4).length ? (arg122.statusRules = options4) : delete arg122.statusRules,
          v183());
      },
      v186 = (arg134, arg135, arg136, arg137) => {
        if (!v184(arg137) || value6) return;
        const element31 = v30("dialog", "settings-dialog i3d-add-dialog");
        ((value6 = element31), element31.setAttribute("aria-label", "设置指示灯条件"));
        const v187 = v30("div", "dialog-heading");
        v187.append(v30("h2", "", "设置指示灯条件"));
        const v188 = v30("div", "i3d-add-dialog-body"),
          v189 = v181(arg136.entityId),
          v190 = v182(arg136.entityId),
          v191 = (v190?.newState || v190)?.state;
        (v188.append(
          v30("strong", "", v189.name || arg136.entityId),
          v30("p", "i3d-note", "此实体使用自定义状态。指定两个匹配值，其他值显示为未知。"),
        ),
          v191 != null && v188.append(v30("p", "i3d-note", "HA 当前值：" + v191)));
        const element32 = v30("input"),
          element33 = v30("input");
        ((element32.value = arg136.active || ""),
          (element33.value = arg136.inactive || ""),
          (element32.maxLength = element33.maxLength = 120),
          fn11(v188, arg134 === "health" ? "提醒时的状态值" : "亮灯时的状态值", element32),
          fn11(v188, arg134 === "health" ? "恢复时的状态值" : "灭灯时的状态值", element33));
        const element34 = v30("p", "i3d-error");
        (element34.setAttribute("role", "status"), v188.append(element34));
        const v192 = v31("确定", () => {
          if (!v184(arg137)) {
            fn17();
            return;
          }
          const list4 = [element32.value.trim(), element33.value.trim()];
          if (
            list4.some(
              (arg138) =>
                !arg138 || arg138.length > 120 || ["unknown", "unavailable"].includes(arg138),
            ) ||
            list4[0] === list4[1]
          ) {
            element34.textContent = "请填写两个不同的有效状态值；未知或不可用不能作为匹配条件。";
            return;
          }
          (fn17(),
            v185(arg134, arg135, {
              entityId: arg136.entityId,
              active: list4[0],
              inactive: list4[1],
            }));
        });
        v192.className = "primary";
        const v193 = v30("div", "dialog-actions");
        (v193.append(v31("取消", fn17), v192),
          element31.append(v187, v188, v193),
          element4.append(element31),
          element31.addEventListener("cancel", (arg139) => {
            (arg139.preventDefault(), fn17());
          }),
          element31.showModal());
      },
      v194 = async (arg140, arg141, arg142) => {
        if (!v38 || v37 || !v173) return;
        const v195 = ++num2;
        (value7?.close(), (element7.textContent = ""));
        const v196 = arg140 === "power" ? arg122.statusRules?.power : v180()[arg141],
          v197 = (arg143) =>
            (arg143.deviceId || arg143.device_id) === v173 &&
            !arg143.disabledBy &&
            !arg143.disabled_by &&
            arg143.enabled !== false &&
            !["disabled", "missing"].includes(arg143.status) &&
            (!v174 || !!v175(arg143, v182(arg143.entityId))) &&
            (arg140 !== "health" ||
              !v180().some(
                (arg144, arg145) => arg145 !== arg141 && arg144.entityId === arg143.entityId,
              ));
        let v198 = false;
        try {
          if (!v5?.entity) throw new Error("实体选择器尚未准备好，请刷新页面。");
          const entity2 = await v5.entity({
            trigger: arg142,
            current: v196?.entityId || "",
            deviceKind: "device-status",
            title: arg140 === "health" ? "选择提醒实体" : "选择亮灭依据",
            entityFilter: v197,
            onSelect(arg146, arg147) {
              if (v198 || !v184(v195)) return;
              if (!arg146) {
                ((v198 = true), v196 && v185(arg140, arg141, null));
                return;
              }
              const v199 = arg147?.entityId === arg146 ? arg147 : v181(arg146);
              if (
                !v197(v199) ||
                ((v198 = true),
                (v3 = [...v3.filter((arg148) => arg148.entityId !== arg146), v199]),
                v196?.entityId === arg146)
              )
                return;
              const v200 = v178(v199, v182(arg146), arg140);
              v200
                ? v185(arg140, arg141, v200)
                : v174 ||
                  v186(
                    arg140,
                    arg141,
                    {
                      entityId: arg146,
                    },
                    v195,
                  );
            },
          });
          v184(v195) ? (value7 = entity2) : entity2?.close();
        } catch (v201) {
          v184(v195) && (element7.textContent = v201.message);
        }
      },
      v202 = (arg149, arg150, arg151) => {
        const v203 = v181(arg151?.entityId),
          text5 = v203.name || arg151?.entityId || "未选择实体",
          v204 = v30("div", "i3d-status-rule"),
          element35 = v31("", () => void v194(arg149, arg150, element35));
        if (
          ((element35.className = "i3d-picker-button"),
          element35.append(v30("span", "", arg151 ? text5 : "不设置 · 选择实体")),
          element35.setAttribute(
            "aria-label",
            arg149 === "power" ? "电源状态实体" : "提醒实体 " + (arg150 + 1),
          ),
          (element35.title = text5),
          (element35.disabled = !v173),
          v204.append(element35),
          !arg151)
        ) {
          ((v204.className += " is-empty"), arg121.append(v204));
          return;
        }
        const v205 = v175(v203, v182(arg151.entityId));
        if (
          arg151.active !== arg151.inactive &&
          v205?.options.some((arg152) => arg152.value === arg151.active) &&
          v205.options.some((arg153) => arg153.value === arg151.inactive)
        ) {
          const element36 = v30("select");
          element36.setAttribute(
            "aria-label",
            arg149 === "power" ? text5 + "亮灯条件" : text5 + "提醒条件",
          );
          for (const { value: v206, label: v207 } of v205.options) {
            const v208 = v30("option", "", v207 + "时" + (arg149 === "power" ? "亮灯" : "提醒"));
            ((v208.value = v206), element36.append(v208));
          }
          ((element36.value = arg151.active),
            element36.addEventListener("change", () => {
              const v209 = element36.value,
                v210 = v205.options.find((arg154) => arg154.value !== v209)?.value;
              !v210 ||
                !v205.options.some((arg155) => arg155.value === v209) ||
                (Object.assign(arg151, {
                  active: v209,
                  inactive: v210,
                }),
                fn10());
            }),
            v204.append(element36));
        } else {
          if (v174) v204.append(v30("span", "i3d-note", "状态暂不可识别，请重新选择实体。"));
          else {
            const element37 = v31("设置匹配条件", () => v186(arg149, arg150, arg151, ++num2));
            (element37.setAttribute("aria-label", "设置" + text5 + "匹配条件"),
              v204.append(element37));
          }
        }
        const element38 = v31("×", () => {
          (num2++, value7?.close(), v185(arg149, arg150, null));
        });
        ((element38.className = "i3d-status-remove"),
          (element38.title = arg149 === "power" ? "移除亮灭依据" : "删除" + text5 + "提醒"),
          element38.setAttribute("aria-label", element38.title),
          v204.append(element38),
          arg121.append(v204));
      };
    (arg121.append(v30("p", "i3d-status-label", "电源状态（可选）")),
      v202("power", 0, arg122.statusRules?.power),
      arg121.append(v30("p", "i3d-status-label", "提醒条件")),
      v180().forEach((arg156, arg157) => v202("health", arg157, arg156)));
    const v211 = v31("＋ 添加提醒", () => void v194("health", v180().length, v211));
    ((v211.disabled = !v173),
      (v211.className = "i3d-status-add"),
      arg121.append(v211),
      arg121.append(
        v30(
          "p",
          "i3d-note",
          "任一提醒条件触发时优先亮橙灯；没有提醒时，按电源状态亮灯或熄灭。不设置电源状态则只看提醒条件。",
        ),
      ));
  }
  function fn24(arg158) {
    if (v37 || !v38 || v40 || v41 || value6) return;
    const v212 = curtainGroupCandidates2(structuredClone2.environment, arg158.id);
    if (!v212.length) return;
    const element39 = v30("dialog", "settings-dialog i3d-add-dialog");
    ((value6 = element39), element39.setAttribute("aria-label", "组合窗帘"));
    const v213 = v30("div", "i3d-add-dialog-body"),
      element40 = v30("p", "i3d-error");
    v213.append(
      v30("h2", "", "组合窗帘"),
      v30(
        "p",
        "i3d-note",
        "以“" +
          (arg158.label || "当前窗帘") +
          "”为第一层，继承其入口位置、尺寸、点击行为和聚焦视角。请选择同一位置的另一层窗帘。",
      ),
    );
    const v214 = fn12(
        v213,
        "另一层窗帘",
        v212.map((arg159) => [arg159.id, arg159.label || arg159.entityId || arg159.id]),
        v212[0].id,
        () => {},
      ),
      element41 = v30("input");
    ((element41.value = "双层窗帘"),
      (element41.maxLength = 128),
      fn11(v213, "组合名称", element41),
      v213.append(
        v30(
          "p",
          "i3d-note",
          "3D 画面只显示双图标，无文字；两个模型仍各自动画。不会移动模型或发送设备命令。",
        ),
      ));
    const v215 = v31("确定组合", () => {
      if (!(!v38 || v37 || value6 !== element39))
        try {
          const v216 = createCurtainGroup2(
            structuredClone2.environment,
            arg158.id,
            v214.value,
            randomUuid2(),
          );
          ((v216.label = element41.value.trim() || "双层窗帘"),
            (structuredClone2.environment.curtainGroups = [...v52(), v216]),
            (text = curtainGroupEntryId2(v216)),
            fn17(),
            fn10(),
            fn29());
        } catch (v217) {
          element40.textContent = v217.message;
        }
    });
    v215.className = "primary";
    const v218 = v30("div", "dialog-actions");
    (v218.append(v31("取消", fn17), v215),
      v213.append(element40, v218),
      element39.append(v213),
      document.body.append(element39),
      element39.addEventListener("cancel", (arg160) => {
        (arg160.preventDefault(), fn17());
      }),
      element39.showModal());
  }
  function fn25(arg161) {
    const v219 = fn21("组合入口"),
      v220 = fn22(v219),
      element42 = v30("input");
    ((element42.value = arg161.label || "双层窗帘"),
      (element42.maxLength = 128),
      element42.addEventListener("change", () => {
        ((arg161.label = element42.value.trim() || "双层窗帘"), fn10());
      }),
      fn11(v220, "组合名称", element42),
      v219.append(
        v30(
          "p",
          "i3d-note",
          "双图标各自显示状态，共用点击范围。名称只用于配置和弹窗，不在户型上显示。",
        ),
      ));
    const map7 = arg161.memberIds.map((arg162) => v50().find((arg163) => arg163.id === arg162)),
      v221 = fn21("组合成员"),
      v222 = v30("div", "i3d-group-member-actions");
    (v221.append(v222),
      map7.forEach((arg164, arg165) =>
        v222.append(
          v31(
            (arg165 === 0 ? "左图标 / 上控制区" : "右图标 / 下控制区") +
              "：" +
              (arg164.label || "窗帘") +
              " · 编辑",
            () => {
              ((text = arg164.id), (text2 = arg164.id), fn10(), fn29());
            },
          ),
        ),
      ),
      v222.append(
        v31("交换两层顺序", () => {
          (arg161.memberIds.reverse(), fn10(), fn29());
        }),
      ));
    const v223 = fn21("交互行为");
    (fn12(
      v223,
      "弹窗布局",
      [
        ["horizontal", "左右布局"],
        ["vertical", "上下布局"],
      ],
      arg161.panelLayout || "horizontal",
      (arg166) => {
        ((arg161.panelLayout = arg166), fn10());
      },
    ),
      v223.append(
        v30(
          "p",
          "i3d-note",
          "左右布局保持普通弹窗大小；上下布局增加高度。均跟随自定义弹窗缩放与位置。",
        ),
      ),
      fn12(
        v223,
        "点击组合入口",
        [
          ["focus", "聚焦并显示控制"],
          ["panel", "仅显示控制"],
          ["turn-on-focus", "开合窗帘（打开时聚焦）"],
          ["turn-on", "仅开合窗帘"],
          ["turn-on-panel", "开合窗帘（打开时显示控制）"],
        ],
        arg161.clickAction || "focus",
        (arg167) => {
          ((arg161.clickAction = arg167), fn10());
        },
      ),
      v223.append(
        v30(
          "p",
          "i3d-note",
          "开关类行为：任一窗帘打开或半开时关闭两层，全部关闭时打开两层；运动中点击先停止。仅打开时执行所选聚焦或弹窗。",
        ),
      ));
    const v224 = v30("div", "i3d-button-visibility-row");
    v223.append(v224);
    for (const [v225, v226, v227] of [
      ["hiddenClickable", "隐藏（可点击）", "buttonHidden"],
      ["buttonHidden", "隐藏（不可点击）", "hiddenClickable"],
    ]) {
      const element43 = v30("input");
      ((element43.type = "checkbox"),
        (element43.checked =
          arg161[v225] === true && (v225 === "buttonHidden" || arg161.buttonHidden !== true)),
        element43.addEventListener("change", () => {
          ((arg161.visible = true),
            (arg161[v225] = element43.checked),
            element43.checked && (arg161[v227] = false),
            fn10(),
            fn29());
        }),
        (fn11(v224, v226, element43).parentElement.className += " i3d-hidden-clickable-setting"));
    }
    const v228 = fn21("按钮外观"),
      v229 = fn22(v228),
      v230 = v30("div", "i3d-coordinate-grid i3d-size-grid"),
      v231 = v30("details");
    (v231.append(v30("summary", "", "更多尺寸设置"), v230), v228.append(v231));
    for (const [v232, v233, v234] of [
      ["size", "按钮大小（px）", 44],
      ["iconSize", "图标大小（px）", 26],
      ["hitSize", "触控范围（px）", 44],
    ])
      fn14(
        v232 === "size" ? v229 : v230,
        v233,
        () => arg161[v232] ?? v234,
        (arg168) => {
          ((arg161[v232] = arg168), fn10());
        },
      );
    const v235 = fn21("按钮位置"),
      v236 = v30("div", "i3d-coordinate-grid");
    v235.append(v236);
    const v237 = map7[0],
      v238 = value2.floors
        .find((arg169) => arg169.id === arg161.floorId)
        ?.curtains?.find((arg170) => arg170.id === v237.modelId);
    for (const [v239, v240, v241, v242, v243] of [
      ["x", "位置 X", -1000000, 1000000, 1],
      ["y", "位置 Y", -1000000, 1000000, 1],
      ["height", "高度（米）", 0, 20, 0.1],
    ])
      fn13(
        v236,
        v240,
        arg161[v239] ?? v237[v239] ?? v238?.[v239] ?? 0,
        v241,
        v242,
        v243,
        (arg171) => {
          ((arg161[v239] = arg171), fn10());
        },
      );
    (v235.append(v31("一键应用到其他组合窗帘", () => fn9(arg161, true))),
      v235.append(
        v31("恢复跟随第一层入口", () => {
          for (const v244 of ["x", "y", "height"]) delete arg161[v244];
          (fn10(), fn29());
        }),
      ));
    const v245 = fn21("聚焦视角");
    v245.className += " i3d-focus-settings";
    const v246 = v30("div", "i3d-focus-actions");
    v245.append(v246);
    const v247 = async (arg172, arg173) => {
      const v248 = ++num,
        v249 = arg172 === "focus-focal-length",
        v250 = v42;
      let v251;
      ((v42 = new Promise((arg174) => {
        v251 = arg174;
      })),
        v249 || ((v41 = true), fn29()));
      try {
        if ((await v250, v37 || v248 !== num)) return;
        const focusCommand = await value3.focusCommand(
          arg172,
          curtainGroupEntryId2(arg161),
          arg173,
        );
        if (v37 || v248 !== num) return;
        arg172 === "save-light-camera"
          ? ((arg161.focusCamera = focusCommand.camera), (v40 = false), (value5 = null), fn10())
          : arg172 === "cancel-light-camera"
            ? ((v40 = false), (value5 = null))
            : ((v40 = true), (value5 = focusCommand.camera));
      } catch (v252) {
        v37 || (element7.textContent = v252.message);
      } finally {
        (v251(), !v37 && v248 === num && !v249 && ((v41 = false), fn29()));
      }
    };
    if (v40) {
      const v253 = v31("保存视角", () => void v247("save-light-camera"));
      ((v253.className = "primary"),
        v246.append(
          v253,
          v31("取消调整", () => void v247("cancel-light-camera")),
        ));
      const element44 = v30("div", "i3d-focus-actions");
      (element44.setAttribute("role", "group"),
        element44.setAttribute("aria-label", "聚焦投影"),
        v245.append(element44));
      for (const [v254, v255] of [
        ["orthographic", "正交"],
        ["perspective", "透视"],
      ]) {
        const element45 = v31(v255, () => void v247("focus-projection", v254));
        (element45.setAttribute("aria-pressed", String((value5?.mode || "orthographic") === v254)),
          element44.append(element45));
      }
      const v256 = fn13(
        v245,
        "焦段（mm）",
        Math.round(value5?.focalLength || 50),
        18,
        120,
        1,
        (arg175) => void v247("focus-focal-length", arg175),
      );
      v256.disabled = value5?.mode !== "perspective";
    } else {
      v246.append(
        v31(arg161.focusCamera ? "调整视角" : "设置视角", () => void v247("edit-light-camera")),
        v31("预览聚焦", () => void v247("preview-light-camera")),
      );
      const v257 = v31("恢复自动聚焦", async () => {
        (await v247("cancel-light-camera"), delete arg161.focusCamera, fn10(), fn29());
      });
      ((v257.className = "i3d-focus-reset"),
        (v257.disabled = !arg161.focusCamera),
        v245.append(v257));
    }
    fn21("组合管理").append(
      v30(
        "p",
        "i3d-note",
        "解除组合仅移除组合关系，恢复两层各自的入口、位置、聚焦视角与图标；不会删除模型或设备。",
      ),
      v31("解除组合", () => {
        ((structuredClone2.environment.curtainGroups = v52().filter(
          (arg176) => arg176.id !== arg161.id,
        )),
          (text = arg161.memberIds[0]),
          (text2 = ""),
          fn10(),
          fn29());
      }),
    );
    for (const element46 of element5.querySelectorAll("input, select, button"))
      (v41 || (v40 && !element46.closest(".i3d-focus-settings"))) && (element46.disabled = true);
  }
  function fn26() {
    const v258 = fn21("环境标签列表"),
      v259 = fn22(v258),
      filter4 = v50().filter((arg177) => arg177.floorId === floorSelection),
      v260 = value2.floors.find((arg178) => arg178.id === floorSelection);
    filter4.some((arg179) => arg179.id === text) || (text = filter4[0]?.id || "");
    const v261 = v31("添加环境标签", () => {
      if (!v260 || !v38) return;
      const options5 = {
        id: randomUuid2(),
        floorId: v260.id,
        label: "环境标签",
        temperatureEntityId: "",
        humidityEntityId: "",
        ...temperatureHumidityFloorCenter2(v260),
        height: 1.8,
        size: 180,
        iconSize: 12,
        hitSize: 44,
      };
      (v50().push(options5), (text = options5.id), fn29(), fn10());
    });
    ((v261.className = "primary"),
      (v261.disabled = !v38),
      v259.append(v261),
      v258.append(
        v30("p", "i3d-note", "环境标签是独立信息框，不绑定户型模型，不聚焦，不发送控制指令。"),
      ),
      filter4.length &&
        fn12(
          v258,
          "当前环境标签",
          filter4.map((arg180) => [arg180.id, arg180.label || "环境标签"]),
          text,
          (arg181) => {
            ((text = arg181), fn10(), fn29());
          },
        ));
    const v262 = filter4.find((arg182) => arg182.id === text);
    if (!v262) {
      element5.append(v258, v30("p", "i3d-note", "当前楼层还没有环境标签，请点击“添加环境标签”。"));
      return;
    }
    const v263 = fn21("显示内容（含文字）"),
      element47 = v30("input");
    ((element47.value = v262.label ?? "环境标签"),
      (element47.maxLength = 120),
      element47.addEventListener("change", () => {
        ((v262.label = element47.value.trim()), fn10());
      }),
      fn11(v263, "名称（留空隐藏）", element47));
    const element48 = v30("input");
    ((element48.type = "checkbox"),
      (element48.checked = v262.showMetricNames !== false),
      element48.addEventListener("change", () => {
        ((v262.showMetricNames = element48.checked), fn10());
      }),
      fn11(v263, "显示指标名称", element48),
      v263.append(v30("p", "i3d-note", "关闭后只显示图标、数值和单位。")));
    const v264 = ({ key: v265, label: v266 }) => {
      const v267 = v265 + "EntityId",
        v268 = v31(
          v3.find((arg183) => arg183.entityId === v262[v267])?.name ||
            v262[v267] ||
            "选择" + v266 + "实体",
          async () => {
            const v269 = ++num2;
            element7.textContent = "";
            try {
              if (!v5?.entity) throw new Error("实体选择器尚未准备好，请刷新页面。");
              value7?.close?.();
              const entity3 = await v5.entity({
                trigger: v268,
                current: v262[v267] || "",
                deviceKind: "temperature-humidity",
                domain: v265,
                title: "选择" + v266 + "实体",
                onSelect(arg184) {
                  v37 ||
                    !v38 ||
                    v269 !== num2 ||
                    !v50().includes(v262) ||
                    ((v262[v267] = arg184 || ""), fn10(), fn29());
                },
              });
              v37 || !v38 || v269 !== num2 ? entity3?.close() : (value7 = entity3);
            } catch (v270) {
              v37 || (element7.textContent = v270.message);
            }
          },
        );
      ((v268.className = "i3d-picker-button"), fn11(v263, v266 + "实体", v268));
    };
    (v264(ENVIRONMENT_BATTERY2),
      v263.append(v30("p", "i3d-note", "电量显示在名称右侧；传感器均可选，未绑定的项目不显示。")));
    for (const v271 of ENVIRONMENT_METRICS2) v264(v271);
    const v272 = fn21("位置与大小"),
      v273 = v30("div", "i3d-coordinate-grid");
    v272.append(v273);
    for (const [v274, v275, v276, v277, v278] of [
      ["x", "位置 X", -1000000, 1000000, 1],
      ["y", "位置 Y", -1000000, 1000000, 1],
      ["height", "高度（米）", 0, 20, 0.1],
    ])
      fn13(v273, v275, v262[v274] ?? 0, v276, v277, v278, (arg185) => {
        ((v262[v274] = arg185), fn10());
      });
    fn27(v272, v262, {
      width: "size",
      font: "iconSize",
      opacity: "opacity",
    });
    const v279 = v30("section", "navigation-batch-section i3d-light-batch"),
      v280 = v30("h4"),
      element49 = v30("span"),
      v281 = () => v50().filter((arg186) => arg186 !== v262 && arg186.floorId === v262.floorId);
    v280.append(v30("span", "", "环境标签设置一键应用"), element49);
    const v282 = v31("一键应用到其他环境标签", () => fn28(v262));
    ((element49.textContent = v281().length + " 个同层目标"), v279.append(v280, v282));
    const v283 = fn21("绑定管理");
    (v283.append(
      v31("删除此环境标签", () => {
        (v51(v50().filter((arg187) => arg187.id !== v262.id)), (text = ""), fn10(), fn29());
      }),
    ),
      element5.append(v258, v263, v272, v279, v283));
  }
  function fn27(arg188, arg189, arg190) {
    const v284 = fn22(arg188);
    for (const [v285, v286, v287, v288, v289] of [
      [arg190.width, "信息框宽度（px）", 180, 100, 600],
      [arg190.font, "文字大小（px）", 12, 9, 24],
    ])
      fn13(
        v284,
        v286,
        arg189[v285] ?? v287,
        v288,
        v289,
        "any",
        (arg191) => {
          ((arg189[v285] = arg191), fn10());
        },
        "number",
        v21,
      );
    const value10 = v21 ? fn22(arg188) : null;
    value10 &&
      fn12(
        value10,
        "排列方式",
        [
          ["0", "自动"],
          ...[1, 2, 3, 4].map((arg192) => [String(arg192), "每行 " + arg192 + " 项"]),
        ],
        String(arg189.columns ?? 0),
        (arg193) => {
          ((arg189.columns = Number(arg193)), fn10());
        },
      );
    const element50 = appendBackgroundOpacityControl2(arg188, arg189, arg190.opacity, fn10);
    value10 &&
      (value10.append(element50.parentElement),
      arg188.append(
        v30("p", "i3d-note", "自动随宽度排列；固定每行项数时，窄框内容会自动换行适配。"),
      ));
  }
  function fn28(arg194) {
    v37 ||
      !v38 ||
      value9 ||
      (value9 = openBatchApply2({
        title: "应用环境标签设置",
        source: arg194,
        targets: v50().filter(
          (arg195) => arg195.id !== arg194.id && arg195.floorId === arg194.floorId,
        ),
        fields: [
          {
            key: "height",
            label: "高度",
            unit: " 米",
            fallback: 1.8,
            optional: true,
            format: (arg196) => Number(arg196).toFixed(1),
          },
          {
            key: "size",
            label: "信息框宽度",
            unit: " px",
            fallback: 180,
          },
          {
            key: "iconSize",
            label: "文字大小",
            unit: " px",
            fallback: 12,
          },
          {
            key: "opacity",
            label: "背景不透明度",
            unit: "%",
            fallback: 1,
            format: (arg197) => Math.round(arg197 * 100),
          },
          {
            key: "columns",
            label: "排列方式",
            fallback: 0,
            format: (arg198) => (arg198 ? "每行 " + arg198 + " 项" : "自动"),
          },
          {
            key: "showMetricNames",
            label: "显示指标名称",
            fallback: true,
            format: (arg199) => (arg199 ? "显示" : "隐藏"),
          },
        ],
        onClose: () => {
          value9 = null;
        },
        onApply: (arg200, arg201) => {
          if (v37 || !v38) throw new Error("配置不可用");
          for (const v290 of arg200) copyBatchFields2(v290, arg194, arg201);
          (fn10(),
            fn29(),
            (element17.textContent = "已应用到 " + arg200.length + " 个环境标签，待保存配置"));
        },
      }));
  }
  function fn29() {
    ((v44 = () => {}),
      (v45 = () => {}),
      (v46 = () => {}),
      (v47 = () => {}),
      (v48 = () => {}),
      (v62 = () => {}),
      element5.replaceChildren());
    let v291 = element5;
    if (v11) {
      fn20();
      return;
    }
    if (value2) {
      if (
        ((v291 = fn22(fn21("配置范围"))),
        fn12(
          v291,
          "配置楼层",
          value2.floors.map((arg202) => [arg202.id, arg202.name]),
          floorSelection,
          (arg203) => {
            (num2++, value7?.close(), (floorSelection = arg203), fn29(), fn10());
          },
        ),
        includes2 &&
          fn12(
            v291,
            "设备类别",
            [
              ["nas", "NAS"],
              ["television", "电视"],
              ["speaker", "智能音响"],
              ["water-heater", "热水器"],
              ["airer", "晾衣架"],
              ...GENERIC_DEVICE_KINDS2.map((arg204) => [
                arg204,
                genericDeviceProfile2(arg204).label,
              ]),
            ],
            v7,
            (arg205) => {
              arg205 !== v7 && fn16(arg205);
            },
          ),
        includes &&
          fn12(
            v291,
            "环境类别",
            [
              ["climate", "空调/浴霸"],
              ["cover", "窗帘"],
              ["fan", "电风扇"],
              ["purifier", "空气净化器"],
              ["temperature-humidity", "环境标签"],
            ],
            v7,
            (arg206) => {
              arg206 !== v7 && fn16(arg206);
            },
          ),
        v12 &&
          fn12(
            v291,
            "配置内容",
            [
              ["vacuum", "设备与地图"],
              ["vacuum-shortcut", "快捷指令"],
            ],
            v7,
            (arg207) => {
              arg207 !== v7 && fn16(arg207);
            },
          ),
        v21)
      ) {
        (fn26(), element5.append(element7), (element18.disabled = v43 || !v38));
        return;
      }
      if (!v22 && structuredClone2.lightingMode === "region") {
        const v292 = fn21("照射范围"),
          element51 = v31("编辑照射范围", async () => {
            if (!v39) {
              ((v39 = true), (element51.disabled = true));
              try {
                const v293 = await openInteraction3dRangeEditor2({
                  component: {
                    ...v1,
                    properties: structuredClone(v114()),
                  },
                  document: v2,
                  states: v4,
                  onSave(arg208) {
                    if (v37 || !v38) throw new Error("灯光配置已关闭，请重新打开。");
                    ((structuredClone2.lightRegionOverrides = structuredClone(arg208)), fn10());
                  },
                  onClose() {
                    ((value4 = null), (v39 = false), v37 || fn29());
                  },
                });
                if (v37 || !v38) {
                  v293.close();
                  return;
                }
                value4 = v293;
              } catch (v294) {
                ((v39 = false), v37 || (element7.textContent = v294.message));
              } finally {
                v37 || fn29();
              }
            }
          });
        if (!element51) return;
        ((element51.dataset ||= {}),
          (element51.dataset.interaction3dRangeEditor = "true"),
          (element51.disabled = v39 || !structuredClone2.sceneId),
          v292.append(
            element51,
            v30(
              "p",
              "i3d-note",
              "在独立弹窗中拖动范围；保存范围后，再点击“保存配置”保存到当前控件。",
            ),
          ));
      }
      ((v291 = fn21(v22 ? "模型列表" : "灯光列表")), (v291.className += " i3d-compact-list"));
      const v295 = v30("div", "i3d-light-heading"),
        v296 = fn15(),
        v297 = v31("添加" + v23, fn18);
      ((v297.disabled = !v296.length),
        (v295.className = "i3d-config-list-row"),
        v291.append(v295),
        v295.append(v297));
      const set3 = new Set(v18 ? v52().flatMap((arg209) => arg209.memberIds) : []),
        filter5 = (
          v18
            ? [
                ...v52().map((arg210) => ({
                  ...arg210,
                  id: curtainGroupEntryId2(arg210),
                  label: (arg210.label || "双层窗帘") + "（组合）",
                })),
                ...v50().filter((arg211) => !set3.has(arg211.id)),
              ]
            : v50()
        ).filter(
          (arg212) =>
            arg212.floorId === floorSelection ||
            (v22 && !value2.floors.some((arg213) => arg213.id === arg212.floorId)),
        ),
        v298 = text2 ? curtainGroupEntryId2(v53(text2)) : v54();
      (!filter5.some((arg214) => arg214.id === v298) && !text2 && (text = filter5[0]?.id || ""),
        filter5.length &&
          fn12(
            v295,
            includes2 ? "当前设备" : "当前按钮",
            filter5.map((arg215) => [arg215.id, arg215.label]),
            v298,
            (arg216) => {
              (num2++, value7?.close(), (text = arg216), (text2 = ""), fn10(), fn29());
            },
          ));
      const v299 = v18 && v52().find((arg217) => curtainGroupEntryId2(arg217) === text);
      if (v299) {
        (fn25(v299), element5.append(element7), (element18.disabled = v43 || !v38 || v40 || v41));
        return;
      }
      const vector = v50().find((arg218) => arg218.id === text);
      if (vector) {
        const v300 = v31(includes2 ? "删除此设备" : "删除此" + v23 + "按钮", () => {
          (num2++,
            value7?.close(),
            v51(v50().filter((arg219) => arg219.id !== vector.id)),
            v18 &&
              v53(vector.id) &&
              (structuredClone2.environment.curtainGroups = v52().filter(
                (arg220) => !arg220.memberIds.includes(vector.id),
              )),
            (text = ""),
            (text2 = ""),
            fn10(),
            fn29());
        });
        v300.className = "i3d-remove-light";
        const v301 = v18 && v53(vector.id);
        (v301 &&
          fn21("组合成员").append(
            v30(
              "p",
              "i3d-note",
              "这里只调整成员模型、实体、图标和帘布；入口位置、大小、隐藏方式和聚焦视角由组合统一管理。",
            ),
            v31("返回组合入口设置", () => {
              ((text = curtainGroupEntryId2(v301)), (text2 = ""), fn10(), fn29());
            }),
          ),
          (v291 = fn21("基础绑定")));
        const v302 = v7 === "climate" && vector.climateType === "bath-heater",
          v303 = v7 === "purifier",
          v304 = v7 === "water-heater",
          v305 = v302 || v303 || v304;
        (v305 && !vector.entityId && (vector.clickAction = "focus"),
          v7 === "climate" &&
            fn12(
              v291,
              "设备类型",
              [
                ["air-conditioner", "空调"],
                ["bath-heater", "浴霸"],
              ],
              vector.climateType || "air-conditioner",
              (arg221) => {
                ((vector.climateType = arg221),
                  arg221 === "air-conditioner" &&
                    (vector.entityId?.startsWith("fan.") && (vector.entityId = ""),
                    delete vector.bathEffects,
                    delete vector.deviceId,
                    delete vector.deviceName),
                  fn10(),
                  fn29());
              },
            ));
        const v306 = v291,
          v307 = fn22(v306),
          element52 = v30("input");
        if (
          ((element52.value = vector.label),
          (element52.maxLength = 128),
          element52.addEventListener("change", () => {
            ((vector.label = element52.value.trim() || v23), fn10());
          }),
          fn11(v307, "名称", element52),
          v22)
        ) {
          const flatMap2 = value2.floors
              .filter((arg222) => arg222.id === floorSelection)
              .flatMap((arg223) =>
                (arg223[v25] || [])
                  .filter(
                    (arg224) =>
                      !v50().some(
                        (arg225) =>
                          arg225 !== vector &&
                          arg225.floorId === arg223.id &&
                          arg225.modelId === arg224.id,
                      ),
                  )
                  .map((arg226) => ({
                    floor: arg223,
                    model: arg226,
                    key: arg223.id + "/" + arg226.id,
                  })),
              ),
            v308 = vector.floorId + "/" + vector.modelId,
            some = flatMap2.some((arg227) => arg227.key === v308),
            map8 = flatMap2.map((arg228) => [arg228.key, v28(arg228.model)]);
          (some || map8.unshift([v308, "原模型已移除，请重新选择"]),
            fn12(v307, "关联" + v23 + "模型", map8, v308, (arg229) => {
              const v309 = flatMap2.find((arg230) => arg230.key === arg229);
              !v309 ||
                arg229 === v308 ||
                ((vector.floorId = v309.floor.id),
                (vector.modelId = v309.model.id),
                delete vector.focusCamera,
                delete vector.followCamera,
                fn10(),
                fn29());
            }),
            some ||
              v291.append(
                v30(
                  "p",
                  "i3d-note",
                  "原模型已移除，请重新选择。已保存的实体绑定和按钮设置仍然保留。",
                ),
              ));
        }
        v291 = v306;
        const v310 = (arg231) => {
            const v311 = v3.find((arg232) => arg232.entityId === arg231);
            return v311?.deviceId || v311?.device_id || "";
          },
          v312 = () => vector.deviceId || v310(vector.entityId),
          v313 = (arg233, arg234) => {
            const element53 = v30(
              "dialog",
              "settings-dialog i3d-add-dialog i3d-device-change-dialog",
            );
            ((value6 = element53), element53.setAttribute("aria-label", "更换设备"));
            const v314 = v30("div", "dialog-heading");
            v314.append(v30("h2", "", "更换设备"));
            const v315 = v30("div", "i3d-add-dialog-body", arg234),
              v316 = v30("div", "dialog-actions"),
              v317 = v31("确定更换", () => {
                (fn17(), !v37 && v38 && v50().includes(vector) && arg233());
              });
            ((v317.className = "primary"),
              v316.append(v31("取消", fn17), v317),
              element53.append(v314, v315, v316),
              element4.append(element53),
              element53.addEventListener("cancel", (arg235) => {
                (arg235.preventDefault(), fn17());
              }),
              element53.showModal());
          },
          v318 = async (arg236, arg237) => {
            const v319 = ++num2;
            element7.textContent = "";
            try {
              const v320 = v5?.[arg236 === "powerEntity" ? "entity" : arg236];
              if (!v320) throw new Error("选择器尚未准备好，请保存后刷新页面。");
              const v321 = await v320({
                trigger: arg237,
                deviceIcon: v26,
                deviceKind:
                  arg236 === "powerEntity" ? "television-power" : v302 ? "bath-heater" : v7,
                entityFilter:
                  v305 && arg236 === "entity" && vector.deviceId
                    ? (arg238) => (arg238.deviceId || arg238.device_id) === vector.deviceId
                    : undefined,
                current:
                  arg236 === "device"
                    ? v305
                      ? v312()
                      : vector.deviceId
                    : arg236 === "vacuum"
                      ? vector.deviceId
                      : arg236 === "powerEntity"
                        ? vector.powerEntityId
                        : arg236 === "nas"
                          ? vector.statusSource?.deviceId
                          : arg236 === "icon"
                            ? vector.icon
                            : vector.entityId,
                onSelect(arg239, arg240) {
                  if (!(v37 || !v38 || v319 !== num2 || !v50().includes(vector))) {
                    if (
                      ((arg236 === "entity" || arg236 === "powerEntity") &&
                        ((v3 = v5.entityCatalog?.() || v3),
                        arg240?.entityId === arg239 &&
                          (v3 = [...v3.filter((arg241) => arg241.entityId !== arg239), arg240])),
                      arg236 === "device")
                    ) {
                      const deviceId2 = v305 ? v312() : vector.deviceId,
                        text6 = arg239?.deviceId || "",
                        v322 =
                          v305 &&
                          !!(
                            vector.entityId ||
                            vector.extraControls?.length ||
                            vector.bathEffects?.length ||
                            vector.airflowEntityId ||
                            vector.workingState ||
                            vector.statusRules
                          ),
                        v323 = deviceId2 !== text6 || (!text6 && v322),
                        v324 = () => {
                          v323 &&
                            ((vector.extraControls = []),
                            delete vector.bathEffects,
                            delete vector.airflowEntityId,
                            delete vector.workingState,
                            delete vector.statusRules,
                            delete vector.batteryEntityId,
                            delete vector.chargingEntityId,
                            delete vector.chargingStates);
                          const v325 = v305 && !!text6 && deviceId2 === text6;
                          if (
                            ((vector.deviceId = arg239?.deviceId || ""),
                            (vector.deviceName = arg239?.name || ""),
                            v325 || (vector.entityId = ""),
                            arg239 &&
                              (map.set(arg239.deviceId, arg239),
                              (v3 = [
                                ...v3.filter(
                                  (arg242) =>
                                    (arg242.deviceId || arg242.device_id) !== arg239.deviceId,
                                ),
                                ...arg239.entities,
                              ])),
                            v7 === "smallcar")
                          ) {
                            const v326 = standardCarBindings2(
                              deviceEntityCatalog2(v3, vector.deviceId, value8 || v4),
                            );
                            for (const v327 of ["batteryEntityId", "chargingEntityId"])
                              vector[v327] || (vector[v327] = v326[v327]);
                          }
                          (fn10(), fn29());
                        };
                      (deviceId2 || v322) && v323
                        ? v313(
                            v324,
                            v305
                              ? "更换或解绑设备将清空原主实体、附加功能和" +
                                  (v304 ? "指示灯" : "效果") +
                                  "规则。取消保留原配置，保存后生效。"
                              : "更换或解绑设备将清空弹窗内容及状态灯规则，保存后生效。",
                          )
                        : v324();
                      return;
                    } else {
                      if (arg236 === "vacuum")
                        ((vector.deviceId = arg239?.deviceId || ""),
                          (vector.deviceName = arg239?.name || ""),
                          (vector.entityId =
                            arg239?.entities.length === 1 ? arg239.entities[0].entityId : ""),
                          (vector.relatedEntityIds = arg239?.relatedEntityIds || []),
                          (vector.map = {
                            entityId: arg239?.maps.length === 1 ? arg239.maps[0].entityId : "",
                          }),
                          arg239 &&
                            ((vector.label = arg239.name), map.set(arg239.deviceId, arg239)));
                      else {
                        if (arg236 === "powerEntity")
                          arg239 ? (vector.powerEntityId = arg239) : delete vector.powerEntityId;
                        else {
                          if (arg236 === "nas") {
                            if (arg239) {
                              if (vector.statusSource?.deviceId === arg239.deviceId) {
                                const map9 = new Map(
                                  vector.statusSource.metrics.map((arg243, arg244) => [
                                    arg243.entityId,
                                    arg244,
                                  ]),
                                );
                                arg239.metrics.sort(
                                  (arg245, arg246) =>
                                    (map9.get(arg245.entityId) ?? Infinity) -
                                    (map9.get(arg246.entityId) ?? Infinity),
                                );
                              }
                              if (
                                (vector.statusSource?.deviceId === arg239.deviceId &&
                                  Array.isArray(vector.statusSource.groupOrder) &&
                                  (arg239.groupOrder = [...vector.statusSource.groupOrder]),
                                vector.statusSource?.deviceId === arg239.deviceId &&
                                  Array.isArray(vector.statusSource.visibleMetrics))
                              ) {
                                const set4 = new Set(vector.statusSource.visibleMetrics);
                                arg239.visibleMetrics = arg239.metrics
                                  .filter((arg247) => set4.has(arg247.entityId))
                                  .map((arg248) => arg248.entityId);
                              }
                              ((vector.statusSource = arg239),
                                (vector.entityId = ""),
                                (vector.clickAction = "focus-panel"));
                            } else delete vector.statusSource;
                          } else {
                            if (arg236 === "icon") vector.icon = arg239;
                            else {
                              if (v305) {
                                const v328 = v312(),
                                  v329 = arg239 ? v310(arg239) : v328;
                                if (arg239 && vector.deviceId && v329 !== vector.deviceId) {
                                  element7.textContent =
                                    "主实体必须属于已绑定的设备；如需更换，请先更换绑定设备。";
                                  return;
                                }
                                const v330 = !!(
                                    arg239 &&
                                    arg239 !== vector.entityId &&
                                    (!v328 || v328 !== v329)
                                  ),
                                  v331 = () => {
                                    (v330
                                      ? ((vector.extraControls = []),
                                        delete vector.bathEffects,
                                        delete vector.airflowEntityId,
                                        delete vector.workingState,
                                        delete vector.statusRules,
                                        delete vector.deviceName)
                                      : v302 &&
                                        (vector.bathEffects = (vector.bathEffects || []).filter(
                                          (arg249) =>
                                            arg249.entityId !== vector.entityId ||
                                            arg249.entityId === arg239 ||
                                            vector.extraControls?.some(
                                              (arg250) => arg250.entityId === arg249.entityId,
                                            ),
                                        )),
                                      !arg239 && v328 && (vector.deviceId = v328),
                                      (vector.entityId = arg239),
                                      v303 &&
                                        vector.airflowEntityId === arg239 &&
                                        delete vector.airflowEntityId,
                                      (vector.extraControls = (vector.extraControls || []).filter(
                                        (arg251) => arg251.entityId !== arg239,
                                      )),
                                      fn10(),
                                      fn29());
                                  };
                                v330 &&
                                (vector.extraControls?.length ||
                                  vector.bathEffects?.length ||
                                  vector.airflowEntityId ||
                                  vector.workingState ||
                                  vector.statusRules)
                                  ? v313(
                                      v331,
                                      "更换为另一台设备的主实体将清空原附加功能和" +
                                        (v304 ? "指示灯" : "效果") +
                                        "规则。取消保留原配置，保存后生效。",
                                    )
                                  : v331();
                                return;
                              } else {
                                if (
                                  ["climate", "airer", "fan", "purifier", "water-heater"].includes(
                                    v7,
                                  ) &&
                                  (vector.extraControls?.length ||
                                    vector.workingState ||
                                    vector.statusRules) &&
                                  purifierDeviceChanged2(v3, vector.entityId, arg239)
                                ) {
                                  const element54 = v30(
                                    "dialog",
                                    "settings-dialog i3d-add-dialog i3d-device-change-dialog",
                                  );
                                  ((value6 = element54),
                                    element54.setAttribute("aria-label", "更换" + v23 + "设备"));
                                  const v332 = v30("div", "dialog-heading");
                                  v332.append(v30("h2", "", "更换" + v23 + "设备"));
                                  const v333 = v30(
                                      "div",
                                      "i3d-add-dialog-body",
                                      "更换设备会清除当前附加功能和指示灯规则，避免使用旧设备状态。取消将保留原绑定；外层保存后才正式生效。",
                                    ),
                                    v334 = v30("div", "dialog-actions"),
                                    v335 = v31("确定更换", () => {
                                      ((vector.entityId = arg239),
                                        (vector.extraControls = []),
                                        delete vector.workingState,
                                        delete vector.statusRules,
                                        fn17(),
                                        fn10(),
                                        fn29());
                                    });
                                  ((v335.className = "primary"),
                                    v334.append(v31("取消", fn17), v335),
                                    element54.append(v332, v333, v334),
                                    element4.append(element54),
                                    element54.addEventListener("cancel", (arg252) => {
                                      (arg252.preventDefault(), fn17());
                                    }),
                                    element54.showModal());
                                  return;
                                } else
                                  ((vector.entityId = arg239),
                                    [
                                      "climate",
                                      "airer",
                                      "fan",
                                      "purifier",
                                      "water-heater",
                                    ].includes(v7) &&
                                      (vector.extraControls = (vector.extraControls || []).filter(
                                        (arg253) => arg253.entityId !== arg239,
                                      )));
                              }
                            }
                          }
                        }
                      }
                    }
                    (fn10(), fn29());
                  }
                },
              });
              v37 || !v38 || v319 !== num2 ? v321?.close() : (value7 = v321);
            } catch (v336) {
              !v37 && v319 === num2 && (element7.textContent = v336.message);
            }
          },
          v337 = v3.find((arg254) => arg254.entityId === vector.entityId);
        if (v20) {
          const v338 = v31(
            vector.statusSource?.name || "选择飞牛或群晖",
            () => void v318("nas", v338),
          );
          if (
            ((v338.className = "i3d-picker-button"),
            fn11(v291, "NAS 数据来源", v338),
            vector.statusSource)
          ) {
            const v339 =
                vector.statusSource.visibleMetrics?.length ?? vector.statusSource.metrics.length,
              v340 = v31("选择显示内容（" + v339 + " 项）", () => fn8(vector));
            ((v340.className = "i3d-picker-button"),
              vector.statusSource.metrics.length && v291.append(v340));
          }
          v291.append(
            v30(
              "p",
              "i3d-note",
              vector.statusSource
                ? vector.statusSource.metrics.length
                  ? "已匹配 " +
                    vector.statusSource.metrics.length +
                    " 项状态。点击数据来源可重新匹配；弹窗只展示状态。"
                  : "已关联 NAS，暂未找到启用的状态指标。请在 Home Assistant 启用指标并同步目录，再点击数据来源重新匹配。"
                : "选择整台 NAS，自动匹配 CPU、内存、温度、存储和网络。无需逐个选择传感器。",
            ),
          );
        }
        const v341 = v31("", () => void v318("entity", v341));
        if (
          ((v341.className = "i3d-picker-button"),
          (v341.title = vector.entityId || (v22 ? "选择" + v23 + "实体" : "选择灯或开关")),
          v341.append(
            v30(
              "span",
              "",
              v337?.name || vector.entityId || (v22 ? "选择" + v23 + "实体" : "选择灯或开关"),
            ),
          ),
          !v16 &&
            !v12 &&
            (!v20 || (!vector.statusSource && vector.entityId)) &&
            fn11(
              v291,
              v20 ? "指示灯状态实体（旧版兼容）" : v305 ? "主实体（选填）" : "绑定实体",
              v341,
            ),
          v305)
        ) {
          const v342 = v31(
            vector.deviceName ||
              vector.deviceId ||
              (v312()
                ? "跟随主实体所属设备"
                : "选择" + (v304 ? "热水器" : v303 ? "净化器" : "浴霸") + "设备"),
            () => void v318("device", v342),
          );
          ((v342.className = "i3d-picker-button"),
            fn11(v291, "绑定设备", v342),
            v291.append(
              v30(
                "p",
                "i3d-note",
                v304
                  ? "有热水器主实体可直接选择；没有就绑定设备，在附加功能中选择开关、温度、模式和状态。各功能独立控制。"
                  : v303
                    ? "有主实体可直接选择；没有就绑定设备，在附加功能中选择开关、模式和状态。各功能独立控制。"
                    : "有标准主实体时可直接选择；没有主实体时，绑定设备并在附加功能中 DIY 暖风、换气和照明等控制。两者同时选择时须属于同一设备。主实体开关只控制主实体。",
              ),
            ));
        }
        if (
          (v15 &&
            v291.append(
              v30(
                "p",
                "i3d-note",
                "绑定 media_player 后，播放、音量、进度和媒体库等控制按实体能力自动显示。播放时顶部彩色呼吸，暂停时微亮，空闲或离线时熄灭。",
              ),
            ),
          v16)
        ) {
          const v343 = v31(vector.deviceName || "选择设备", () => void v318("device", v343));
          if (
            ((v343.className = "i3d-picker-button"),
            fn11(v291, "绑定设备", v343),
            genericDeviceProfile2(v7).statusIndicator !== false)
          ) {
            const v344 = fn21("状态灯（可选）");
            fn23(v344, vector);
          } else delete vector.statusRules;
        }
        if (v7 === "smallcar") {
          const v345 = fn21("车辆状态"),
            v346 = deviceEntityCatalog2(v3, vector.deviceId, value8 || v4);
          for (const [v347, v348, v349] of [
            ["batteryEntityId", "电量实体（%）", ["sensor"]],
            ["chargingEntityId", "充电状态实体", ["binary_sensor", "sensor"]],
          ]) {
            const map10 = v346
              .filter(
                (arg255) =>
                  v349.includes(arg255.entityId.split(".")[0]) &&
                  arg255.enabled !== false &&
                  !["missing", "disabled"].includes(arg255.status),
              )
              .map((arg256) => [
                arg256.entityId,
                (arg256.name || arg256.entityId) + " · " + arg256.entityId,
              ]);
            (vector[v347] &&
              !map10.some(([v350]) => v350 === vector[v347]) &&
              map10.unshift([vector[v347], vector[v347] + "（失效或不属于当前设备）"]),
              fn12(v345, v348, [["", "未绑定"], ...map10], vector[v347] || "", (arg257) => {
                ((vector[v347] = arg257),
                  v347 === "chargingEntityId" && delete vector.chargingStates,
                  fn10(),
                  fn29());
              }));
          }
          const element55 = v30("p", "i3d-note i3d-car-raw-state");
          (element55.setAttribute("aria-live", "polite"), v345.append(element55));
          const v351 = v30("details", "i3d-car-charging-settings");
          ((v351.open = !!vector.chargingStates),
            v351.append(v30("summary", "", "自定义充电识别（可选）")),
            v351.append(
              v30(
                "p",
                "i3d-note",
                "在 HA 中查看充电状态实体，充电和不充电时显示什么文字，就分别填入对应输入框。两项都留空则自动识别。",
              ),
            ));
          const options6 = {},
            element56 = v30("p", "i3d-error");
          element56.setAttribute("role", "status");
          const element57 = v30("p", "i3d-note");
          for (const [v352, v353, v354] of [
            ["inactive", "不充电状态值", "填写不充电时的文字"],
            ["active", "充电状态值", "填写充电时的文字"],
          ]) {
            const element58 = v30("input");
            ((element58.type = "text"),
              (element58.maxLength = 120),
              (element58.placeholder = v354),
              element58.setAttribute("aria-label", v353),
              (element58.value =
                typeof vector.chargingStates?.[v352] == "string"
                  ? vector.chargingStates[v352]
                  : ""),
              (element58.disabled = !vector.chargingEntityId),
              (options6[v352] = element58),
              fn11(v351, v353, element58),
              element58.addEventListener("input", () => {
                const options7 = {
                  inactive: options6.inactive.value.trim(),
                  active: options6.active.value.trim(),
                };
                (options7.active || options7.inactive
                  ? (vector.chargingStates = options7)
                  : delete vector.chargingStates,
                  (element56.textContent = vector.chargingStates
                    ? carChargingMappingError2(options7)
                    : ""));
                for (const v355 of Object.values(options6))
                  v355.setCustomValidity(element56.textContent);
                (fn10(), v44());
              }));
          }
          (v351.append(element56, element57),
            v345.append(v351),
            (v44 = () => {
              const v356 = carState2(vector, value8 || v4),
                text7 = vector.chargingEntityId
                  ? v356.chargingRaw
                    ? "当前原始状态：" + v356.chargingRaw
                    : "当前原始状态：" + v356.status + "，请等待实体恢复后再填写。"
                  : "当前原始状态：请先选择充电状态实体。";
              element55.textContent !== text7 && (element55.textContent = text7);
              const v357 =
                "当前识别：" +
                (v356.charging === true
                  ? "充电中"
                  : v356.charging === false
                    ? "不充电"
                    : "未匹配") +
                "。";
              element57.textContent !== v357 && (element57.textContent = v357);
            }),
            v44());
          const v358 = fn21("汽车状态卡片");
          fn27(v358, vector, {
            width: "cardWidth",
            font: "cardFontSize",
            opacity: "cardOpacity",
          });
        }
        if (v19) {
          v291.append(
            v30(
              "p",
              "i3d-note",
              "顶部安装高度和最大伸展距离在户型图中调整。100%为最高，0%为最低；模型跟随设备反馈。",
            ),
          );
          const element59 = v30("input");
          ((element59.type = "number"),
            (element59.min = "5"),
            (element59.max = "180"),
            (element59.step = "1"),
            (element59.value = String(vector.travelSeconds || 20)),
            element59.addEventListener("change", () => {
              ((vector.travelSeconds = Math.max(5, Math.min(180, Number(element59.value) || 20))),
                fn10());
            }),
            fn11(v291, "无位置回传时全程耗时（秒）", element59));
        }
        if (v7 === "water-heater") {
          const v359 = fn21("指示灯规则（可选）"),
            v360 = v312();
          (fn23(v359, vector, {
            deviceId: v360,
            standardOnly: true,
          }),
            v360 ||
              v359.append(
                v30(
                  "p",
                  "i3d-note",
                  vector.entityId
                    ? "当前实体没有可用的 HA 设备归属，请同步设备目录后重新打开配置，或更换绑定实体。"
                    : "先选择主实体或绑定设备，再选择指示灯状态。",
                ),
              ));
        }
        if (
          ["climate", "airer", "fan", "purifier", "water-heater"].includes(v7) ||
          (v16 && v7 !== "smallcar")
        ) {
          let v361 = function () {
            const set5 = new Set((vector.extraControls || []).map((arg258) => arg258.entityId));
            element61.querySelector("summary").textContent =
              "选择附加功能（已选 " + set5.size + "/12）";
            for (const [v362, { check: element60, disabled: v363 }] of map11)
              ((element60.checked = set5.has(v362)),
                (element60.disabled = !element60.checked && (v363 || set5.size >= 12)));
          };
          const list5 = vector.extraControls || [];
          v291 = fn21("附加功能");
          const filter6 =
              v16 || v305
                ? deviceEntityCatalog2(
                    v3,
                    vector.deviceId || v337?.deviceId || v337?.device_id,
                    value8 || v4,
                  ).filter((arg259) => arg259.entityId !== vector.entityId)
                : purifierRelatedEntities2(v3, vector.entityId),
            deviceId3 =
              v16 || v305
                ? vector.deviceId || v337?.deviceId || v337?.device_id
                : v337?.deviceId || v337?.device_id,
            v364 = async () => {
              try {
                await value3?.focusCommand("preview-device-panel", vector.id);
              } catch (v365) {
                v37 || (element7.textContent = v365.message);
              }
            },
            v366 = v31("实时预览弹窗", v364);
          v291.append(
            v366,
            v30(
              "p",
              "i3d-note",
              "仅选择当前设备的附加实体，最多 12 项。预览随修改实时更新，不发送设备指令；保存后正式生效。",
            ),
          );
          const element61 = v30("details");
          element61.append(v30("summary", "", "选择附加功能（已选 " + list5.length + "/12）"));
          const element62 = v30("input");
          ((element62.placeholder = "搜索本设备实体名称或 ID"),
            element62.setAttribute("aria-label", "搜索附加实体"));
          const v367 = v30("div", "i3d-extra-entity-list"),
            map11 = new Map(),
            v368 = () => {
              (v367.replaceChildren(), map11.clear());
              const lowerCase = element62.value.trim().toLowerCase(),
                map12 = (vector.extraControls || [])
                  .filter(
                    (arg260) => !filter6.some((arg261) => arg261.entityId === arg260.entityId),
                  )
                  .map((arg262) => ({
                    entityId: arg262.entityId,
                    name: "已失效或不属于当前设备",
                    status: "missing",
                  })),
                filter7 = [...filter6, ...map12].filter((arg263) =>
                  ((arg263.name || "") + " " + arg263.entityId).toLowerCase().includes(lowerCase),
                );
              filter7.length ||
                v367.append(
                  v30(
                    "p",
                    "i3d-note",
                    deviceId3
                      ? lowerCase
                        ? "没有匹配的实体。"
                        : "该设备没有其他实体。"
                      : v16 || v305
                        ? "请先绑定设备，再选择弹窗内容。"
                        : "主实体没有设备关联，无法获取所属设备实体。",
                  ),
                );
              for (const v369 of filter7) {
                const some2 = (vector.extraControls || []).some(
                    (arg264) => arg264.entityId === v369.entityId,
                  ),
                  v370 = !!(
                    v369.disabledBy ||
                    v369.disabled_by ||
                    v369.enabled === false ||
                    ["disabled", "missing"].includes(v369.status)
                  ),
                  v371 = value8?.[v369.entityId] || v4?.get?.(v369.entityId) || v4?.[v369.entityId],
                  v372 = v371?.newState || v371,
                  v373 = v30("label", "i3d-extra-entity-row"),
                  element63 = v30("input");
                ((element63.type = "checkbox"),
                  (element63.checked = some2),
                  (element63.disabled =
                    !some2 && (v370 || (vector.extraControls || []).length >= 12)),
                  map11.set(v369.entityId, {
                    check: element63,
                    disabled: v370,
                  }));
                const v374 = v30("span");
                ((v374.title = (v369.name || v369.entityId) + "\n" + v369.entityId),
                  v374.append(
                    v30("strong", "", v369.name || v369.entityId),
                    v30("small", "", v369.entityId),
                    v30(
                      "small",
                      "",
                      extraLabels2[extraTypes2(v369.entityId)[0]] +
                        " · " +
                        (v370 ? "已禁用或移除" : v372?.state || "暂无状态"),
                    ),
                  ),
                  element63.addEventListener("change", () => {
                    const list6 = vector.extraControls || [];
                    ((vector.extraControls = element63.checked
                      ? [
                          ...list6,
                          {
                            entityId: v369.entityId,
                            type: extraTypes2(v369.entityId)[0],
                            label: "",
                          },
                        ]
                      : list6.filter((arg265) => arg265.entityId !== v369.entityId)),
                      !element63.checked &&
                        v303 &&
                        vector.airflowEntityId === v369.entityId &&
                        delete vector.airflowEntityId,
                      !element63.checked &&
                        v302 &&
                        (vector.bathEffects = (vector.bathEffects || []).filter(
                          (arg266) => arg266.entityId !== v369.entityId,
                        )),
                      fn10(),
                      v361(),
                      v364(),
                      v302 && v46(),
                      v303 && v48());
                  }),
                  v373.append(element63, v374),
                  v367.append(v373));
              }
            };
          ((element61.className = "i3d-extra-chooser"),
            element62.addEventListener("input", v368),
            v368(),
            element61.append(element62, v367),
            v291.append(element61),
            element61.addEventListener("toggle", () => {
              element61.open && v364();
            }));
        }
        if (v302) {
          const v375 = fn21("出风动画"),
            v376 = v30("div");
          (v375.append(v376),
            (v46 = () => {
              (v376.replaceChildren(),
                (v45 = bathEffectEditor2({
                  item: vector,
                  entities: v3,
                  states: () => value8 || v4,
                  host: v376,
                  node: v30,
                  button: v31,
                  select: fn12,
                  field: fn11,
                  update: fn10,
                  redraw: v46,
                })));
            }),
            v46());
        }
        if (v303) {
          const v377 = fn21("出风动画");
          ((v48 = () => {
            (v377.replaceChildren(v30("h4", "", "出风动画")),
              v377.append(
                v30(
                  "p",
                  "i3d-note",
                  "有主实体时默认自动跟随。DIY 选择运行开关，开启就出风，关闭就停止。",
                ),
              ));
            const set6 = new Set((vector.extraControls || []).map((arg267) => arg267.entityId)),
              map13 = v3
                .filter(
                  (arg268) =>
                    set6.has(arg268.entityId) &&
                    /^(switch|fan|binary_sensor|input_boolean)\./.test(arg268.entityId),
                )
                .map((arg269) => [arg269.entityId, arg269.name || arg269.entityId]);
            (vector.airflowEntityId &&
              !map13.some(([v378]) => v378 === vector.airflowEntityId) &&
              map13.unshift([vector.airflowEntityId, vector.airflowEntityId + "（当前不可用）"]),
              fn12(
                v377,
                "出风跟随",
                [["", vector.entityId ? "主实体（自动）" : "请选择运行开关"], ...map13],
                vector.airflowEntityId || "",
                (arg270) => {
                  (arg270 ? (vector.airflowEntityId = arg270) : delete vector.airflowEntityId,
                    fn10(),
                    v47());
                },
              ));
            const element64 = v30("p", "i3d-note");
            (v377.append(element64),
              (v47 = () => {
                const v379 = purifierState2(vector, value8 || v4);
                element64.textContent =
                  "出风状态：" +
                  (v379.available ? (v379.running ? "出风中" : "已停止") : "状态未知");
              }),
              v47());
          }),
            v48());
        }
        if (v18) {
          if (!v301) {
            const v380 = v31("组合另一扇窗帘", () => fn24(vector));
            ((v380.disabled = !curtainGroupCandidates2(structuredClone2.environment, vector.id)
              .length),
              v291.append(
                v380,
                v30(
                  "p",
                  "i3d-note",
                  "选择同楼层另一扇普通窗帘；仅组合入口与弹窗，保留两层模型和设备绑定。",
                ),
              ));
          }
          v291 = fn21("帘布外观");
          const v381 = fn22(v291),
            element65 = fn12(
              v381,
              "窗帘类型",
              [
                ["standard", "普通窗帘"],
                ["roller", "卷帘"],
                ["dream", "梦幻帘"],
              ],
              vector.coverKind,
              (arg271) => {
                ((vector.coverKind = ["dream", "roller"].includes(arg271) ? arg271 : "standard"),
                  (vector.coverKindOverride = true),
                  fn10(),
                  fn29());
              },
            );
          ((element65.disabled = !!v301),
            v301 && (element65.title = "请先解除组合，再切换为梦幻帘"));
          const v382 = fn22(v291),
            v383 = value2.floors
              .find((arg272) => arg272.id === vector.floorId)
              ?.curtains?.find((arg273) => arg273.id === vector.modelId),
            v384 = fn12(
              v382,
              "帘布类型",
              [
                ["cloth", "布帘"],
                ["sheer", "纱帘"],
              ],
              vector.curtainFabricOverride === true
                ? vector.curtainFabric
                : v383?.curtainFabric || vector.curtainFabric,
              (arg274) => {
                ((vector.curtainFabric = arg274 === "sheer" ? "sheer" : "cloth"),
                  (vector.curtainFabricOverride = true),
                  fn10());
              },
            );
          v384.title = "仅修改当前3D交互的帘布，不改变户型模型或2D导图";
          const coverKind =
            vector.coverKindOverride === true
              ? vector.coverKind
              : v383?.curtainForm === "roller"
                ? "roller"
                : vector.coverKind;
          element65.value = coverKind;
          const v385 = coverKind === "roller";
          if (
            (!v385 &&
              v383?.curtainTrack &&
              v383.curtainTrack !== "straight" &&
              v291.append(
                v30(
                  "p",
                  "i3d-note",
                  (v383.curtainTrack === "u" ? "U" : "L") + " 型轨道，尺寸和合拢位置继承户型模型。",
                ),
              ),
            v385 &&
              v291.append(
                v30(
                  "p",
                  "i3d-note",
                  "卷帘垂直升降，0% 完全放下、100% 完全卷起；控制沿用普通窗帘。",
                ),
              ),
            v385 ||
              fn12(
                v382,
                "开合方向",
                [
                  ["auto", "继承模型"],
                  ["left", "向左收拢"],
                  ["right", "向右收拢"],
                  ["split", "双向收拢"],
                ],
                vector.coverDirection,
                (arg275) => {
                  ((vector.coverDirection = ["left", "right", "split"].includes(arg275)
                    ? arg275
                    : "auto"),
                    fn10());
                },
              ),
            vector.entityId)
          )
            v291.append(
              v30("p", "i3d-note", "开合状态跟随绑定实体；解除绑定后恢复预设的展示状态。"),
            );
          else {
            const list7 = [
              ["0", "关闭"],
              ["50", "半开"],
              ["100", "全开"],
            ];
            ([0, 50, 100].includes(vector.unboundPosition) ||
              list7.push([String(vector.unboundPosition), "打开 " + vector.unboundPosition + "%"]),
              fn12(v291, "未绑定时显示", list7, String(vector.unboundPosition), (arg276) => {
                ((vector.unboundPosition = Number(arg276)), fn10());
              }),
              v291.append(
                v30("p", "i3d-note", "仅设置 3D 帘布的展示状态；绑定实体后自动跟随实际开合。"),
              ));
          }
        }
        if (v12) {
          const v386 = v31(vector.deviceName || "选择扫地机设备", () => void v318("vacuum", v386));
          ((v386.className = "i3d-picker-button"), fn11(v291, "绑定设备", v386));
          const options8 = map.get(vector.deviceId) || {
            entities: v3.filter(
              (arg277) =>
                /^vacuum\./.test(arg277.entityId) &&
                (arg277.deviceId === vector.deviceId || arg277.entityId === vector.deviceId),
            ),
            maps: v3.filter(
              (arg278) =>
                /^(camera|image)\./.test(arg278.entityId) && arg278.deviceId === vector.deviceId,
            ),
          };
          (options8?.entities.length > 1
            ? fn12(
                v291,
                "扫地机主实体",
                [
                  ["", "请选择主实体"],
                  ...options8.entities.map((arg279) => [
                    arg279.entityId,
                    arg279.name || arg279.entityId,
                  ]),
                ],
                vector.entityId,
                (arg280) => {
                  ((vector.entityId = arg280), fn10());
                },
              )
            : vector.entityId && v291.append(v30("p", "i3d-note", "已识别：" + vector.entityId)),
            (v291 = fn21("地图与移动")));
          const element66 = v30("input");
          (Object.assign(element66, {
            type: "number",
            min: "0",
            max: "300",
            step: "1",
            value: String(structuredClone2.navigation?.followOffset ?? 16),
            title: "所有扫地机共用此标签偏移",
          }),
            element66.addEventListener("change", () => {
              if (!v38 || v37) return;
              const NaN5 = element66.value.trim() === "" ? NaN : Number(element66.value);
              (Number.isFinite(NaN5) &&
                ((structuredClone2.navigation = {
                  ...structuredClone2.navigation,
                  followOffset: Math.max(0, Math.min(300, NaN5)),
                }),
                fn10()),
                (element66.value = String(structuredClone2.navigation?.followOffset ?? 16)));
            }),
            fn11(v291, "跟随标签上移（px）", element66));
          for (const [v387, v388] of [
            ["motionEnabled", "跟随真实位置移动"],
            ["funMessages", "工作时显示趣味短句"],
          ]) {
            const element67 = v30("input");
            (Object.assign(element67, {
              type: "checkbox",
              checked: vector[v387] !== false,
            }),
              element67.addEventListener("change", () => {
                ((vector[v387] = element67.checked), fn10());
              }),
              fn11(v291, v388, element67));
          }
          options8?.maps.length > 1 &&
            fn12(
              v291,
              "已识别的地图",
              [
                ["", "请选择地图"],
                ...options8.maps.map((arg281) => [arg281.entityId, arg281.name || arg281.entityId]),
              ],
              vector.map?.entityId || "",
              (arg282) => {
                ((vector.map = {
                  ...vector.map,
                  entityId: arg282,
                }),
                  fn10(),
                  fn29());
              },
            );
          const v389 = v31(vector.map?.entityId || "选择扫地机地图", async () => {
            const v390 = ++num2;
            try {
              value7 = await v5.entity({
                trigger: v389,
                deviceKind: "vacuum-map",
                current: vector.map?.entityId || "",
                onSelect(arg283) {
                  v37 ||
                    !v38 ||
                    v390 !== num2 ||
                    !v50().includes(vector) ||
                    ((vector.map = {
                      ...vector.map,
                      entityId: arg283,
                    }),
                    fn10(),
                    fn29());
                },
              });
            } catch (v391) {
              element7.textContent = v391.message;
            }
          });
          ((v389.className = "i3d-picker-button"), fn11(v291, "地图来源", v389));
          const v392 = v31("底图对齐", () => {
            const v393 =
                value8 === null ? v4?.get?.(vector.map?.entityId) : value8[vector.map?.entityId],
              v394 = value8 === null ? v4?.get?.(vector.entityId) : value8[vector.entityId],
              v395 = vacuumMapIdentity2(v393, v394),
              options9 = {
                ...vector,
                map: {
                  ...vector.map,
                },
              };
            (v395 ? (options9.map.sourceMapId = v395) : delete options9.map.sourceMapId,
              (value4 = openVacuumMapEditor2({
                item: options9,
                floor: value2.floors.find((arg284) => arg284.id === vector.floorId),
                document: v2,
                getMapState: () =>
                  value8 === null ? v4?.get?.(vector.map?.entityId) : value8[vector.map?.entityId],
                pickers: v5,
                onSave(arg285) {
                  !v37 &&
                    v38 &&
                    v50().includes(vector) &&
                    ((vector.map = arg285.map), fn10(), fn29());
                },
              })));
          });
          v291.append(v392);
        }
        if (v14) {
          const v396 = v31(
            vector.powerEntityId || "不单独绑定",
            () => void v318("powerEntity", v396),
          );
          ((v396.className = "i3d-picker-button"),
            fn11(v291, "电视电源实体（可选）", v396),
            v291.append(
              v30(
                "p",
                "i3d-note",
                "可绑定任意能提供开关状态的实体：开启显示 HA BRIDGE 海报，关闭黑屏。上方绑定媒体播放器后，有节目封面时优先显示封面；不单独绑定电源时，跟随媒体播放器的开关状态。",
              ),
            ));
        }
        if (
          (v20 &&
            !vector.statusSource &&
            vector.entityId &&
            v291.append(
              v30(
                "p",
                "i3d-note",
                "旧版绑定仅按 on/off 控制指示灯，不会开关 NAS 或关联整台设备。安全状态表示告警，不应作为开机依据；选择 NAS 数据来源后将替换旧绑定。",
              ),
            ),
          v20 &&
            v291.append(
              v30(
                "p",
                "i3d-note",
                vector.statusSource
                  ? "已选择 NAS 自身状态数据作为呼吸灯依据。安全状态只用于告警。"
                  : "请先选择 NAS 数据来源，缺少 CPU 等个别指标也可绑定。",
              ),
            ),
          !v301 && v7 !== "smallcar")
        ) {
          ((v291 = fn21("交互行为")),
            fn12(
              v291,
              "点击" + v23,
              v305 && !vector.entityId
                ? [["focus", "聚焦并显示控制"]]
                : v19
                  ? [
                      ["focus", "聚焦并显示控制"],
                      ["panel", "仅显示控制"],
                    ]
                  : v15
                    ? [
                        ["focus-panel", "聚焦并显示控制"],
                        ["panel", "仅显示控制"],
                        ["focus", "仅聚焦"],
                      ]
                    : v14
                      ? [
                          ["focus-panel", "聚焦并显示控制"],
                          ["panel", "仅显示控制"],
                          ["focus", "仅聚焦"],
                          ["turn-on-focus", "开关电视（开机时聚焦）"],
                          ["turn-on", "仅开关电视"],
                          ["turn-on-panel", "开关电视（开机时显示控制）"],
                        ]
                      : v13
                        ? [
                            ["focus-panel", v16 ? "聚焦并显示弹窗" : "聚焦并显示状态"],
                            ["panel", v16 ? "仅显示弹窗" : "仅显示状态"],
                            ["focus", "仅聚焦"],
                          ]
                        : v18
                          ? [
                              ["focus", "聚焦并显示控制"],
                              ["panel", "仅显示控制"],
                              ["turn-on-focus", "开合窗帘（打开时聚焦）"],
                              ["turn-on", "仅开合窗帘"],
                              ["turn-on-panel", "开合窗帘（打开时显示控制）"],
                            ]
                          : v17
                            ? [
                                ["focus", "聚焦并显示控制"],
                                ["turn-on-focus", "开关" + v23 + "（开启时聚焦）"],
                                ["turn-on", "仅开关" + v23],
                                ["turn-on-panel", "开关" + v23 + "（开启时显示控制）"],
                              ]
                            : [
                                ["focus", "聚焦并显示控制"],
                                ["turn-on-focus", "开关灯（开灯时聚焦）"],
                                ["turn-on", "仅开关灯"],
                                ["turn-on-panel", "开关灯（开灯时显示控制）"],
                              ],
              vector.clickAction,
              (arg286) => {
                ((vector.clickAction = v29(arg286)), fn10());
              },
            ),
            v18
              ? v291.append(
                  v30(
                    "p",
                    "i3d-note",
                    "开关类行为：完全关闭时打开，已打开或半开时关闭，运动中点击先停止。仅打开时执行所选聚焦或弹窗。",
                  ),
                )
              : v305
                ? v291.append(
                    v30(
                      "p",
                      "i3d-note",
                      vector.entityId
                        ? "开关行为只操作主实体；独立功能分别在弹窗内控制。"
                        : "未绑定主实体，点击入口打开各功能控制。",
                    ),
                  )
                : !v19 &&
                  (!v13 || v14) &&
                  v291.append(
                    v30(
                      "p",
                      "i3d-note",
                      "开关类行为：已开启时直接关闭；已关闭时开启，并执行所选聚焦或弹窗。",
                    ),
                  ));
          const v397 = v30("div", "i3d-button-visibility-row");
          v291.append(v397);
          const element68 = v30("input");
          (Object.assign(element68, {
            type: "checkbox",
            checked: vector.hiddenClickable === true && vector.buttonHidden !== true,
          }),
            element68.addEventListener("change", () => {
              ((vector.hiddenClickable = element68.checked),
                element68.checked && ((vector.buttonHidden = false), (element69.checked = false)),
                fn10());
            }),
            (fn11(v397, "隐藏（可点击）", element68).parentElement.className +=
              " i3d-hidden-clickable-setting"));
          const element69 = v30("input");
          (Object.assign(element69, {
            type: "checkbox",
            checked: vector.buttonHidden === true,
          }),
            element69.addEventListener("change", () => {
              ((vector.buttonHidden = element69.checked),
                element69.checked &&
                  ((vector.hiddenClickable = false), (element68.checked = false)),
                fn10());
            }),
            (fn11(v397, "隐藏（不可点击）", element69).parentElement.className +=
              " i3d-hidden-clickable-setting"));
        }
        if (v7 !== "smallcar") {
          if (((v291 = fn21(v12 ? "状态标签" : "按钮外观")), v18)) {
            const element70 = v30("input");
            (Object.assign(element70, {
              type: "checkbox",
              checked: vector.iconStateReversed === true,
            }),
              element70.addEventListener("change", () => {
                ((vector.iconStateReversed = element70.checked), fn10());
              }),
              fn11(v291, "图标状态反向", element70));
          }
          const v398 = fn22(v291);
          if (!v12) {
            const v399 = v31("", () => void v318("icon", v399));
            v399.className = "i3d-picker-button i3d-icon-picker-button";
            const element71 = v30("i");
            element71.setAttribute("aria-hidden", "true");
            const v400 =
              "/bridge-static/vendor/mdi/7.4.47/svg/" + vector.icon.replace(/^mdi:/, "") + ".svg";
            ((element71.style.maskImage = 'url("' + v400 + '")'),
              (element71.style.webkitMaskImage = 'url("' + v400 + '")'),
              v399.append(element71, v30("span", "", vector.icon)),
              fn11(v398, "图标", v399));
          }
          if (v301) {
            (fn21("绑定管理").append(
              v30("p", "i3d-note", "删除此成员会自动解除组合，另一成员恢复原入口。"),
              v300,
            ),
              element5.append(element7),
              (element18.disabled = v43 || !v38));
            return;
          }
          const v401 = v30("div", "i3d-coordinate-grid i3d-size-grid"),
            v402 = v30("details");
          (v402.append(v30("summary", "", "更多尺寸设置"), v401), v291.append(v402));
          const v403 = () =>
            Number.isFinite(vector.hitSize) && vector.hitSize > 0
              ? vector.hitSize
              : Math.max(44, vector.size);
          (fn14(
            v398,
            v12 ? "状态框缩放（%）" : "按钮大小（px）",
            () => (v12 ? Math.round((vector.size / 44) * 100) : vector.size),
            (arg287) => {
              ((vector.size = v12 ? (arg287 / 100) * 44 : arg287),
                (v404.value = String(Number(v403().toPrecision(12)))),
                fn10());
            },
          ),
            fn14(
              v401,
              v12 ? "文字大小（px）" : "图标大小（px）",
              () => (v12 ? vector.iconSize / 2 : vector.iconSize),
              (arg288) => {
                ((vector.iconSize = v12 ? arg288 * 2 : arg288), fn10());
              },
            ));
          const v404 = fn14(v401, "触控范围（px）", v403, (arg289) => {
            ((vector.hitSize = arg289), fn10());
          });
          v12 && appendBackgroundOpacityControl2(v291, vector, "backgroundOpacity", fn10);
        }
        if (v22) {
          v291 = fn21(v12 || v7 === "smallcar" ? "标签位置" : "按钮位置");
          const v405 = value2.floors
              .find((arg290) => arg290.id === vector.floorId)
              ?.[v25]?.find((arg291) => arg291.id === vector.modelId),
            v406 = v30("div", "i3d-coordinate-grid");
          v291.append(v406);
          const element72 = v31("恢复跟随模型", () => {
            (delete vector.x, delete vector.y, delete vector.height, fn10(), fn29());
          });
          element72.disabled = !["x", "y", "height"].some((arg292) =>
            Number.isFinite(vector[arg292]),
          );
          for (const [v407, v408, v409, v410, v411] of [
            ["x", "位置 X", -1000000, 1000000, 1],
            ["y", "位置 Y", -1000000, 1000000, 1],
            ["height", "高度（米）", 0, 20, 0.1],
          ]) {
            const num4 = Number.isFinite(vector[v407])
              ? vector[v407]
              : v7 === "smallcar" && v407 !== "height"
                ? 0
                : v12 && v407 === "height"
                  ? (Number(v405?.elevation) || 0) + (Number(v405?.height) || 0.85) + 0.25
                  : Number.isFinite(v405?.[v407])
                    ? v405[v407]
                    : 0;
            fn13(
              v406,
              v7 === "smallcar" && v407 !== "height"
                ? "相对汽车偏移 " + v407.toUpperCase()
                : v12 && v407 === "height"
                  ? "离地高度（米）"
                  : v408,
              num4,
              v409,
              v410,
              v411,
              (arg293) => {
                ((vector[v407] = arg293), (element72.disabled = false), fn10());
              },
            );
          }
          v291.append(element72);
          const v412 = v30("section", "navigation-batch-section i3d-light-batch"),
            v413 = v30("h4"),
            element73 = v30("span");
          v413.append(
            v30("span", "", v7 === "smallcar" ? "卡片设置一键应用" : "图标设置一键应用"),
            element73,
          );
          const v414 = v31("一键应用到其他" + v23, () => fn9(vector));
          ((v62 = () => {
            const v415 = fn5(vector).length;
            ((element73.textContent = v415 + " 项修改"), (v414.disabled = !v38 || v40 || v41));
          }),
            v62(),
            v412.append(v413, v414),
            v291.append(v412));
        } else {
          v291 = fn21("按钮位置");
          const v416 = v30("div", "i3d-coordinate-grid");
          v291.append(v416);
          for (const v417 of ["x", "y"])
            fn13(
              v416,
              "位置 " + v417.toUpperCase(),
              vector[v417],
              -1000000,
              1000000,
              1,
              (arg294) => {
                ((vector[v417] = arg294), fn10());
              },
            );
          (fn13(v416, "高度（米）", vector.height, 0, 20, 0.1, (arg295) => {
            ((vector.height = arg295), fn10());
          }),
            fn13(v291, "缓开缓灭（秒）", vector.fadeDuration, 0, 10, 0.1, (arg296) => {
              ((vector.fadeDuration = arg296), fn10());
            }));
          const v418 = v30("section", "navigation-batch-section i3d-light-batch"),
            v419 = v30("h4"),
            element74 = v30("span");
          v419.append(v30("span", "", "灯光设置一键应用"), element74);
          const v420 = v31("一键应用到其他灯光", () => fn9(vector));
          ((v62 = () => {
            const v421 = fn5(vector).length;
            ((element74.textContent = v421 + " 项修改"),
              (v420.disabled = !v38 || v40 || v41 || v39));
          }),
            v62(),
            v418.append(v419, v420),
            v291.append(v418));
        }
        if (v7 !== "smallcar") {
          const element75 = v30("section", "i3d-focus-settings i3d-config-section");
          element5.append(element75);
          const text8 = v12 && text3 === "follow" ? "followCamera" : "focusCamera";
          if (
            (element75.append(v30("h4", "", text8 === "followCamera" ? "跟随视角" : "聚焦视角")),
            v12 && !v40)
          ) {
            const v422 = v30("div", "i3d-focus-actions");
            for (const [v423, v424] of [
              ["focus", "聚焦视角"],
              ["follow", "跟随视角"],
            ]) {
              const element76 = v31(v424, () => {
                ((text3 = v423), fn29());
              });
              (element76.setAttribute("aria-pressed", String(text3 === v423)),
                (element76.disabled = v41),
                v422.append(element76));
            }
            element75.append(v422);
          }
          text8 === "followCamera" &&
            element75.append(
              v30(
                "p",
                "i3d-note",
                "固定鸟瞰角度跟随机器人平移，不随机器人转向。调整角度和远近后保存；跟随时不弹出控制面板。",
              ),
            );
          const v425 = async (arg297, arg298) => {
              const v426 = num,
                v427 = arg297 === "focus-focal-length",
                v428 = v42;
              let v429;
              ((v42 = new Promise((arg299) => {
                v429 = arg299;
              })),
                v427 || ((v41 = true), (element7.textContent = ""), fn29()));
              try {
                if ((await v428, v37 || v426 !== num)) return;
                const focusCommand2 = await value3.focusCommand(
                  text8 === "followCamera" && arg297 === "edit-light-camera"
                    ? "edit-follow-camera"
                    : arg297,
                  vector.id,
                  arg298,
                );
                if (v37 || v426 !== num) return;
                arg297 === "save-light-camera"
                  ? ((vector[text8] = focusCommand2.camera), (v40 = false), (value5 = null), fn10())
                  : arg297 === "cancel-light-camera"
                    ? ((v40 = false), (value5 = null))
                    : arg297 !== "preview-light-camera" &&
                      ((v40 = true), (value5 = focusCommand2.camera));
              } catch (v430) {
                !v37 && v426 === num && (element7.textContent = v430.message);
              } finally {
                (v429(), !v37 && v426 === num && !v427 && ((v41 = false), fn29()));
              }
            },
            v431 = v30("div", "i3d-focus-actions");
          if ((element75.append(v431), v40)) {
            const v432 = v31("保存视角", () => void v425("save-light-camera"));
            ((v432.className = "primary"),
              v431.append(
                v432,
                v31("取消调整", () => void v425("cancel-light-camera")),
              ));
            const element77 = v30("div", "i3d-focus-actions");
            (element77.setAttribute("role", "group"),
              element77.setAttribute("aria-label", "聚焦投影"),
              element75.append(element77));
            for (const [v433, v434] of [
              ["orthographic", "正交"],
              ["perspective", "透视"],
            ]) {
              const element78 = v31(v434, () => void v425("focus-projection", v433));
              (element78.setAttribute(
                "aria-pressed",
                String((value5?.mode || "orthographic") === v433),
              ),
                element77.append(element78));
            }
            const v435 = fn13(
              element75,
              "焦段（mm）",
              Math.round(value5?.focalLength || 50),
              18,
              120,
              1,
              (arg300) => void v425("focus-focal-length", arg300),
            );
            v435.disabled = value5?.mode !== "perspective";
          } else {
            v431.append(
              v31(vector[text8] ? "调整视角" : "设置视角", () => void v425("edit-light-camera")),
              ...(text8 === "followCamera"
                ? []
                : [v31("预览聚焦", () => void v425("preview-light-camera"))]),
            );
            const v436 = v31(
              text8 === "followCamera" ? "恢复默认鸟瞰" : "恢复自动聚焦",
              async () => {
                try {
                  (await value3.focusCommand("cancel-light-camera", vector.id),
                    delete vector[text8],
                    fn10(),
                    fn29());
                } catch (v437) {
                  element7.textContent = v437.message;
                }
              },
            );
            ((v436.disabled = !vector[text8]),
              (v436.className = "i3d-focus-reset"),
              element75.append(v436));
          }
          if (v41) {
            for (const v438 of element75.querySelectorAll("button, input")) v438.disabled = true;
          }
        }
        fn21("绑定管理").append(v300);
      } else
        v291.append(
          v30(
            "p",
            "i3d-note",
            v12
              ? v296.length
                ? "点击“添加扫地机”，选择模型后绑定扫地机设备。"
                : "当前楼层暂无扫地机模型，请先在 3D 户型图绘制中添加扫地机器人后更新户型。"
              : v16
                ? v296.length
                  ? "点击“添加" + v23 + "”，选择模型并绑定 HA 设备。"
                  : "当前楼层暂无" + v23 + "模型，请先在 3D 户型图绘制中添加" + v23 + "后更新户型。"
                : v15
                  ? v296.length
                    ? "点击“添加设备”，选择智能音响模型并绑定媒体播放器实体。"
                    : "当前楼层暂无智能音响模型，请先在 3D 户型图绘制中添加智能音响后更新户型。"
                  : v14
                    ? v296.length
                      ? "点击“添加设备”，选择电视模型并绑定媒体播放器实体。"
                      : "当前楼层暂无电视模型，请先在 3D 户型图绘制中添加电视后更新户型。"
                    : v20
                      ? v296.length
                        ? "点击“添加设备”，选择设备类型和模型，再绑定开启实体。"
                        : "当前楼层暂无 NAS 模型，请先在 3D 户型图绘制中添加 NAS 模型后更新户型。"
                      : v18
                        ? v296.length
                          ? "点击“添加窗帘”，选择需要控制的窗帘模型。"
                          : "当前楼层暂无窗帘模型，请先在 3D 户型图绘制中添加普通窗帘后更新户型。"
                        : v7 === "water-heater"
                          ? v296.length
                            ? "点击“添加热水器”，选择需要控制的热水器模型。"
                            : "当前楼层暂无热水器模型，请先在 3D 户型图绘制中添加储水式或燃气式热水器后更新户型。"
                          : ["airer", "fan", "purifier"].includes(v7)
                            ? v296.length
                              ? "点击“添加" + v23 + "”，选择需要控制的" + v23 + "模型。"
                              : "当前楼层暂无" +
                                v23 +
                                "模型，请先在 3D 户型图绘制中添加" +
                                v23 +
                                "后更新户型。"
                            : v17
                              ? v296.length
                                ? "点击“添加空调/浴霸”，选择设备类型和关联模型。"
                                : "当前楼层暂无可关联模型，请先在 3D 户型图绘制中添加壁挂空调、柜机或出风口后更新户型。"
                              : v296.length
                                ? "点击“添加灯光”，选择需要控制的灯组。"
                                : "当前楼层暂无灯组，请先在 3D 户型图绘制中添加灯组后更新户型。",
          ),
        );
    }
    if ((element5.append(element7), (element18.disabled = v43 || !v38 || v40 || v41), v40 || v41)) {
      for (const element79 of element5.querySelectorAll("input, select, button"))
        element79.closest(".i3d-focus-settings") || (element79.disabled = true);
    }
    if (v39) {
      for (const element80 of element5.querySelectorAll("input, select, button"))
        element80.dataset.interaction3dRangeEditor !== "true" && (element80.disabled = true);
    }
  }
  function fn30() {
    value3 = mountInteraction3d2(v36, {
      component: {
        ...v1,
        properties: v114(),
      },
      context: {
        document: v2,
        states: v4,
        entityMetadata: new Map(v3.map((arg301) => [arg301.entityId, arg301])),
      },
      editing: true,
      editingVacuumId: v11 ? v9 : "",
      editingModule: v13 ? v7 : v18 ? "cover" : v19 || v17 || v21 ? v7 : "light",
      onStates(arg302) {
        v37 || ((value8 = arg302), value4?.syncMap?.(), v44(), v45(), v47());
      },
      onReady(arg303) {
        (num++,
          (v40 = false),
          (v41 = false),
          (value5 = null),
          (value2 = arg303),
          value2.floors.some((arg304) => arg304.id === floorSelection) ||
            (floorSelection = value2.floors[0]?.id || ""),
          fn29(),
          fn10(),
          v8 && ((v8 = false), queueMicrotask(fn18)));
      },
      onEdit(arg305) {
        if (!(v37 || !v38 || value6 || value9)) {
          if (
            ["purifier-layout", "device-layout"].includes(arg305.action) &&
            (["climate", "airer", "fan", "purifier", "water-heater"].includes(v7) || v16)
          ) {
            const v439 = v50().find((arg306) => arg306.id === arg305.id),
              map14 = new Map(
                (v439?.extraControls || []).map((arg307) => [arg307.entityId, arg307]),
              );
            if (
              !v439 ||
              !Array.isArray(arg305.extraControls) ||
              arg305.extraControls.length !== map14.size ||
              new Set(arg305.extraControls.map((arg308) => arg308.entityId)).size !== map14.size ||
              arg305.extraControls.some(
                (arg309) =>
                  !map14.has(arg309.entityId) ||
                  ![1, 2, 3, 4].includes(arg309.columns) ||
                  ![1, 2].includes(arg309.rows),
              )
            )
              return;
            ((v439.extraControls = arg305.extraControls.map((arg310) => ({
              entityId: arg310.entityId,
              type: extraTypes2(arg310.entityId)[0],
              columns: arg310.columns,
              rows: arg310.rows,
            }))),
              fn10());
            return;
          }
          if (
            (arg305.action === "light-region-overrides" &&
              ((structuredClone2.lightRegionOverrides = structuredClone(arg305.overrides || {})),
              num3++,
              v43 || (element17.textContent = "")),
            v11)
          ) {
            const vector2 = v50().find(
              (arg311) => "vacuum-room:" + v9 + ":" + arg311.id === arg305.id,
            );
            vector2 &&
              ((text = vector2.id),
              arg305.action === "position" &&
                ((vector2.x = arg305.x), (vector2.y = arg305.y), fn10()),
              fn29(),
              arg305.action === "select" && fn10());
            return;
          }
          if (v12 && arg305.id?.startsWith("vacuum-room:")) {
            const v440 = v50().find((arg312) =>
                (arg312.shortcuts || []).some(
                  (arg313) => "vacuum-room:" + arg312.id + ":" + arg313.id === arg305.id,
                ),
              ),
              vector3 = v440?.shortcuts.find(
                (arg314) => "vacuum-room:" + v440.id + ":" + arg314.id === arg305.id,
              );
            vector3 &&
              ((text = v440.id),
              arg305.action === "position" &&
                ((vector3.x = arg305.x), (vector3.y = arg305.y), fn10()),
              arg305.action === "select" && fn29());
            return;
          }
          if (
            (arg305.action === "focus-exited" && ((v40 = false), (value5 = null), fn29()),
            arg305.action === "select")
          ) {
            if (
              v21 &&
              !v50().some((arg315) => arg315.id === arg305.id && arg315.floorId === floorSelection)
            )
              return;
            ((text = arg305.id), fn29(), fn10());
          }
          if (arg305.action === "position") {
            const vector4 =
              (v18 && v52().find((arg316) => curtainGroupEntryId2(arg316) === arg305.id)) ||
              v50().find((arg317) => arg317.id === arg305.id);
            vector4 &&
              (!v21 || vector4.floorId === floorSelection) &&
              Number.isFinite(arg305.x) &&
              Number.isFinite(arg305.y) &&
              ((vector4.x = arg305.x), (vector4.y = arg305.y), v21 && fn29(), fn10());
          }
          arg305.action === "camera" &&
            ((structuredClone2.floorCameras = {
              ...structuredClone2.floorCameras,
              [floorSelection]: arg305.camera,
            }),
            floorSelection === structuredClone2.floorSelection &&
              (structuredClone2.camera = arg305.camera),
            (element7.textContent = "默认视角已记录，保存配置后生效。"));
        }
      },
    });
  }
  const v441 = subscribeInteraction3dAccess2((arg318) => {
    v37 ||
      ((v38 = arg318.allowed),
      (element18.disabled = v43 || !v38 || v40 || v41),
      (element5.inert = !v38),
      (element6.hidden = v38 || (!!value3 && arg318.status !== "denied")),
      (element6.textContent =
        arg318.status === "denied" || arg318.status === "unavailable"
          ? arg318.message
          : "正在准备户型…"),
      v38
        ? value3
          ? value3.setAuthorized(true)
          : fn30()
        : (fn17(),
          fn7(),
          value4?.close(),
          num2++,
          value7?.close(),
          num++,
          (v40 = false),
          (v41 = false),
          (value5 = null),
          fn29(),
          value3?.setAuthorized(false),
          arg318.status === "denied" && (value3?.(), (value3 = null), fn29())));
  });
  (fn29(), element4.showModal(), document.dispatchEvent(new Event("hb-i3d-preview-scope")), v107());
}
export async function openInteraction3dAppearanceEditor({ component: v442, onSave: v443 }) {
  if (normalizeInteraction3dLightingMode2(v442.properties?.lightingMode) === "region") return;
  await requestInteraction3dAccess2();
  const v444 = getInteraction3dEditorView2(v442.id);
  if (!v444?.metadata) throw new Error("户型还在加载，请稍候再打开进阶设置。");
  const structuredClone4 = structuredClone(v442.properties || {});
  let options10 = {
      ...v444.metadata.defaults,
      ...structuredClone(structuredClone4.baseLighting || v444.metadata.baseLighting),
    },
    v445 = false;
  const element81 = document.createElement("link");
  ((element81.rel = "stylesheet"),
    (element81.href =
      "/api/v1/modules/interaction3d/runtime.css?v=20260909-curtain-action-v15-warm-popups-v1-20260926-fan-v1"),
    document.head.append(element81));
  const v446 = (arg319, v447 = "") => {
      const element82 = document.createElement(arg319);
      return ((element82.textContent = v447), element82);
    },
    element83 = v446("dialog");
  ((element83.className = "i3d-editor i3d-appearance-editor"),
    element83.setAttribute("aria-label", "户型进阶设置"));
  const element84 = v446("header"),
    v448 = v446("div");
  v448.className = "i3d-appearance-body";
  const element85 = v446("p");
  ((element85.className = "i3d-error"), element85.setAttribute("role", "status"));
  let vector5;
  const v449 = (arg320, arg321) => {
      const boundingClientRect = element83.getBoundingClientRect();
      Object.assign(element83.style, {
        margin: "0",
        right: "auto",
        bottom: "auto",
        left:
          Math.max(8, Math.min(arg320, window.innerWidth - boundingClientRect.width - 8)) + "px",
        top:
          Math.max(8, Math.min(arg321, window.innerHeight - boundingClientRect.height - 8)) + "px",
      });
    },
    v450 = () => {
      const boundingClientRect2 = element83.getBoundingClientRect();
      v449(boundingClientRect2.left, boundingClientRect2.top);
    };
  ((element84.title = "按住标题栏拖动"),
    element84.addEventListener("pointerdown", (arg322) => {
      if (arg322.button !== 0 || arg322.target.closest("button")) return;
      arg322.preventDefault();
      const boundingClientRect3 = element83.getBoundingClientRect();
      ((vector5 = {
        id: arg322.pointerId,
        x: arg322.clientX,
        y: arg322.clientY,
        left: boundingClientRect3.left,
        top: boundingClientRect3.top,
      }),
        element84.setPointerCapture(arg322.pointerId));
    }),
    element84.addEventListener("pointermove", (arg323) => {
      !vector5 ||
        vector5.id !== arg323.pointerId ||
        v449(vector5.left + arg323.clientX - vector5.x, vector5.top + arg323.clientY - vector5.y);
    }));
  for (const v451 of ["pointerup", "pointercancel", "lostpointercapture"])
    element84.addEventListener(v451, () => {
      vector5 = null;
    });
  window.addEventListener("resize", v450);
  const v452 = () =>
      v444.update({
        ...structuredClone4,
        baseLighting: options10,
      }),
    v453 = (v454 = false) => {
      v445 ||
        ((v445 = true),
        v454 || v444.update(structuredClone4),
        window.removeEventListener("resize", v450),
        element83.close(),
        element83.remove(),
        element81.remove());
    },
    element86 = v446("button", "完成");
  ((element86.type = "button"),
    element86.addEventListener("click", async () => {
      if (!(v445 || element86.disabled)) {
        element86.disabled = true;
        try {
          if ((await requestInteraction3dAccess2(), v445)) return;
          (await v443(options10), v453(true));
        } catch (v455) {
          v445 || ((element85.textContent = v455.message), (element86.disabled = false));
        }
      }
    }));
  const element87 = v446("button", "取消");
  ((element87.type = "button"), element87.addEventListener("click", () => v453()));
  const v456 = v446("span", "拖动");
  ((v456.className = "i3d-drag-hint"),
    element84.append(v446("strong", "户型进阶设置"), v456, element86, element87));
  const map15 = new Map(),
    Wi2 = Wi;
  for (const [v457, v458] of Wi2) {
    const v459 = v446("section"),
      v460 = v446("div");
    ((v460.className = "i3d-appearance-grid"), v459.append(v446("h4", v457), v460));
    for (const [v461, v462, v463, v464, v465] of v458) {
      const v466 = v446("label"),
        element88 = v446("input");
      (Object.assign(element88, {
        name: "i3d-base-light-" + v462,
        type: "number",
        min: String(v463),
        max: String(v464),
        step: String(v465),
        value: String(options10[v462]),
      }),
        element88.addEventListener("input", () => {
          Number.isFinite(element88.valueAsNumber) &&
            ((options10[v462] = Math.max(v463, Math.min(v464, element88.valueAsNumber))), v452());
        }),
        v466.append(v446("span", v461), element88),
        v460.append(v466),
        map15.set(v462, element88));
    }
    v448.append(v459);
  }
  const element89 = v446("button", "恢复默认");
  ((element89.type = "button"),
    element89.addEventListener("click", () => {
      for (const [v467, v468] of map15)
        ((options10[v467] = v444.metadata.defaults[v467]), (v468.value = String(options10[v467])));
      v452();
    }));
  const v469 = v446(
    "p",
    "调整当前户型的整体光照与阴影。完成后点击页面上方保存，仅保存至当前 3D 控件。",
  );
  ((v469.className = "i3d-note"),
    v448.append(element89, v469, element85),
    element83.append(element84, v448),
    document.body.append(element83),
    element83.addEventListener("cancel", (arg324) => {
      (arg324.preventDefault(), v453());
    }),
    element83.showModal());
}
