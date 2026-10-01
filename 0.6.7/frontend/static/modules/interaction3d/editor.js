import { resolvePageBehavior } from "./page-behavior.js?v=20260911-page-behavior-light-v2-20260926-speaker-v1";
import {
  performanceWarnings,
  confirmPerformanceWarning,
} from "./performance-warning.js?v=20260908-performance-warning-v1-motion-resolution-v1-20260918-review-1234-v2";
import { normalizeGroundReflection } from "./reflection-settings.js?v=20260918-reflection-user-settings-v1-20260918-review-1234-v2";
import {
  requestInteraction3dAccess,
  getInteraction3dEditorView,
  waitInteraction3dEditorView,
  cancelOtherInteraction3dViews,
} from "./bridge.js?v=20260926-integration-v1-reload-diagnostics-v2";
import {
  createInteraction3dCover,
  updateInteraction3dCoverMessage,
} from "./cover.js?v=20260905-interaction3d-cover-v1-20260908-access-lock-v1";
import { withRequestTimeout } from "../../utils/request-timeout.js?v=20260907-browser-compat-v1";
import {
  INTERACTION3D_LIGHTING_MODES,
  normalizeInteraction3dLightingMode,
  BACKGROUND_THEMES,
  normalizeBackgroundTheme,
} from "./definition.js?v=20260905-interaction3d-v1-20260908-environment-v1-20260908-lighting-mode-v1-20260908-curtains-v1-background-theme-v2-warm-wood-v1-20260918-review-1234-v2-region-only-v1-20260926-fan-v1-20260926-airer-v2";
export function interaction3dEntries(arg1, arg2 = [], arg3 = new Map()) {
  if (Array.isArray(arg1))
    arg1.forEach((arg4, arg5) =>
      interaction3dEntries(arg4, [...arg2, String(arg4?.id ?? arg4?.path ?? arg5)], arg3),
    );
  else {
    if (arg1 && typeof arg1 == "object") {
      if (arg1.type === "interaction3d") return (arg3.set(JSON.stringify(arg2), arg1), arg3);
      for (const [value1, value2] of Object.entries(arg1))
        interaction3dEntries(value2, [...arg2, value1], arg3);
    }
  }
  return arg3;
}
function Ln(arg6, arg7) {
  if (arg6 === arg7) return true;
  if (
    !arg6 ||
    !arg7 ||
    typeof arg6 != "object" ||
    typeof arg7 != "object" ||
    Array.isArray(arg6) !== Array.isArray(arg7)
  )
    return false;
  const value3 = Object.keys(arg6);
  return value3.length !== Object.keys(arg7).length
    ? false
    : value3.every((arg8) => Object.hasOwn(arg7, arg8) && Ln(arg6[arg8], arg7[arg8]));
}
function kn(arg9) {
  if (!arg9) return null;
  const { zIndex: value4, ...value5 } = arg9.position || {};
  return {
    ...arg9,
    position: value5,
  };
}
export function changesInteraction3d(arg10, arg11) {
  const value6 = interaction3dEntries(arg10),
    value7 = interaction3dEntries(arg11);
  for (const [value8, value9] of value7) if (!Ln(kn(value9), kn(value6.get(value8)))) return true;
  const set1 = new Set(
    (arg11?.sharedComponents || [])
      .filter((arg12) => interaction3dEntries(arg12).size)
      .map((arg13) => arg13.id),
  );
  return (arg11?.pages || []).some((arg14) => {
    const set2 = new Set(
      (arg10?.pages || []).find((arg15) => arg15.id === arg14.id)?.sharedComponentIds || [],
    );
    return (arg14.sharedComponentIds || []).some((arg16) => set1.has(arg16) && !set2.has(arg16));
  });
}
export async function guardInteraction3dChanges(arg17, arg18) {
  changesInteraction3d(arg17, arg18) && (await requestInteraction3dAccess());
}
export function renderInteraction3dThumbnail(arg19) {
  (arg19.classList.add("interaction3d-thumbnail"), arg19.append(createInteraction3dCover()));
}
const gt = new WeakMap();
export async function updateInteraction3dCard(arg20) {
  const object1 = {
    denied: gt.get(arg20)?.denied === true,
  };
  (gt.set(arg20, object1), (arg20.disabled = true), (arg20.title = "3D 交互"));
  const value10 = arg20.querySelector(".interaction3d-cover-title");
  ((value10.hidden = false),
    object1.denied || updateInteraction3dCoverMessage(value10, ["正在验证 3D 交互授权…"]));
  try {
    if ((await requestInteraction3dAccess(), gt.get(arg20) !== object1)) return;
    ((object1.denied = false),
      (arg20.disabled = false),
      (arg20.title = "添加 3D 交互控件"),
      (value10.hidden = true));
  } catch (error1) {
    if (gt.get(arg20) !== object1) return;
    ((object1.denied ||= error1?.status === 403),
      (value10.hidden = false),
      updateInteraction3dCoverMessage(
        value10,
        object1.denied
          ? undefined
          : [
              error1?.status === 401
                ? "登录状态已失效，请重新登录"
                : "暂时无法验证授权，请稍后重试",
            ],
      ),
      (arg20.title = error1?.status === 403 ? "3D 交互" : "3D 交互暂时无法连接，请稍后重试"));
  }
}
const Wt = new Map(),
  Nn = new WeakMap();
export async function requestInteraction3dScene() {
  return withRequestTimeout(20000, async (arg21) => {
    const value11 = await fetch("/api/v1/modules/interaction3d/scenes", {
        method: "POST",
        credentials: "same-origin",
        signal: arg21,
      }),
      value12 = await value11.json().catch(() => ({}));
    if (!value11.ok)
      throw new Error(
        typeof value12.detail == "string" ? value12.detail : "户型载入失败，请重试。",
      );
    if (!/^[0-9a-f]{32}$/.test(value12.sceneId || "")) throw new Error("户型载入失败，请重试。");
    return {
      sceneId: value12.sceneId,
    };
  });
}
export function renderInteraction3dInspector(arg22, arg23, arg24) {
  Nn.get(arg22)?.abort();
  const abortController1 = new AbortController();
  (Nn.set(arg22, abortController1),
    cancelOtherInteraction3dViews(arg23?.type === "interaction3d" ? arg23.id : null));
  let value13 = arg22.querySelector("#interaction3d-inspector");
  value13 ||
    ((value13 = document.createElement("section")),
    (value13.id = "interaction3d-inspector"),
    (value13.className = "inspector-form"),
    arg22.append(value13));
  const value14 = !value13.hidden && value13.dataset.componentId === arg23?.id,
    value15 = arg22.scrollTop,
    value16 = value13.contains(document.activeElement) ? document.activeElement.name : "",
    value17 = value13.style.minHeight;
  if (
    (value14 && (value13.style.minHeight = value13.getBoundingClientRect().height + "px"),
    (value13.hidden = arg23?.type !== "interaction3d"),
    value13.hidden)
  ) {
    value13.style.minHeight = value17;
    return;
  }
  value13.dataset.componentId = arg23.id;
  const map1 = new Map(
    value14
      ? [...value13.querySelectorAll("details")]
          .filter((arg25) => arg25.dataset.inspectorGroup)
          .map((arg26) => [arg26.dataset.inspectorGroup, arg26.open])
      : [],
  );
  value13.replaceChildren();
  const fn1 = (arg27, arg28 = "", arg29 = "") => {
      const value134 = document.createElement(arg27);
      return ((value134.className = arg28), (value134.textContent = arg29), value134);
    },
    fn2 = (arg30) => {
      const value135 = fn1("section", "inspector-section");
      return (value135.append(fn1("h3", "", arg30)), value13.append(value135), value135);
    },
    fn3 = (arg31, arg32, arg33) => {
      const value136 = fn1("label");
      return (value136.append(fn1("span", "", arg32), arg33), arg31.append(value136), arg33);
    },
    fn4 = (arg34) =>
      Promise.resolve(arg24.onChange(arg34)).catch((arg35) => arg24.onError?.(arg35)),
    value18 = arg23.properties || {},
    value19 = arg23.position || {},
    weakSet1 = new WeakSet(),
    fn5 = (arg36, arg37) => {
      ((arg36.value = String(arg37)), weakSet1.add(arg36));
      try {
        arg36.dispatchEvent?.(
          new Event("change", {
            bubbles: true,
          }),
        );
      } finally {
        weakSet1.delete(arg36);
      }
    },
    fn6 = async (arg38) =>
      (await confirmPerformanceWarning(performanceWarnings(value18, arg38), {
        document: document,
        signal: abortController1.signal,
      })) &&
      !abortController1.signal.aborted &&
      !value13.hidden &&
      value13.dataset.componentId === arg23.id,
    object2 = {
      rotationMode: value18.interaction?.rotationMode || value18.camera?.rotationMode || "free",
      panEnabled: false,
      zoomEnabled: false,
    },
    value20 = getInteraction3dEditorView(arg23.id),
    value21 = !!value20?.viewEditing,
    value22 = arg24.document?.canvas || {},
    value23 = Number(value22.width || 2778),
    value24 = Number(value22.height || 1940),
    value25 = Number(value19.width || 100),
    value26 = Number(value19.height || 100),
    value27 = fn2("布局与位置"),
    value28 = fn1("div", "image-layout-options");
  (value28.setAttribute("role", "group"), value28.setAttribute("aria-label", "3D 交互布局"));
  const value29 = value18.layoutMode === "fill";
  for (const [value137, value138] of [
    ["free", "自由"],
    ["fill", "铺满"],
  ]) {
    const value139 = fn1("button", "", value138);
    ((value139.type = "button"), (value139.dataset.interaction3dLayout = value137));
    const value140 = (value29 ? "fill" : "free") === value137;
    (value139.classList.toggle("active", value140),
      value139.setAttribute("aria-pressed", String(value140)),
      value139.addEventListener("click", () => {
        value140 ||
          fn4({
            properties: {
              layoutMode: value137,
            },
          });
      }),
      value28.append(value139));
  }
  const value30 = fn1("div", "inspector-grid two-columns");
  (value27.append(value28, value30), (value30.hidden = value29));
  const fn7 = (arg39, arg40, arg41, arg42, arg43) => {
    const value141 = fn1("input");
    (Object.assign(value141, {
      name: "i3d-position-" + arg39,
      type: "number",
      min: String(arg41),
      max: String(arg42),
      step: ".1",
      value: String(Math.round(arg40 * 10) / 10),
      disabled: value29,
    }),
      value141.addEventListener("change", () => {
        Number.isFinite(value141.valueAsNumber) &&
          fn4(arg43(Math.max(arg41, Math.min(arg42, value141.valueAsNumber))));
      }),
      fn3(value30, arg39, value141));
  };
  (fn7("左侧（%）", ((Number(value19.x || 0) + value25 / 2) / value23) * 100, 0, 100, (arg44) => ({
    position: {
      x: (arg44 * value23) / 100 - value25 / 2,
    },
  })),
    fn7("顶部（%）", ((Number(value19.y || 0) + value26 / 2) / value24) * 100, 0, 100, (arg45) => ({
      position: {
        y: (arg45 * value24) / 100 - value26 / 2,
      },
    })),
    fn7("宽度（%）", (value25 / value23) * 100, 0.1, 100, (arg46) => ({
      position: {
        width: (arg46 * value23) / 100,
      },
    })),
    fn7("高度（%）", (value26 / value24) * 100, 0.1, 100, (arg47) => ({
      position: {
        height: (arg47 * value24) / 100,
      },
    })),
    fn7("缩放（%）", Number(arg23.style?.scale || 1) * 100, 1, 500, (arg48) => ({
      style: {
        scale: arg48 / 100,
      },
    })),
    fn7("旋转（°）", Number(value19.rotation || 0), -360, 360, (arg49) => ({
      position: {
        rotation: arg49,
      },
    })));
  const value31 = fn2("户型"),
    value32 = fn1("p", "inspector-section-note");
  value32.setAttribute("role", "status");
  const value33 = (arg24.document?.projectId || "") + "/" + arg23.id;
  Wt.has(value33) ||
    Wt.set(value33, {
      state: "idle",
      error: "",
    });
  const value34 = Wt.get(value33),
    value35 = fn1("button", "", "重新载入户型");
  value35.type = "button";
  const value36 = fn1("button", "", "配置灯光");
  value36.type = "button";
  const value37 = fn1("button", "", "配置环境");
  value37.type = "button";
  const value38 = fn1("button", "", "户型渲染");
  value38.type = "button";
  const fn8 = async () => {
    (arg24.prepareCanvas?.(), (value58.hidden = false), (value58.textContent = "正在准备户型…"));
    const value142 = await waitInteraction3dEditorView(arg23.id);
    return value13.hidden || value13.dataset.componentId !== arg23.id
      ? null
      : ((value58.hidden = true), value142);
  };
  value38.addEventListener("click", async () => {
    if (value96 !== "region") {
      value38.disabled = true;
      try {
        if (!(await fn8())) return;
        await requestInteraction3dAccess();
        const { openInteraction3dAppearanceEditor: value143 } =
          await import("../../../api/v1/modules/interaction3d/config-editor.js?v=20260926-label-opacity-v1-20260925-lazy-catalog-v1-20260911-unified-device-settings-v2-furniture-plan-v1-20260912-model-hints-v1-tv-power-poster-v1-entity-picker-all-v1-light-preview-150-v1-fixed-effects-v2-presets-20260918-review-1234-v2-20260926-speaker-v1-20260926-fan-v1-20260926-airer-v2-20260926-focus-ui-v1");
        await value143({
          component: arg23,
          onSave: (arg50) =>
            arg24.onChange({
              properties: {
                baseLighting: arg50,
              },
            }),
        });
      } catch (error2) {
        ((value58.hidden = false), (value58.textContent = error2.message));
      } finally {
        value38.disabled = false;
      }
    }
  });
  const value39 = fn1("div", "i3d-house-actions");
  value31.append(value32, value35, value39);
  const value40 = fn2("灯光效果"),
    value41 = fn2("灯光");
  value41.append(value36);
  const value42 = fn2("环境");
  value42.append(value37);
  const value43 = fn2("设备"),
    value44 = fn1("button", "", "配置设备");
  ((value44.type = "button"),
    value43.append(value44),
    value44.addEventListener("click", async () => {
      value44.disabled = true;
      try {
        const { openInteraction3dEditor: value144 } =
          await import("../../../api/v1/modules/interaction3d/config-editor.js?v=20260926-label-opacity-v1-20260925-lazy-catalog-v1-20260911-unified-device-settings-v2-furniture-plan-v1-20260912-model-hints-v1-tv-power-poster-v1-entity-picker-all-v1-light-preview-150-v1-fixed-effects-v2-presets-20260918-review-1234-v2-20260926-speaker-v1-20260926-fan-v1-20260926-airer-v2-20260926-focus-ui-v1");
        await value144({
          component: arg23,
          deviceKind: "devices",
          document: arg24.document,
          entities: arg24.entities,
          states: arg24.states,
          pickers: arg24.pickers,
          onSave: (arg51) =>
            arg24.onChange(
              {
                properties: arg51,
              },
              {
                replaceProperties: true,
              },
            ),
        });
      } catch (error3) {
        arg24.onError?.(error3);
      } finally {
        value44.disabled = false;
      }
    }));
  const value45 = fn2("安防"),
    value46 = fn1("button", "", "配置安防");
  ((value46.type = "button"),
    value45.append(value46),
    value46.addEventListener("click", async () => {
      value46.disabled = true;
      try {
        await requestInteraction3dAccess();
        const { openSecurityEditor: value145 } =
          await import("../../../api/v1/modules/interaction3d/security-editor.js?v=20260926-label-opacity-v1-20260924-door-binding-v8-20260926-focus-ui-v1");
        await value145({
          component: arg23,
          panelDocument: arg24.document,
          entities: arg24.entities,
          pickers: arg24.pickers,
          onSave: async (arg52) => {
            await arg24.onChange({
              properties: {
                security: arg52.security,
              },
            });
          },
        });
      } catch (error4) {
        arg24.onError?.(error4);
      } finally {
        value46.disabled = false;
      }
    }));
  const value47 = fn2("扫地机"),
    value48 = fn1("button", "", "配置扫地机");
  ((value48.type = "button"),
    value47.append(value48),
    value48.addEventListener("click", async () => {
      value48.disabled = true;
      try {
        const { openInteraction3dEditor: value146 } =
          await import("../../../api/v1/modules/interaction3d/config-editor.js?v=20260926-label-opacity-v1-20260925-lazy-catalog-v1-20260911-unified-device-settings-v2-furniture-plan-v1-20260912-model-hints-v1-tv-power-poster-v1-entity-picker-all-v1-light-preview-150-v1-fixed-effects-v2-presets-20260918-review-1234-v2-20260926-speaker-v1-20260926-fan-v1-20260926-airer-v2-20260926-focus-ui-v1");
        await value146({
          component: arg23,
          deviceKind: "vacuum",
          document: arg24.document,
          entities: arg24.entities,
          states: arg24.states,
          pickers: arg24.pickers,
          onSave: (arg53) =>
            arg24.onChange(
              {
                properties: arg53,
              },
              {
                replaceProperties: true,
              },
            ),
        });
      } catch (error5) {
        arg24.onError?.(error5);
      } finally {
        value48.disabled = false;
      }
    }),
    (value34.refresh = () => {
      value32.isConnected &&
        ((value32.textContent = value18.sceneId
          ? "已关联户型，可继续配置视角和灯光。"
          : value34.state === "loading"
            ? "正在载入已保存的户型…"
            : value34.error || "尚未载入户型。"),
        (value32.hidden = !!value18.sceneId),
        (value35.hidden = !!value18.sceneId || value34.state === "loading"),
        (value36.disabled = !value18.sceneId || value21),
        (value46.disabled =
          value48.disabled =
          value44.disabled =
          value37.disabled =
            value36.disabled),
        (value38.disabled = !value18.sceneId || value21));
    }));
  const fn9 = async () => {
    if (value34.state !== "loading") {
      ((value34.state = "loading"), (value34.error = ""), value34.refresh());
      try {
        const value147 = await requestInteraction3dScene();
        (await arg24.onChange({
          properties: value147,
        }),
          (value34.state = "ready"));
      } catch (error6) {
        ((value34.state = "error"),
          (value34.error =
            error6.name === "TimeoutError" ? "户型载入超时，请重试。" : error6.message));
      }
      value34.refresh();
    }
  };
  (value35.addEventListener("click", () => void fn9()),
    value36.addEventListener("click", async () => {
      value36.disabled = true;
      try {
        await requestInteraction3dAccess();
        const { openInteraction3dEditor: value148 } =
          await import("../../../api/v1/modules/interaction3d/config-editor.js?v=20260926-label-opacity-v1-20260925-lazy-catalog-v1-20260911-unified-device-settings-v2-furniture-plan-v1-20260912-model-hints-v1-tv-power-poster-v1-entity-picker-all-v1-light-preview-150-v1-fixed-effects-v2-presets-20260918-review-1234-v2-20260926-speaker-v1-20260926-fan-v1-20260926-airer-v2-20260926-focus-ui-v1");
        await value148({
          component: arg23,
          document: arg24.document,
          entities: arg24.entities,
          states: arg24.states,
          pickers: arg24.pickers,
          onSave: (arg54) =>
            arg24.onChange(
              {
                properties: arg54,
              },
              {
                replaceProperties: true,
              },
            ),
        });
      } catch (error7) {
        arg24.onError?.(error7);
      } finally {
        value36.disabled = false;
      }
    }),
    value37.addEventListener("click", async () => {
      value37.disabled = true;
      try {
        await requestInteraction3dAccess();
        const { openInteraction3dEditor: value149 } =
          await import("../../../api/v1/modules/interaction3d/config-editor.js?v=20260926-label-opacity-v1-20260925-lazy-catalog-v1-20260911-unified-device-settings-v2-furniture-plan-v1-20260912-model-hints-v1-tv-power-poster-v1-entity-picker-all-v1-light-preview-150-v1-fixed-effects-v2-presets-20260918-review-1234-v2-20260926-speaker-v1-20260926-fan-v1-20260926-airer-v2-20260926-focus-ui-v1");
        await value149({
          component: arg23,
          deviceKind: "environment",
          document: arg24.document,
          entities: arg24.entities,
          states: arg24.states,
          pickers: arg24.pickers,
          onSave: (arg55) =>
            arg24.onChange(
              {
                properties: arg55,
              },
              {
                replaceProperties: true,
              },
            ),
        });
      } catch (error8) {
        arg24.onError?.(error8);
      } finally {
        value37.disabled = false;
      }
    }));
  const value49 = fn2("楼层视角"),
    value50 = fn1("div", "i3d-view-floor-row");
  value49.append(value50);
  const value51 = fn1("select");
  ((value51.name = "i3d-view-floor"),
    (value51.disabled = value21),
    fn3(value50, "视角楼层", value51));
  const value52 = fn1("input");
  (Object.assign(value52, {
    name: "i3d-floor-gap",
    type: "number",
    min: "0",
    max: "20",
    step: "0.1",
    value: String(value18.floorGap ?? value20?.metadata?.floorGap ?? 3),
  }),
    fn3(value50, "楼层间距（m）", value52),
    (value52.disabled = value18.floorSelection !== "all"),
    value52.addEventListener("change", () => {
      if (!value52.disabled) {
        if (Number.isFinite(value52.valueAsNumber)) {
          const value150 = Math.max(0, Math.min(20, value52.valueAsNumber));
          ((value52.value = String(value150)),
            fn4({
              properties: {
                floorGap: value150,
              },
            }));
        } else value52.value = String(value18.floorGap ?? value20?.metadata?.floorGap ?? 3);
      }
    }));
  const value53 = fn1("input");
  (Object.assign(value53, {
    name: "i3d-uniform-overview-stack",
    type: "checkbox",
    checked: value18.uniformOverviewStack ?? value20?.metadata?.uniformOverviewStack ?? false,
  }),
    fn3(value49, "多层等比例叠加", value53),
    (value53.parentElement.className = "i3d-setting-toggle i3d-view-toggle"),
    value49.append(
      fn1(
        "p",
        "inspector-section-note",
        "仅总览生效：各层使用相同视角。调小楼层间距可让各层继续靠近，允许重叠。",
      ),
    ),
    value53.addEventListener("change", () => {
      value53.disabled ||
        fn4({
          properties: {
            uniformOverviewStack: value53.checked,
          },
        });
    }));
  const value54 = fn1("div", "i3d-floor-number-group");
  value54.append(fn1("span", "i3d-floor-number-title", "楼层编号"));
  const value55 = fn1("div", "i3d-floor-number-fields");
  (value54.append(value55), value49.append(value54));
  const fn10 = (arg56) => {
      (value55.replaceChildren(), (value54.hidden = !arg56.length));
      for (const [value151, value152] of arg56.entries()) {
        const value153 = value152.id,
          value154 = value152.name || "未命名楼层",
          value155 = value18.floorNumbers?.[value153] ?? value152.number ?? value151 + 1,
          value156 = fn1("input");
        (Object.assign(value156, {
          type: "number",
          min: "-99",
          max: "99",
          step: "1",
          value: String(value155),
          name: "i3d-floor-number-" + value153,
          title: "负数为地下层，1 为一层",
          disabled: value21,
        }),
          fn3(value55, value154, value156));
        let value157 = value155;
        value156.addEventListener("change", async () => {
          let value158 = value156.valueAsNumber;
          if (
            (value158 === 0 && (value158 = value157 < 0 ? 1 : -1),
            !Number.isInteger(value158) || value158 < -99 || value158 > 99)
          ) {
            value156.value = String(value157);
            return;
          }
          const object8 = {
            ...value18.floorNumbers,
            [value153]: value158,
          };
          value156.disabled = true;
          try {
            (await arg24.onChange({
              properties: {
                floorNumbers: object8,
              },
            }),
              (value18.floorNumbers = object8),
              (value157 = value158),
              (value156.value = String(value158)));
          } catch (error9) {
            ((value156.value = String(value157)), arg24.onError?.(error9));
          } finally {
            value156.disabled = value21;
          }
        });
      }
    },
    fn11 = (arg57) => {
      if (!value51.isConnected) return;
      const value159 = arg57?.metadata?.floors || [];
      (fn10(value159),
        value18.floorGap === undefined &&
          Number.isFinite(arg57?.metadata?.floorGap) &&
          (value52.value = String(arg57.metadata.floorGap)),
        value51.replaceChildren());
      const value160 = value159.length
        ? [
            ...(value159.length > 1 ? [["all", "全部楼层"]] : []),
            ...value159.map((arg58) => [arg58.id, arg58.name || "未命名楼层"]),
          ]
        : [[value18.floorSelection || "all", "当前楼层"]];
      for (const [value161, value162] of value160) {
        const value163 = fn1("option", "", value162);
        ((value163.value = value161), value51.append(value163));
      }
      ((value51.value = value18.floorSelection || value160[0][0]),
        (value52.disabled = value51.value !== "all" || value159.length < 2),
        (value53.disabled = value52.disabled),
        value18.uniformOverviewStack === undefined &&
          (value53.checked = arg57?.metadata?.uniformOverviewStack === true),
        (value51.disabled = value21 || value159.length < 2));
    };
  (fn11(value20),
    value18.sceneId &&
      !value20?.metadata?.floors?.length &&
      typeof waitInteraction3dEditorView == "function" &&
      waitInteraction3dEditorView(arg23.id)
        .then(fn11)
        .catch(() => {}),
    value51.addEventListener("change", async () => {
      if (value21) return;
      const value164 = value51.value,
        object9 = {
          ...value18.floorCameras,
        };
      value18.camera &&
        value18.floorSelection &&
        !object9[value18.floorSelection] &&
        (object9[value18.floorSelection] = value18.camera);
      const object10 = {
        floorSelection: value164,
        floorCameras: object9,
        camera: object9[value164] || null,
      };
      (await fn4({
        properties: object10,
      }),
        renderInteraction3dInspector(
          arg22,
          {
            ...arg23,
            properties: {
              ...value18,
              ...object10,
            },
          },
          arg24,
        ));
    }));
  const value56 = fn1("button", value21 ? "primary" : "", value21 ? "完成并固定" : "调整户型视角");
  ((value56.type = "button"),
    (value56.disabled = !value18.sceneId),
    value56.setAttribute("aria-pressed", String(value21)));
  const value57 = fn1("button", "", "取消本次调整");
  ((value57.type = "button"), (value57.hidden = !value21));
  const value58 = fn1("p", "inspector-section-note");
  ((value58.hidden = true),
    value56.addEventListener("click", async () => {
      value56.disabled = true;
      try {
        const value165 = await fn8();
        if (!value165) return;
        if (value165.viewEditing) {
          const value166 = await value165.captureView(),
            object11 = {
              ...value18.floorCameras,
              [value18.floorSelection || value51.value]: value166,
            };
          (await arg24.onChange({
            properties: {
              camera: value166,
              floorCameras: object11,
              interaction: object2,
            },
          }),
            value165.setViewEditing(false),
            renderInteraction3dInspector(
              arg22,
              {
                ...arg23,
                properties: {
                  ...value18,
                  camera: value166,
                  floorCameras: object11,
                  interaction: object2,
                },
              },
              arg24,
            ));
        } else (value165.setViewEditing(true), renderInteraction3dInspector(arg22, arg23, arg24));
      } catch (error10) {
        ((value58.hidden = false), (value58.textContent = error10.message));
      } finally {
        value56.disabled = false;
      }
    }),
    value57.addEventListener("click", () => {
      (getInteraction3dEditorView(arg23.id)?.setViewEditing(false),
        renderInteraction3dInspector(arg22, arg23, arg24));
    }),
    value39.append(value56),
    value49.append(value39),
    value49.append(value57, value58));
  const value59 = fn1("div", "i3d-view-options");
  ((value59.hidden = !value21), value49.append(value59));
  const value60 = value20?.viewCamera || value18.camera || {},
    fn12 = async (arg59, arg60) => {
      try {
        const value167 = getInteraction3dEditorView(arg23.id);
        if (!value167?.viewEditing) return;
        (await value167.viewCommand(arg59, arg60),
          renderInteraction3dInspector(arg22, arg23, arg24));
      } catch (error11) {
        ((value58.hidden = false), (value58.textContent = error11.message));
      }
    };
  ((arg61, arg62, arg63, arg64) => {
    const value168 = fn1("div", "navigation-property-control"),
      value169 = fn1("div", "navigation-segmented-options");
    (value169.setAttribute("role", "group"), value169.setAttribute("aria-label", "3D " + arg61));
    for (const [value170, value171] of arg63) {
      const value172 = fn1("button", "", value171);
      ((value172.type = "button"),
        (value172.disabled = !value21),
        value172.classList.toggle("active", value170 === arg64),
        value172.setAttribute("aria-pressed", String(value170 === arg64)),
        value172.addEventListener("click", () => void fn12(arg62, value170)),
        value169.append(value172));
    }
    (value168.append(fn1("span", "", arg61), value169), value59.append(value168));
  })(
    "投影",
    "projection",
    [
      ["orthographic", "正交"],
      ["perspective", "透视"],
    ],
    value60.mode || "orthographic",
  );
  const value61 = fn1("input");
  (Object.assign(value61, {
    name: "i3d-focal-length",
    type: "number",
    min: "18",
    max: "120",
    step: "1",
    value: String(Math.round(value60.focalLength || 50)),
    disabled: !value21 || value60.mode !== "perspective",
  }),
    value61.addEventListener("change", () => {
      Number.isFinite(value61.valueAsNumber) &&
        fn12("focal-length", Math.max(18, Math.min(120, value61.valueAsNumber)));
    }),
    fn3(value59, "焦段（mm）", value61));
  const value62 = fn2("导航位置"),
    object3 = {
      categories: {
        x: 50,
        y: 94,
        ...value18.navigation?.categories,
      },
      floors: {
        x: 96,
        y: 50,
        ...value18.navigation?.floors,
      },
      followOffset: value18.navigation?.followOffset ?? 16,
    },
    list1 = [];
  for (const [value173, value174] of [
    ["categories", "分类栏"],
    ["floors", "楼层栏"],
  ]) {
    const value175 = fn1("div", "i3d-finishing-row");
    value62.append(value175);
    for (const [value176, value177] of [
      ["x", "横向"],
      ["y", "纵向"],
    ]) {
      const value178 = fn1("input");
      (Object.assign(value178, {
        name: "i3d-navigation-" + value173 + "-" + value176,
        type: "number",
        min: "0",
        max: "100",
        step: "1",
        value: String(object3[value173][value176]),
        disabled: value21,
      }),
        value178.addEventListener("change", () => {
          value21 ||
            (Number.isFinite(value178.valueAsNumber) &&
              ((object3[value173][value176] = Math.max(0, Math.min(100, value178.valueAsNumber))),
              fn4({
                properties: {
                  navigation: structuredClone(object3),
                },
              })),
            (value178.value = String(object3[value173][value176])));
        }),
        fn3(value175, "" + value174 + value177 + "（%）", value178),
        list1.push([value178, value173, value176]));
    }
  }
  const value63 = fn1("div", "i3d-finishing-row");
  value62.append(value63);
  const list2 = [];
  for (const [value179, value180] of [
    ["categories", "分类栏"],
    ["floors", "楼层栏"],
  ]) {
    const value181 = fn1("input");
    (Object.assign(value181, {
      name: "i3d-navigation-" + value179 + "-scale",
      type: "number",
      min: "50",
      max: "1000",
      step: "5",
      value: String(Math.round((object3[value179].scale ?? 1) * 100)),
      disabled: value21,
    }),
      value181.addEventListener("change", () => {
        value21 ||
          (Number.isFinite(value181.valueAsNumber) &&
            ((object3[value179].scale = Math.max(50, Math.min(1000, value181.valueAsNumber)) / 100),
            fn4({
              properties: {
                navigation: structuredClone(object3),
              },
            })),
          (value181.value = String(Math.round((object3[value179].scale ?? 1) * 100))));
      }),
      fn3(value63, value180 + "缩放（%）", value181),
      list2.push(value181));
  }
  const value64 = fn1("button", "secondary-button", "恢复默认位置与大小");
  ((value64.type = "button"),
    (value64.disabled = value21),
    value64.addEventListener("click", () => {
      if (!value21) {
        Object.assign(object3, {
          categories: {
            x: 50,
            y: 94,
          },
          floors: {
            x: 96,
            y: 50,
          },
        });
        for (const [value182, value183, value184] of list1)
          value182.value = String(object3[value183][value184]);
        for (const value185 of list2) value185.value = "100";
        fn4({
          properties: {
            navigation: structuredClone(object3),
          },
        });
      }
    }),
    value62.append(value64));
  const value65 = fn2("交互行为");
  let value66 = value18.behaviorScope === "page" ? "page" : "global";
  const list3 = [
    ["overview", "ALL（全部楼层）"],
    ["light", "灯光"],
    ["environment", "环境"],
    ["devices", "设备"],
    ["vacuum", "扫地机"],
    ["security", "安防"],
  ];
  let value67 = arg22.dataset.behaviorPage || "light",
    value68 = structuredClone(value18.pageBehaviors || {}),
    object4 = {
      ...value18,
      pageBehaviors: value68,
    };
  const fn13 = () =>
      resolvePageBehavior(
        {
          ...object4,
          behaviorScope: value66,
          pageBehaviors: value68,
        },
        value67,
      ),
    fn14 = (arg65) => (arg65 === "hideIconsWhileRotating" ? fn13()[arg65] : fn13()[arg65].enabled),
    value69 = fn1("div", "i3d-behavior-scope-row"),
    value70 = fn1("select"),
    value71 = fn1("select");
  (Object.assign(value70, {
    name: "i3d-behavior-scope",
    disabled: value21,
  }),
    value70.setAttribute("aria-label", "交互行为设置范围"));
  for (const [value186, value187] of [
    ["global", "全部页面"],
    ["page", "单页面"],
  ]) {
    const value188 = fn1("option", "", value187);
    ((value188.value = value186), value70.append(value188));
  }
  ((value70.value = value66),
    Object.assign(value71, {
      name: "i3d-behavior-page",
      disabled: value21,
    }),
    value71.setAttribute("aria-label", "交互设置页面"));
  for (const [value189, value190] of list3) {
    const value191 = fn1("option", "", value190);
    ((value191.value = value189), value71.append(value191));
  }
  value71.value = value67;
  const value72 = fn1("div");
  (value72.append(value71),
    (value72.hidden = value66 !== "page"),
    value69.append(value70, value72),
    value65.append(value69),
    value65.append(
      fn1(
        "p",
        "inspector-section-note",
        "以下设置统一应用于所选范围；单页面未单独设置的参数沿用全部页面。",
      ),
    ));
  const fn15 = (arg66, arg67) => {
      if (!value21) {
        if (value66 === "page") {
          const value192 = value68[value67]?.[arg66],
            value193 =
              typeof arg67 == "boolean"
                ? arg67
                : {
                    ...(typeof value192 == "boolean"
                      ? {
                          enabled: value192,
                        }
                      : value192 || {}),
                    ...arg67,
                  };
          ((value68 = {
            ...value68,
            [value67]: {
              ...value68[value67],
              [arg66]: value193,
            },
          }),
            fn4({
              properties: {
                pageBehaviors: value68,
              },
            }));
        } else {
          const value194 =
            typeof arg67 == "boolean"
              ? arg67
              : {
                  ...resolvePageBehavior({
                    ...object4,
                    behaviorScope: "global",
                  })[arg66],
                  ...arg67,
                };
          ((object4 = {
            ...object4,
            [arg66]: value194,
          }),
            fn4({
              properties: {
                [arg66]: value194,
              },
            }));
        }
      }
    },
    fn16 = (arg68, arg69) =>
      fn15(
        arg68,
        arg68 === "hideIconsWhileRotating"
          ? arg69
          : {
              enabled: arg69,
            },
      );
  (value70.addEventListener("change", () => {
    value21 ||
      ((value66 = value70.value),
      fn18(),
      fn4({
        properties: {
          behaviorScope: value66,
          ...(value66 === "page"
            ? {
                pageBehaviors: value68,
              }
            : {}),
        },
      }));
  }),
    value71.addEventListener("change", () => {
      ((value67 = value71.value), (arg22.dataset.behaviorPage = value67), fn18());
    }));
  const value73 = fn1("div", "navigation-property-control"),
    value74 = fn1("div", "navigation-segmented-options three-columns");
  (value74.setAttribute("role", "group"), value74.setAttribute("aria-label", "3D 旋转方式"));
  for (const [value195, value196] of [
    ["free", "自由"],
    ["horizontal", "仅左右"],
    ["vertical", "仅上下"],
  ]) {
    const value197 = fn1("button", "", value196);
    ((value197.type = "button"),
      (value197.disabled = value21),
      (value197.dataset.rotationMode = value195));
    const value198 = fn13().interaction.rotationMode === value195;
    (value197.classList.toggle("active", value198),
      value197.setAttribute("aria-pressed", String(value198)),
      value197.addEventListener("click", () => {
        (fn15("interaction", {
          rotationMode: value195,
        }),
          fn18());
      }),
      value74.append(value197));
  }
  (value73.append(fn1("span", "", "旋转方式"), value74), value65.append(value73));
  const value75 = fn2("自动旋转"),
    object5 = {
      ...fn13().autoRotate,
    },
    value76 = fn1("label", "i3d-setting-toggle i3d-view-toggle"),
    value77 = fn1("input");
  (Object.assign(value77, {
    name: "i3d-auto-rotate-enabled",
    type: "checkbox",
    checked: object5.enabled,
    disabled: value21,
  }),
    value76.append(fn1("span", "", "开启自动旋转"), value77));
  const value78 = fn1("div", "inspector-grid two-columns");
  value78.hidden = !object5.enabled;
  const value79 = fn1("div", "i3d-auto-rotate-row"),
    value80 = fn1("div", "navigation-segmented-options");
  (value80.setAttribute("role", "group"), value80.setAttribute("aria-label", "自动旋转方向"));
  for (const [value199, value200] of [
    ["clockwise", "顺时针"],
    ["counterclockwise", "逆时针"],
  ]) {
    const value201 = fn1("button", "", value200);
    ((value201.type = "button"),
      (value201.disabled = value21),
      (value201.dataset.direction = value199),
      value201.classList.toggle("active", object5.direction === value199),
      value201.setAttribute("aria-pressed", String(object5.direction === value199)),
      value201.addEventListener("click", () => {
        if (!(value21 || object5.direction === value199)) {
          object5.direction = value199;
          for (const value202 of value80.children) {
            const value203 = value202 === value201;
            (value202.classList.toggle("active", value203),
              value202.setAttribute("aria-pressed", String(value203)));
          }
          fn15("autoRotate", {
            direction: object5.direction,
          });
        }
      }),
      value80.append(value201));
  }
  (value79.append(value76, value80), value75.append(value79, value78));
  const fn17 = (arg70, arg71, arg72, arg73, arg74) => {
    const value204 = fn1("input");
    (Object.assign(value204, {
      type: "number",
      min: String(arg72),
      max: String(arg73),
      step: String(arg74),
      name: "i3d-auto-rotate-" + arg71,
      value: String(object5[arg71]),
      disabled: value21 || !object5.enabled,
    }),
      value204.addEventListener("change", () => {
        const value205 = value204.valueAsNumber;
        (Number.isFinite(value205) &&
          ((object5[arg71] = Math.max(
            arg72,
            Math.min(arg73, arg71 === "idleSeconds" ? Math.round(value205) : value205),
          )),
          fn15("autoRotate", {
            [arg71]: object5[arg71],
          })),
          (value204.value = String(object5[arg71])));
      }),
      fn3(value78, arg70, value204));
  };
  (fn17("等待时间（秒）", "idleSeconds", 1, 3600, 1),
    fn17("旋转速度（°/秒）", "speed", 0.5, 30, 0.5));
  const value81 = fn1("label", "i3d-setting-toggle i3d-view-toggle i3d-return-default"),
    value82 = fn1("input");
  (Object.assign(value82, {
    name: "i3d-auto-rotate-return-default",
    type: "checkbox",
    checked: object5.returnToDefault,
    disabled: value21 || !object5.enabled,
  }),
    value81.append(fn1("span", "", "旋转前回到默认视角"), value82),
    value82.addEventListener("change", () => {
      value82.disabled ||
        ((object5.returnToDefault = value82.checked),
        fn15("autoRotate", {
          returnToDefault: object5.returnToDefault,
        }));
    }),
    value77.addEventListener("change", () => {
      if (!value21) {
        ((object5.enabled = value77.checked),
          (value78.hidden = !object5.enabled),
          (value82.disabled = value21 || !object5.enabled));
        for (const value206 of value78.querySelectorAll("input"))
          value206.disabled = value21 || !object5.enabled;
        fn16("autoRotate", object5.enabled);
      }
    }));
  const value83 = fn2("闲置退出聚焦"),
    object6 = {
      ...fn13().idleExitFocus,
    },
    value84 = fn1("label", "i3d-setting-toggle i3d-view-toggle"),
    value85 = fn1("input");
  (Object.assign(value85, {
    name: "i3d-idle-exit-enabled",
    type: "checkbox",
    checked: object6.enabled,
    disabled: value21,
  }),
    value84.append(fn1("span", "", "无操作时自动退出"), value85));
  const value86 = fn1("div", "inspector-grid");
  value86.hidden = !object6.enabled;
  const value87 = fn1("input");
  (Object.assign(value87, {
    name: "i3d-idle-exit-seconds",
    type: "number",
    min: "1",
    max: "3600",
    step: "1",
    value: String(object6.idleSeconds),
    disabled: value21 || !object6.enabled,
  }),
    value87.addEventListener("change", () => {
      value87.disabled ||
        (Number.isFinite(value87.valueAsNumber) &&
          ((object6.idleSeconds = Math.max(1, Math.min(3600, Math.round(value87.valueAsNumber)))),
          fn15("idleExitFocus", {
            idleSeconds: object6.idleSeconds,
          })),
        (value87.value = String(object6.idleSeconds)));
    }),
    value87.setAttribute("aria-label", "闲置退出聚焦等待秒数"),
    fn3(value86, "等待时间（秒）", value87),
    value85.addEventListener("change", () => {
      value85.disabled ||
        ((object6.enabled = value85.checked),
        (value86.hidden = !object6.enabled),
        (value87.disabled = value21 || !object6.enabled),
        fn16("idleExitFocus", object6.enabled));
    }),
    value83.append(value84, value86));
  const value88 = fn2("图标显示");
  value88.classList.add("i3d-icon-visibility-row");
  const object7 = {
      ...fn13().idleHideIcons,
    },
    value89 = fn1("label", "i3d-setting-toggle i3d-view-toggle"),
    value90 = fn1("input");
  (Object.assign(value90, {
    name: "i3d-idle-icons-enabled",
    type: "checkbox",
    checked: object7.enabled,
    disabled: value21,
  }),
    value89.append(fn1("span", "", "闲置后隐藏图标"), value90));
  const value91 = fn1("div", "inspector-grid");
  value91.hidden = !object7.enabled;
  const value92 = fn1("input");
  (Object.assign(value92, {
    name: "i3d-idle-icons-seconds",
    type: "number",
    min: "1",
    max: "3600",
    step: "1",
    value: String(object7.idleSeconds),
    disabled: value21 || !object7.enabled,
  }),
    value92.addEventListener("change", () => {
      (Number.isFinite(value92.valueAsNumber) &&
        ((object7.idleSeconds = Math.max(1, Math.min(3600, Math.round(value92.valueAsNumber)))),
        fn15("idleHideIcons", {
          idleSeconds: object7.idleSeconds,
        })),
        (value92.value = String(object7.idleSeconds)));
    }),
    value92.setAttribute("aria-label", "隐藏图标等待秒数"),
    fn3(value91, "等待时间（秒）", value92),
    value90.addEventListener("change", () => {
      value21 ||
        ((object7.enabled = value90.checked),
        (value91.hidden = !object7.enabled),
        (value92.disabled = value21 || !object7.enabled),
        fn16("idleHideIcons", object7.enabled));
    }),
    value88.append(value89, value91));
  const value93 = fn1("label", "i3d-setting-toggle i3d-view-toggle"),
    value94 = fn1("input");
  (Object.assign(value94, {
    type: "checkbox",
    name: "i3d-hide-icons-rotating",
    checked: fn14("hideIconsWhileRotating"),
    disabled: value21,
  }),
    value94.addEventListener("change", () => fn16("hideIconsWhileRotating", value94.checked)),
    value93.append(fn1("span", "", "旋转时隐藏图标"), value94),
    value88.append(value93));
  function fn18() {
    value72.hidden = value66 !== "page";
    const value207 = fn13();
    (Object.assign(object5, value207.autoRotate),
      Object.assign(object6, value207.idleExitFocus),
      Object.assign(object7, value207.idleHideIcons));
    for (const value208 of value74.children) {
      const value209 = value208.dataset.rotationMode === value207.interaction.rotationMode;
      (value208.classList.toggle("active", value209),
        value208.setAttribute("aria-pressed", String(value209)));
    }
    for (const value210 of value80.children) {
      const value211 = value210.dataset.direction === object5.direction;
      (value210.classList.toggle("active", value211),
        value210.setAttribute("aria-pressed", String(value211)));
    }
    for (const value212 of value78.querySelectorAll("input"))
      value212.value = String(object5[value212.name.replace("i3d-auto-rotate-", "")]);
    ((value82.checked = object5.returnToDefault),
      (value85.checked = object6.enabled),
      (value87.value = String(object6.idleSeconds)),
      (value86.hidden = !object6.enabled),
      (value87.disabled = value21 || !object6.enabled),
      (value92.value = String(object7.idleSeconds)),
      (value77.checked = object5.enabled),
      (value78.hidden = !object5.enabled),
      (value82.disabled = value21 || !object5.enabled));
    for (const value213 of value78.querySelectorAll("input"))
      value213.disabled = value21 || !object5.enabled;
    ((object7.enabled = fn14("idleHideIcons")),
      (value90.checked = object7.enabled),
      (value91.hidden = !object7.enabled),
      (value92.disabled = value21 || !object7.enabled),
      (value94.checked = fn14("hideIconsWhileRotating")));
  }
  const value95 = fn2("画面显示");
  value95.classList.add("i3d-picture-settings");
  let value96 = normalizeInteraction3dLightingMode(value18.lightingMode);
  const value97 = fn1("select");
  ((value97.name = "i3d-lighting-mode"), value97.setAttribute("aria-label", "灯光模式"));
  for (const [value214, value215] of INTERACTION3D_LIGHTING_MODES) {
    const value216 = fn1("option", "", value215);
    ((value216.value = value214), value97.append(value216));
  }
  ((value97.value = value96),
    (value97.disabled = true),
    fn3(value40, "灯光模式", value97),
    value96 !== "region" && value40.append(value38));
  const value98 = fn1("div", "navigation-property-control"),
    value99 = fn1("div", "navigation-segmented-options");
  (value99.setAttribute("role", "group"), value99.setAttribute("aria-label", "户型底图"));
  for (const [value217, value218] of [
    [true, "显示"],
    [false, "隐藏"],
  ]) {
    const value219 = fn1("button", "", value218);
    value219.type = "button";
    const value220 = (value18.backgroundVisible !== false) === value217;
    (value219.classList.toggle("active", value220),
      value219.setAttribute("aria-pressed", String(value220)),
      value219.addEventListener("click", () => {
        value220 ||
          fn4({
            properties: {
              backgroundVisible: value217,
            },
          });
      }),
      value99.append(value219));
  }
  (value98.append(fn1("span", "", "户型底图"), value99), value95.append(value98));
  const value100 = fn1("select");
  ((value100.name = "i3d-scene-style"), value100.setAttribute("aria-label", "材质风格"));
  for (const [value221, value222] of [
    ["default", "默认风格"],
    ["warm-wood", "暖阳原木"],
  ]) {
    const value223 = fn1("option", "", value222);
    ((value223.value = value221), value100.append(value223));
  }
  const value101 = value18.sceneStyle === "warm-wood";
  ((value100.value = value101 ? "warm-wood" : "default"),
    value100.addEventListener("change", () => {
      if (weakSet1.has(value100)) return;
      const value224 = value100.value;
      fn4({
        properties: {
          sceneStyle: value224,
        },
      });
    }),
    fn3(value95, "材质风格", value100));
  const value102 = fn1("select");
  ((value102.name = "i3d-background-theme"), value102.setAttribute("aria-label", "背景主题"));
  for (const [value225, value226] of value101
    ? [
        ["warm-sunlight", "暖阳微光"],
        ["warm-dusk", "暖阳暮色"],
      ]
    : BACKGROUND_THEMES) {
    const value227 = fn1("option", "", value226);
    ((value227.value = value225), value102.append(value227));
  }
  if (
    ((value102.value =
      value101 && ["warm-sunlight", "warm-dusk"].includes(value18.warmBackgroundTheme)
        ? value18.warmBackgroundTheme
        : value101
          ? "warm-sunlight"
          : normalizeBackgroundTheme(value18.backgroundTheme)),
    (value102.disabled = false),
    value102.addEventListener("change", () => {
      weakSet1.has(value102) ||
        fn4({
          properties: value101
            ? {
                warmBackgroundTheme: value102.value,
              }
            : {
                backgroundTheme: normalizeBackgroundTheme(value102.value),
              },
        });
    }),
    fn3(value95, "背景主题", value102),
    value101)
  ) {
    const value228 = fn1("input");
    ((value228.type = "checkbox"),
      (value228.name = "i3d-background-motion"),
      (value228.checked = value18.backgroundMotion !== false),
      value228.setAttribute("aria-label", "背景动态"),
      value228.addEventListener("change", () => {
        fn4({
          properties: {
            backgroundMotion: value228.checked,
          },
        });
      }),
      fn3(value95, "背景动态", value228),
      (value228.parentElement.className = "i3d-setting-toggle i3d-view-toggle"));
  }
  value102.title = value101
    ? "随材质风格切换，亮区跟随当前楼层底部；ALL 时跟随最底层。"
    : "微光围绕户型中心渐隐，随视角呈现远近层次。";
  const value103 = fn1("select");
  ((value103.name = "i3d-wall-opacity-mode"),
    value103.setAttribute("aria-label", "墙体透明度模式"));
  for (const [value229, value230] of [
    ["diy", "沿用户型 DIY"],
    ["custom", "统一调整"],
  ]) {
    const value231 = fn1("option", "", value230);
    ((value231.value = value229), value103.append(value231));
  }
  const value104 = typeof value18.wallOpacity == "number" && Number.isFinite(value18.wallOpacity);
  ((value103.value = value104 ? "custom" : "diy"),
    value103.addEventListener("change", () => {
      fn4({
        properties: {
          wallOpacity: value103.value === "custom" ? (value18.wallOpacity ?? 0.25) : null,
        },
      });
    }),
    fn3(value95, "墙体透明度", value103));
  const value105 = fn1("div", "i3d-wall-opacity-row"),
    value106 = fn1("input"),
    value107 = fn1("input");
  value105.hidden = !value104;
  for (const [value232, value233] of [
    [value106, "range"],
    [value107, "number"],
  ])
    (Object.assign(value232, {
      type: value233,
      min: "0",
      max: "100",
      step: "1",
      value: String(Math.round((value18.wallOpacity ?? 0.25) * 100)),
      disabled: !value104,
    }),
      value232.setAttribute("aria-label", value233 === "range" ? "墙体透明度" : "墙体透明度百分比"),
      value232.addEventListener("input", () => {
        (value232 === value106 ? value107 : value106).value = value232.value;
      }),
      value232.addEventListener("change", () => {
        const value234 = Number(value232.value);
        Number.isFinite(value234) &&
          fn4({
            properties: {
              wallOpacity: Math.max(0, Math.min(100, value234)) / 100,
            },
          });
      }),
      value105.append(value232));
  const value108 = fn1("span", "i3d-wall-opacity-unit", "%");
  (value105.append(value108),
    (value105.title = "0% 全透明，100% 实心；切换风格保留此设置。"),
    value95.append(value105, fn1("p", "inspector-section-note", "仅影响当前控件，保留户型 DIY。")));
  const value109 = fn1("select");
  value109.name = "i3d-render-scale";
  for (const [value235, value236] of [
    [1.5, "高清 150%"],
    [1, "标准 100%"],
    [0.8, "均衡 80%"],
    [0.75, "均衡 75%"],
    [0.5, "流畅 50%"],
    [0.25, "低负载 25%"],
  ]) {
    const value237 = fn1("option", "", value236);
    ((value237.value = String(value235)), value109.append(value237));
  }
  const value110 = fn2("渲染分辨率");
  (value109.setAttribute("aria-label", "渲染分辨率"),
    (value109.value = String(value18.renderScale ?? 1)),
    value109.addEventListener("change", async () => {
      if (weakSet1.has(value109)) return;
      const value238 = Number(value109.value),
        value239 = value18.renderScale ?? 1;
      (fn5(value109, value239), (value109.disabled = true));
      try {
        (await fn6({
          renderScale: value238,
        })) &&
          (await fn4({
            properties: {
              renderScale: value238,
            },
          }));
      } finally {
        value109.disabled = value21;
      }
    }),
    value110.append(value109),
    (value109.title = "画面卡顿时，可降低渲染分辨率。"));
  const value111 = fn2("转动分辨率"),
    value112 = fn1("div", "inspector-grid two-columns"),
    value113 = fn1("select"),
    value114 = fn1("input");
  let value115 =
      typeof value18.motionRenderScale == "number" && Number.isFinite(value18.motionRenderScale)
        ? Math.max(0.25, Math.min(1, value18.motionRenderScale))
        : null,
    value116 = value115 ?? 0.75;
  for (const [value240, value241] of [
    ["auto", "自动"],
    ["custom", "自定义"],
  ]) {
    const value242 = fn1("option", "", value241);
    ((value242.value = value240), value113.append(value242));
  }
  ((value113.name = "i3d-motion-resolution-mode"),
    value113.setAttribute("aria-label", "转动分辨率调整方式"),
    Object.assign(value114, {
      name: "i3d-motion-render-scale",
      type: "number",
      min: "25",
      max: "100",
      step: "1",
    }),
    value114.setAttribute("aria-label", "转动分辨率百分比"));
  const fn19 = () => {
      (fn5(value113, value115 === null ? "auto" : "custom"),
        (value113.disabled = value21),
        (value114.disabled = value21 || value115 === null),
        (value114.value = String(Math.round(value116 * 100))));
    },
    fn20 = async (arg75) => {
      value113.disabled = value114.disabled = true;
      try {
        (await fn6({
          motionRenderScale: arg75,
        })) &&
          (await fn4({
            properties: {
              motionRenderScale: arg75,
            },
          }),
          (value115 = arg75),
          arg75 !== null && (value116 = arg75));
      } catch (error12) {
        arg24.onError?.(error12);
      } finally {
        fn19();
      }
    };
  (value113.addEventListener("change", () => {
    weakSet1.has(value113) ||
      value113.disabled ||
      fn20(value113.value === "auto" ? null : value116);
  }),
    value114.addEventListener("change", () => {
      if (value114.disabled) return;
      const value243 = value114.value.trim() === "" ? NaN : Number(value114.value);
      if (!Number.isFinite(value243)) {
        fn19();
        return;
      }
      fn20(Math.max(25, Math.min(100, Math.round(value243))) / 100);
    }),
    fn3(value112, "调整方式", value113),
    fn3(value112, "转动比例（%）", value114),
    value111.append(value112),
    fn19());
  const value117 = fn1(
    "p",
    "inspector-section-note",
    "按静止分辨率计算，停止转动后恢复。100% 不降清晰度。",
  );
  value111.append(value117);
  const value118 = fn2("地面反射");
  value118.classList.add("i3d-reflection-section");
  let value119 = normalizeGroundReflection(value18.groundReflection);
  const value120 = fn1("select"),
    value121 = fn1("select");
  ((value120.name = "i3d-reflection-mode"),
    value120.setAttribute("aria-label", "地面反射范围"),
    (value121.name = "i3d-reflection-resolution"),
    value121.setAttribute("aria-label", "反射清晰度"));
  for (const [value244, value245] of [
    ["off", "关闭"],
    ["inside", "室内"],
    ["outside", "室外"],
    ["all", "室内＋室外"],
  ]) {
    const value246 = fn1("option", "", value245);
    ((value246.value = value244), value120.append(value246));
  }
  for (const [value247, value248] of [
    [256, "低"],
    [512, "中"],
    [768, "高"],
  ]) {
    const value249 = fn1("option", "", value248);
    ((value249.value = String(value247)), value121.append(value249));
  }
  ((value120.value = value119.mode), (value121.value = String(value119.resolution)));
  const value122 = fn1("div", "i3d-reflection-options");
  (fn3(value122, "范围", value120), fn3(value122, "清晰度", value121));
  const value123 = fn1("div", "i3d-vignette-setting"),
    value124 = fn1("input"),
    value125 = fn1("output");
  (Object.assign(value124, {
    name: "i3d-reflection-strength",
    type: "range",
    min: "0",
    max: "45",
    step: "1",
    value: String(Math.round(value119.strength * 100)),
  }),
    value124.setAttribute("aria-label", "反射强度"),
    (value125.textContent = value124.value + "%"),
    value123.append(value124, value125),
    value118.append(value122),
    fn3(value118, "强度", value123));
  const fn21 = () => {
      ((value120.disabled = value21),
        (value121.disabled = value124.disabled = value21 || value119.mode === "off"));
    },
    fn22 = async (arg76) => {
      if (weakSet1.has(arg76?.target)) return;
      const value250 = normalizeGroundReflection({
        mode: value120.value,
        resolution: Number(value121.value),
        strength: Number(value124.value) / 100,
      });
      (fn5(value120, value119.mode),
        fn5(value121, value119.resolution),
        (value124.value = String(Math.round(value119.strength * 100))),
        (value125.textContent = value124.value + "%"),
        (value120.disabled = value121.disabled = value124.disabled = true));
      try {
        if (
          !(await fn6({
            groundReflection: value250,
          }))
        )
          return;
        await fn4({
          properties: {
            groundReflection: {
              ...value250,
            },
          },
        });
      } finally {
        ((value120.disabled = value21), fn21());
      }
    };
  (value120.addEventListener("change", fn22),
    value121.addEventListener("change", fn22),
    value124.addEventListener("input", () => {
      value125.textContent = value124.value + "%";
    }),
    value124.addEventListener("change", fn22),
    fn21());
  const value126 = fn1("section", "inspector-section i3d-popup-settings"),
    value127 = structuredClone(value18.popupLayout || {});
  for (const [value251, value252] of [
    ["general", "通用弹窗"],
    ["camera", "摄像头弹窗"],
  ]) {
    const value253 = fn1("section", "i3d-popup-setting-group"),
      value254 = fn1("div", "i3d-popup-setting-heading");
    (value254.append(fn1("h4", "", value252)),
      value253.append(value254),
      value126.append(value253));
    const object12 = {
        scale: 1,
        ...value127[value251],
      },
      fn24 = (arg77 = object12) => {
        value21 ||
          getInteraction3dEditorView(arg23.id)?.previewPopupLayout?.(value251, {
            ...arg77,
          });
      },
      value255 = fn1("button", "secondary-button", "预览");
    ((value255.type = "button"),
      (value255.disabled = value21),
      value255.setAttribute("aria-label", "预览" + value252),
      value255.addEventListener("click", () => fn24()),
      value254.append(value255));
    const value256 = fn1("input"),
      value257 = fn1("output"),
      value258 = fn1("div", "i3d-vignette-setting");
    (Object.assign(value256, {
      name: "i3d-popup-" + value251 + "-scale",
      type: "range",
      min: "50",
      max: "1000",
      step: "5",
      value: String(Math.round(object12.scale * 100)),
      disabled: value21,
    }),
      value256.setAttribute("aria-label", value252 + "大小"),
      (value257.textContent = value256.value + "%"),
      value258.append(value256, value257),
      fn3(value253, "等比例大小", value258));
    const value259 = fn1("input");
    (Object.assign(value259, {
      name: "i3d-popup-" + value251 + "-custom",
      type: "checkbox",
      checked: Number.isFinite(object12.x) || Number.isFinite(object12.y),
      disabled: value21,
    }),
      value259.setAttribute("aria-label", value252 + "自定义位置"),
      fn3(value253, "自定义位置", value259),
      (value259.parentElement.className = "i3d-setting-toggle i3d-view-toggle"));
    const value260 = fn1("div", "i3d-popup-position");
    value253.append(value260);
    const object13 = {},
      fn25 = () => {
        (fn24(),
          (value127[value251] = {
            ...object12,
          }),
          fn4({
            properties: {
              popupLayout: structuredClone(value127),
            },
          }));
      },
      fn26 = () => {
        value260.hidden = !value259.checked;
        for (const value262 of Object.values(object13))
          value262.disabled = value21 || !value259.checked;
      };
    for (const [value263, value264, value265] of [
      ["x", "横向", 100],
      ["y", "纵向", 0],
    ]) {
      const value266 = fn1("input");
      ((object13[value263] = value266),
        Object.assign(value266, {
          name: "i3d-popup-" + value251 + "-" + value263,
          type: "range",
          min: "0",
          max: "100",
          step: "1",
          value: String(object12[value263] ?? value265),
        }),
        value266.setAttribute(
          "aria-label",
          "" + value252 + (value263 === "x" ? "横向位置" : "纵向位置"),
        ));
      const value267 = fn1("output"),
        value268 = fn1("div", "i3d-vignette-setting");
      ((value267.textContent = value266.value + "%"),
        value268.append(value266, value267),
        value266.addEventListener("input", () => {
          value266.disabled ||
            ((value267.textContent = value266.value + "%"),
            fn24({
              ...object12,
              [value263]: Number(value266.value),
            }));
        }),
        value266.addEventListener("change", () => {
          if (value266.disabled) return;
          const value269 = value266.value.trim() === "" ? NaN : Number(value266.value);
          if (!Number.isFinite(value269)) {
            value266.value = String(object12[value263] ?? value265);
            return;
          }
          ((object12[value263] = Math.max(0, Math.min(100, value269))),
            (value266.value = String(object12[value263])),
            (value267.textContent = value266.value + "%"),
            fn25());
        }),
        fn3(value260, value264, value268));
    }
    (value259.addEventListener("change", () => {
      value259.disabled ||
        (value259.checked
          ? ((object12.x = Number(object13.x.value)), (object12.y = Number(object13.y.value)))
          : (delete object12.x, delete object12.y),
        fn26(),
        fn25());
    }),
      value256.addEventListener("input", () => {
        ((value257.textContent = value256.value + "%"),
          value256.disabled ||
            fn24({
              ...object12,
              scale: Number(value256.value) / 100,
            }));
      }),
      value256.addEventListener("change", () => {
        if (value256.disabled) return;
        const value270 = Number(value256.value);
        Number.isFinite(value270) &&
          ((object12.scale = Math.max(0.5, Math.min(10, value270 / 100))), fn25());
      }));
    const value261 = fn1("button", "secondary-button", "恢复默认");
    ((value261.type = "button"),
      (value261.disabled = value21),
      value261.setAttribute("aria-label", "恢复" + value252 + "默认大小和位置"),
      value261.addEventListener("click", () => {
        if (!value261.disabled) {
          (delete value127[value251],
            (object12.scale = 1),
            delete object12.x,
            delete object12.y,
            (value256.value = "100"),
            (value257.textContent = "100%"),
            (value259.checked = false),
            (object13.x.value = "100"),
            (object13.y.value = "0"),
            fn26());
          for (const value271 of Object.values(object13))
            value271.parentElement.children[1].textContent = value271.value + "%";
          (fn24(),
            fn4({
              properties: {
                popupLayout: structuredClone(value127),
              },
            }));
        }
      }),
      value254.append(value261),
      fn26());
  }
  const value128 = fn1("button", "secondary-button i3d-popup-preview-close", "关闭预览");
  ((value128.type = "button"),
    value128.addEventListener("click", () =>
      getInteraction3dEditorView(arg23.id)?.closePopupLayoutPreview?.(),
    ),
    value126.append(value128));
  const value129 = fn1("div", "i3d-vignette-setting"),
    value130 = fn1("input"),
    value131 = fn1("output"),
    value132 =
      100 -
      (Number.isFinite(value18.popupOpacity)
        ? Math.max(0, Math.min(100, value18.popupOpacity))
        : 74);
  if (
    (Object.assign(value130, {
      name: "i3d-popup-transparency",
      type: "range",
      min: "0",
      max: "100",
      step: "1",
      value: String(value132),
    }),
    value130.setAttribute("aria-label", "弹窗透明度"),
    (value131.textContent = value132 + "%"),
    value130.addEventListener("input", () => {
      value131.textContent = value130.value + "%";
    }),
    value130.addEventListener("change", () => {
      const value272 = Math.max(0, Math.min(100, Number(value130.value)));
      Number.isFinite(value272) &&
        fn4({
          properties: {
            popupOpacity: 100 - value272,
          },
        });
    }),
    value129.append(value130, value131),
    fn3(value126, "弹窗透明度", value129),
    value21)
  ) {
    for (const value273 of [
      value27,
      value41,
      value42,
      value43,
      value47,
      value40,
      value95,
      value110,
      value118,
      value126,
    ])
      for (const value274 of value273.querySelectorAll("input, select, button"))
        value274.disabled = true;
  }
  for (const value275 of [value41, value42, value43, value47, value45])
    value275.classList.add("i3d-category-entry");
  for (const value276 of [
    value31,
    value27,
    value41,
    value42,
    value43,
    value47,
    value45,
    value40,
    value110,
  ])
    value276.classList.add("i3d-inline-section");
  (value31.classList.add("i3d-house-section"),
    value27.classList.add("i3d-placement-section"),
    value40.classList.add("i3d-light-effects-row"),
    (value97.parentElement.children[0].hidden = true));
  for (const value277 of [value75, value83, value88])
    value277.classList.add("i3d-inspector-subsection");
  for (const [value278, value279] of [
    [value83, value86],
    [value88, value91],
  ])
    (value278.classList.add("i3d-idle-inline"),
      value279.classList.add("i3d-idle-wait"),
      (value279.children[0].children[0].textContent = "秒"));
  value84.children[0].textContent = "闲置时退出聚焦";
  const value133 = fn1("div", "i3d-behavior-row i3d-inspector-subsection");
  (value83.classList.remove("i3d-inspector-subsection"),
    value75.append(value81),
    value133.append(value83),
    value65.append(value75, value133, value88));
  const fn23 = (arg78, arg79, arg80) => {
    const value280 = fn1("details", "i3d-inspector-group");
    ((value280.dataset.inspectorGroup = arg78),
      (value280.open = map1.get(arg78) ?? false),
      value280.append(fn1("summary", "", arg79), ...arg80),
      value13.append(value280),
      arg78 === "popups" &&
        value280.addEventListener("toggle", () => {
          !value280.open &&
            value280.isConnected &&
            getInteraction3dEditorView(arg23.id)?.closePopupLayoutPreview?.();
        }));
  };
  (fn23("layout", "户型与布局", [value31, value27, value95]),
    fn23("devices", "设备配置", [value41, value42, value43, value47, value45]),
    fn23("appearance", "画面效果", [value40, value110, value111, value118]),
    fn23("view", "视角与导航", [value49, value62]),
    fn23("popups", "弹窗大小与位置", [value126]),
    (value65.children[0].hidden = true),
    fn23("interaction", "交互行为", [value65]),
    value34.refresh(),
    arg24.enhanceControls?.(value13),
    (value13.style.minHeight = value17),
    value14 &&
      ((arg22.scrollTop = value15),
      value16 &&
        [...value13.querySelectorAll("input,select")]
          .find((arg81) => arg81.name === value16)
          ?.focus({
            preventScroll: true,
          })),
    !value18.sceneId && value34.state === "idle" && fn9());
}
