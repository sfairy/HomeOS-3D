import {
  percentageBarDefaults as percentageBarDefaults2,
  percentageBarNumbers as percentageBarNumbers2,
  percentageBarSeries as percentageBarSeries2,
  PERCENTAGE_BAR_LIMIT as PERCENTAGE_BAR_LIMIT2,
} from "./percentage-bar-model.js?v=20260930-percentage-text-offset-v1";
import { inspectorComponentMetrics as inspectorComponentMetrics2 } from "./editor-basic-inspectors.js?v=20260831-editor-utils-v1";
const O = new WeakMap(),
  i = (arg1, arg2, arg3) => {
    const element = document.createElement(arg1);
    return (
      arg2 != null && (element.textContent = arg2),
      arg3 && (element.className = arg3),
      element
    );
  };
export function renderPercentageBarInspector(arg4, arg5, arg6) {
  let v1 = O.get(arg4);
  if (!v1) {
    const i2 = i("form", null, "inspector-form");
    ((i2.id = "percentage-bar-inspector"),
      i2.addEventListener("submit", (arg7) => arg7.preventDefault()),
      arg4.append(i2),
      (v1 = {
        form: i2,
        selected: 0,
        componentId: null,
      }),
      O.set(arg4, v1));
  }
  const { form: element2 } = v1;
  if (((element2.hidden = arg5?.type !== "percentage-bar"), element2.hidden)) return;
  (v1.componentId !== arg5.id && (v1.selected = 0), (v1.componentId = arg5.id));
  const v2 = percentageBarSeries2(arg5);
  v1.selected = Math.min(v1.selected, v2.length - 1);
  const options = {
      ...percentageBarDefaults2,
      ...arg5.properties,
    },
    v3 = inspectorComponentMetrics2(arg5, arg6.document);
  element2.replaceChildren();
  const v4 = (arg8) => {
      const i3 = i("section", null, "inspector-section");
      return (i3.append(i("h3", arg8)), element2.append(i3), i3);
    },
    v5 = (arg9) => {
      const i4 = i("div", null, "inspector-grid two-columns");
      return (arg9.append(i4), i4);
    },
    v6 = (
      arg10,
      arg11,
      {
        type: v7 = "text",
        value: v8 = "",
        choices: v9,
        min: v10,
        max: v11,
        readonly: v12,
        change: v13,
        preview: v14,
        key: v15,
        disabled: v16,
        step: v17 = 1,
        placeholder: v18,
      } = {},
    ) => {
      const i5 = i("label", arg11),
        i6 = i(v9 ? "select" : "input");
      if (v9)
        for (const [v19, v20] of v9) {
          const i7 = i("option", v20);
          ((i7.value = v19), i6.append(i7));
        }
      else i6.type = v7;
      ((i6.value = String(v8)),
        i6.setAttribute("aria-label", arg11),
        v15 && (i6.dataset.geometry = v15),
        v10 != null && (i6.min = v10),
        v11 != null && (i6.max = v11),
        v7 === "number" && (i6.step = String(v17)),
        v18 && (i6.placeholder = v18),
        v7 === "text" && (i6.maxLength = 128),
        (i6.readOnly = !!v12),
        (i6.disabled = !!v16));
      const v21 = () =>
        v7 !== "number"
          ? i6.value
          : i6.value.trim() === "" || !Number.isFinite(Number(i6.value))
            ? null
            : Math.max(v10, Math.min(v11, Number(i6.value)));
      return (
        i6.addEventListener("change", () => {
          const v22 = v21();
          v22 !== null ? v13?.(v22) : ((i6.value = String(v8)), v14?.(v8));
        }),
        v14 &&
          i6.addEventListener("input", () => {
            const v23 = v21();
            v23 !== null && v14(v23);
          }),
        i5.append(i6),
        arg10.append(i5),
        i6
      );
    },
    v24 = (arg12, arg13, arg14, v25 = {}) =>
      v6(arg12, arg13, {
        value: options[arg14],
        type: percentageBarNumbers2[arg14] ? "number" : "text",
        min: percentageBarNumbers2[arg14]?.[0],
        max: percentageBarNumbers2[arg14]?.[1],
        change: (arg15) =>
          arg6.change({
            property: arg14,
            value: arg15,
          }),
        preview:
          percentageBarNumbers2[arg14] || v25.type === "color"
            ? (arg16) => arg6.previewProperty(arg14, arg16)
            : null,
        ...v25,
      }),
    v26 = v5(v4("基础"));
  (v6(v26, "类型", {
    value: "百分比柱状图",
    readonly: true,
  }),
    v24(v26, "控件备注", "label", {
      value: options.label || "",
    }));
  const element3 = v4("柱体列表");
  element3
    .querySelector("h3")
    .append(i("span", v2.length + " / " + PERCENTAGE_BAR_LIMIT2, "percentage-series-count"));
  const i8 = i("div", null, "percentage-series-tabs");
  v2.forEach((arg17, arg18) => {
    const i9 = i("button", arg17.label || "柱体 " + (arg18 + 1));
    ((i9.type = "button"),
      (i9.title = arg17.label || "柱体 " + (arg18 + 1)),
      i9.setAttribute("aria-label", "选择第 " + (arg18 + 1) + " 根柱子"),
      i9.setAttribute("aria-pressed", String(v1.selected === arg18)),
      i9.addEventListener("click", () => {
        ((v1.selected = arg18), renderPercentageBarInspector(arg4, arg5, arg6));
      }),
      i8.append(i9));
  });
  const i10 = i("button", "+ 添加柱体");
  ((i10.type = "button"),
    (i10.disabled = v2.length >= PERCENTAGE_BAR_LIMIT2),
    i10.addEventListener("click", () => {
      ((v1.selected = v2.length),
        arg6.change({
          add: true,
        }));
    }),
    i8.append(i10),
    element3.append(i8));
  const selected = v1.selected,
    v27 = v2[selected],
    v28 = arg6.entities.find((arg19) => arg19.entityId === v27.entityId),
    i11 = i(
      "button",
      v28 ? arg6.entityName(v28) : v27.entityId || "选择百分比实体",
      "inspector-picker-button",
    );
  ((i11.type = "button"),
    i11.setAttribute("aria-label", "选择百分比实体"),
    i11.setAttribute("aria-haspopup", "dialog"));
  const i12 = i("div", null, "inspector-picker");
  (i12.append(i("span", "百分比实体", "inspector-picker-title")),
    i12.append(i11),
    i11.addEventListener("click", () =>
      arg6.pickEntity(i11, v27, (arg20) =>
        arg6.change({
          seriesIndex: selected,
          patch: arg20,
        }),
      ),
    ),
    element3.append(i12));
  const text = v27.entityId
    ? "" +
      v27.entityId +
      (v27.attribute ? " · " + v27.attribute : "") +
      (v28 ? "" : " · 实体未载入或已失效")
    : "仅列出百分比实体和设备的百分比属性。";
  i12.append(i("p", text, "inspector-help"));
  const v29 = v5(element3);
  (v6(v29, "柱体备注", {
    value: v27.label || "",
    placeholder: "默认实体名称",
    change: (arg21) =>
      arg6.change({
        seriesIndex: selected,
        patch: {
          label: arg21,
        },
      }),
  }),
    v6(v29, "柱体颜色", {
      type: "color",
      value: v27.color || "#f2a20d",
      change: (arg22) =>
        arg6.change({
          seriesIndex: selected,
          patch: {
            color: arg22,
          },
        }),
    }));
  const i13 = i("div", null, "percentage-series-actions");
  for (const [v30, v31, v32] of [
    [
      "前移",
      {
        move: -1,
      },
      selected === 0,
    ],
    [
      "后移",
      {
        move: 1,
      },
      selected === v2.length - 1,
    ],
    [
      "移除",
      {
        remove: true,
      },
      v2.length <= 1,
    ],
  ]) {
    const i14 = i("button", v30);
    ((i14.type = "button"),
      (i14.disabled = v32),
      i14.addEventListener("click", () => {
        (v31.move && (v1.selected += v31.move),
          arg6.change({
            seriesIndex: selected,
            ...v31,
          }));
      }),
      i13.append(i14));
  }
  element3.append(i13);
  const v33 = v5(v4("样式与布局"));
  (v24(v33, "柱体样式", "variant", {
    choices: [
      ["gradient", "渐变柱"],
      ["cursor", "内嵌游标柱"],
      ["glass", "玻璃液柱"],
    ],
  }),
    v24(v33, "显示方向", "orientation", {
      choices: [
        ["vertical", "纵向"],
        ["horizontal", "横向"],
      ],
    }));
  for (const [v34, v35] of [
    ["thickness", "统一粗细（px）"],
    ["length", "柱体长度（px）"],
    ["gap", "柱间距（px）"],
    ["radius", "端部圆角（px）"],
  ])
    v24(v33, v35, v34, {
      disabled: v34 === "gap" && v2.length === 1,
    });
  v24(v33, "填充浓度（%）", "fillOpacity").parentElement.classList.add("inspector-full-row");
  for (const [v36, v37, v38, v39, v40] of [
    ["valueVisible", "数值", "valueSize", "valueColor", "valueOffset"],
    ["labelVisible", "备注", "labelSize", "labelColor", "labelOffset"],
  ]) {
    const v41 = v4(v37 + "显示"),
      v42 = v5(v41);
    (v24(v42, "显示" + v37, v36, {
      value: String(options[v36]),
      choices: [
        ["true", "显示"],
        ["false", "隐藏"],
      ],
      change: (arg23) =>
        arg6.change({
          property: v36,
          value: arg23 === "true",
        }),
    }),
      v24(v42, v37 + "颜色", v39, {
        type: "color",
        disabled: !options[v36],
      }));
    const v43 = v5(v41);
    (v24(v43, v37 + "字号（px）", v38, {
      disabled: !options[v36],
    }),
      v36 === "valueVisible" &&
        v24(v43, "小数位数", "precision", {
          type: "text",
          choices: [
            ["0", "整数"],
            ["1", "1 位"],
            ["2", "2 位"],
          ],
          change: (arg24) =>
            arg6.change({
              property: "precision",
              value: Number(arg24),
            }),
          disabled: !options.valueVisible,
        }));
    const v44 = v5(v41);
    (v24(v44, v37 + "水平偏移（px）", v40 + "X", {
      disabled: !options[v36],
    }),
      v24(v44, v37 + "垂直偏移（px）", v40 + "Y", {
        disabled: !options[v36],
      }),
      v41.append(i("p", "水平：负数向左，正数向右；垂直：负数向上，正数向下。", "inspector-help")));
  }
  const v45 = v5(v4("位置与变换"));
  for (const [v46, v47, v48, v49, v50] of [
    ["left", "左侧（%）", v3.left, 0, 100],
    ["top", "顶部（%）", v3.top, 0, 100],
    ["scale", "缩放（%）", v3.scale, 1, 500],
    ["rotation", "旋转（°）", v3.rotation, -360, 360],
  ])
    v6(v45, v47, {
      type: "number",
      value: v48,
      min: v49,
      max: v50,
      key: v46,
      step: 0.1,
      change: (arg25) =>
        arg6.change({
          geometry: v46,
          value: arg25,
        }),
      preview: (arg26) => arg6.previewGeometry(v46, arg26),
    });
  const element4 = v4("批量应用");
  element4.classList.add("navigation-batch-section");
  const i15 = i("button", "应用样式到其它百分比柱状图");
  ((i15.type = "button"),
    (i15.disabled = !arg6.canApplyStyle),
    i15.addEventListener("click", arg6.applyStyle),
    element4.append(i15),
    arg6.enhance?.(element2));
}
export function previewPercentageBarInspector(arg27, arg28, arg29) {
  const element5 = O.get(arg27)?.form;
  if (!element5 || element5.hidden) return;
  const v51 = inspectorComponentMetrics2(arg28, arg29);
  for (const v52 of ["left", "top", "scale", "rotation"]) {
    const selector = element5.querySelector('[data-geometry="' + v52 + '"]');
    selector && (selector.value = v51[v52]);
  }
}
