const { popupPlacement: b } = await (import.meta.url.startsWith("file:")
    ? import(new URL("../../static/modules/interaction3d/popup-placement.js", import.meta.url))
    : import(
        new URL(
          "../../../../bridge-static/modules/interaction3d/popup-placement.js?v=20260925-canvas-scale-v2",
          import.meta.url,
        )
      )),
  { cameraPopupLayout: L } = await (import.meta.url.startsWith("file:")
    ? import(new URL("../../static/modules/interaction3d/camera-popup-layout.js", import.meta.url))
    : import(
        new URL(
          "../../../../bridge-static/modules/interaction3d/camera-popup-layout.js",
          import.meta.url,
        )
      ));
export function popupPreviewPlacement(arg1, arg2, arg3, arg4) {
  const value1 = arg1 === "camera" ? L(arg2, arg3) : null,
    value2 = value1?.panelWidth || 360,
    value3 = value1?.panelHeight || 232,
    value4 = value1?.top ?? Math.max(12, Math.min(arg3 * 0.56 - 400, arg3 - 812));
  return {
    ...b({
      width: arg2,
      height: arg3,
      panelWidth: value2,
      panelHeight: value3,
      defaultTop: value4,
      defaultScale: 2,
      settings: arg4,
    }),
    panelWidth: value2,
    panelHeight: value3,
  };
}
export function createPopupLayoutPreview(arg5, arg6, arg7) {
  const value5 = arg5.ownerDocument || document,
    fn1 = (arg8, arg9, arg10 = "") => {
      const value14 = value5.createElement(arg8);
      return ((value14.className = arg9), (value14.textContent = arg10), value14);
    },
    value6 = fn1("div", "i3d-popup-preview-layer"),
    value7 = fn1("section", "i3d-popup-preview");
  value7.setAttribute("aria-label", "弹窗布局预览");
  const value8 = fn1("header", "i3d-popup-preview-heading"),
    value9 = fn1("strong", "", ""),
    value10 = fn1("button", "", "×");
  ((value10.type = "button"),
    value10.setAttribute("aria-label", "关闭弹窗布局预览"),
    value10.addEventListener("pointerdown", (arg11) => arg11.stopPropagation()),
    value10.addEventListener("click", arg7),
    value8.append(value9, value10));
  const value11 = fn1("div", "i3d-popup-preview-body");
  (value7.append(value8, value11), value6.append(value7), arg5.append(value6));
  let value12, value13;
  const fn2 = () => {
    if (!value12) return;
    const value15 = arg6() || {},
      value16 = value15.width || arg5.clientWidth,
      value17 = value15.height || arg5.clientHeight;
    if (!(value16 > 0 && value17 > 0)) return;
    const value18 = popupPreviewPlacement(value12, value16, value17, value13),
      value19 = arg5.clientWidth / value16,
      value20 = arg5.clientHeight / value17;
    Object.assign(value7.style, {
      width: value18.panelWidth + "px",
      height: value18.panelHeight + "px",
      left: value18.left * value19 + "px",
      top: value18.top * value20 + "px",
      transform: "scale(" + value18.scale * value19 + "," + value18.scale * value20 + ")",
    });
  };
  return {
    update(arg12, arg13) {
      if (arg12 !== value12) {
        if (
          ((value9.textContent = arg12 === "camera" ? "摄像头 · 布局预览" : "通用弹窗 · 布局预览"),
          (value7.dataset.kind = arg12),
          value11.replaceChildren(),
          arg12 === "camera")
        )
          value11.append(fn1("div", "i3d-popup-preview-video", "16:9 画面示例"));
        else {
          const value21 = fn1("div", "i3d-popup-preview-actions");
          (value21.append(...["关闭", "暂停", "打开"].map((arg14) => fn1("span", "", arg14))),
            value11.append(
              fn1("p", "i3d-popup-preview-name", "窗帘控制示例 · 50%"),
              fn1("div", "i3d-popup-preview-track"),
              value21,
            ));
        }
      }
      ((value12 = arg12),
        (value13 = {
          ...arg13,
        }),
        fn2());
    },
    resize: fn2,
    dispose() {
      value6.remove();
    },
  };
}
export function createFocusDevicePopup(
  arg15,
  {
    kind: arg16,
    item: arg17,
    getLayout: arg18,
    getSettings: arg19,
    getStates: arg20,
    panelDocument: arg21,
  },
) {
  const value22 = arg15.ownerDocument || document,
    value23 = value22.createElement("div");
  ((value23.className = "i3d-focus-popup-preview"), (value23.inert = true));
  const value24 = value22.createElement("link");
  ((value24.rel = "stylesheet"),
    (value24.href =
      "/bridge-static/renderer/renderer.css?v=20260914-focus-preview-v1-20260930-percentage-text-offset-v1"));
  const value25 = value22.createElement("div");
  ((value25.className = "i3d-focus-popup-host"),
    value23.append(value24, value25),
    arg15.append(value23));
  let value26 = false,
    value27,
    value28;
  const fn3 = () => arg19()?.[arg16 === "camera" ? "camera" : "general"],
    fn4 = () => value28?.updateLayout?.();
  return {
    ready: (import.meta.url.startsWith("file:")
      ? import(new URL("../../static/renderer/renderer.js", import.meta.url))
      : import(new URL("../../../../bridge-static/renderer/renderer.js", import.meta.url))
    ).then(({ PanelRenderer: arg22 }) => {
      if (value26) return;
      ((value27 = new arg22(value25, {
        editable: true,
      })),
        (value27.document = arg21));
      const object1 = {
          root: value25,
          getPresentationLayout: arg18,
          getPopupLayout: fn3,
          popupOpacity: arg19()?.opacity ?? 74,
        },
        object2 = {
          ...arg17,
          entityId: arg17.entityId || arg16 + ".layout_preview",
        };
      (arg16 === "camera"
        ? (value27.showCameraPreview(
            {
              id: object2.id,
              properties: {
                label: object2.label,
              },
              bindings: {
                entity: {
                  entityId: object2.entityId,
                },
              },
            },
            {
              preview: true,
              interaction3d: object1,
            },
          ),
          (value28 = {
            updateLayout: () => value27.detailsDialog?.resizeInteraction3d?.(),
            close: () => value27.detailsDialog?.close(),
          }))
        : (value28 = value27.openInteraction3dVacuumDetails(object2, () => {}, {
            ...object1,
            states: arg20(),
          })),
        fn4());
    }),
    resize: fn4,
    updateStates: () => value28?.updateStates?.(arg20()),
    dispose() {
      ((value26 = true), value28?.close(), value27?.destroy(), value23.remove());
    },
  };
}
