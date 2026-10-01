import { mountInteraction3d } from "./runtime.js?v=20260909-preview-sleep-v1-warm-popups-v1-20260923-lazy-stage-v1-20260926-speaker-v1-20260926-fan-v1-20260926-airer-v2-reload-diagnostics-v2";
import {
  requestInteraction3dAccess,
  subscribeInteraction3dAccess,
} from "../../../../bridge-static/modules/interaction3d/bridge.js?v=20260926-integration-v1-reload-diagnostics-v2";
export async function openInteraction3dRangeEditor({
  component: arg1,
  document: arg2,
  states: arg3,
  onSave: arg4,
  onClose: arg5 = () => {},
}) {
  if ((await requestInteraction3dAccess(), !arg1.properties?.sceneId))
    throw new Error("请先载入 3D 户型。");
  if (arg1.properties.lightingMode !== "region") throw new Error("请先选择轻量柔光模式。");
  const value1 = structuredClone(arg1),
    value2 = document.activeElement,
    fn1 = (arg6, arg7 = "", arg8 = "") => {
      const value20 = document.createElement(arg6);
      return ((value20.className = arg7), (value20.textContent = arg8), value20);
    },
    value3 = fn1("link");
  ((value3.rel = "stylesheet"),
    (value3.href =
      "/api/v1/modules/interaction3d/runtime.css?v=20260909-curtain-action-v15-warm-popups-v1-20260926-fan-v1"),
    document.head.append(value3));
  const value4 = fn1("dialog", "i3d-editor i3d-range-dialog");
  (value4.setAttribute("aria-label", "照射范围"),
    value4.setAttribute("data-i3d-preview-scope", ""));
  const value5 = fn1("header"),
    value6 = fn1("button", "primary", "保存"),
    value7 = fn1("button", "i3d-range-close", "×");
  (value7.setAttribute("aria-label", "关闭照射范围"),
    (value7.title = "关闭"),
    (value6.type = value7.type = "button"),
    (value6.disabled = true));
  const value8 = fn1("p", "i3d-range-status", "正在准备灯光预览…");
  value8.setAttribute("role", "status");
  const value9 = fn1("button", "", "重新载入");
  ((value9.type = "button"), (value9.hidden = true));
  const value10 = fn1("div", "i3d-range-dialog-body"),
    value11 = fn1("div");
  (value5.append(fn1("strong", "", "照射范围"), value9, value6, value7),
    value10.append(value11),
    value4.append(value5, value8, value10),
    document.body.append(value4));
  let value12 = false,
    value13 = false,
    value14 = false,
    value15 = null,
    fn2 = () => {},
    value16 = 0,
    value17 = 0,
    value18,
    value19;
  const promise1 = new Promise((arg9, arg10) => {
    ((value18 = arg9), (value19 = arg10));
  });
  promise1.catch(() => {});
  function fn3() {
    value12 ||
      ((value12 = true),
      value16++,
      fn2(),
      value15?.(),
      value19(new Error("照射范围编辑已关闭。")),
      window.removeEventListener("pagehide", fn3),
      value4.close(),
      value4.remove(),
      value3.remove(),
      document.dispatchEvent(new Event("hb-i3d-preview-scope")),
      value2?.isConnected && value2.focus(),
      arg5());
  }
  function fn4(arg11) {
    value12 ||
      ((value6.disabled = true),
      (value9.hidden = false),
      (value8.textContent = arg11.message || "照射范围载入失败，请重试。"),
      value8.classList.add("is-error"),
      value19(arg11));
  }
  function fn5() {
    const value21 = ++value16;
    ((value14 = false),
      value15?.(),
      (value6.disabled = true),
      (value9.hidden = true),
      value8.classList.remove("is-error"),
      (value8.textContent = "正在准备灯光预览…"),
      (value15 = mountInteraction3d(value11, {
        component: value1,
        context: {
          document: arg2,
          states: arg3,
        },
        editing: true,
        rangeEditorOnly: true,
        async onPresented() {
          try {
            if ((await value15.openRangeEditor(), value12 || value21 !== value16)) return;
            ((value14 = true),
              (value6.disabled = false),
              (value8.textContent =
                "平面编辑调整照射范围，3D 预览实时查看高度效果；两个视图共用参数。"),
              value18());
          } catch (error1) {
            value21 === value16 && fn4(error1);
          }
        },
        onLoadError: fn4,
        onEdit(arg12) {
          if (!(value12 || value21 !== value16)) {
            if (arg12.action === "light-region-overrides") {
              const value22 = structuredClone(arg12.overrides || {});
              (JSON.stringify(value22) !==
                JSON.stringify(value1.properties.lightRegionOverrides || {}) &&
                (value17++,
                value13 ||
                  ((value8.textContent = "范围已修改，点击保存应用。"),
                  value8.classList.remove("is-error"))),
                (value1.properties.lightRegionOverrides = value22));
            }
            arg12.action === "range-editor-state" && arg12.error
              ? fn4(new Error(arg12.error))
              : arg12.action === "range-editor-state" &&
                !arg12.active &&
                value14 &&
                !value13 &&
                fn3();
          }
        },
      })));
  }
  return (
    value6.addEventListener("click", async () => {
      if (!(value12 || value13 || !value14 || value6.disabled)) {
        ((value13 = true),
          (value6.disabled = true),
          (value7.disabled = true),
          (value9.hidden = true),
          (value8.textContent = "正在保存范围…"));
        try {
          await value15.flushRangeEditor();
          const value23 = structuredClone(value1.properties.lightRegionOverrides || {}),
            value24 = value17;
          if ((await requestInteraction3dAccess(), value12)) return;
          (await arg4(value23),
            value12 ||
              ((value8.textContent =
                value24 === value17
                  ? "已保存到灯光配置，可继续调整。关闭后点击“保存配置”完成保存。"
                  : "已保存，另有新修改待保存。"),
              value8.classList.remove("is-error")));
        } catch (error2) {
          if (value12) return;
          ((value8.textContent = error2.message || "保存失败，请重试。"),
            value8.classList.add("is-error"));
        } finally {
          ((value13 = false),
            value12 ||
              ((value7.disabled = false),
              (value6.disabled = !value15.ready || !value15.rangeEditing)));
        }
      }
    }),
    value7.addEventListener("click", () => {
      value13 || fn3();
    }),
    value4.addEventListener("cancel", (arg13) => {
      (arg13.preventDefault(), value13 || fn3());
    }),
    value9.addEventListener("click", fn5),
    window.addEventListener("pagehide", fn3),
    value4.showModal(),
    document.dispatchEvent(new Event("hb-i3d-preview-scope")),
    fn5(),
    (fn2 = subscribeInteraction3dAccess((arg14) => {
      !arg14.allowed && ["denied", "unavailable"].includes(arg14.status) && fn3();
    })),
    value12 && fn2(),
    {
      close: fn3,
      ready: promise1,
    }
  );
}
