import {
  mapCorners,
  createVacuumMapImageLoader,
} from "./vacuum-map.js?v=20260925-vacuum-state-v2-reload-diagnostics-v2";
export function planFurniture(arg1 = {}) {
  const value1 = Number(arg1.pixelsPerMeter) > 0 ? Number(arg1.pixelsPerMeter) : 1,
    set1 = new Set([
      "downlight",
      "ceilinglight",
      "striplight",
      "camera",
      "presence",
      "flooropening",
      "label",
    ]);
  return (arg1.items || [])
    .filter(
      (arg2) =>
        !set1.has(arg2.type) &&
        [arg2.x, arg2.y, arg2.width, arg2.depth].every(Number.isFinite) &&
        arg2.width > 0 &&
        arg2.depth > 0,
    )
    .map((arg3) => ({
      ...arg3,
      width: arg3.width * value1,
      depth: arg3.depth * value1,
      rotation: Number(arg3.rotation) || 0,
    }));
}
export function openVacuumMapEditor({
  item: arg4,
  floor: arg5,
  onSave: arg6,
  getMapState: arg7 = () => null,
}) {
  const value2 = window.document,
    text1 = "http://www.w3.org/2000/svg",
    fn1 = (arg8, arg9) => {
      const value37 = value2.createElement(arg8);
      return (arg9 && (value37.textContent = arg9), value37);
    },
    fn2 = (arg10, arg11 = {}) => {
      const value38 = value2.createElementNS(text1, arg10);
      for (const [value39, value40] of Object.entries(arg11))
        value38.setAttribute(value39, value40);
      return value38;
    },
    value3 = arg5?.plan?.walls || [],
    value4 = planFurniture(arg5?.plan),
    list1 = [...value3.flatMap((arg12) => [arg12.start, arg12.end]), ...value4.flatMap(mapCorners)],
    value5 = list1.length ? Math.min(...list1.map((arg13) => arg13.x)) : 0,
    value6 = list1.length ? Math.min(...list1.map((arg14) => arg14.y)) : 0,
    value7 = Math.max(
      100,
      list1.length ? Math.max(...list1.map((arg15) => arg15.x)) - value5 : 1000,
    ),
    value8 = Math.max(
      100,
      list1.length ? Math.max(...list1.map((arg16) => arg16.y)) - value6 : 1000,
    ),
    object1 = {
      x: value5 + value7 / 2,
      y: value6 + value8 / 2,
      width: value7,
      depth: value8,
      rotation: 0,
      opacity: 45,
      visible: true,
    },
    object2 = {
      map: {
        ...object1,
        ...structuredClone(arg4.map || {}),
      },
    },
    value9 = fn1("dialog");
  ((value9.className = "i3d-vacuum-map-editor"), value9.setAttribute("aria-label", "底图对齐"));
  const value10 = fn1("header"),
    value11 = fn1("strong", (arg5?.name || "当前楼层") + " · 底图对齐"),
    value12 = fn1("span");
  value12.setAttribute("role", "status");
  let value13 = false,
    value14 = null;
  const fn3 = () => {
      value13 ||
        ((value13 = true),
        value34.dispose(),
        document.removeEventListener("visibilitychange", fn9),
        resizeObserver1.disconnect(),
        value9.close(),
        value9.remove());
    },
    fn4 = (arg17, arg18) => {
      const value41 = fn1("button", arg17);
      return ((value41.type = "button"), value41.addEventListener("click", arg18), value41);
    },
    value15 = fn4("保存", () => {
      (arg6(structuredClone(object2)), (value12.textContent = "已应用，最后保存扫地机配置"));
    });
  value15.className = "primary";
  const value16 = fn4("×", fn3);
  (value16.setAttribute("aria-label", "关闭底图对齐"),
    value10.append(value11, value12, value15, value16));
  const value17 = fn1("div");
  value17.className = "i3d-vacuum-map-body";
  const value18 = fn1("div");
  value18.className = "i3d-vacuum-plan";
  const value19 = Math.max(value7, value8) * 0.12,
    value20 = fn2("svg", {
      viewBox:
        value5 -
        value19 +
        " " +
        (value6 - value19) +
        " " +
        (value7 + value19 * 2) +
        " " +
        (value8 + value19 * 2),
      role: "img",
      "aria-label": "户型平面与扫地机地图",
    });
  let object3 = {
    x: value5 - value19,
    y: value6 - value19,
    width: value7 + value19 * 2,
    height: value8 + value19 * 2,
  };
  const fn5 = () => {
      (value20.setAttribute(
        "viewBox",
        object3.x + " " + object3.y + " " + object3.width + " " + object3.height,
      ),
        fn10());
    },
    fn6 = (arg19) => {
      const value42 = object2.map,
        value43 = Math.max(
          0.01 / Math.min(value42.width, value42.depth),
          Math.min(1000000 / Math.max(value42.width, value42.depth), arg19),
        );
      ((value42.width *= value43), (value42.depth *= value43), fn10());
    },
    fn7 = (arg20) => {
      const value44 = Math.max(value7 * 0.15, Math.min(value7 * 10, object3.width * arg20)),
        value45 = value44 / object3.width;
      ((object3 = {
        x: object3.x + (object3.width - value44) / 2,
        y: object3.y + (object3.height * (1 - value45)) / 2,
        width: value44,
        height: object3.height * value45,
      }),
        fn5());
    },
    value21 = fn2("image", {
      preserveAspectRatio: "none",
    }),
    value22 = fn2("g", {
      "pointer-events": "none",
      "data-layer": "furniture",
    }),
    value23 = fn2("g"),
    value24 = fn2("g"),
    list2 = [];
  for (const value46 of value4) {
    const value47 = value46.width,
      value48 = value46.depth,
      value49 = fn2("g", {
        transform:
          "translate(" + value46.x + " " + value46.y + ") rotate(" + value46.rotation + ")",
        "data-furniture-id": value46.id,
        fill: /^#[0-9a-f]{6}$/i.test(value46.color || "") ? value46.color : "#91a4b5",
        "fill-opacity": 0.28,
        stroke: "#d0dae3",
        "stroke-width": 1,
        "stroke-opacity": 0.8,
      }),
      fn12 = (arg21, arg22) =>
        value49.append(
          fn2(arg21, {
            ...arg22,
            "vector-effect": "non-scaling-stroke",
          }),
        ),
      value50 = ["plant", "robotvacuum", "roundtable", "stool"].includes(value46.type);
    if (
      (fn12(
        value50 ? "ellipse" : "rect",
        value50
          ? {
              cx: 0,
              cy: 0,
              rx: value47 / 2,
              ry: value48 / 2,
            }
          : {
              x: -value47 / 2,
              y: -value48 / 2,
              width: value47,
              height: value48,
              rx: Math.min(value47, value48) * 0.06,
            },
      ),
      value46.type === "bed"
        ? (fn12("rect", {
            x: -value47 * 0.42,
            y: -value48 * 0.43,
            width: value47 * 0.36,
            height: value48 * 0.2,
            rx: value48 * 0.03,
          }),
          fn12("rect", {
            x: value47 * 0.06,
            y: -value48 * 0.43,
            width: value47 * 0.36,
            height: value48 * 0.2,
            rx: value48 * 0.03,
          }),
          fn12("line", {
            x1: -value47 / 2,
            x2: value47 / 2,
            y1: -value48 * 0.12,
            y2: -value48 * 0.12,
          }))
        : value46.type === "sofa" &&
          (fn12("rect", {
            x: -value47 * 0.38,
            y: -value48 * 0.26,
            width: value47 * 0.76,
            height: value48 * 0.65,
            rx: value48 * 0.04,
          }),
          fn12("line", {
            x1: 0,
            x2: 0,
            y1: -value48 * 0.26,
            y2: value48 * 0.39,
          })),
      value22.append(value49),
      value46.name)
    ) {
      const value51 = fn2("text", {
        x: value46.x,
        y: value46.y,
        fill: "#e0e7ed",
        "text-anchor": "middle",
        "dominant-baseline": "central",
        stroke: "#17212d",
        "stroke-width": 2.5,
        "paint-order": "stroke",
        "vector-effect": "non-scaling-stroke",
      });
      ((value51.textContent = value46.name),
        value22.append(value51),
        list2.push({
          label: value51,
          item: value46,
        }));
    }
  }
  for (const value52 of value3)
    value23.append(
      fn2("line", {
        x1: value52.start.x,
        y1: value52.start.y,
        x2: value52.end.x,
        y2: value52.end.y,
        stroke: "#9fa9bc",
        "stroke-width": Math.max(2, value52.thickness || value7 * 0.006),
        "vector-effect": "non-scaling-stroke",
        "pointer-events": "none",
      }),
    );
  (value20.append(value21, value22, value23, value24), value18.append(value20));
  const value25 = fn1("div");
  ((value25.className = "i3d-vacuum-view-tools"),
    value25.append(
      fn4("地图 −", () => fn6(1 / 1.1)),
      fn4("地图 +", () => fn6(1.1)),
      fn4("视图 −", () => fn7(1.2)),
      fn4("视图 +", () => fn7(1 / 1.2)),
      fn4("显示全部", () => {
        const list3 = [...list1, ...mapCorners(object2.map)],
          value53 = Math.max(value7, value8) * 0.15,
          value54 = Math.min(...list3.map((arg23) => arg23.x)),
          value55 = Math.min(...list3.map((arg24) => arg24.y));
        ((object3 = {
          x: value54 - value53,
          y: value55 - value53,
          width: Math.max(...list3.map((arg25) => arg25.x)) - value54 + value53 * 2,
          height: Math.max(...list3.map((arg26) => arg26.y)) - value55 + value53 * 2,
        }),
          fn5());
      }),
    ),
    value18.append(value25),
    value20.addEventListener(
      "wheel",
      (arg27) => {
        (arg27.preventDefault(),
          arg27.target.closest("[data-drag]")
            ? fn6(arg27.deltaY > 0 ? 1 / 1.08 : 1.08)
            : fn7(arg27.deltaY > 0 ? 1.12 : 1 / 1.12));
      },
      {
        passive: false,
      },
    ));
  const value26 = fn1("aside"),
    value27 = fn1(
      "p",
      "拖动地图移动，拖角点缩放，拖圆点旋转；Shift 等比缩放。地图上滚轮或双指缩放地图，空白处滚轮缩放视图。",
    );
  ((value27.className = "i3d-note"), value26.append(value27));
  const fn8 = (arg28, arg29, arg30, arg31, arg32, arg33 = 1, arg34 = value26) => {
      const value56 = fn1("label"),
        value57 = fn1("span", arg28),
        value58 = fn1("input");
      return (
        Object.assign(value58, {
          type: "number",
          min: arg31,
          max: arg32,
          step: "any",
          value: arg29[arg30],
        }),
        (value58.dataset.numberStep = String(arg33)),
        value58.setAttribute("aria-label", arg28),
        value58.addEventListener("change", () => {
          const value59 = Number(value58.value);
          if (!Number.isFinite(value59) || value58.value.trim() === "") {
            value58.value = arg29[arg30];
            return;
          }
          ((arg29[arg30] = Math.max(arg31, Math.min(arg32, value59))),
            (value58.value = arg29[arg30]),
            fn10());
        }),
        value56.append(value57, value58),
        arg34.append(value56),
        value58
      );
    },
    map1 = new Map();
  for (const [value60, value61, value62, value63] of [
    ["位置 X", "x", -1000000, 1000000],
    ["位置 Y", "y", -1000000, 1000000],
    ["宽度", "width", 0.01, 1000000],
    ["高度", "depth", 0.01, 1000000],
    ["旋转角度", "rotation", -360, 360],
    ["地图显示强度（%）", "opacity", 0, 100],
  ])
    map1.set(
      value61,
      fn8(value60, object2.map, value61, value62, value63, value61 === "rotation" ? 0.5 : 1),
    );
  const value28 = fn1("label"),
    value29 = fn1("input");
  ((value28.className = "i3d-setting-toggle"),
    (value29.type = "checkbox"),
    (value29.checked = object2.map.visible),
    value29.setAttribute("aria-label", "显示地图"),
    value29.addEventListener("change", () => {
      ((object2.map.visible = value29.checked), fn10());
    }),
    value28.append(fn1("span", "显示地图"), value29),
    value26.append(value28));
  const value30 = fn1("label"),
    value31 = fn1("input");
  ((value30.className = "i3d-setting-toggle"),
    (value31.type = "checkbox"),
    (value31.checked = true),
    value31.setAttribute("aria-label", "显示家具参照"),
    value31.addEventListener("change", () => {
      value22.style.display = value31.checked ? "" : "none";
    }),
    value30.append(fn1("span", "显示家具参照"), value31),
    value26.append(value30),
    value26.append(
      fn4("重置地图位置", () => {
        (Object.assign(object2.map, object1), (value29.checked = true), fn10());
      }),
    ));
  const value32 = fn1("p");
  ((value32.className = "i3d-note"), value26.append(value32));
  let value33 = false;
  const value34 = createVacuumMapImageLoader({
      entityId: object2.map.entityId,
      getState: arg7,
      isActive: () => !value13 && !!object2.map.entityId && !document.hidden,
      onFrame(arg35) {
        ((value33 = true),
          value21.setAttribute("href", arg35.src),
          (value32.textContent = ""),
          fn10());
      },
      onUnavailable() {
        ((value33 = false),
          value21.removeAttribute("href"),
          (value32.textContent = object2.map.entityId
            ? "地图暂时不可用，已隐藏；已保存的位置会保留，恢复后自动显示。"
            : "尚未选择地图；仍可放置房间快捷按钮。"),
          fn10());
      },
    }),
    fn9 = () => value34.sync();
  document.addEventListener("visibilitychange", fn9);
  let value35 = null;
  function fn10() {
    const value64 = object2.map,
      value65 = 1 / Math.max(0.001, value20.getScreenCTM()?.a || 1);
    for (const [value69, value70] of map1)
      value2.activeElement !== value70 && (value70.value = Number(value64[value69].toFixed(2)));
    if (value65 !== value35) {
      value35 = value65;
      for (const { label: value71, item: value72 } of list2)
        (value71.setAttribute(
          "font-size",
          Math.min(11 * value65, (value72.width * 0.85) / Math.max(1, [...value72.name].length)),
        ),
          (value71.style.display =
            Math.min(value72.width, value72.depth) / value65 < 25 ? "none" : ""));
    }
    for (const [value73, value74] of Object.entries({
      x: value64.x - value64.width / 2,
      y: value64.y - value64.depth / 2,
      width: value64.width,
      height: value64.depth,
      opacity: value64.opacity / 100,
      transform: "rotate(" + value64.rotation + " " + value64.x + " " + value64.y + ")",
    }))
      value21.setAttribute(value73, value74);
    ((value21.style.display = value64.visible === false || !value33 ? "none" : ""),
      value24.replaceChildren());
    const value66 = mapCorners(value64);
    (value24.append(
      fn2("polygon", {
        points: value66.map((arg36) => arg36.x + "," + arg36.y).join(" "),
        fill: "transparent",
        stroke: "#73b3ff",
        "stroke-width": 1.5,
        "vector-effect": "non-scaling-stroke",
        "data-drag": "map",
      }),
    ),
      value66.forEach((arg37, arg38) =>
        value24.append(
          fn2("circle", {
            cx: arg37.x,
            cy: arg37.y,
            r: 8 * value65,
            fill: "#73b3ff",
            "data-drag": "corner:" + arg38,
          }),
        ),
      ));
    const value67 = (value64.rotation * Math.PI) / 180,
      value68 = value64.depth / 2 + Math.max(value7, value8) * 0.055;
    value24.append(
      fn2("circle", {
        cx: value64.x + Math.sin(value67) * value68,
        cy: value64.y - Math.cos(value67) * value68,
        r: 10 * value65,
        fill: "#b8e77b",
        "data-drag": "rotate",
      }),
    );
  }
  const fn11 = (arg39) => {
      const value75 = value20.createSVGPoint();
      return (
        (value75.x = arg39.clientX),
        (value75.y = arg39.clientY),
        value75.matrixTransform(value20.getScreenCTM().inverse())
      );
    },
    map2 = new Map();
  let value36 = null;
  (value20.addEventListener("pointerdown", (arg40) => {
    if (
      (map2.set(arg40.pointerId, {
        x: arg40.clientX,
        y: arg40.clientY,
      }),
      map2.size === 2)
    ) {
      arg40.preventDefault();
      const [list4, list5] = [...map2.values()];
      ((value36 = {
        distance: Math.max(1, Math.hypot(list4.x - list5.x, list4.y - list5.y)),
        width: object2.map.width,
        depth: object2.map.depth,
      }),
        (value14 = null),
        value20.setPointerCapture(arg40.pointerId));
      return;
    }
    const value76 = arg40.target.closest("[data-drag]")?.getAttribute("data-drag");
    arg40.button === 0 &&
      (arg40.preventDefault(),
      (value14 = {
        kind: value76 || "pan",
        start: fn11(arg40),
        viewBox: {
          ...object3,
        },
        clientX: arg40.clientX,
        clientY: arg40.clientY,
        map: {
          ...object2.map,
        },
      }),
      value20.setPointerCapture(arg40.pointerId));
  }),
    value20.addEventListener("pointermove", (arg41) => {
      if (
        (map2.has(arg41.pointerId) &&
          map2.set(arg41.pointerId, {
            x: arg41.clientX,
            y: arg41.clientY,
          }),
        value36 && map2.size === 2)
      ) {
        const [list6, list7] = [...map2.values()],
          value82 = Math.max(
            0.01 / Math.min(value36.width, value36.depth),
            Math.min(
              1000000 / Math.max(value36.width, value36.depth),
              Math.hypot(list6.x - list7.x, list6.y - list7.y) / value36.distance,
            ),
          );
        ((object2.map.width = value36.width * value82),
          (object2.map.depth = value36.depth * value82),
          fn10());
        return;
      }
      if (!value14) return;
      const value77 = fn11(arg41),
        value78 = value77.x - value14.start.x,
        value79 = value77.y - value14.start.y,
        value80 = object2.map,
        value81 = value14.map;
      if (value14.kind === "pan") {
        const value83 = value20.getScreenCTM().a;
        ((object3 = {
          ...value14.viewBox,
          x: value14.viewBox.x - (arg41.clientX - value14.clientX) / value83,
          y: value14.viewBox.y - (arg41.clientY - value14.clientY) / value83,
        }),
          fn5());
        return;
      }
      if (value14.kind === "map")
        ((value80.x = value81.x + value78), (value80.y = value81.y + value79));
      else {
        if (value14.kind === "rotate")
          value80.rotation =
            (Math.atan2(value77.x - value81.x, value81.y - value77.y) * 180) / Math.PI;
        else {
          const value84 = Number(value14.kind.split(":")[1]),
            value85 = [
              [-1, -1],
              [1, -1],
              [1, 1],
              [-1, 1],
            ][value84],
            value86 = (value81.rotation * Math.PI) / 180,
            value87 = Math.cos(value86),
            value88 = Math.sin(value86);
          let value89 = Math.max(
              0.01,
              value81.width + (value78 * value87 + value79 * value88) * value85[0],
            ),
            value90 = Math.max(
              0.01,
              value81.depth + (-value78 * value88 + value79 * value87) * value85[1],
            );
          if (arg41.shiftKey) {
            const value91 = Math.max(value89 / value81.width, value90 / value81.depth);
            ((value89 = value81.width * value91), (value90 = value81.depth * value91));
          }
          ((value80.width = value89),
            (value80.depth = value90),
            (value80.x =
              value81.x +
              ((value89 - value81.width) * value85[0] * value87 -
                (value90 - value81.depth) * value85[1] * value88) /
                2),
            (value80.y =
              value81.y +
              ((value89 - value81.width) * value85[0] * value88 +
                (value90 - value81.depth) * value85[1] * value87) /
                2));
        }
      }
      fn10();
    }));
  for (const value92 of ["pointerup", "pointercancel"])
    value20.addEventListener(value92, (arg42) => {
      (map2.delete(arg42.pointerId), (value36 = null), (value14 = null));
    });
  const resizeObserver1 = new ResizeObserver(() => {
    value13 || fn10();
  });
  return (
    value17.append(value18, value26),
    value9.append(value10, value17),
    value2.body.append(value9),
    value9.addEventListener("cancel", (arg43) => {
      (arg43.preventDefault(), fn3());
    }),
    value9.showModal(),
    value25.lastElementChild.click(),
    resizeObserver1.observe(value20),
    fn9(),
    {
      close: fn3,
      syncMap: fn9,
    }
  );
}
