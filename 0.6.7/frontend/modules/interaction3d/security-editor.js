import { appendBackgroundOpacityControl } from "../../../../bridge-static/modules/interaction3d/label-appearance.js";
import {
  openBatchApply,
  copyBatchFields,
} from "../../../../bridge-static/modules/interaction3d/batch-apply.js";
import {
  PRESENCE_TRIGGER_MODES,
  presenceTriggerIsTimed,
} from "./presence-motion.js?v=20260914-detection-triggers-v1";
import {
  doorModels,
  identifyLockEntities,
  lockEntityRole,
} from "../../../../bridge-static/modules/interaction3d/lock-state-runtime.js?v=20260925-xiaomi-contact-v1-20260926-speaker-v1";
const xt = ["doorEntityId", "batteryEntityId"],
  Mt = [
    "doorSource",
    "doorEventEntityId",
    "doorOpenEntityId",
    "doorCloseEntityId",
    "doorEventAttribute",
    "doorOpenValue",
    "doorCloseValue",
  ],
  Ct = [
    ["icon", "图标"],
    ["size", "卡片大小"],
    ["fontSize", "文字大小"],
    ["labelMode", "标签显示"],
  ];
import { mountInteraction3d } from "./runtime.js?v=20260909-preview-sleep-v1-warm-popups-v1-20260923-lazy-stage-v1-20260926-speaker-v1-20260926-fan-v1-20260926-airer-v2-reload-diagnostics-v2";
import { openPresenceEditor } from "./presence-editor.js?v=20260911-security-focal-v1-detection-triggers-v1-20260926-focus-ui-v1";
import { randomUuid } from "../../../../bridge-static/utils/random-id.js?v=20260923-lock-editor-ui-v1";
import {
  requestInteraction3dAccess,
  subscribeInteraction3dAccess,
} from "../../../../bridge-static/modules/interaction3d/bridge.js?v=20260926-integration-v1-reload-diagnostics-v2";
import { interaction3dPreviewSize } from "../../../../bridge-static/modules/interaction3d/preview-layout.js?v=20260923-lock-editor-ui-v1";
export async function openSecurityEditor({
  component: arg1,
  panelDocument: arg2,
  entities: arg5 = [],
  pickers: arg3,
  onSave: arg4,
}) {
  await requestInteraction3dAccess();
  const value1 = structuredClone(arg1.properties || {});
  value1.security = {
    ...value1.security,
    locks: value1.security?.locks || [],
    cameras: value1.security?.cameras || [],
    presenceSensors: value1.security?.presenceSensors || [],
  };
  for (const value28 of value1.security.locks) for (const value29 of Mt) delete value28[value29];
  for (const value30 of value1.security.locks)
    ((value30.labelMode =
      value30.labelMode === "hidden" ||
      value30.labelMode === "open" ||
      value30.labelMode === "always"
        ? value30.labelMode
        : value30.labelHidden === true
          ? "hidden"
          : "always"),
      delete value30.labelHidden);
  for (const value31 of value1.security.cameras)
    (delete value31.buttonHidden, delete value31.hiddenClickable);
  const fn1 = (arg6, arg7 = "", arg8 = "") => {
      const value32 = document.createElement(arg6);
      return ((value32.className = arg7), (value32.textContent = arg8), value32);
    },
    fn2 = (arg9, arg10) => {
      const value33 = fn1("button", "", arg9);
      return ((value33.type = "button"), value33.addEventListener("click", arg10), value33);
    },
    value2 = fn1("link");
  ((value2.rel = "stylesheet"),
    (value2.href =
      "/api/v1/modules/interaction3d/runtime.css?v=20260923-lock-layout-v3-20260926-fan-v1"));
  const value3 = fn1("dialog", "i3d-editor");
  (value3.setAttribute("aria-label", "3D 安防配置"), (value3.dataset.i3dPreviewScope = "security"));
  const value4 = fn1("header"),
    value5 = fn1("div", "i3d-editor-body"),
    value6 = fn1("div", "i3d-editor-view"),
    value7 = fn1("aside");
  let value8 = value7;
  const value9 = fn1("div", "i3d-editor-aspect"),
    value10 = fn1("div", "i3d-editor-stage"),
    value11 = fn1("p", "i3d-error");
  (value11.setAttribute("role", "status"),
    value9.append(value10),
    value6.append(value9),
    value5.append(value6, value7));
  const fn3 = (arg11) => {
    ((value11.textContent = arg11 || ""), (value11.hidden = !value11.textContent));
  };
  fn3("");
  let value12 = null,
    value13 = value1.floorSelection === "all" ? "" : value1.floorSelection || "",
    text1 = "camera",
    text2 = "",
    value14 = null,
    value15 = false,
    value16 = true,
    value17 = false,
    value18 = false,
    value19 = null,
    value20 = Promise.resolve();
  const set1 = new Set();
  let value21 = null,
    value22 = 0,
    value23 = null,
    value24 = false,
    value25 = null;
  const value26 = document.activeElement,
    map1 = new Map();
  let text3 = "";
  const fn4 = () =>
      text1 === "lock" ? "locks" : text1 === "camera" ? "cameras" : "presenceSensors",
    fn5 = () => (text1 === "lock" ? "门" : text1 === "camera" ? "摄像头" : "人体传感器"),
    fn6 = () => value1.security[fn4()],
    fn7 = () => fn6().find((arg12) => arg12.id === text2 && arg12.floorId === value13),
    fn8 = () => value12?.floors.find((arg13) => arg13.id === value13),
    fn9 = () => doorModels(fn8() || {}),
    fn10 = (arg14) => arg14?.modelId || arg14?.id || "";
  function fn11() {
    for (const value34 of value1.security.locks) {
      if (!value34?.modelId || String(value34.modelId).startsWith("door:")) continue;
      const value35 = (value12?.floors || []).find((arg15) => arg15.id === value34.floorId),
        value36 = (value35?.scene?.doors?.length ? value35.scene.doors : value35?.doors || []).find(
          (arg16) => {
            const value38 = String(arg16?.id || arg16?.modelId || "");
            return value38 === String(value34.modelId) || value38 === "door:" + value34.modelId;
          },
        ),
        value37 = String(value36?.id || value36?.modelId || "").replace(/^door:/, "");
      value37 && (value34.modelId = "door:" + value37);
    }
  }
  const fn12 = () =>
      text1 === "lock"
        ? fn9().filter((arg17) => arg17.doorType !== "frame-only")
        : fn8()?.[fn4()] || [],
    fn13 = (arg18) => text1 + ":" + arg18.id,
    fn14 = () => ({
      ...value1,
      floorSelection: value13,
      camera:
        value1.floorCameras?.[value13] ||
        (value1.floorSelection === value13 ? value1.camera : null),
    }),
    fn15 = (arg19) => {
      value15 || fn3(arg19?.message || String(arg19));
    };
  function fn16() {
    !value15 &&
      !value24 &&
      value16 &&
      value14?.update(fn14(), text2 ? text1 + ":" + text2 : "", {
        module: "security",
        securityKind: text1,
      });
  }
  function fn17() {
    (fn3("配置已修改，请保存配置。"), fn16());
  }
  function fn18() {
    (value22++, value21?.close(), (value21 = null));
  }
  function fn19(arg20, arg21, arg22, arg23) {
    const value39 = fn1("select");
    (value39.setAttribute("aria-label", arg20),
      arg21.length || (arg21 = [["", value12 ? "暂无可选项" : "正在加载…"]]));
    for (const [value41, value42] of arg21) {
      const value43 = fn1("option", "", value42);
      ((value43.value = value41), value39.append(value43));
    }
    ((value39.value = arg22), value39.addEventListener("change", () => arg23(value39.value)));
    const value40 = fn1("label");
    return (value40.append(fn1("span", "", arg20), value39), value8.append(value40), value39);
  }
  function fn20(arg24, arg25, arg26, arg27, arg28, arg29 = 0.1, arg30 = false) {
    const value44 = arg24.endsWith("高度（米）"),
      fn32 = (arg31) => (value44 ? Number(arg31).toFixed(1) : arg31),
      value45 = fn1("input");
    (Object.assign(value45, {
      type: "number",
      value: fn32(arg25),
      min: arg26,
      max: arg27,
      step: value44 ? 0.1 : arg29,
    }),
      value45.setAttribute("aria-label", arg24),
      arg30 &&
        value45.addEventListener("input", () => {
          const value47 = Number(value45.value);
          value45.value.trim() &&
            Number.isFinite(value47) &&
            value47 >= arg26 &&
            value47 <= arg27 &&
            ((arg25 = value44 ? Number(value47.toFixed(1)) : value47), arg28(arg25), fn17());
        }),
      value45.addEventListener("change", () => {
        const value48 = Number(value45.value);
        if (
          !value45.value.trim() ||
          !Number.isFinite(value48) ||
          value48 < arg26 ||
          value48 > arg27
        ) {
          value45.value = fn32(arg25);
          return;
        }
        ((arg25 = value44 ? Number(value48.toFixed(1)) : value48),
          (value45.value = fn32(arg25)),
          arg28(arg25),
          fn17());
      }));
    const value46 = fn1("label");
    (value46.append(fn1("span", "", arg24), value45), value8.append(value46));
  }
  const value27 = fn2("保存配置", async () => {
    if (!(value17 || !value16 || value18 || value24)) {
      ((value17 = true), fn30());
      try {
        if ((await requestInteraction3dAccess(), value15 || !value16)) return;
        (await arg4(structuredClone(value1)), value15 || fn3("已应用到编辑器，请保存仪表盘。"));
      } catch (error1) {
        fn15(error1);
      } finally {
        ((value17 = false), value15 || fn30());
      }
    }
  });
  value27.className = "primary";
  function fn21() {
    value15 ||
      ((value15 = true),
      fn18(),
      value23?.close(),
      value14?.(),
      resizeObserver1.disconnect(),
      fn23(),
      value25?.close(),
      value25?.remove(),
      (value25 = null),
      value3.close(),
      value3.remove(),
      value2.remove(),
      document.dispatchEvent(new Event("hb-i3d-preview-scope")),
      value26?.focus?.());
  }
  (value4.append(fn1("strong", "", "3D 安防配置"), value27, fn2("退出", fn21)),
    value3.append(value4, value5),
    value3.addEventListener("cancel", (arg32) => {
      (arg32.preventDefault(), fn21());
    }));
  function fn22() {
    const value49 = interaction3dPreviewSize(arg1, arg2, value6.clientWidth, value6.clientHeight);
    ((value9.style.width = value49.width + "px"), (value9.style.height = value49.height + "px"));
  }
  const resizeObserver1 = new ResizeObserver(fn22);
  resizeObserver1.observe(value6);
  let fn23 = () => {};
  const fn24 = (arg33) => {
    const value50 = arg33.allowed === true;
    if (!value50 && arg33.status === "denied") {
      ((value16 = false),
        (value18 = false),
        fn18(),
        value23?.close(),
        value14?.setAuthorized?.(false),
        value14?.(),
        (value14 = null),
        fn3(arg33.message || "3D 使用权限已失效。"),
        value15 || fn30());
      return;
    }
    value50 !== value16 &&
      ((value16 = value50),
      value16
        ? (value14?.setAuthorized?.(true), fn3(""))
        : ((value18 = false), fn18(), value23?.close(), value14?.setAuthorized?.(false), fn3("")),
      value15 || (fn30(), value16 && value3.open && fn31()));
  };
  async function fn25(arg34, arg35) {
    const value51 = fn7();
    if (!value51 || value17 || !value16 || value15) return;
    const value52 = arg34 === "focus-focal-length",
      value53 = value20;
    let value54;
    ((value20 = new Promise((arg36) => {
      value54 = arg36;
    })),
      value52 || ((value17 = true), fn30()));
    try {
      if ((await value53, value15 || !value16 || fn7() !== value51)) return;
      const value55 = await value14.focusCommand(arg34, fn13(value51), arg35);
      if (value15 || !value16 || fn7() !== value51) return;
      (value55?.camera && (value19 = value55.camera),
        arg34 === "save-light-camera"
          ? ((value51.focusCamera = value55.camera), (value18 = false), fn17())
          : arg34 === "cancel-light-camera"
            ? ((value18 = false), (value19 = null))
            : arg34 === "edit-light-camera" && (value18 = true));
    } catch (error2) {
      value15 || fn15(error2);
    } finally {
      (value54(), value52 || ((value17 = false), value15 || fn30()));
    }
  }
  async function fn26() {
    if (!(value17 || value18 || value24 || !value16)) {
      ((value24 = true), value14?.(), (value14 = null));
      try {
        const value56 = await openPresenceEditor({
          component: {
            ...arg1,
            properties: structuredClone(value1),
          },
          panelDocument: arg2,
          floors: value12?.floors || [],
          entities: arg5,
          pickers: arg3,
          initialSelectedId: text2,
          editingFloorId: value13,
          manageBindings: false,
          onSave: async (arg37) => {
            !value15 &&
              value16 &&
              ((value1.security = structuredClone(arg37.security)),
              fn3("路线已应用，请保存配置。"));
          },
          onClose: () => {
            ((value23 = null), (value24 = false), !value15 && value16 && (fn31(), fn30()));
          },
        });
        value15 || !value16 || !value24 ? value56?.close() : (value23 = value56);
      } catch (error3) {
        ((value24 = false), fn15(error3), !value15 && value16 && fn31());
      }
    }
  }
  function fn27(arg38) {
    const value57 = fn1("section", "i3d-focus-settings i3d-security-settings");
    return (
      value57.append(fn1("h4", "", arg38)),
      value7.append(value57),
      (value8 = value57),
      value57
    );
  }
  function fn28(arg39, arg40, arg41 = value8) {
    const value58 = fn1("details", "i3d-security-disclosure");
    ((value58.open = set1.has(arg40)),
      value58.append(fn1("summary", "", arg39)),
      value58.addEventListener("toggle", () => {
        value58.open ? set1.add(arg40) : set1.delete(arg40);
      }));
    const value59 = fn1("div", "i3d-security-disclosure-body");
    return (value58.append(value59), arg41.append(value58), value59);
  }
  function fn29(arg42) {
    if (value15 || !value16 || value17 || value18 || value24 || value25) return;
    const fn33 = (arg43) =>
        fn9().find((arg44) => fn10(arg44) === arg43.modelId)?.doorType || "solid",
      value60 = fn12().find((arg45) => fn10(arg45) === arg42.modelId),
      object1 = {
        ...arg42,
        height: arg42.height ?? value60?.height ?? (text1 === "camera" ? 0.15 : 1.1),
      };
    let value61;
    if (text1 === "lock") {
      (Object.assign(object1, {
        icon: arg42.icon || "mdi:door-closed",
        size: arg42.size ?? 44,
        fontSize: arg42.fontSize ?? 12,
        labelMode: arg42.labelMode || (arg42.labelHidden ? "hidden" : "always"),
        duration: arg42.duration ?? 0.7,
        openAngle: arg42.openAngle ?? 80,
        openDirection: arg42.openDirection ?? 1,
        hinge: arg42.hinge || "left",
      }),
        (value61 = Ct.map(([arg46, arg47]) => ({
          key: arg46,
          label: arg47,
          ...(arg46 === "labelMode"
            ? {
                write: (arg48, arg49) => {
                  ((arg48.labelMode = arg49), delete arg48.labelHidden);
                },
              }
            : {}),
        }))),
        value61.push({
          key: "duration",
          label: "动画时长",
          unit: " 秒",
          optional: true,
        }));
      const value62 = fn33(arg42),
        value63 = ["solid", "entry", "glass"].includes(value62);
      ((value63 || value62 === "double") &&
        value61.push({
          key: "openAngle",
          label: "开门角度",
          optional: true,
          compatible: (arg50) => fn33(arg50) === value62,
        }),
        (value63 || ["double", "sliding-glass"].includes(value62)) &&
          value61.push({
            key: "openDirection",
            label: "开门方向",
            optional: true,
            compatible: (arg51) => fn33(arg51) === value62,
          }),
        value63 &&
          value61.push({
            key: "hinge",
            label: "铰链方向",
            optional: true,
            compatible: (arg52) => fn33(arg52) === value62,
          }));
    } else
      text1 === "camera"
        ? (value61 = [
            ["icon", "图标", "mdi:cctv"],
            ["size", "标签大小", 44],
            ["iconSize", "图标大小", 26],
            ["fontSize", "文字大小", 12],
            ["hitSize", "触控范围", 44],
          ].map(([arg53, arg54, arg55]) => ({
            key: arg53,
            label: arg54,
            fallback: arg55,
          })))
        : (value61 = [
            ["waveEnabled", "显示感应光圈", true],
            ["waveScale", "光圈缩放", 1],
            ["waveOpacity", "光圈不透明度（%）", 68],
            ["character", "人物方案", "traveler"],
            ["color", "人物颜色", "cyan"],
            ["size", "人物缩放", 1],
            ["speed", "行走速度（米/秒）", 0.45],
            ["clickToFocus", "点击人物聚焦", false],
            ["hitPadding", "触控范围扩展（px）", 8],
          ].map(([arg56, arg57, arg58]) => ({
            key: arg56,
            label: arg57,
            fallback: arg58,
            optional: ["speed", "clickToFocus", "hitPadding"].includes(arg56),
          })));
    (text1 !== "presence" &&
      value61.push({
        key: "backgroundOpacity",
        label: "背景不透明度",
        unit: "%",
        fallback: 1,
        format: (arg59) => Math.round(arg59 * 100),
      }),
      text1 !== "presence" &&
        value61.push({
          key: "height",
          label: "高度",
          unit: " 米",
          optional: true,
          format: (arg60) => Number(arg60).toFixed(1),
        }),
      (value25 = openBatchApply({
        title: "应用" + fn5() + "设置",
        source: object1,
        fields: value61,
        targets: fn6().filter((arg61) => arg61.id !== arg42.id && arg61.floorId === arg42.floorId),
        onClose: () => {
          value25 = null;
        },
        onApply: async (arg62, arg63) => {
          if ((await requestInteraction3dAccess(), value15 || !value16 || !value25?.open))
            throw new Error("配置已关闭或授权不可用");
          for (const value64 of arg62) copyBatchFields(value64, object1, arg63);
          (fn17(), fn30(), fn3("已应用到 " + arg62.length + " 个目标，请保存配置。"));
        },
      })));
  }
  function fn30() {
    (value7.replaceChildren(),
      (value27.disabled = value17 || value18 || !value16 || !value12 || value24));
    const value65 = fn27("配置范围"),
      value66 = fn1("div", "i3d-security-scope-grid");
    (value65.append(value66),
      (value8 = value66),
      fn19(
        "配置楼层",
        (value12?.floors || []).map((arg64) => [arg64.id, arg64.name]),
        value13,
        (arg65) => {
          (fn18(), (value13 = arg65), (text2 = ""), fn16(), fn30());
        },
      ),
      fn19(
        "安防类别",
        [
          ["camera", "摄像头"],
          ["presence", "人体传感器"],
          ["lock", "门"],
        ],
        text1,
        (arg66) => {
          (fn18(), (text1 = arg66), (text2 = ""), fn16(), fn30());
        },
      ));
    const value67 = fn27("模型列表");
    ((value67.className += " i3d-security-model-list"), (value8 = value67));
    const value68 = fn6().filter((arg67) => arg67.floorId === value13);
    (value68.some((arg68) => arg68.id === text2) || (text2 = value68[0]?.id || ""),
      fn19(
        fn5() + "列表",
        value68.map((arg69) => [arg69.id, arg69.label || arg69.entityId || fn5()]),
        text2,
        (arg70) => {
          (fn18(), (text2 = arg70), fn16(), fn30());
        },
      ),
      (value8 = fn28("添加" + fn5(), "add:" + text1 + ":" + value13, value67)));
    const value69 = fn12().filter(
        (arg71) =>
          !fn6().some((arg72) => arg72.floorId === value13 && arg72.modelId === fn10(arg71)),
      ),
      value70 = fn19(
        "待添加" + fn5() + "模型",
        value69.map((arg73) => [fn10(arg73), arg73.name]),
        fn10(value69[0]),
        () => {},
      ),
      value71 = fn2("添加" + fn5(), () => {
        const value74 = fn12().find((arg74) => fn10(arg74) === value70.value);
        if (
          !value74 ||
          fn6().some((arg75) => arg75.floorId === value13 && arg75.modelId === fn10(value74))
        )
          return;
        const object2 = {
          id: randomUuid(),
          floorId: value13,
          modelId: fn10(value74),
          entityId: "",
          label: value74.name || fn5(),
          ...(text1 === "lock"
            ? {
                openAngle: 80,
                openDirection: 1,
                duration: 0.7,
                hinge: value74.hinge === "right" ? "right" : "left",
                size: 44,
                fontSize: 12,
                labelMode: "always",
                icon: "mdi:door-closed",
              }
            : text1 === "camera"
              ? {
                  size: 44,
                  visible: true,
                  icon: "mdi:cctv",
                }
              : {
                  route: [],
                  routeClosed: false,
                  size: 1,
                  speed: 0.45,
                  displayDuration: 0,
                  character: "traveler",
                  color: "cyan",
                  clickToFocus: false,
                  hitPadding: 8,
                }),
        };
        (fn6().push(object2),
          (text2 = object2.id),
          set1.delete("add:" + text1 + ":" + value13),
          fn17(),
          fn30());
      });
    ((value71.disabled = !value69.length),
      value8.append(value71),
      fn12().length ||
        value8.append(
          fn1("p", "i3d-note", "本层没有" + fn5() + "模型，请先在 3D 户型图绘制中增加模型。"),
        ),
      (value8 = value67));
    const value72 = fn7();
    if (value72) {
      const value75 = fn27("基础绑定"),
        value76 = fn1("div", "i3d-security-scope-grid");
      (value75.append(value76), (value8 = value76));
      const value77 = fn1("input");
      ((value77.value = value72.label || ""),
        (value77.maxLength = 128),
        value77.setAttribute("aria-label", "名称"),
        value77.addEventListener("input", () => {
          ((value72.label = value77.value), fn17());
        }));
      const value78 = fn1("label");
      (value78.append(fn1("span", "", "名称"), value77), value8.append(value78));
      const value79 = fn12().filter(
          (arg76) =>
            !fn6().some(
              (arg77) =>
                arg77 !== value72 && arg77.floorId === value13 && arg77.modelId === fn10(arg76),
            ),
        ),
        value80 = value79.map((arg78) => [fn10(arg78), arg78.name]);
      if (
        (value79.some((arg79) => fn10(arg79) === value72.modelId) ||
          value80.unshift([
            value72.modelId || "",
            value72.modelId ? "原模型已移除，请重新选择" : "未关联模型（保留原人在路线）",
          ]),
        fn19("关联" + fn5() + "模型", value80, value72.modelId || "", (arg80) => {
          (arg80 ? (value72.modelId = arg80) : delete value72.modelId,
            (text1 === "camera" || text1 === "lock") && delete value72.focusCamera,
            fn17(),
            fn30());
        }),
        (value8 = value75),
        text1 === "lock")
      ) {
        value8 = fn27("实体来源");
        const value87 = fn2(value72.deviceName || "选择设备", async () => {
          const value109 = ++value22;
          value21?.close();
          try {
            const value110 = await arg3.device({
              trigger: value87,
              current: value72.deviceId || "",
              deviceIcon: "mdi:door-closed",
              title: "选择门设备",
              onSelect(arg81) {
                if (!(value15 || !value16 || value109 !== value22 || fn7() !== value72)) {
                  ((value72.deviceId = arg81?.deviceId || ""),
                    (value72.deviceName = arg81?.name || ""),
                    Object.assign(value72, identifyLockEntities(arg81?.entities || [])),
                    delete value72.entityId,
                    delete value72.lowBatteryEntityId,
                    delete value72.tamperEntityId);
                  for (const value111 of [
                    "doorEventEntityId",
                    "doorOpenEntityId",
                    "doorCloseEntityId",
                  ])
                    delete value72[value111];
                  (fn17(), fn30());
                }
              },
            });
            value15 || value109 !== value22 ? value110?.close() : (value21 = value110);
          } catch (error4) {
            fn15(error4);
          }
        });
        value8.append(value87);
        const value88 = xt,
          object3 = {
            doorEntityId: "开关门检测",
            batteryEntityId: "电量",
          };
        for (const value112 of value88) {
          const value113 = fn2(
            object3[value112] +
              "：" +
              (arg5.find((arg82) => arg82.entityId === value72[value112])?.name ||
                value72[value112] ||
                "未选择"),
            async () => {
              const value114 = ++value22;
              value21?.close();
              try {
                const value115 = value112 === "doorEntityId" ? "lock-door" : "lock-battery",
                  value116 = await arg3.entity({
                    trigger: value113,
                    current: value72[value112] || "",
                    deviceKind: value115,
                    title: "选择" + object3[value112] + "实体",
                    entityFilter: (arg83) => {
                      const value117 = arg83.entityId || arg83.entity_id || "";
                      if (value117 === value72[value112]) return true;
                      if (
                        !value72.deviceId ||
                        (arg83.deviceId || arg83.device_id) !== value72.deviceId
                      )
                        return false;
                      if (lockEntityRole(arg83, value112)) return true;
                      const value118 = value117.split(".")[0];
                      return value112 === "doorEntityId"
                        ? ["binary_sensor", "sensor"].includes(value118)
                        : value112 === "batteryEntityId" && value118 === "sensor";
                    },
                    onSelect(arg84) {
                      value15 ||
                        !value16 ||
                        value114 !== value22 ||
                        fn7() !== value72 ||
                        ((value72[value112] = arg84), fn17(), fn30());
                    },
                  });
                value15 || value114 !== value22 ? value116?.close() : (value21 = value116);
              } catch (error5) {
                fn15(error5);
              }
            },
          );
          ((value113.disabled = !value72.deviceId),
            (value113.className = "i3d-picker-button i3d-lock-entity-picker"),
            value8.append(value113));
        }
        const value89 = fn9().find((arg85) => fn10(arg85) === value72.modelId)?.doorType || "solid",
          value90 = fn27("门扇动作"),
          value91 = fn1("div", "i3d-security-grid i3d-lock-motion-grid");
        (value90.append(value91), (value8 = value91));
        const fn34 = () => {
            (fn17(), value14?.previewLockMotion?.(fn13(value72), true));
          },
          value92 = ["solid", "entry", "glass"].includes(value89),
          value93 = value89 === "double",
          value94 = value89 === "sliding-glass";
        (value92 &&
          fn19(
            "铰链方向",
            [
              ["left", "左开"],
              ["right", "右开"],
            ],
            value72.hinge || "left",
            (arg86) => {
              ((value72.hinge = arg86), fn34());
            },
          ),
          (value92 || value93) &&
            fn19(
              value93 ? "双扇开启方向" : "开门方向",
              [
                ["1", "内开"],
                ["-1", "外开"],
              ],
              String(value72.openDirection ?? 1),
              (arg87) => {
                ((value72.openDirection = Number(arg87)), fn34());
              },
            ),
          value94 &&
            fn19(
              "滑动方向",
              [
                ["1", "向右收起"],
                ["-1", "向左收起"],
              ],
              String(value72.openDirection ?? 1),
              (arg88) => {
                ((value72.openDirection = Number(arg88)), fn34());
              },
            ),
          value89 === "roller-shutter" &&
            value91.append(fn1("p", "i3d-note", "卷帘门按上下卷收，不使用左右铰链或内外开方向。")),
          (value92 || value93) &&
            fn20(
              "开门角度",
              value72.openAngle ?? 80,
              10,
              110,
              (arg89) => {
                value72.openAngle = arg89;
              },
              1,
            ),
          fn20(
            "动画时长（秒）",
            value72.duration ?? 0.7,
            0.2,
            3,
            (arg90) => {
              value72.duration = arg90;
            },
            0.1,
          ));
        const value95 = fn27("标签外观"),
          value96 = fn1("div", "i3d-security-grid i3d-lock-appearance-grid");
        (value95.append(value96), (value8 = value96));
        const value97 = fn2(value72.icon || "mdi:door-closed", async () => {
          const value119 = ++value22;
          value21?.close();
          try {
            const value120 = await arg3.icon({
              trigger: value97,
              current: value72.icon || "mdi:door-closed",
              deviceKind: "lock",
              onSelect(arg91) {
                value15 ||
                  !value16 ||
                  value119 !== value22 ||
                  fn7() !== value72 ||
                  ((value72.icon = arg91 || "mdi:door-closed"), fn17(), fn30());
              },
            });
            value15 || value119 !== value22 ? value120?.close() : (value21 = value120);
          } catch (error6) {
            fn15(error6);
          }
        });
        value97.className = "i3d-picker-button i3d-icon-picker-button";
        const value98 = fn1("i");
        value98.setAttribute("aria-hidden", "true");
        const value99 = value72.icon || "mdi:door-closed";
        ((value98.style.maskImage =
          "url('/bridge-static/vendor/mdi/7.4.47/svg/" + value99.slice(4) + ".svg')"),
          (value98.style.webkitMaskImage = value98.style.maskImage),
          (value97.textContent = ""),
          value97.append(value98, fn1("span", "", value99)),
          value97.setAttribute("aria-label", "门图标"));
        const value100 = fn1("label");
        value100.append(fn1("span", "", "图标"), value97);
        const value101 =
            value72.labelMode === "hidden" ||
            value72.labelMode === "open" ||
            value72.labelMode === "always"
              ? value72.labelMode
              : value72.labelHidden === true
                ? "hidden"
                : "always",
          value102 = fn1("select");
        value102.setAttribute("aria-label", "标签显示");
        for (const [value121, value122] of [
          ["hidden", "隐藏标签"],
          ["always", "常驻显示"],
          ["open", "打开时显示"],
        ]) {
          const value123 = fn1("option", "", value122);
          ((value123.value = value121), value102.append(value123));
        }
        ((value102.value = value101),
          value102.addEventListener("change", () => {
            ((value72.labelMode = value102.value), delete value72.labelHidden, fn17(), fn30());
          }));
        const value103 = fn1("label");
        value103.append(fn1("span", "", "标签显示"), value102);
        const value104 = fn1("div", "i3d-lock-appearance-row");
        (value104.append(value100, value103),
          value96.append(value104),
          fn20(
            "卡片大小（px）",
            value72.size ?? 44,
            20,
            500,
            (arg92) => {
              value72.size = arg92;
            },
            1,
          ),
          fn20(
            "文字大小（px）",
            value72.fontSize ?? 12,
            8,
            100,
            (arg93) => {
              value72.fontSize = arg93;
            },
            1,
          ),
          appendBackgroundOpacityControl(value95, value72, "backgroundOpacity", fn17));
        const value105 = fn27("标签位置"),
          value106 = fn1("div", "i3d-coordinate-grid");
        (value105.append(value106),
          (value8 = value106),
          fn20(
            "位置 X",
            value72.x ?? fn12().find((arg94) => fn10(arg94) === value72.modelId)?.x ?? 0,
            -1000000,
            1000000,
            (arg95) => {
              value72.x = arg95;
            },
            0.01,
          ),
          fn20(
            "位置 Y",
            value72.y ?? fn12().find((arg96) => fn10(arg96) === value72.modelId)?.y ?? 0,
            -1000000,
            1000000,
            (arg97) => {
              value72.y = arg97;
            },
            0.01,
          ),
          fn20(
            "离地高度（米）",
            value72.height ??
              fn12().find((arg98) => fn10(arg98) === value72.modelId)?.height ??
              1.1,
            -1000,
            1000,
            (arg99) => {
              value72.height = arg99;
            },
            0.1,
          ));
        const value107 = fn27("批量设置"),
          value108 = fn2("一键应用到其他门", () => fn29(value72));
        ((value108.className = "i3d-batch-apply-button"),
          (value108.disabled =
            fn6().filter((arg100) => arg100 !== value72 && arg100.floorId === value13).length ===
            0),
          value107.append(
            value108,
            fn1(
              "p",
              "i3d-note",
              "选择外观、高度或兼容门型的动作设置；保留模型、实体、坐标和视角。",
            ),
          ));
      }
      let value81 = null;
      if (text1 === "presence") {
        const value124 = fn2(value72.deviceName || "选择人体传感器设备", async () => {
          const value127 = ++value22;
          value21?.close();
          try {
            const value128 = await arg3.presence({
              trigger: value124,
              current: value72.deviceId || "",
              onSelect(arg101) {
                value15 ||
                  !value16 ||
                  value127 !== value22 ||
                  fn7() !== value72 ||
                  (arg101
                    ? ((value72.deviceId = arg101.deviceId),
                      (value72.deviceName = arg101.name),
                      map1.set(value72.id, arg101.entities),
                      arg101.entities.some((arg102) => arg102.entityId === value72.entityId) ||
                        (value72.entityId = arg101.entities[0]?.entityId || ""),
                      value72.entityId.startsWith("event.") &&
                        !(value72.displayDuration > 0) &&
                        (value72.displayDuration = 30))
                    : (delete value72.deviceId,
                      delete value72.deviceName,
                      (value72.entityId = ""),
                      map1.delete(value72.id)),
                  fn17(),
                  fn30());
              },
            });
            value15 || value127 !== value22 ? value128?.close() : (value21 = value128);
          } catch (error7) {
            fn15(error7);
          }
        });
        ((value124.className = "i3d-picker-button"),
          value124.setAttribute("aria-label", "选择人体传感器设备"));
        const value125 = fn1("label");
        (value125.append(fn1("span", "", "绑定设备"), value124),
          value8.append(value125),
          value8.append(fn1("p", "i3d-note", "选择设备后自动关联检测来源，通常无需再设置。")),
          (value81 = fn28("检测来源（高级）", "detection:" + value72.id)));
        const value126 = value8;
        if (((value8 = value81), value72.deviceId)) {
          const value129 = (
            map1.get(value72.id) ||
            arg3.presenceEntities?.(value72.deviceId) ||
            []
          ).map((arg103) => [arg103.entityId, arg103.name || arg103.entityId]);
          (value72.entityId &&
            !value129.some(([arg104]) => arg104 === value72.entityId) &&
            value129.unshift([value72.entityId, value72.entityId + "（当前绑定）"]),
            value129.length > 1
              ? fn19("有人状态来源", value129, value72.entityId || "", (arg105) => {
                  ((value72.entityId = arg105),
                    arg105.startsWith("event.") &&
                      !(value72.displayDuration > 0) &&
                      (value72.displayDuration = 30),
                    fn17());
                })
              : value8.append(
                  fn1(
                    "p",
                    "i3d-note",
                    value129.length
                      ? "检测实体：" + value129[0][1]
                      : "设备暂无可用检测实体，请重新选择设备。",
                  ),
                ));
        }
        value8 = value126;
      }
      const value82 = fn2(
        arg5.find((arg106) => arg106.entityId === value72.entityId)?.name ||
          value72.entityId ||
          "选择" + fn5() + "实体",
        async () => {
          const value130 = ++value22;
          value21?.close();
          try {
            const value131 = await arg3.entity({
              trigger: value82,
              current: value72.entityId,
              deviceKind: text1,
              onSelect(arg107) {
                value15 ||
                  !value16 ||
                  value130 !== value22 ||
                  fn7() !== value72 ||
                  ((value72.entityId = arg107),
                  text1 === "presence" &&
                    (delete value72.deviceId, delete value72.deviceName, map1.delete(value72.id)),
                  text1 === "presence" &&
                    arg107.startsWith("event.") &&
                    !(value72.displayDuration > 0) &&
                    (value72.displayDuration = 30),
                  fn17(),
                  fn30());
              },
            });
            value15 || value130 !== value22 ? value131?.close() : (value21 = value131);
          } catch (error8) {
            fn15(error8);
          }
        },
      );
      text1 === "presence" &&
        (value82.textContent = value72.entityId
          ? "手动绑定：" + value72.entityId
          : "手动选择实体（无设备归属）");
      const value83 = value82.textContent;
      value82.textContent = "";
      const value84 = fn1("span", "i3d-security-entity-label", value83);
      if (
        (value82.append(value84),
        (value82.title = value83),
        (value82.className = "i3d-picker-button"),
        value82.setAttribute("aria-label", "选择" + fn5() + "实体"),
        text1 === "presence")
      ) {
        if (
          (value81.append(
            fn1("p", "i3d-note", "可选择摄像头检测、人体传感器或自定义实体，按检测结果触发。"),
            value82,
          ),
          (value8 = value81),
          fn19("触发方式", PRESENCE_TRIGGER_MODES, value72.triggerMode || "auto", (arg108) => {
            ((value72.triggerMode = arg108),
              arg108 === "equals" && (value72.triggerValue ||= "on"),
              arg108 === "threshold" && (value72.triggerThreshold ??= 0),
              presenceTriggerIsTimed(value72) &&
                !(value72.displayDuration > 0) &&
                (value72.displayDuration = 30),
              fn17(),
              fn30());
          }),
          value72.triggerMode === "threshold" &&
            fn20(
              "数值大于",
              value72.triggerThreshold ?? 0,
              -1000000,
              1000000,
              (arg109) => {
                value72.triggerThreshold = arg109;
              },
              0.1,
              true,
            ),
          value72.triggerMode === "equals")
        ) {
          const value133 = fn1("input");
          ((value133.value = value72.triggerValue ?? "on"),
            (value133.maxLength = 128),
            value133.setAttribute("aria-label", "触发值"),
            value133.addEventListener("input", () => {
              value133.value.trim() &&
                ((value72.triggerValue = value133.value.trim().slice(0, 128)), fn17());
            }),
            value133.addEventListener("change", () => {
              value133.value = value72.triggerValue ?? "on";
            }));
          const value134 = fn1("label");
          (value134.append(fn1("span", "", "触发值"), value133), value8.append(value134));
        }
        const value132 = presenceTriggerIsTimed(value72);
        (fn20(
          "触发后显示（秒）",
          value72.displayDuration ?? (value132 ? 30 : 0),
          value132 ? 1 : 0,
          3600,
          (arg110) => {
            value72.displayDuration = arg110;
          },
          1,
          true,
        ),
          value8.append(
            fn1(
              "p",
              "i3d-note",
              value72.triggerMode === "change" || value72.triggerMode === "equals"
                ? "只比较状态值，属性刷新不触发；首次加载和离线恢复不触发。再次触发重新计时。"
                : value132
                  ? "按检测事件发生时间计时，再次检测重新计时；到时隐藏。"
                  : "0 秒：满足条件时持续显示，不满足时隐藏。其他值：达到时长后隐藏。自动识别开关状态、检测事件及名称明确的人数；其他数值请设置阈值。",
            ),
          ),
          (value8 = value75),
          value8.append(
            fn1("p", "i3d-note", "配置时点击标签选择传感器；正式页面仅展示模型和感应效果。"),
          ));
      } else text1 !== "lock" && value8.append(value82);
      if (text1 === "camera") {
        value8.append(
          fn1(
            "p",
            "i3d-note",
            "标签显示设备状态；仅点击聚焦后连接视频，退出时断开。可拖动标签调整位置。",
          ),
        );
        const value135 = fn27("标签设置"),
          value136 = fn1("div", "i3d-security-scope-grid");
        (value135.append(value136), (value8 = value136));
        const value137 = fn2(value72.icon || "mdi:cctv", async () => {
          const value147 = ++value22;
          value21?.close();
          try {
            const value148 = await arg3.icon({
              trigger: value137,
              current: value72.icon || "mdi:cctv",
              deviceKind: "camera",
              onSelect(arg111) {
                value15 ||
                  !value16 ||
                  value147 !== value22 ||
                  fn7() !== value72 ||
                  ((value72.icon = arg111), fn17(), fn30());
              },
            });
            value15 || value147 !== value22 ? value148?.close() : (value21 = value148);
          } catch (error9) {
            fn15(error9);
          }
        });
        value137.className = "i3d-picker-button i3d-icon-picker-button";
        const value138 = fn1("i");
        ((value138.style.maskImage =
          "url('/bridge-static/vendor/mdi/7.4.47/svg/" +
          (value72.icon || "mdi:cctv").slice(4) +
          ".svg')"),
          (value138.style.webkitMaskImage = value138.style.maskImage),
          (value137.textContent = ""),
          value137.append(value138, fn1("span", "", value72.icon || "mdi:cctv")),
          value137.setAttribute("aria-label", "摄像头图标"));
        const value139 = fn1("label");
        (value139.append(fn1("span", "", "图标"), value137),
          value8.append(value139),
          fn20(
            "标签缩放（%）",
            Math.round(((value72.size ?? 44) / 44) * 100),
            10,
            500,
            (arg112) => {
              value72.size = (arg112 / 100) * 44;
            },
            1,
          ),
          appendBackgroundOpacityControl(value135, value72, "backgroundOpacity", fn17));
        const value140 = fn28("更多尺寸设置", "camera-sizes", value135),
          value141 = fn1("div", "i3d-coordinate-grid i3d-security-size-grid");
        (value140.append(value141),
          (value8 = value141),
          fn20(
            "图标大小（px）",
            value72.iconSize ?? 26,
            4,
            200,
            (arg113) => {
              value72.iconSize = arg113;
            },
            1,
          ),
          fn20(
            "文字大小（px）",
            value72.fontSize ?? 12,
            8,
            100,
            (arg114) => {
              value72.fontSize = arg114;
            },
            1,
          ),
          fn20(
            "触控范围（px）",
            value72.hitSize ?? 44,
            1,
            1000,
            (arg115) => {
              value72.hitSize = arg115;
            },
            1,
          ));
        const value142 = fn27("标签位置"),
          value143 = fn1("div", "i3d-coordinate-grid");
        (value142.append(value143), (value8 = value143));
        const value144 = fn12().find((arg116) => fn10(arg116) === value72.modelId);
        for (const value149 of ["x", "y"])
          fn20(
            "位置 " + value149.toUpperCase(),
            value72[value149] ?? value144?.[value149] ?? 0,
            -1000000,
            1000000,
            (arg117) => {
              value72[value149] = arg117;
            },
          );
        (fn20(
          "离地高度（米）",
          value72.height ?? value144?.height ?? 0.15,
          -1000,
          1000,
          (arg118) => {
            value72.height = arg118;
          },
        ),
          (value8 = value142));
        const value145 = fn2("恢复跟随模型", () => {
          (delete value72.x, delete value72.y, delete value72.height, fn17(), fn30());
        });
        ((value145.disabled = !["x", "y", "height"].some((arg119) =>
          Number.isFinite(value72[arg119]),
        )),
          (value145.className = "i3d-focus-reset"),
          value8.append(value145),
          value8.append(
            fn1("p", "i3d-note", "仅调整标签，不移动摄像头模型。也可在预览中拖动标签。"),
          ),
          fn27("聚焦视角"));
        const value146 = fn1("div", "i3d-focus-actions");
        if (
          (value18
            ? value146.append(
                fn2("保存视角", () => fn25("save-light-camera")),
                fn2("取消调整", () => fn25("cancel-light-camera")),
              )
            : value146.append(
                fn2(value72.focusCamera ? "调整视角" : "设置视角", () => fn25("edit-light-camera")),
                fn2("预览聚焦", () => fn25("preview-light-camera")),
              ),
          value8.append(value146),
          value18)
        ) {
          const value150 = fn1("div", "i3d-focus-actions");
          (value150.setAttribute("role", "group"), value150.setAttribute("aria-label", "聚焦投影"));
          for (const [value153, value154] of [
            ["orthographic", "正交"],
            ["perspective", "透视"],
          ]) {
            const value155 = fn2(value154, () => fn25("focus-projection", value153));
            (value155.setAttribute(
              "aria-pressed",
              String((value19?.mode || "orthographic") === value153),
            ),
              value150.append(value155));
          }
          const value151 = fn1("input");
          (Object.assign(value151, {
            type: "number",
            min: "18",
            max: "120",
            step: "1",
            value: String(Math.round(value19?.focalLength || 50)),
          }),
            value151.setAttribute("aria-label", "焦段（mm）"),
            (value151.dataset.focusFocal = "true"),
            value151.addEventListener("change", () => {
              const value156 = Number(value151.value);
              if (!value151.value.trim() || !Number.isFinite(value156)) {
                value151.value = String(value19?.focalLength || 50);
                return;
              }
              ((value151.value = String(Math.max(18, Math.min(120, value156)))),
                fn25("focus-focal-length", Number(value151.value)));
            }));
          const value152 = fn1("label");
          (value152.append(fn1("span", "", "焦段（mm）"), value151),
            value8.append(value150, value152));
        }
        if (!value18) {
          const value157 = fn2("恢复自动聚焦", async () => {
            if (!(value17 || !value16)) {
              ((value17 = true), fn30());
              try {
                if (
                  (await value14.focusCommand("cancel-light-camera", fn13(value72)),
                  value15 || !value16)
                )
                  return;
                (delete value72.focusCamera, fn17());
              } catch (error10) {
                fn15(error10);
              } finally {
                ((value17 = false), value15 || fn30());
              }
            }
          });
          ((value157.disabled = !value72.focusCamera),
            (value157.className = "i3d-focus-reset"),
            value8.append(value157));
        }
      }
      if (text1 === "presence") {
        if (value72.modelId) {
          const value158 = fn27("感应光圈");
          fn19(
            "显示光圈",
            [
              ["on", "开启"],
              ["off", "关闭"],
            ],
            value72.waveEnabled === false ? "off" : "on",
            (arg120) => {
              ((value72.waveEnabled = arg120 === "on"), fn17(), fn30());
            },
          );
          const value159 = fn1("div", "i3d-security-scope-grid");
          if (
            (value158.append(value159),
            (value8 = value159),
            fn20(
              "光圈大小（%）",
              Math.round((value72.waveScale ?? 1) * 100),
              25,
              300,
              (arg121) => {
                value72.waveScale = arg121 / 100;
              },
              1,
            ),
            fn20(
              "光圈透明度（%）",
              100 - (value72.waveOpacity ?? 68),
              0,
              100,
              (arg122) => {
                value72.waveOpacity = 100 - arg122;
              },
              1,
            ),
            value72.waveEnabled === false)
          ) {
            for (const value160 of value159.querySelectorAll("input")) value160.disabled = true;
          }
        }
        (fn27("人物展示"),
          value8.append(fn2("配置人物与行走路线", fn26)),
          value8.append(
            fn1("p", "i3d-note", "按需设置人物、显示时长与行走路线。设备绑定在上方统一管理。"),
          ));
      }
      text1 !== "lock" &&
        fn27("批量设置").append(fn2("一键应用到其他" + fn5(), () => fn29(value72)));
      const value85 = fn27("绑定管理"),
        value86 = fn2("移除" + fn5() + "绑定", () => {
          (fn18(),
            (value1.security[fn4()] = fn6().filter((arg123) => arg123 !== value72)),
            (text2 = ""),
            fn17(),
            fn30());
        });
      ((value86.className = "i3d-remove-light"), value85.append(value86));
    }
    const value73 = text1 + ":" + value13 + ":" + text2;
    if (
      (value73 !== text3 && ((text3 = value73), (value7.scrollTop = 0)),
      (value8 = value7),
      value8.append(value11),
      value17 || value18 || !value16 || value24)
    ) {
      for (const value161 of value7.querySelectorAll("button,input,select"))
        value161.disabled = true;
      if (value18 && !value17 && value16) {
        for (const value162 of value7.querySelectorAll(".i3d-focus-actions button"))
          value162.disabled = false;
      }
      for (const value163 of value7.querySelectorAll("input"))
        value163.dataset.focusFocal &&
          (value163.disabled = value17 || !value16 || value19?.mode !== "perspective");
    }
  }
  function fn31() {
    value15 ||
      !value16 ||
      value14 ||
      value24 ||
      ((value14 = mountInteraction3d(value10, {
        component: {
          ...arg1,
          properties: fn14(),
        },
        context: {
          document: arg2,
          editable: true,
        },
        editing: true,
        editingModule: "security",
        editingSecurityKind: text1,
        onReady(arg124) {
          ((value12 = arg124),
            fn11(),
            value12.floors.some((arg125) => arg125.id === value13) ||
              (value13 = value12.floors[0]?.id || ""),
            fn30(),
            fn16());
        },
        onEdit(arg126) {
          if (!(value15 || !value16)) {
            if (arg126.action === "position") {
              const value164 = /^(camera|lock):(.+)$/.exec(arg126.id || ""),
                value165 =
                  value164?.[1] === "lock" ? "locks" : value164?.[1] === "camera" ? "cameras" : "",
                value166 =
                  value165 && value1.security[value165].find((arg127) => arg127.id === value164[2]);
              value166 &&
                Number.isFinite(arg126.x) &&
                Number.isFinite(arg126.y) &&
                ((value166.x = arg126.x), (value166.y = arg126.y), fn17());
            }
            if (
              (arg126.action === "focus-exited" && ((value18 = false), fn30()),
              arg126.action === "select" && /^(camera|presence|lock):/.test(arg126.id || ""))
            ) {
              const value167 = arg126.id.indexOf(":");
              ((text1 = arg126.id.slice(0, value167)),
                (text2 = arg126.id.slice(value167 + 1)),
                fn30());
            }
          }
        },
        onLoadError: fn15,
      })),
      document.dispatchEvent(new Event("hb-i3d-preview-scope")));
  }
  return (
    document.head.append(value2),
    document.body.append(value3),
    value3.showModal(),
    fn30(),
    fn22(),
    fn31(),
    (fn23 = subscribeInteraction3dAccess(fn24)),
    {
      close: fn21,
    }
  );
}
