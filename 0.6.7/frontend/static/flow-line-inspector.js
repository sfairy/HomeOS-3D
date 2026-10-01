import {
  normalizeFlowLine as normalizeFlowLine2,
  flowClamp as flowClamp2,
} from "./flow-line-model.js?v=20260930-flow-line-sign-v1";
import { inspectorComponentMetrics as inspectorComponentMetrics2 } from "./editor-basic-inspectors.js?v=20260901-editor-basic-inspectors-v4";
import { openFlowLinePathEditor as openFlowLinePathEditor2 } from "./flow-line-editor.js?v=20260930-flow-line-sign-v1";
const $ = new WeakMap(),
  v = {
    width: [1, 40, 1],
    speed: [0, 500, 1],
    tail: [2, 300, 1],
    spacing: [10, 600, 1],
    glow: [0, 100, 1],
    radius: [0, 150, 1],
    opacity: [0, 100, 100],
    baseOpacity: [0, 100, 100],
  },
  P = {
    left: [0, 100],
    top: [0, 100],
    widthPercent: [0.1, 100],
    heightPercent: [0.1, 100],
    scale: [1, 500],
    rotation: [-360, 360],
  };
export function flowLineGeometryChange(arg1, arg2, arg3, arg4) {
  const v1 = inspectorComponentMetrics2(arg1, {
      canvas: arg2,
    }),
    options = arg1.position || {},
    num = Number(arg2?.width) || 2778,
    num2 = Number(arg2?.height) || 1940,
    v2 = Number(options.x || 0) + v1.width / 2,
    v3 = Number(options.y || 0) + v1.height / 2;
  return arg3 === "left"
    ? {
        position: {
          x: (num * arg4) / 100 - v1.width / 2,
        },
      }
    : arg3 === "top"
      ? {
          position: {
            y: (num2 * arg4) / 100 - v1.height / 2,
          },
        }
      : arg3 === "widthPercent"
        ? {
            position: {
              x: v2 - (num * arg4) / 200,
              width: (num * arg4) / 100,
            },
          }
        : arg3 === "heightPercent"
          ? {
              position: {
                y: v3 - (num2 * arg4) / 200,
                height: (num2 * arg4) / 100,
              },
            }
          : arg3 === "scale"
            ? {
                style: {
                  scale: arg4 / 100,
                },
              }
            : {
                position: {
                  rotation: arg4,
                },
              };
}
export function renderFlowLineInspector(arg5, arg6, arg7) {
  let v4 = $.get(arg5);
  if (!v4) {
    const element = document.createElement("form");
    ((element.id = "flow-line-inspector"),
      (element.className = "inspector-form"),
      arg5.append(element),
      (v4 = {
        form: element,
        fields: new Map(),
        component: null,
        options: null,
      }),
      $.set(arg5, v4));
    const v5 = (arg8) => {
        const element2 = document.createElement("section");
        element2.className = "inspector-section";
        const element3 = document.createElement("h3");
        return (
          (element3.textContent = arg8),
          element2.append(element3),
          element.append(element2),
          element2
        );
      },
      v6 = (arg9) => {
        const element4 = document.createElement("div");
        return (
          (element4.className = "inspector-grid two-columns"),
          arg9.append(element4),
          element4
        );
      },
      v7 = (arg10, arg11, arg12, v8 = "number", v9 = []) => {
        const element5 = document.createElement("label");
        element5.append(document.createTextNode(arg12));
        const element6 = document.createElement(v8 === "select" ? "select" : "input");
        if (((element6.id = "flow-line-" + arg11), (element6.name = arg11), v8 === "select"))
          for (const [v10, v11] of v9) {
            const element7 = document.createElement("option");
            ((element7.value = v10), (element7.textContent = v11), element6.append(element7));
          }
        else element6.type = v8;
        if (v8 === "number") {
          const v12 = v[arg11] || P[arg11];
          ((element6.min = v12[0]),
            (element6.max = v12[1]),
            (element6.step = v[arg11] ? "1" : "0.1"));
        }
        return (
          v8 === "text" && (element6.maxLength = 128),
          element5.append(element6),
          arg10.append(element5),
          v4.fields.set(arg11, element6),
          element6
        );
      },
      v13 = v6(v5("基础")),
      v14 = v7(v13, "type", "类型", "text");
    ((v14.readOnly = true), (v14.value = "流水线条"), v7(v13, "label", "备注 / 名称", "text"));
    const v15 = v5("路径"),
      element8 = document.createElement("button");
    ((element8.type = "button"),
      (element8.textContent = "绘制 / 编辑路径"),
      (element8.dataset.flowPathEditor = ""),
      v15.append(element8),
      (v4.count = document.createElement("p")),
      (v4.count.className = "field-note"),
      v15.append(v4.count),
      (element8.onclick = () => {
        const component = v4.component,
          options2 = v4.options;
        if (component)
          try {
            openFlowLinePathEditor2(component, {
              ...options2.pathEditorContext?.(),
              onSave: (arg13) => options2.onChange(component.id, arg13),
              onError: options2.onError,
            });
          } catch (v16) {
            options2.onError?.(v16);
          }
      }));
    const v17 = v6(v15);
    (v7(v17, "shape", "路径形态", "select", [
      ["straight", "折线"],
      ["rounded", "圆角"],
      ["curve", "曲线"],
    ]),
      v7(v17, "radius", "转角半径"));
    const v18 = v5("效果"),
      v19 = v6(v18);
    (v7(v19, "effect", "效果风格", "select", [
      ["water", "水流"],
      ["energy", "能量"],
    ]),
      v7(v19, "opacity", "整体透明度（%）"));
    const v20 = (arg14, arg15, arg16, v21 = "显示", v22 = "隐藏") => {
        const element9 = document.createElement("div");
        ((element9.className = "navigation-property-group"), arg14.append(element9));
        const element10 = document.createElement("div");
        ((element10.className = "navigation-property-heading"), element9.append(element10));
        const element11 = document.createElement("strong");
        if (((element11.textContent = arg15), element10.append(element11), arg16)) {
          const element12 = document.createElement("button");
          ((element12.type = "button"),
            (element12.id = "flow-line-" + arg16),
            (element12.className = "inspector-visibility-toggle compact"),
            (element12.dataset.onLabel = v21),
            (element12.dataset.offLabel = v22),
            element12.setAttribute("aria-label", arg15),
            element10.append(element12),
            v4.fields.set(arg16, element12),
            (element12.onclick = () => {
              const component2 = v4.component,
                options3 = v4.options;
              component2 &&
                Promise.resolve(
                  options3.onChange(component2.id, {
                    properties: {
                      [arg16]: !normalizeFlowLine2(component2.properties)[arg16],
                    },
                  }),
                ).catch((arg17) => options3.onError?.(arg17));
            }));
        }
        return v6(element9);
      },
      v23 = v20(v18, "流光");
    (v7(v23, "color", "颜色", "color"),
      v7(v23, "width", "线宽"),
      v7(v23, "tail", "光尾长度"),
      v7(v23, "glow", "发光强度（%）"));
    const v24 = v20(v18, "底线", "baseVisible");
    (v7(v24, "baseColor", "颜色", "color"), v7(v24, "baseOpacity", "透明度（%）"));
    const v25 = v20(v18, "光点", "headVisible");
    (v7(v25, "headColor", "颜色", "color"), v7(v25, "spacing", "光点间距"));
    const v26 = v20(v18, "流动动画", "animated", "开启", "关闭");
    v7(v26, "controlMode", "控制方式", "select", [
      ["manual", "手动"],
      ["entity-sign", "实体自动"],
    ]);
    const element13 = document.createElement("label");
    ((element13.textContent = "数值实体"), v26.append(element13), (v4.entityLabel = element13));
    const element14 = document.createElement("button");
    ((element14.type = "button"),
      (element14.className = "inspector-picker-button"),
      (element14.id = "flow-line-entity"),
      element13.append(element14),
      (v4.entityButton = element14),
      (element14.onclick = () => {
        const component3 = v4.component,
          options4 = v4.options;
        component3 &&
          Promise.resolve(
            options4.pickEntity?.(element14, component3.bindings?.entity?.entityId || "", (arg18) =>
              options4.onChange(component3.id, {
                bindings: {
                  entity: {
                    entityId: arg18 || null,
                  },
                },
              }),
            ),
          ).catch((arg19) => options4.onError?.(arg19));
      }),
      (v4.directionLabel = v7(v26, "direction", "方向", "select", [
        ["1", "正向"],
        ["-1", "反向"],
      ]).parentElement),
      v7(v26, "speed", "流速"),
      (v4.motionNote = document.createElement("p")),
      (v4.motionNote.className = "field-note"),
      v18.append(v4.motionNote));
    const v27 = v6(v5("位置"));
    for (const [v28, v29] of [
      ["left", "左侧（%）"],
      ["top", "顶部（%）"],
    ])
      v7(v27, v28, v29);
    const v30 = v6(v5("尺寸与变换"));
    for (const [v31, v32] of [
      ["widthPercent", "宽度（%）"],
      ["heightPercent", "高度（%）"],
      ["scale", "缩放（%）"],
      ["rotation", "旋转（°）"],
    ])
      v7(v30, v31, v32);
    const element15 = v5("批量应用");
    (element15.classList.add("navigation-batch-section"),
      (v4.applyCount = document.createElement("span")),
      (v4.applyCount.id = "flow-line-apply-count"),
      element15.querySelector("h3").append(" ", v4.applyCount));
    const element16 = document.createElement("button");
    ((element16.type = "button"),
      (element16.id = "flow-line-apply-style"),
      (element16.textContent = "一键应用到同类型控件"),
      (element16.onclick = () => v4.options.onApplyStyle?.()),
      element15.append(element16),
      (v4.apply = element16),
      element.addEventListener("submit", (arg20) => arg20.preventDefault()));
    const v33 = (arg21, arg22) => {
      const target = arg21.target,
        v34 = target.name,
        component4 = v4.component,
        options5 = v4.options;
      if (!component4 || !v4.fields.has(v34) || v34 === "type") return;
      let checked = target.type === "checkbox" ? target.checked : target.value,
        v35;
      if (v[v34] || P[v34]) {
        if (checked === "" || !Number.isFinite(Number(checked))) return;
        const v36 = v[v34] || P[v34];
        ((checked = flowClamp2(checked, v36[0], v36[1])),
          (v35 = P[v34]
            ? flowLineGeometryChange(component4, options5.document?.canvas, v34, checked)
            : {
                properties: {
                  [v34]: checked / (v36[2] || 1),
                },
              }));
      } else
        v34 === "effect"
          ? (v35 = {
              properties:
                checked === "energy"
                  ? {
                      effect: checked,
                      color: "#b594ff",
                      baseColor: "#b594ff",
                      speed: 140,
                      width: 4,
                      tail: 85,
                      spacing: 175,
                      glow: 80,
                    }
                  : {
                      effect: checked,
                      color: "#42d9ef",
                      baseColor: "#42d9ef",
                      speed: 90,
                      width: 5,
                      tail: 58,
                      spacing: 130,
                      glow: 55,
                    },
            })
          : (v35 = {
              properties: {
                [v34]: v34 === "direction" ? Number(checked) : checked,
              },
            });
      arg22
        ? options5.onPreview?.(component4.id, v35)
        : Promise.resolve(options5.onChange(component4.id, v35)).catch((arg23) =>
            options5.onError?.(arg23),
          );
    };
    (element.addEventListener("input", (arg24) => v33(arg24, true)),
      element.addEventListener("change", (arg25) => v33(arg25, false)),
      arg7.enhanceControls?.(element));
  }
  if (
    ((v4.component = arg6),
    (v4.options = arg7),
    (v4.form.hidden = arg6?.type !== "flow-line"),
    v4.form.hidden)
  )
    return;
  v4.form.dataset.componentId = arg6.id;
  const v37 = normalizeFlowLine2(arg6.properties),
    v38 = inspectorComponentMetrics2(arg6, arg7.document);
  for (const [v39, element17] of v4.fields) {
    if (v39 === "type") continue;
    const text =
      v39 === "label"
        ? arg6.properties?.label || arg6.properties?.instanceName || ""
        : P[v39]
          ? v38[v39]
          : v[v39]
            ? v37[v39] * (v[v39][2] || 1)
            : v37[v39];
    element17.tagName === "BUTTON"
      ? (element17.setAttribute("aria-pressed", String(text)),
        (element17.textContent = text ? element17.dataset.onLabel : element17.dataset.offLabel))
      : (element17.value = text);
  }
  v4.count.textContent = v37.points.length + " 个节点 · 拖动时按 Shift 锁轴";
  const text2 = arg6.bindings?.entity?.entityId || "",
    v40 = arg7.entities?.find((arg26) => arg26.entityId === text2);
  ((v4.entityLabel.hidden = v37.controlMode !== "entity-sign"),
    (v4.directionLabel.hidden = v37.controlMode === "entity-sign"),
    (v4.entityButton.textContent = v40?.name || text2 || "选择数值实体"),
    (v4.entityButton.title = text2),
    (v4.motionNote.hidden = v37.controlMode !== "entity-sign"),
    (v4.motionNote.textContent =
      "绑定后自动读取：正数从路径起点流向终点，负数反向，0 或不可用时只显示底线。"),
    (v4.applyCount.textContent = (arg7.styleChangeCount || 0) + " 项修改"),
    (v4.apply.disabled = !arg7.hasStyleChanges));
  for (const v41 of ["widthPercent", "heightPercent"])
    v4.fields.get(v41).disabled = !!arg7.multipleSelected;
  arg7.syncControls?.(v4.form);
}
export function previewFlowLineInspectorTransform(arg27, arg28, arg29, arg30) {
  const v42 = $.get(arg27);
  if (!v42 || v42.form.hidden) return;
  const options6 = {
      ...arg28,
      position: {
        ...arg28.position,
        ...arg30,
      },
      style: {
        ...arg28.style,
        ...(Number.isFinite(arg30.scale)
          ? {
              scale: arg30.scale,
            }
          : {}),
      },
    },
    v43 = inspectorComponentMetrics2(options6, {
      canvas: arg29,
    });
  for (const v44 of Object.keys(P)) v42.fields.get(v44).value = v43[v44];
}
