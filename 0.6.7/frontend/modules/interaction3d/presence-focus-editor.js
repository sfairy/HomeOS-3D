import { mountInteraction3d } from "./runtime.js";
import { interaction3dPreviewSize } from "../../../../bridge-static/modules/interaction3d/preview-layout.js?v=20260906-i3d-preview-layout-v1-20260908-curtains-v1";
export function openPresenceFocusEditor({
  component: arg1,
  properties: arg2,
  item: arg3,
  panelDocument: arg4,
  onSave: arg5,
  previewOnly: arg6 = false,
}) {
  const value1 = window.document,
    fn1 = (arg7, arg8) => {
      const value24 = value1.createElement(arg7);
      return (arg8 && (value24.textContent = arg8), value24);
    },
    value2 = fn1("dialog");
  ((value2.className = "i3d-editor"),
    value2.setAttribute("aria-label", "人在传感器聚焦视角"),
    (value2.dataset.i3dPreviewScope = "presence-focus"));
  const value3 = fn1("header"),
    value4 = fn1("div");
  value4.className = "i3d-editor-body";
  const value5 = fn1("div"),
    value6 = fn1("aside"),
    value7 = fn1("p", "正在加载户型…");
  value5.className = "i3d-editor-view";
  const value8 = fn1("div"),
    value9 = fn1("div");
  ((value8.className = "i3d-editor-aspect"),
    (value9.className = "i3d-editor-stage"),
    value8.append(value9),
    value5.append(value8));
  const fn2 = () => {
      const value25 = interaction3dPreviewSize(arg1, arg4, value5.clientWidth, value5.clientHeight);
      Object.assign(value8.style, {
        width: value25.width + "px",
        height: value25.height + "px",
      });
    },
    resizeObserver1 = new ResizeObserver(fn2);
  resizeObserver1.observe(value5);
  let value10,
    value11 = false,
    value12 = false,
    value13 = false,
    value14 = null,
    value15 = Promise.resolve(),
    value16 = !arg6;
  const list1 = [],
    fn3 = (arg9, arg10) => {
      const value26 = fn1("button", arg9);
      return (
        (value26.type = "button"),
        value26.addEventListener("click", arg10),
        list1.push(value26),
        value26
      );
    },
    fn4 = () => {
      value12 ||
        ((value12 = true),
        resizeObserver1.disconnect(),
        value10?.(),
        value2.close(),
        value2.remove(),
        value1.dispatchEvent(new Event("hb-i3d-preview-scope")));
    },
    fn5 = () => {
      (list1.forEach((arg11) => {
        arg11.disabled = !value11 || value13;
      }),
        (value17.hidden = !value16),
        (value18.hidden = value16),
        (value19.textContent = value16 ? "取消调整" : "关闭预览"),
        (value19.disabled = false),
        (value20.hidden = !value16),
        (value22.hidden = !value16),
        (value21.disabled = !value16 || !value11 || value13 || value14?.mode !== "perspective"),
        value1.activeElement !== value21 &&
          (value21.value = String(Math.round(value14?.focalLength || 50))));
      for (const [value27, value28] of map1)
        value28.setAttribute("aria-pressed", String((value14?.mode || "orthographic") === value27));
    },
    fn6 = async (arg12, arg13) => {
      if (!value11 || value13 || value12) return;
      const value29 = arg12 === "focus-focal-length",
        value30 = value15;
      let value31;
      ((value15 = new Promise((arg14) => {
        value31 = arg14;
      })),
        value29 || ((value13 = true), fn5()));
      try {
        if ((await value30, value12)) return;
        const value32 = await value10.focusCommand(arg12, "presence:" + arg3.id, arg13);
        if (value12) return;
        (value32?.camera && (value14 = value32.camera),
          arg12 === "save-light-camera"
            ? (arg5(value32.camera), fn4())
            : (arg12 === "edit-light-camera" && (value16 = true),
              (value7.textContent = value16
                ? "拖动旋转 · 右键平移 · 滚轮缩放。调整完成后保存视角。"
                : "正在预览聚焦视角。")));
      } catch (error1) {
        value12 || (value7.textContent = error1.message);
      } finally {
        (value31(), value29 || (value13 = false), value12 || fn5());
      }
    },
    value17 = fn3("保存视角", () => fn6("save-light-camera"));
  value17.className = "primary";
  const value18 = fn3("调整视角", () => fn6("edit-light-camera")),
    value19 = fn3("取消调整", fn4);
  value3.append(
    fn1("strong", (arg3.label || "人在传感器") + " · 聚焦视角"),
    value17,
    value18,
    value19,
  );
  const value20 = fn1("div");
  ((value20.className = "i3d-focus-actions"),
    value20.setAttribute("role", "group"),
    value20.setAttribute("aria-label", "聚焦投影"));
  const map1 = new Map();
  for (const [value33, value34] of [
    ["orthographic", "正交"],
    ["perspective", "透视"],
  ]) {
    const value35 = fn3(value34, () => fn6("focus-projection", value33));
    (map1.set(value33, value35), value20.append(value35));
  }
  const value21 = fn1("input");
  (Object.assign(value21, {
    type: "number",
    min: "18",
    max: "120",
    step: "1",
    value: "50",
  }),
    value21.setAttribute("aria-label", "焦段（mm）"),
    value21.addEventListener("change", () => {
      const value36 = Number(value21.value);
      if (!value21.value.trim() || !Number.isFinite(value36)) {
        value21.value = String(value14?.focalLength || 50);
        return;
      }
      ((value21.value = String(Math.max(18, Math.min(120, value36)))),
        fn6("focus-focal-length", Number(value21.value)));
    }));
  const value22 = fn1("label");
  (value22.append(fn1("span", "焦段（mm）"), value21),
    fn5(),
    value6.append(
      value7,
      value20,
      value22,
      fn1("p", "此视角用于点击小人后的聚焦展示，不弹出控制面板。"),
    ),
    value4.append(value5, value6),
    value2.append(value3, value4),
    value1.body.append(value2),
    value2.addEventListener("cancel", (arg15) => {
      (arg15.preventDefault(), fn4());
    }),
    value2.showModal(),
    fn2());
  const value23 = structuredClone(arg2);
  ((value23.security = {
    presenceSensors: [structuredClone(arg3)],
  }),
    (value23.floorSelection = arg3.floorId),
    (value23.camera =
      value23.floorCameras?.[arg3.floorId] ||
      (arg2.floorSelection === arg3.floorId ? arg2.camera : null)),
    (value10 = mountInteraction3d(value9, {
      component: {
        ...arg1,
        properties: value23,
      },
      context: {
        document: arg4,
        editable: true,
      },
      editing: true,
      editingModule: "security",
      onPresented: () => {
        value11 ||
          value12 ||
          ((value11 = true), fn6(arg6 ? "preview-light-camera" : "edit-light-camera"));
      },
      onLoadError: (arg16) => {
        value7.textContent = arg16.message || String(arg16);
      },
    })),
    value1.dispatchEvent(new Event("hb-i3d-preview-scope")));
}
