const et = "http://www.w3.org/2000/svg",
  O = (arg1, arg2, arg3) => Math.max(arg2, Math.min(arg3, arg1)),
  J = (arg4, arg5 = 0) => (Number.isFinite(Number(arg4)) ? Number(arg4) : arg5),
  X = (arg6) => JSON.parse(JSON.stringify(arg6 || {})),
  N = (arg7) => Math.round(arg7 * 100) / 100,
  tt = (arg8, arg9) => JSON.stringify([String(arg8), String(arg9)]);
export function resizeRegionDimensions(arg10, arg11, arg12, arg13, arg14 = false) {
  if (
    (["n", "s"].includes(arg13) && (arg11 = arg10.width),
    ["w", "e"].includes(arg13) && (arg12 = arg10.depth),
    arg14)
  ) {
    const value1 = arg11 / arg10.width,
      value2 = arg12 / arg10.depth;
    let value3 = ["w", "e"].includes(arg13)
      ? value1
      : ["n", "s"].includes(arg13)
        ? value2
        : Math.abs(value1 - 1) >= Math.abs(value2 - 1)
          ? value1
          : value2;
    return (
      (value3 = O(
        value3,
        Math.max(0.5 / arg10.width, 0.5 / arg10.depth),
        Math.min(20 / arg10.width, 20 / arg10.depth),
      )),
      {
        width: N(arg10.width * value3),
        depth: N(arg10.depth * value3),
      }
    );
  }
  return {
    width: N(O(arg11, 0.5, 20)),
    depth: N(O(arg12, 0.5, 20)),
  };
}
export function regionHeightPatch(arg15, arg16, arg17) {
  const object1 = {
    heightAbove: undefined,
    heightBelow: undefined,
    heightMin: arg15.heightMin === undefined ? undefined : O(arg15.heightMin, 0, 20),
    heightMax: arg15.heightMax === undefined ? undefined : O(arg15.heightMax, 0, 20),
    [arg16]: arg17,
  };
  return (
    object1.heightMin !== undefined &&
      object1.heightMax !== undefined &&
      object1.heightMin > object1.heightMax &&
      (object1[arg16 === "heightMin" ? "heightMax" : "heightMin"] = arg17),
    object1
  );
}
export function mountRegionRangeEditor(
  arg18,
  {
    getConfig: arg19 = () => ({}),
    onChange: arg20 = () => {},
    onClose: arg21 = () => {},
    wake: arg22 = () => {},
    standalone: arg23 = false,
  } = {},
) {
  const value4 = arg18.container.ownerDocument,
    value5 = value4.defaultView,
    value6 = arg18.THREE,
    value7 = value4.createElement("section");
  ((value7.className = "plan2-range-editor"),
    (value7.dataset.testid = "range-editor"),
    (value7.hidden = true),
    value7.setAttribute("aria-label", "平面光区编辑"),
    (value7.innerHTML =
      '\n    <svg aria-label="灯具与照射范围" role="group"></svg>\n    <header class="p2r-top"><div class="p2r-title">平面光区编辑<small>拖动边角调整范围，按住 Shift 等比例缩放</small></div><span class="p2r-compact-caption">自由拖动 · Shift 等比</span></header>\n    <div class="p2r-panel">\n      <h3>照射范围</h3>\n      <div class="p2r-view-switch" role="group" aria-label="编辑视图">\n        <button type="button" data-action="view-plan" aria-pressed="true">平面编辑</button>\n        <button type="button" data-action="view-3d" aria-pressed="false">3D 预览</button>\n      </div>\n      <div class="p2r-selectors">\n        <label class="p2r-field">楼层<select data-field="floor" aria-label="楼层"></select></label>\n        <label class="p2r-field">灯具<select data-field="fixture" aria-label="灯具"></select></label>\n      </div>\n      <div class="p2r-grid">\n        <label class="p2r-field p2r-shape">光区形状<select data-field="shape" aria-label="光区形状"><option value="circle">圆形</option><option value="square">方形</option></select></label>\n        <label class="p2r-field"><span data-width-label>宽度（米）</span><input data-field="width" aria-label="宽度（米）" type="number" min="0.5" max="20" step="0.1" inputmode="decimal"></label>\n        <label class="p2r-field"><span data-depth-label>深度（米）</span><input data-field="depth" aria-label="深度（米）" type="number" min="0.5" max="20" step="0.1" inputmode="decimal"></label>\n        <label class="p2r-field p2r-rotation">旋转（度）<input data-field="rotation" aria-label="旋转（度）" type="number" min="-180" max="180" step="1" inputmode="decimal"></label>\n        <label class="p2r-field p2r-soft-field">边缘柔和度<span class="p2r-softness"><input data-field="softness" aria-label="边缘柔和度" type="range" min="5" max="100" step="1"><output data-soft-value>35%</output></span></label>\n      </div>\n      <h3>离地照明范围</h3>\n      <div class="p2r-grid">\n        <label class="p2r-field">最低照到（米）<input data-field="heightMin" aria-label="最低照到（米）" type="number" min="0" max="20" step="0.05" placeholder="自动" inputmode="decimal"></label>\n        <label class="p2r-field">最高照到（米）<input data-field="heightMax" aria-label="最高照到（米）" type="number" min="0" max="20" step="0.05" placeholder="自动" inputmode="decimal"></label>\n      </div>\n      <p class="p2r-status" data-height-summary></p>\n      <p class="p2r-status">从本层地面算起，0 米是地面；留空自动。切到“3D 预览”可边调高度边看效果。</p>\n      <div class="p2r-options">\n        <label class="p2r-check i3d-setting-toggle"><input data-field="moveCenter" type="checkbox">允许移动范围中心</label>\n        <label class="p2r-check i3d-setting-toggle"><input data-field="group" type="checkbox">同步本组范围</label>\n        <label class="p2r-check i3d-setting-toggle"><input data-field="preview" type="checkbox"><span data-preview-label>仅预览当前灯</span></label>\n      </div>\n      <div class="p2r-actions"><button type="button" data-action="reset-center">中心回到灯位</button><button type="button" data-action="reset">恢复模型默认</button><button type="button" class="p2r-done" data-action="close">完成</button></div>\n      <p class="p2r-status" role="status" aria-live="polite"></p>\n    </div>\n    <div class="p2r-help">外边界为光照衰减到零的位置 · 范围不代表墙体挡光</div>'),
    (value7.querySelector("[data-action=close]").hidden = arg23),
    arg18.container.append(value7));
  const value8 = value7.querySelector("svg"),
    value9 = value7.querySelector(".p2r-panel"),
    value10 = Object.fromEntries(
      [...value7.querySelectorAll("[data-field]")].map((arg24) => [arg24.dataset.field, arg24]),
    ),
    value11 = value7.querySelector(".p2r-status[role=status]"),
    value12 = value7.querySelector("[data-soft-value]"),
    value13 = mountRangeFormControls(value7),
    value14 = new value6.Raycaster(),
    value15 = new value6.Vector2(),
    value16 = new value6.Plane(new value6.Vector3(0, 1, 0), 0);
  let value17 = false,
    value18 = false,
    object2 = {},
    list1 = [],
    text1 = "",
    text2 = "",
    text3 = "",
    value19 = null,
    text4 = "",
    value20 = true,
    value21 = null,
    value22 = false,
    value23 = null,
    value24 = null,
    value25 = null,
    value26 = 0,
    value27 = false,
    value28 = false,
    value29 = null,
    value30 = 0,
    value31 = 0;
  const fn1 = () => arg18.regionLighting,
    fn2 = () => list1.find((arg25) => arg25.key === text1),
    fn3 = (arg26) =>
      (arg18.document?.floors || []).find((arg27) => String(arg27.id) === String(arg26)),
    fn4 = (arg28) =>
      arg28
        ? list1.filter(
            (arg29) =>
              String(arg29.floorId) === String(arg28.floorId) &&
              (arg28.groupId ? arg29.groupId === arg28.groupId : arg29.key === arg28.key),
          )
        : [],
    fn5 = () =>
      value10.group.checked ? fn4(fn2()).map((arg30) => arg30.key) : fn2() ? [text1] : [];
  function fn6() {
    list1 = (fn1()?.listRegions?.() || []).map((arg31) => {
      const value34 = fn3(arg31.floorId),
        value35 = value34?.scene?.items?.find((arg32) => String(arg32.id) === String(arg31.id)),
        value36 = value35?.lightGroupId || "",
        value37 = (arg19()?.lights || []).find(
          (arg33) => String(arg33.floorId) === String(arg31.floorId) && arg33.groupId === value36,
        ),
        value38 = value34?.scene?.lightGroups?.find((arg34) => arg34.id === value36);
      return {
        ...arg31,
        key: arg31.key || tt(arg31.floorId, arg31.id),
        groupId: value36,
        label: value37?.label || value38?.name || value35?.name || "灯具",
      };
    });
    for (const value39 of list1) {
      const value40 = fn4(value39);
      value39.fixtureLabel =
        "" +
        value39.label +
        (value40.length > 1
          ? " · " +
            (value40.findIndex((arg35) => arg35.key === value39.key) + 1) +
            "/" +
            value40.length
          : "");
    }
    const value33 = list1.filter((arg36) => String(arg36.floorId) === text2);
    value33.some((arg37) => arg37.key === text1) || (text1 = value33[0]?.key || "");
  }
  function fn7(arg38, arg39) {
    const value41 = value4.createElement("option");
    return ((value41.value = arg38), (value41.textContent = arg39), value41);
  }
  function fn8() {
    (value10.floor.replaceChildren(
      ...(arg18.document?.floors || []).map((arg40) => fn7(String(arg40.id), arg40.name || "楼层")),
    ),
      (value10.floor.value = text2),
      value10.fixture.replaceChildren(
        ...list1
          .filter((arg41) => String(arg41.floorId) === text2)
          .map((arg42) => fn7(arg42.key, arg42.fixtureLabel)),
      ),
      (value10.fixture.value = text1));
    const value42 = fn2(),
      value43 = !!value42,
      value44 = fn4(value42);
    for (const value45 of [
      "fixture",
      "shape",
      "width",
      "depth",
      "rotation",
      "softness",
      "preview",
      "moveCenter",
      "heightMin",
      "heightMax",
    ])
      value10[value45].disabled = !value43;
    if (
      ((value10.group.disabled = value44.length < 2),
      (value7.querySelector("[data-preview-label]").textContent =
        value10.group.checked && value44.length > 1 ? "仅预览当前灯组" : "仅预览当前灯"),
      (value7.querySelector("[data-action=reset]").disabled = !value43),
      (value7.querySelector("[data-action=reset-center]").hidden =
        !value42 || (!value42.offsetX && !value42.offsetZ)),
      (value10.moveCenter.checked = value42?.moveCenterEnabled === true),
      value42)
    ) {
      value10.shape.value = ["square", "strip"].includes(value42.shape) ? "square" : "circle";
      for (const value46 of ["width", "depth", "rotation"])
        value4.activeElement !== value10[value46] && (value10[value46].value = N(value42[value46]));
      for (const value47 of ["heightMin", "heightMax"])
        value4.activeElement !== value10[value47] &&
          (value10[value47].value = value42[value47] === undefined ? "" : N(value42[value47]));
      const fn38 = (arg43) =>
        arg43 === undefined ? "自动" : arg43 <= 0 ? "地面" : N(arg43) + " 米";
      ((value7.querySelector("[data-height-summary]").textContent =
        "灯具离地 " +
        N(value42.lampHeight || 0) +
        " 米 · 照明：" +
        fn38(value42.heightMin) +
        " ～ " +
        fn38(value42.heightMax)),
        (value10.softness.value = Math.round(value42.softness * 100)),
        (value12.value = value10.softness.value + "%"),
        (value11.textContent =
          value10.group.checked && value44.length > 1
            ? "本组 " + value44.length + " 盏 · 修改会同步到各自灯位"
            : value44.length > 1
              ? "本组 " + value44.length + " 盏 · 当前只调整这一盏"
              : value22
                ? "旋转或缩放查看效果 · 修改高度实时预览"
                : value42.moveCenterEnabled
                  ? "拖动光区或中心十字移动范围 · 灯位不变"
                  : "范围中心已锁定 · 可拖动边角调整大小"));
    } else value11.textContent = "当前楼层暂无可编辑灯具，请切换楼层。";
    (text3
      ? ((value11.textContent = "本次保存未成功：" + text3 + "。当前预览仍保留。"),
        (value11.style.color = "#ffc28d"))
      : value11.style.removeProperty("color"),
      value13.sync());
  }
  function fn9() {
    const value48 = value10.preview.checked ? fn5() : null;
    (fn1()?.setPreview?.(value48), arg18.invalidateRegionLighting?.(), arg22());
  }
  function fn10(arg44, arg45 = false) {
    if (fn2()) {
      for (const value49 of fn5()) {
        const value50 = list1.find((arg46) => arg46.key === value49),
          value51 = arg44.heightEdit
            ? regionHeightPatch(value50, arg44.heightEdit.field, arg44.heightEdit.value)
            : arg44,
          object3 = {
            width: value50.width,
            depth: value50.depth,
            rotation: value50.rotation,
            softness: value50.softness,
            shape: value50.shape,
            offsetX: value50.offsetX || 0,
            offsetZ: value50.offsetZ || 0,
            moveCenterEnabled: value50.moveCenterEnabled === true,
            ...(object2[value49] || {}),
            ...value51,
          };
        arg44.shape &&
          (object3.shape = ["square", "strip"].includes(object3.shape) ? "square" : "circle");
        for (const value52 of ["heightAbove", "heightBelow", "heightMin", "heightMax"])
          object3[value52] === undefined && delete object3[value52];
        object2[value49] = object3;
      }
      (fn1()?.setOverrides?.(object2),
        arg18.invalidateRegionLighting?.(),
        arg22(),
        fn6(),
        fn8(),
        fn17(),
        arg45 && fn11());
    }
  }
  function fn11() {
    ((object2 = X(fn1()?.getOverrides?.() || object2)), arg20(X(object2)));
  }
  function fn12(arg47, arg48, arg49) {
    const value53 = arg18.canvas.getBoundingClientRect(),
      value54 = value7.getBoundingClientRect(),
      value55 = new value6.Vector3(arg47, arg48, arg49).project(arg18.camera);
    return [
      value53.left - value54.left + ((value55.x + 1) * value53.width) / 2,
      value53.top - value54.top + ((1 - value55.y) * value53.height) / 2,
    ];
  }
  function fn13() {
    return J(arg18.worldPoint?.(text2, 0, 0, 0.065)?.y, 0.065);
  }
  function fn14(arg50, arg51, arg52, arg53) {
    const [value56, value57] = arg50.axis;
    return fn12(
      arg50.center[0] + arg51 * value56 - arg52 * value57,
      arg53,
      arg50.center[2] + arg51 * value57 + arg52 * value56,
    );
  }
  function fn15(arg54, arg55, arg56 = value8) {
    const value58 = value4.createElementNS(et, arg54);
    for (const [value59, value60] of Object.entries(arg55 || {}))
      value58.setAttribute(value59, String(value60));
    return (arg56.append(value58), value58);
  }
  function fn16(arg57, arg58, arg59 = 1) {
    const value61 = (arg57.width * arg59) / 2,
      value62 = (arg57.depth * arg59) / 2,
      list2 = [];
    if (arg57.shape === "square")
      return (
        [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ]
          .map(([arg60, arg61], arg62) => {
            const value63 = fn14(arg57, arg60 * value61, arg61 * value62, arg58);
            return "" + (arg62 ? "L" : "M") + value63[0].toFixed(2) + "," + value63[1].toFixed(2);
          })
          .join("") + "Z"
      );
    for (let value64 = 0; value64 < 64; value64 += 1) {
      const value65 = (value64 * Math.PI * 2) / 64,
        value66 = Math.cos(value65),
        value67 = Math.sin(value65),
        value68 = Math.min(value61, value62),
        value69 =
          arg57.shape === "strip"
            ? Math.sign(value66) * (value61 - value68) + value66 * value68
            : value66 * value61,
        value70 =
          arg57.shape === "strip"
            ? Math.sign(value67) * (value62 - value68) + value67 * value68
            : value67 * value62;
      list2.push(fn14(arg57, value69, value70, arg58));
    }
    return (
      list2
        .map(
          (arg63, arg64) =>
            "" + (arg64 ? "L" : "M") + arg63[0].toFixed(2) + "," + arg63[1].toFixed(2),
        )
        .join("") + "Z"
    );
  }
  function fn17() {
    if (!value17 || !arg18.camera || value22) return;
    arg18.camera.updateMatrixWorld();
    const value71 = value7.getBoundingClientRect(),
      value72 = fn13();
    (value8.setAttribute("viewBox", "0 0 " + (value71.width || 1) + " " + (value71.height || 1)),
      value8.replaceChildren());
    const value73 = fn15("g"),
      value74 = fn15("g"),
      value75 = fn2(),
      set1 = new Set(fn4(value75).map((arg65) => arg65.key)),
      value76 = list1
        .filter((arg66) => String(arg66.floorId) === text2)
        .sort((arg67, arg68) => +(arg67.key === text1) - +(arg68.key === text1));
    for (const value86 of value76) {
      const value87 = value86.key === text1,
        value88 = set1.has(value86.key);
      ((value87 || value88) &&
        fn15(
          "path",
          {
            ...(value87 && value86.moveCenterEnabled
              ? {
                  "data-range-handle": "move",
                  cursor: "move",
                }
              : {}),
            d: fn16(value86, value72),
            fill: value87 ? "#edb06012" : "none",
            stroke: value87 ? "#f2b768" : "#99afc0",
            "stroke-width": value87 ? 1.6 : 1,
            "stroke-dasharray": value87 ? "none" : "4 4",
            opacity: value87 ? 1 : 0.45,
          },
          value73,
        ),
        value87 &&
          fn15(
            "path",
            {
              d: fn16(value86, value72, Math.max(0.05, 1 - value86.softness)),
              fill: "none",
              stroke: "#efb56f",
              "stroke-width": 1,
              "stroke-dasharray": "3 5",
              opacity: 0.42,
            },
            value73,
          ));
      const value89 = value86.lampCenter || value86.center,
        [value90, value91] = fn12(value89[0], value72, value89[2]),
        value92 = fn15(
          "g",
          {
            "data-region-key": value86.key,
            role: "button",
            tabindex: "0",
            "aria-label": "选择" + value86.fixtureLabel,
          },
          value74,
        );
      (fn15(
        "circle",
        {
          cx: value90,
          cy: value91,
          r: 12,
          fill: "transparent",
        },
        value92,
      ),
        fn15(
          "circle",
          {
            cx: value90,
            cy: value91,
            r: value87 ? 5 : 3.8,
            fill: value87 ? "#ffd498" : "#e9f0f5",
            stroke: value87 ? "#a87029" : "#536777",
            "stroke-width": 1.7,
            class: "p2r-marker",
          },
          value92,
        ));
      const value93 = fn15("title", {}, value92);
      value93.textContent = value86.fixtureLabel;
    }
    if (!value75) return;
    const value77 = fn14(value75, 0, 0, value72),
      value78 = value75.lampCenter || value75.center,
      value79 = fn12(value78[0], value72, value78[2]);
    if (
      ((value75.offsetX || value75.offsetZ) &&
        fn15("line", {
          x1: value79[0],
          y1: value79[1],
          x2: value77[0],
          y2: value77[1],
          stroke: "#e8b76e",
          "stroke-width": 1,
          "stroke-dasharray": "4 4",
          "pointer-events": "none",
        }),
      value75.moveCenterEnabled)
    ) {
      const [value94, value95] = value77,
        value96 = fn15("g", {
          "data-range-handle": "move",
          role: "button",
          tabindex: "0",
          "aria-label": "拖动光区中心",
          cursor: "move",
        });
      (fn15(
        "circle",
        {
          cx: value94,
          cy: value95,
          r: 14,
          fill: "#edb06033",
          stroke: "#f2b768",
        },
        value96,
      ),
        fn15(
          "path",
          {
            d:
              "M" +
              (value94 - 8) +
              "," +
              value95 +
              "H" +
              (value94 + 8) +
              "M" +
              value94 +
              "," +
              (value95 - 8) +
              "V" +
              (value95 + 8),
            stroke: "#ffe0ad",
            "stroke-width": 2,
            fill: "none",
          },
          value96,
        ));
    }
    const list3 = [
      ["nw", -1, -1],
      ["ne", 1, -1],
      ["se", 1, 1],
      ["sw", -1, 1],
    ];
    list3.push(["w", -1, 0], ["e", 1, 0], ["n", 0, -1], ["s", 0, 1]);
    for (const [value97, value98, value99] of list3) {
      const [value100, value101] = fn14(
          value75,
          (value98 * value75.width) / 2,
          (value99 * value75.depth) / 2,
          value72,
        ),
        value102 = fn15("g", {
          "data-range-handle": value97,
          role: "button",
          tabindex: "0",
          "aria-label":
            "拖动" +
            {
              nw: "左上角",
              ne: "右上角",
              se: "右下角",
              sw: "左下角",
              w: "左边调整宽度",
              e: "右边调整宽度",
              n: "上边调整深度",
              s: "下边调整深度",
            }[value97],
        });
      (fn15(
        "circle",
        {
          cx: value100,
          cy: value101,
          r: 13,
          fill: "transparent",
        },
        value102,
      ),
        fn15(
          "rect",
          {
            x: value100 - 4.5,
            y: value101 - 4.5,
            width: 9,
            height: 9,
            rx: 2,
            fill: "#ffe0ad",
            stroke: "#9f6e33",
            "stroke-width": 1.2,
            class: "p2r-handle",
          },
          value102,
        ));
    }
    const value80 = fn14(value75, 0, 0, value72),
      value81 = fn14(value75, 0, -value75.depth / 2, value72),
      value82 = value81[0] - value80[0],
      value83 = value81[1] - value80[1],
      value84 = Math.max(1, Math.hypot(value82, value83)),
      list4 = [value81[0] + (value82 / value84) * 27, value81[1] + (value83 / value84) * 27];
    fn15("line", {
      x1: value81[0],
      y1: value81[1],
      x2: list4[0],
      y2: list4[1],
      stroke: "#eabc7b",
      "stroke-width": 1.2,
    });
    const value85 = fn15("g", {
      "data-range-handle": "rotate",
      role: "button",
      tabindex: "0",
      "aria-label": "拖动旋转照射范围",
    });
    (fn15(
      "circle",
      {
        cx: list4[0],
        cy: list4[1],
        r: 14,
        fill: "transparent",
      },
      value85,
    ),
      fn15(
        "circle",
        {
          cx: list4[0],
          cy: list4[1],
          r: 5,
          fill: "#f3c581",
          stroke: "#956527",
          "stroke-width": 1.2,
          class: "p2r-handle",
        },
        value85,
      ));
  }
  function fn18(arg69) {
    const value103 = arg18.canvas.getBoundingClientRect();
    return !value103.width || !value103.height
      ? null
      : (value15.set(
          ((arg69.clientX - value103.left) / value103.width) * 2 - 1,
          1 - ((arg69.clientY - value103.top) / value103.height) * 2,
        ),
        value14.setFromCamera(value15, arg18.camera),
        (value16.constant = -fn13()),
        value14.ray.intersectPlane(value16, new value6.Vector3()));
  }
  function fn19(arg70) {
    if (arg70.button !== 0 || !value17 || value22) return;
    const value104 = arg70.target.closest?.("[data-range-handle]");
    if (value104 && fn2()) {
      if (value104.dataset.rangeHandle === "move" && !fn2().moveCenterEnabled) return;
      (arg70.preventDefault(), arg70.stopPropagation(), value104.focus?.());
      const value105 = fn2(),
        value106 = fn18(arg70);
      if (!value106) return;
      ((value25 = {
        pointerId: arg70.pointerId,
        handle: value104.dataset.rangeHandle,
        region: X(value105),
        point: value106,
        initial: X(object2),
        changed: false,
      }),
        value8.setPointerCapture(arg70.pointerId));
    } else {
      const value107 = arg70.target.closest?.("[data-region-key]");
      value107 && (arg70.preventDefault(), fn22(value107.dataset.regionKey));
    }
  }
  function fn20(arg71) {
    if (!value25 || arg71.pointerId !== value25.pointerId) return;
    const value108 = fn18(arg71);
    if (!value108) return;
    arg71.preventDefault();
    const value109 = value25.region,
      [value110, value111] = value109.axis,
      value112 = value108.x - value109.center[0],
      value113 = value108.z - value109.center[2];
    if (value25.handle === "move")
      fn10({
        offsetX: N(O((value109.offsetX || 0) + value108.x - value25.point.x, -100, 100)),
        offsetZ: N(O((value109.offsetZ || 0) + value108.z - value25.point.z, -100, 100)),
      });
    else {
      if (value25.handle === "rotate") {
        const value114 = Math.atan2(
            value25.point.z - value109.center[2],
            value25.point.x - value109.center[0],
          ),
          value115 = Math.atan2(value113, value112) - value114;
        let value116 = value109.rotation + (value115 * 180) / Math.PI;
        ((value116 = ((((value116 + 180) % 360) + 360) % 360) - 180),
          arg71.shiftKey && (value116 = Math.round(value116 / 15) * 15),
          fn10({
            rotation: N(value116),
          }));
      } else {
        const value117 = 2 * Math.abs(value112 * value110 + value113 * value111),
          value118 = 2 * Math.abs(-value112 * value111 + value113 * value110);
        fn10(resizeRegionDimensions(value109, value117, value118, value25.handle, arg71.shiftKey));
      }
    }
    value25.changed = true;
  }
  function fn21(arg72, arg73 = false) {
    if (!value25 || (arg72 && arg72.pointerId !== value25.pointerId)) return;
    const value119 = value25;
    ((value25 = null),
      value8.hasPointerCapture(value119.pointerId) &&
        value8.releasePointerCapture(value119.pointerId),
      arg73
        ? ((object2 = value119.initial),
          fn1()?.setOverrides?.(object2),
          arg18.invalidateRegionLighting?.(),
          fn6(),
          fn8(),
          fn17())
        : value119.changed && fn11());
  }
  function fn22(arg74) {
    (value25 && fn21(null), (text1 = arg74), fn8(), fn9(), fn17());
  }
  function fn23() {
    arg18.controls && (arg18.controls.enabled = false);
  }
  function fn24() {
    (arg18.setCameraInteraction?.({
      enabled: value17 && value22,
      rotationMode: "free",
      panEnabled: value22,
      zoomEnabled: value22,
    }),
      value22 || fn23());
  }
  function fn25(arg75) {
    if (!value17 || value22 === arg75) return;
    (fn21(null),
      value22 ? (value23 = X(arg18.cameraState(true))) : (value24 = X(arg18.cameraState(true))),
      (value22 = arg75),
      (value8.style.display = value22 ? "none" : ""),
      value7
        .querySelector("[data-action=view-plan]")
        .setAttribute("aria-pressed", String(!value22)),
      value7.querySelector("[data-action=view-3d]").setAttribute("aria-pressed", String(value22)),
      (value7.querySelector(".p2r-title").textContent = value22
        ? "3D 高度预览 · 拖动旋转，滚轮缩放"
        : "俯视范围编辑 · 拖动边角调整"),
      (value7.querySelector(".p2r-compact-caption").textContent = value22
        ? "拖动旋转 · 双指缩放"
        : "自由拖动 · Shift 等比"));
    const value120 = value22 ? value23 : value24;
    (value120 ? arg18.restoreCamera(value120) : fn27(),
      fn24(),
      fn8(),
      fn17(),
      arg18.invalidateRegionLighting?.(),
      arg22());
  }
  function fn26(arg76, arg77) {
    const value121 = fn3(text2)?.scene,
      list5 = [],
      fn39 = (arg78, arg79, arg80 = 0) => {
        if (!Number.isFinite(Number(arg78)) || !Number.isFinite(Number(arg79))) return;
        const value126 = arg18.worldPoint?.(text2, Number(arg78), Number(arg79), 0.065);
        value126 &&
          list5.push({
            point: value126,
            radius: arg80,
          });
      };
    for (const value127 of value121?.walls || []) {
      const value128 = Math.max(0, J(value127.thickness, 0.12)) / 2;
      (fn39(value127.start?.x, value127.start?.y, value128),
        fn39(value127.end?.x, value127.end?.y, value128));
    }
    if (!list5.length)
      for (const value129 of value121?.items || []) {
        const value130 = arg18.worldPoint?.(text2, value129.x, value129.y, 0.065);
        if (!value130) continue;
        const value131 = (J(value129.rotation) * Math.PI) / 180,
          value132 = Math.cos(value131),
          value133 = Math.sin(value131);
        for (const value134 of [-1, 1])
          for (const value135 of [-1, 1]) {
            const value136 = (value134 * Math.max(0.1, J(value129.width, 0.5))) / 2,
              value137 = (value135 * Math.max(0.1, J(value129.depth, 0.5))) / 2;
            list5.push({
              point: new value6.Vector3(
                value130.x + value136 * value132 - value137 * value133,
                value130.y,
                value130.z + value136 * value133 + value137 * value132,
              ),
              radius: 0,
            });
          }
      }
    if (!list5.length) {
      for (const value138 of list1.filter((arg81) => String(arg81.floorId) === text2))
        list5.push({
          point: new value6.Vector3().fromArray(value138.center),
          radius: 0.5,
        });
    }
    list5.length ||
      list5.push({
        point: new value6.Vector3(0, 0, 0),
        radius: 2.5,
      });
    let value122 = Infinity,
      value123 = -Infinity,
      value124 = Infinity,
      value125 = -Infinity;
    for (const { point: value139, radius: value140 } of list5) {
      const value141 = value139.dot(arg76),
        value142 = value139.dot(arg77);
      ((value122 = Math.min(value122, value141 - value140)),
        (value123 = Math.max(value123, value141 + value140)),
        (value124 = Math.min(value124, value142 - value140)),
        (value125 = Math.max(value125, value142 + value140)));
    }
    return {
      left: value122,
      right: value123,
      bottom: value124,
      top: value125,
    };
  }
  function fn27() {
    if (!value17 || !value21 || value28) return;
    const value143 = value7.getBoundingClientRect(),
      value144 = value9.getBoundingClientRect();
    if (!(value143.width < 2 || value143.height < 2)) {
      value28 = true;
      try {
        const value145 =
            value143.width <= 620
              ? {
                  x: 14,
                  y: 52,
                  width: value143.width - 28,
                  height: Math.max(70, value144.top - value143.top - 62),
                }
              : {
                  x: 18,
                  y: 68,
                  width: Math.max(70, value144.left - value143.left - 35),
                  height: Math.max(70, value143.height - 115),
                },
          value146 = X(value21);
        let value147 = new value6.Vector3().fromArray(value21.up || [0, 0, -1]).normalize();
        const value148 = new value6.Vector3()
          .fromArray(value21.target)
          .sub(new value6.Vector3().fromArray(value21.position))
          .normalize();
        value22 && (value148.set(-1, -1.1, -1).normalize(), value147.set(0, 1, 0));
        const value149 = new value6.Vector3().crossVectors(value148, value147).normalize();
        value22 && value147.crossVectors(value149, value148).normalize();
        const value150 = fn26(value149, value147),
          value151 = Math.max(1, value150.right - value150.left),
          value152 = Math.max(1, value150.top - value150.bottom) + (value22 ? 3 : 0),
          value153 =
            Math.max((value151 + 0.4) / value145.width, (value152 + 0.4) / value145.height) * 1.08,
          value154 = value145.x + value145.width / 2 - value143.width / 2,
          value155 = value145.y + value145.height / 2 - value143.height / 2,
          value156 = value149
            .clone()
            .multiplyScalar((value150.left + value150.right) / 2)
            .add(value147.clone().multiplyScalar((value150.bottom + value150.top) / 2));
        if (value22) {
          const value157 = fn26(new value6.Vector3(1, 0, 0), new value6.Vector3(0, 0, 1));
          value156.set(
            (value157.left + value157.right) / 2,
            0,
            (value157.bottom + value157.top) / 2,
          );
        }
        ((value156.y = fn13() + 0.6),
          value156
            .addScaledVector(value149, -value154 * value153)
            .addScaledVector(value147, value155 * value153),
          (value146.target = value156.toArray()),
          value22 && ((value146.up = [0, 1, 0]), (value146.view = "free")),
          (value146.position = value156
            .clone()
            .addScaledVector(value148, -Math.max(20, value151 * 2, value152 * 2))
            .toArray()),
          (value146.frameSize = value153 * Math.min(value143.width, value143.height)),
          (value146.zoom = 1),
          arg18.restoreCamera(value146),
          fn24(),
          arg18.invalidateRegionLighting?.(),
          arg22(),
          (value30 = value143.width),
          (value31 = value143.height),
          fn17());
      } finally {
        value28 = false;
      }
    }
  }
  function fn28({ fit: arg82 = false } = {}) {
    value17 &&
      ((value27 ||= arg82),
      value26 && value5.cancelAnimationFrame(value26),
      (value26 = value5.requestAnimationFrame(() => {
        value26 = 0;
        const value158 = value27;
        ((value27 = false), value17 && (fn6(), fn8(), value158 && !value22 ? fn27() : fn17()));
      })));
  }
  function fn29(arg83) {
    value25 && fn21(null);
    const value159 = value22;
    (value159 && fn25(false),
      (text2 = String(arg83)),
      (text1 = ""),
      (value24 = null),
      (value23 = null),
      arg18.setFloor(text2),
      arg18.setCameraProjection("orthographic"),
      arg18.topView(),
      (value21 = X(arg18.cameraState(true))),
      fn23(),
      arg18.invalidateRegionLighting?.(),
      fn6(),
      fn8(),
      fn9(),
      value159
        ? (fn27(), fn25(true))
        : fn28({
            fit: true,
          }));
  }
  function fn30(arg84) {
    const value160 = arg84.target,
      value161 = value160.dataset.field;
    if (value161 === "floor") return fn29(value160.value);
    if (value161 === "fixture") return fn22(value160.value);
    if (value161 === "group" || value161 === "preview") {
      (fn8(), fn9(), fn17());
      return;
    }
    if (value161 === "moveCenter")
      return fn10(
        {
          moveCenterEnabled: value160.checked,
        },
        true,
      );
    if (value161 === "shape")
      return fn10(
        {
          shape: value160.value,
        },
        true,
      );
    if (value161 === "softness")
      return fn10(
        {
          softness: O(J(value160.value, 35) / 100, 0.05, 1),
        },
        true,
      );
    if (["heightMin", "heightMax"].includes(value161)) {
      const value162 = value160.value.trim() === "" ? undefined : N(O(J(value160.value), 0, 20));
      return (
        (value160.value = value162 ?? ""),
        fn10(
          {
            heightEdit: {
              field: value161,
              value: value162,
            },
          },
          true,
        )
      );
    }
    if (["width", "depth", "rotation"].includes(value161)) {
      const value163 = fn2()?.[value161],
        value164 = value160.value.trim() === "" ? value163 : J(value160.value, value163);
      ((value160.value = N(
        O(value164, value161 === "rotation" ? -180 : 0.5, value161 === "rotation" ? 180 : 20),
      )),
        fn10(
          {
            [value161]: Number(value160.value),
          },
          true,
        ));
    }
  }
  function fn31(arg85) {
    if (!value17 || arg85.defaultPrevented) return;
    if (arg85.key === "Escape") {
      (arg85.preventDefault(), arg85.stopPropagation(), fn34());
      return;
    }
    const value165 = arg85.target.closest?.("[data-region-key]");
    value165 &&
      ["Enter", " "].includes(arg85.key) &&
      (arg85.preventDefault(), fn22(value165.dataset.regionKey));
    const value166 = arg85.target.closest?.("[data-range-handle]");
    if (
      !value166 ||
      !fn2() ||
      !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(arg85.key)
    )
      return;
    arg85.preventDefault();
    const value167 = ["ArrowUp", "ArrowRight"].includes(arg85.key) ? 1 : -1;
    if (value166.dataset.rangeHandle === "move") {
      if (!fn2().moveCenterEnabled) return;
      const value168 = ["ArrowLeft", "ArrowRight"].includes(arg85.key) ? "offsetX" : "offsetZ",
        value169 = ["ArrowRight", "ArrowDown"].includes(arg85.key) ? 1 : -1;
      fn10(
        {
          [value168]: N(
            O((fn2()[value168] || 0) + value169 * (arg85.shiftKey ? 0.5 : 0.1), -100, 100),
          ),
        },
        true,
      );
    } else {
      if (value166.dataset.rangeHandle === "rotate")
        fn10(
          {
            rotation: O(fn2().rotation + value167 * (arg85.shiftKey ? 15 : 1), -180, 180),
          },
          true,
        );
      else {
        const value170 = value166.dataset.rangeHandle,
          value171 = ["w", "e"].includes(value170)
            ? "width"
            : ["n", "s"].includes(value170)
              ? "depth"
              : ["ArrowLeft", "ArrowRight"].includes(arg85.key)
                ? "width"
                : "depth",
          value172 = fn2(),
          object4 = {
            width: value172.width,
            depth: value172.depth,
            [value171]: value172[value171] + value167 * 0.1,
          };
        fn10(
          resizeRegionDimensions(
            value172,
            object4.width,
            object4.depth,
            value171 === "width" ? "e" : "s",
            arg85.shiftKey,
          ),
          true,
        );
      }
    }
  }
  function fn32(arg86) {
    const value173 = arg86.target.closest?.("[data-action]")?.dataset.action;
    if (
      (value173 === "view-plan" && fn25(false),
      value173 === "view-3d" && fn25(true),
      value173 === "close" && fn34(),
      value173 === "reset-center" &&
        fn10(
          {
            offsetX: 0,
            offsetZ: 0,
          },
          true,
        ),
      value173 === "reset")
    ) {
      for (const value174 of fn5()) delete object2[value174];
      (fn1()?.setOverrides?.(object2),
        arg18.invalidateRegionLighting?.(),
        arg22(),
        fn6(),
        fn8(),
        fn17(),
        fn11());
    }
  }
  (value7.addEventListener("change", fn30),
    value7.addEventListener("input", (arg87) => {
      if (
        ["heightMin", "heightMax"].includes(arg87.target.dataset.field) &&
        arg87.target.validity.valid
      ) {
        const value175 =
          arg87.target.value.trim() === "" ? undefined : O(Number(arg87.target.value), 0, 20);
        fn10({
          heightEdit: {
            field: arg87.target.dataset.field,
            value: value175,
          },
        });
      }
      arg87.target === value10.softness &&
        fn10({
          softness: O(J(value10.softness.value, 35) / 100, 0.05, 1),
        });
    }),
    value7.addEventListener("click", fn32),
    value8.addEventListener("pointerdown", fn19),
    value8.addEventListener("pointermove", fn20),
    value8.addEventListener("pointerup", (arg88) => fn21(arg88)),
    value8.addEventListener("pointercancel", (arg89) => fn21(arg89, true)),
    value8.addEventListener("lostpointercapture", (arg90) => fn21(arg90)));
  const value32 = new value5.ResizeObserver(() => {
    if (!value17 || value28) return;
    const value176 = value7.getBoundingClientRect();
    Math.abs(value176.width - value30) > 1 || Math.abs(value176.height - value31) > 1
      ? fn28({
          fit: true,
        })
      : fn28();
  });
  value32.observe(arg18.container);
  function fn33() {
    if (!(value17 || value18)) {
      if (!fn1()?.listRegions) throw new Error("区域灯光尚未准备好，请稍后重试。");
      ((text4 = String(
        arg19()?.floorSelection ||
          arg18.document?.activeFloorId ||
          arg18.document?.floors?.[0]?.id ||
          "",
      )),
        (value22 = false),
        (value23 = null),
        (value24 = null),
        (value8.style.display = ""),
        (value7.querySelector(".p2r-title").textContent = "俯视范围编辑 · 拖动边角调整"),
        (value7.querySelector(".p2r-compact-caption").textContent = "自由拖动 · Shift 等比"),
        value7.querySelector("[data-action=view-plan]").setAttribute("aria-pressed", "true"),
        value7.querySelector("[data-action=view-3d]").setAttribute("aria-pressed", "false"),
        (value20 = arg18.controls?.enabled),
        (value19 = X(arg18.cameraState(true))),
        (value17 = true),
        (value7.hidden = false),
        (object2 = X(arg19()?.lightRegionOverrides || fn1()?.getOverrides?.() || {})),
        fn1().setOverrides(object2),
        (text2 =
          text4 === "all"
            ? String(arg18.document?.activeFloorId || arg18.document?.floors?.[0]?.id || "")
            : text4),
        arg18.setFloor(text2),
        arg18.setCameraProjection("orthographic"),
        arg18.topView(),
        (value21 = X(arg18.cameraState(true))),
        fn23(),
        value4.addEventListener("keydown", fn31, true),
        (value29 = arg18.onCameraChange?.(() => {
          !value28 && !value22 && fn28();
        })),
        arg18.invalidateRegionLighting?.(),
        fn6(),
        fn8(),
        fn9(),
        fn28({
          fit: true,
        }),
        value7.querySelector("[data-action=close]").focus({
          preventScroll: true,
        }));
    }
  }
  function fn34() {
    value17 &&
      (value13.close(),
      fn21(null),
      (value17 = false),
      (value7.hidden = true),
      value26 && (value5.cancelAnimationFrame(value26), (value26 = 0)),
      value29?.(),
      (value29 = null),
      value4.removeEventListener("keydown", fn31, true),
      fn1()?.setPreview?.(null),
      arg18.setFloor(text4),
      arg18.restoreCamera(value19),
      arg18.controls && (arg18.controls.enabled = value20 !== false),
      arg18.invalidateRegionLighting?.(),
      arg22(),
      (value21 = null),
      arg21());
  }
  function fn35() {
    value17 && fn28();
  }
  function fn36(arg91) {
    ((text3 = arg91 ? String(arg91.message || arg91) : ""), value17 && fn8());
  }
  function fn37() {
    value18 || (fn34(), (value18 = true), value13.dispose(), value32.disconnect(), value7.remove());
  }
  return {
    open: fn33,
    close: fn34,
    flush() {
      (value13.close(), fn21(null), fn11());
    },
    isOpen: () => value17,
    syncCameraInteraction: fn24,
    refresh: fn35,
    dispose: fn37,
    setSaveStatus: fn36,
  };
}
export function mountRangeFormControls(arg92) {
  const value177 = arg92.ownerDocument,
    value178 = value177.defaultView,
    list6 = [],
    list7 = [],
    list8 = [];
  let value179 = null,
    value180 = null;
  const fn40 = (arg93, arg94) => {
      const value181 = value177.createElement(arg93);
      return ((value181.className = arg94), value181);
    },
    fn41 = (arg95, arg96, arg97, arg98) => {
      (arg95.addEventListener(arg96, arg97, arg98),
        list8.push(() => arg95.removeEventListener(arg96, arg97, arg98)));
    };
  function fn42(arg99 = false) {
    if (!value179) return;
    const value182 = value179;
    ((value179 = null),
      (value182.menu.hidden = true),
      value182.button.setAttribute("aria-expanded", "false"),
      arg99 &&
        value182.button.focus({
          preventScroll: true,
        }));
  }
  function fn43() {
    if (!value179) return;
    const { button: value183, menu: value184 } = value179,
      value185 = value183.getBoundingClientRect(),
      value186 = Math.max(40, Math.min(320, value178.innerHeight - 16));
    Object.assign(value184.style, {
      width: value185.width + "px",
      maxHeight: value186 + "px",
      left: Math.max(8, Math.min(value178.innerWidth - value185.width - 8, value185.left)) + "px",
    });
    const value187 = Math.min(value184.scrollHeight, value186);
    value184.style.top =
      (value185.bottom + value187 + 12 <= value178.innerHeight
        ? value185.bottom + 4
        : Math.max(8, value185.top - value187 - 4)) + "px";
  }
  function fn44(arg100) {
    const { select: value188, button: value189, menu: value190 } = arg100;
    ((value189.textContent = value188.selectedOptions[0]?.textContent || "请选择"),
      (value189.disabled = value188.disabled),
      value189.setAttribute("aria-label", value188.getAttribute("aria-label") || "打开选择菜单"));
    const value191 = JSON.stringify(
      [...value188.options].map((arg101) => [
        arg101.value,
        arg101.textContent,
        arg101.disabled,
        arg101.hidden,
      ]),
    );
    value191 !== arg100.signature &&
      ((arg100.signature = value191),
      value190.replaceChildren(
        ...[...value188.options]
          .filter((arg102) => !arg102.hidden)
          .map((arg103) => {
            const value192 = fn40("button", "custom-select-option");
            return (
              (value192.type = "button"),
              (value192.dataset.value = arg103.value),
              value192.setAttribute("role", "option"),
              (value192.textContent = arg103.textContent),
              (value192.disabled = arg103.disabled),
              value192
            );
          }),
      ));
    for (const value193 of value190.children)
      (value193.classList.toggle("active", value193.dataset.value === value188.value),
        value193.setAttribute("aria-selected", String(value193.dataset.value === value188.value)));
    value188.disabled && value179 === arg100 && fn42();
  }
  function fn45(arg104, arg105 = false) {
    (fn42(),
      fn44(arg104),
      !arg104.select.disabled &&
        ((value179 = arg104),
        (arg104.menu.hidden = false),
        arg104.button.setAttribute("aria-expanded", "true"),
        fn43(),
        arg105 &&
          (
            arg104.menu.querySelector(".active:not(:disabled)") ||
            arg104.menu.querySelector("button:not(:disabled)")
          )?.focus({
            preventScroll: true,
          })));
  }
  function fn46(arg106, arg107) {
    if (!arg107 || arg107.disabled || arg106.select.disabled) return;
    const value194 = arg106.select.value;
    ((arg106.select.value = arg107.dataset.value),
      fn42(true),
      value194 !== arg106.select.value &&
        arg106.select.dispatchEvent(
          new value178.Event("change", {
            bubbles: true,
          }),
        ),
      fn44(arg106));
  }
  for (const value195 of arg92.querySelectorAll("select")) {
    const value196 = fn40("span", "custom-select"),
      value197 = fn40("button", "custom-select-button"),
      value198 = fn40("div", "custom-select-menu");
    (value195.before(value196),
      value196.append(value195, value197),
      arg92.append(value198),
      value195.classList.add("native-select-control"),
      (value195.tabIndex = -1),
      value195.setAttribute("aria-hidden", "true"),
      (value197.type = "button"),
      value197.setAttribute("aria-haspopup", "listbox"),
      value197.setAttribute("aria-expanded", "false"),
      (value198.id = "range-select-" + value195.dataset.field + "-menu"),
      value198.setAttribute("role", "listbox"),
      (value198.hidden = true),
      value197.setAttribute("aria-controls", value198.id),
      value198.setAttribute("aria-label", value195.getAttribute("aria-label") || "选项"));
    const object5 = {
      select: value195,
      wrapper: value196,
      button: value197,
      menu: value198,
    };
    (list6.push(object5),
      fn44(object5),
      fn41(value197, "click", (arg108) => {
        (arg108.preventDefault(), value179 === object5 ? fn42() : fn45(object5));
      }),
      fn41(value198, "click", (arg109) => {
        (arg109.preventDefault(), fn46(object5, arg109.target.closest(".custom-select-option")));
      }),
      fn41(value195, "change", () => fn44(object5)));
  }
  function fn47(arg110, arg111) {
    if (arg110.disabled || arg110.readOnly) return false;
    const value199 = arg110.value;
    try {
      arg111 > 0 ? arg110.stepUp() : arg110.stepDown();
    } catch {
      return false;
    }
    return value199 === arg110.value
      ? false
      : (arg110.dispatchEvent(
          new value178.Event("input", {
            bubbles: true,
          }),
        ),
        arg110.dispatchEvent(
          new value178.Event("change", {
            bubbles: true,
          }),
        ),
        true);
  }
  for (const value200 of arg92.querySelectorAll("input[type=number]")) {
    const value201 = fn40("span", "inspector-number-control"),
      value202 = fn40("span", "inspector-number-steppers");
    (value200.before(value201), value201.append(value200, value202));
    const list9 = [];
    for (const [value203, value204, value205] of [
      [1, "增加数值", "M1 5 5 1l4 4"],
      [-1, "减少数值", "M1 1 5 5l4-4"],
    ]) {
      const value206 = fn40("button", "inspector-number-stepper");
      ((value206.type = "button"),
        (value206.tabIndex = -1),
        value206.setAttribute("aria-label", value204),
        (value206.title = value204),
        (value206.innerHTML =
          '<svg viewBox="0 0 10 6" aria-hidden="true"><path d="' + value205 + '"></path></svg>'),
        value202.append(value206),
        list9.push(value206),
        fn41(value206, "click", (arg112) => {
          (arg112.preventDefault(), arg112.detail === 0 && fn47(value200, value203));
        }),
        fn41(value206, "pointerdown", (arg113) => {
          if (arg113.button !== 0 || value200.disabled || value200.readOnly) return;
          (arg113.preventDefault(),
            value180?.(),
            value200.focus({
              preventScroll: true,
            }),
            fn47(value200, value203));
          let value207, value208;
          ((value180 = () => {
            (value178.clearTimeout(value207), value178.clearInterval(value208), (value180 = null));
          }),
            (value207 = value178.setTimeout(() => {
              value208 = value178.setInterval(() => fn47(value200, value203), 55);
            }, 320)));
          try {
            value206.setPointerCapture(arg113.pointerId);
          } catch {}
        }));
      for (const value209 of ["pointerup", "pointercancel", "lostpointercapture"])
        fn41(value206, value209, () => value180?.());
    }
    (fn41(value200, "keydown", (arg114) => {
      ["ArrowUp", "ArrowDown"].includes(arg114.key) &&
        (arg114.preventDefault(), fn47(value200, arg114.key === "ArrowUp" ? 1 : -1));
    }),
      list7.push({
        field: value200,
        peers: list9,
      }));
  }
  function fn48(arg115) {
    const value210 = list6.find(
      (arg116) => arg116.button === arg115.target || arg116.menu.contains(arg115.target),
    );
    if (!value210) return;
    if (arg115.key === "Escape" && value179) {
      (arg115.preventDefault(), arg115.stopImmediatePropagation(), fn42(true));
      return;
    }
    if (arg115.key === "Tab") {
      fn42();
      return;
    }
    if (!["ArrowUp", "ArrowDown", "Home", "End", "Enter", " "].includes(arg115.key)) return;
    if ((arg115.preventDefault(), arg115.stopImmediatePropagation(), value179 !== value210)) {
      fn45(value210, true);
      return;
    }
    if (["Enter", " "].includes(arg115.key)) {
      fn46(
        value210,
        arg115.target.closest(".custom-select-option") || value210.menu.querySelector(".active"),
      );
      return;
    }
    const value211 = [...value210.menu.children].filter((arg117) => !arg117.disabled),
      value212 = value211.indexOf(value177.activeElement),
      value213 =
        arg115.key === "Home"
          ? 0
          : arg115.key === "End"
            ? value211.length - 1
            : (value212 + (arg115.key === "ArrowUp" ? -1 : 1) + value211.length) % value211.length;
    value211[value213]?.focus();
  }
  return (
    fn41(value177, "keydown", fn48, true),
    fn41(
      value177,
      "pointerdown",
      (arg118) => {
        value179 &&
          !value179.wrapper.contains(arg118.target) &&
          !value179.menu.contains(arg118.target) &&
          fn42();
      },
      true,
    ),
    fn41(value178, "resize", () => fn42()),
    fn41(value178, "blur", () => {
      (value180?.(), fn42());
    }),
    fn41(value177, "visibilitychange", () => {
      value177.hidden && (value180?.(), fn42());
    }),
    fn41(arg92.querySelector(".p2r-panel"), "scroll", () => fn42(), {
      passive: true,
    }),
    {
      sync() {
        list6.forEach(fn44);
        for (const { field: value214, peers: value215 } of list7)
          for (const value216 of value215)
            value216.disabled = value214.disabled || value214.readOnly;
      },
      close() {
        (fn42(), value180?.());
      },
      dispose() {
        (fn42(),
          value180?.(),
          list8.forEach((arg119) => arg119()),
          list6.forEach((arg120) => arg120.menu.remove()));
      },
    }
  );
}
