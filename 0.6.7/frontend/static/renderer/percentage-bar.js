import {
  percentageBarSeries as percentageBarSeries2,
  percentageBarDimensions as percentageBarDimensions2,
} from "../percentage-bar-model.js?v=20260930-percentage-text-offset-v1";
export function percentageValue(arg1, v1 = "") {
  if (
    ((arg1 = arg1?.newState || arg1),
    arg1?.available === false ||
      ["unknown", "unavailable"].includes(String(arg1?.state).toLowerCase()))
  )
    return null;
  const v2 = v1 ? arg1?.attributes?.[v1] : arg1?.state;
  if (v2 == null || typeof v2 == "boolean" || String(v2).trim() === "") return null;
  const v3 = Number(v2);
  return Number.isFinite(v3) ? Math.max(0, Math.min(100, v3)) : null;
}
export function percentageLabel(arg2, v4 = 0) {
  if (arg2 === null) return "—";
  const max = Math.max(0, Math.min(2, Math.trunc(Number(v4) || 0)));
  return arg2.toFixed(max) + "%";
}
export function renderPercentageBar(arg3, arg4) {
  const options = arg3.properties || {},
    v5 = percentageBarSeries2(arg3),
    element = document.createElement("section");
  element.className = "hb-percentage-chart";
  const variant = ["cursor", "glass"].includes(options.variant) ? options.variant : "gradient";
  ((element.dataset.variant = variant),
    element.style.setProperty("--series-count", String(v5.length)),
    element.classList.toggle("is-horizontal", options.orientation === "horizontal"));
  const v6 = (arg5, arg6, arg7, arg8) => {
      const v7 = Number(options[arg5]);
      return options[arg5] == null || !Number.isFinite(v7)
        ? arg8
        : Math.max(arg6, Math.min(arg7, v7));
    },
    options2 = {
      length: [80, 600, 300],
      gap: [0, 80, 52],
      valueGap: [0, 40, 11],
      labelGap: [0, 40, 16],
      valueSize: [12, 48, 26],
      labelSize: [8, 24, 11],
      radius: [0, 24, 5],
    };
  for (const v8 of ["valueOffsetX", "valueOffsetY", "labelOffsetX", "labelOffsetY"])
    options2[v8] = [-600, 600, 0];
  for (const [v9, [v10, v11, v12]] of Object.entries(options2))
    element.style.setProperty(
      "--" + v9.replace(/[A-Z]/g, (arg9) => "-" + arg9.toLowerCase()),
      v6(v9, v10, v11, v12) + "px",
    );
  (element.style.setProperty("--fill-opacity", v6("fillOpacity", 5, 90, 32) + "%"),
    element.classList.toggle("hide-values", options.valueVisible === false),
    element.classList.toggle("hide-labels", options.labelVisible === false));
  for (const [v13, v14] of [
    ["valueColor", "--chart-text"],
    ["labelColor", "--chart-label"],
  ])
    /^#[0-9a-f]{6}$/i.test(options[v13] || "") && element.style.setProperty(v14, options[v13]);
  element.setAttribute("aria-label", options.title || "百分比柱状图");
  const element2 = document.createElement("div");
  element2.className = "hb-percentage-axis";
  for (const v15 of [100, 75, 50, 25, 0]) {
    const element3 = document.createElement("span");
    ((element3.textContent = v15 + "%"), element2.append(element3));
  }
  const element4 = document.createElement("div");
  element4.className = "hb-percentage-plot";
  const map = v5.map((arg10) => {
    const element5 = document.createElement("div");
    element5.className = "hb-percentage-column";
    const max2 = Math.max(8, Math.min(96, Number(options.thickness) || 48));
    element5.style.setProperty("--bar-thickness", max2 + "px");
    const element6 = document.createElement("strong");
    element6.className = "hb-percentage-value";
    const element7 = document.createElement("div");
    ((element7.className = "hb-percentage-track"),
      element7.setAttribute("role", "meter"),
      element7.setAttribute("aria-valuemin", "0"),
      element7.setAttribute("aria-valuemax", "100"));
    const element8 = document.createElement("div");
    element8.className = "hb-percentage-fill";
    const color = arg10.color || options.color;
    /^#[0-9a-f]{6}$/i.test(color || "") && element5.style.setProperty("--bar-color", color);
    const element9 = document.createElement("span");
    element9.className = "hb-percentage-label";
    const element10 = document.createElement("div");
    return (
      (element10.className = "hb-percentage-surface"),
      element10.setAttribute("aria-hidden", "true"),
      element10.append(element8),
      element7.append(element10),
      element5.append(element6, element7, element9),
      element4.append(element5),
      {
        item: arg10,
        column: element5,
        value: element6,
        track: element7,
        fill: element8,
        label: element9,
      }
    );
  });
  return (
    element.append(element2, element4),
    (element.syncPercentageStates = (arg11) => {
      for (const v16 of map) {
        const v17 = arg11.get(v16.item.entityId),
          percentageValue2 = percentageValue(v17, v16.item.attribute),
          text =
            v16.item.label ||
            (v17?.newState || v17)?.attributes?.friendly_name ||
            v16.item.entityId ||
            "未绑定实体",
          percentageLabel2 = percentageLabel(percentageValue2, options.precision);
        ((v16.label.textContent = text), (v16.label.title = text));
        const element11 = document.createElement("span");
        element11.textContent = percentageValue2 === null ? "—" : percentageLabel2.slice(0, -1);
        const element12 = document.createElement("small");
        ((element12.textContent = percentageValue2 === null ? "" : "%"),
          v16.value.replaceChildren(element11, element12),
          v16.column.style.setProperty("--percentage", String((percentageValue2 ?? 0) / 100)),
          (v16.fill.hidden = percentageValue2 === null || percentageValue2 === 0),
          v16.column.classList.toggle("is-unavailable", percentageValue2 === null),
          v16.track.setAttribute("aria-label", text),
          v16.track.setAttribute(
            "aria-valuetext",
            percentageValue2 === null ? "暂无数据" : percentageLabel2,
          ),
          percentageValue2 === null
            ? v16.track.removeAttribute("aria-valuenow")
            : v16.track.setAttribute("aria-valuenow", String(percentageValue2)),
          (v16.column.title =
            text + "：" + (percentageValue2 === null ? "暂无数据" : percentageLabel2)));
      }
    }),
    element.syncPercentageStates(arg4.states),
    element
  );
}
export function renderPercentageBarControl(arg12, arg13) {
  const element13 = document.createElement("div");
  element13.className = "hb-percentage-control";
  const percentageBar = renderPercentageBar(arg12, arg13),
    v18 = percentageBarDimensions2(arg12.properties, percentageBarSeries2(arg12).length);
  ((percentageBar.style.width = v18.width + "px"),
    (percentageBar.style.minWidth = "0"),
    (percentageBar.style.height = v18.height + "px"),
    element13.append(percentageBar));
  const v19 = () => {
    const width = element13.clientWidth || arg12.position?.width || v18.width,
      height = element13.clientHeight || arg12.position?.height || v18.height;
    percentageBar.style.transform =
      "translate(-50%, -50%) scale(" + Math.min(width / v18.width, height / v18.height) + ")";
  };
  if ((v19(), typeof ResizeObserver < "u")) {
    const resizeObserver = new ResizeObserver(v19);
    (resizeObserver.observe(element13), arg13.cleanup?.(() => resizeObserver.disconnect()));
  }
  for (const v20 of new Set(
    percentageBarSeries2(arg12)
      .map((arg14) => arg14.entityId)
      .filter(Boolean),
  ))
    arg13.registerRuntimeStateHandler?.(v20, () =>
      percentageBar.syncPercentageStates(arg13.states),
    );
  return element13;
}
