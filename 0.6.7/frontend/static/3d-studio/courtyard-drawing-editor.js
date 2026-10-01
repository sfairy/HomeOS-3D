import { validatePlacementChange } from "./studio-placement.js?v=20260927-overlap-v1";
import {
  enhanceStudioSelect,
  initializeNumberInputs,
  disposeStudioSelects,
} from "./studio-widgets.js?v=20260927-courtyard-controls-v1";
import {
  snapCourtyardPoint,
  trimCourtyardArea,
  isCourtyardDrawing,
  DRAWING_STYLES,
  normalizeCourtyardDrawing,
  packDrawingPoints,
  drawingPlanPoints,
  pathPoints,
  samplePath,
  validLoop,
  validHole,
  segmentDistance,
  surfaceRegions,
  surfaceExclusions,
  fenceSegments,
  fenceOpenings,
  hedgeSamples,
} from "./courtyard-drawing.js?v=20260927-drawing-v5";
import { courtyardPalette } from "./courtyard-models.js";
export function createCourtyardDrawingEditor(arg1) {
  const { canvas: value1, toolbar: value2, inspector: value3 } = arg1,
    value4 = document.createElement("div");
  ((value4.className = "courtyard-tool-options"),
    (value4.hidden = true),
    (value4.innerHTML =
      '<label>样式 <select aria-label="绘制样式"></select></label><label class="area-mode">方式 <select aria-label="地面绘制方式"><option value="polygon">逐点围合</option><option value="rectangle">拖画矩形</option></select></label><button type="button" data-action="finish">完成绘制</button><button type="button" data-action="cancel">取消</button><span>连续点击画边线，点起点闭合；Enter 完成，Esc 取消，Shift 锁轴</span>'),
    value2.append(value4));
  const value5 = document.createElement("div");
  ((value5.className = "courtyard-fields field-section"),
    (value5.hidden = true),
    value3.append(value5));
  const value6 = value4.querySelector("select"),
    value7 = value4.querySelector('[aria-label="地面绘制方式"]');
  let text1 = "",
    value8 = null,
    value9 = null,
    value10 = null,
    list1 = [],
    text2 = "select",
    list2 = [],
    value11 = null,
    value12 = null,
    value13 = null,
    value14 = -1,
    value15 = -1,
    value16 = false,
    value17 = null;
  const object1 = {};
  for (const value18 of Object.keys(DRAWING_STYLES))
    object1[value18] = normalizeCourtyardDrawing({
      type: value18,
    }).drawing;
  const fn1 = (arg2) =>
      ((((arg2.drawing.angle + (arg2.rotation || 0) + 180) % 360) + 360) % 360) - 180,
    fn2 = () => arg1.selected(),
    fn3 = () => Object.hasOwn(DRAWING_STYLES, text2),
    fn4 = (arg3) => arg1.point(arg3),
    fn5 = (arg4, arg5, arg6) => (
      (value10 = snapCourtyardPoint(arg4, {
        base: arg1.snap(arg4, arg5, arg6),
        walls: arg1.scene().walls,
        items: arg1.scene().items,
        draft: list2,
        ppm: arg1.ppm(),
        tolerance: (arg1.scene().settings?.snapTolerance || 13) / arg1.zoom(),
        enabled: arg1.snapping(),
        anchor: arg5,
        forceAxis: arg6,
        excludeId: value12?.id,
        settings: arg1.scene().settings,
      })),
      arg1.feedback?.(value10),
      value10.point
    );
  function fn6(arg7, arg8, arg9) {
    ((arg7.innerHTML = Object.entries(DRAWING_STYLES[arg8])
      .map(([arg10, arg11]) => '<option value="' + arg10 + '">' + arg11 + "</option>")
      .join("")),
      Object.hasOwn(DRAWING_STYLES[arg8], arg9) ||
        arg7.insertAdjacentHTML(
          "beforeend",
          '<option value="' + arg9 + '" disabled>旧款围挡（可切换）</option>',
        ),
      (arg7.value = arg9));
  }
  function fn7() {
    if (value12) {
      try {
        value1.releasePointerCapture(value12.pointerId);
      } catch {}
      value12.original && value12.item && Object.assign(value12.item, value12.original);
    }
    ((list2 = []),
      (list1 = []),
      (value11 = null),
      (value13 = null),
      (value9 = null),
      (value10 = null),
      (value12 = null),
      arg1.feedback?.(null));
  }
  function fn8(arg12) {
    (fn7(),
      (text2 = arg12),
      (value4.hidden = !fn3()),
      (value16 = false),
      fn3() &&
        ((value6.closest("label").hidden = false),
        (value4.querySelector('[data-action="finish"]').disabled = false),
        (value4.querySelector("span").textContent =
          "连续点击画边线，点起点闭合；Enter 完成，Esc 取消，Shift 锁轴（矩形为正方形）"),
        fn6(value6, text2, object1[text2].style),
        (value4.querySelector(".area-mode").hidden = text2 !== "courtyard-area")),
      arg1.draw());
  }
  function fn9(arg13) {
    const value19 = validatePlacementChange(arg13, arg1.scene(), arg1.ppm());
    return value19 ? ((text1 = ""), arg1.toast(value19), arg1.refresh(), false) : true;
  }
  function fn10() {
    if (!fn3()) return;
    if (value9) {
      arg1.toast("先点两点画裁剪线，再点击要裁掉的一侧。");
      return;
    }
    const value20 = text2 === "courtyard-area",
      value21 = value20 ? 3 : 2;
    if (list2.length < value21) {
      arg1.toast(value20 ? "至少绘制三个节点，或切换为拖画矩形。" : "至少绘制两个节点。");
      return;
    }
    if (value20 && !validLoop(list2)) {
      arg1.toast("轮廓不能交叉或重叠，请调整节点。");
      return;
    }
    if (value13) {
      const value26 = arg1.scene().items.find((arg14) => arg14.id === value13);
      if (!value26) return;
      if (value26.drawing.holes.length >= 16) {
        arg1.toast("单块地面最多支持 16 处留空。");
        return;
      }
      const value27 = drawingPlanPoints(value26, arg1.ppm()),
        value28 = value26.drawing.holes.map((arg15) =>
          drawingPlanPoints(value26, arg1.ppm(), arg15),
        );
      if (!validHole(list2, value27, value28)) {
        arg1.toast("留空范围须完整位于地面内部，且不能与其他留空相交。");
        return;
      }
      arg1.snapshot();
      const value29 = packDrawingPoints(value27, arg1.ppm(), [...value28, list2]);
      ((value26.drawing.angle = fn1(value26)),
        Object.assign(value26, {
          x: value29.x,
          y: value29.y,
          width: value29.width,
          depth: value29.depth,
          rotation: 0,
        }),
        (value26.drawing.points = value29.points),
        (value26.drawing.holes = value29.holes),
        fn7(),
        arg1.setTool("select"),
        (value16 = true),
        arg1.changed(),
        arg1.refresh());
      return;
    }
    const value22 = packDrawingPoints(list2, arg1.ppm()),
      value23 = text2,
      value24 = structuredClone(object1[value23]);
    if (
      ((value24.style = value6.value),
      (value24.points = value22.points),
      (value24.holes = []),
      value22.width > 200 || value22.depth > 200)
    ) {
      arg1.toast("单个绘制对象不能超过 200 米，请分区绘制。");
      return;
    }
    const object2 = {
        id: arg1.id(),
        type: value23,
        x: value22.x,
        y: value22.y,
        width: value22.width,
        depth: value22.depth,
        rotation: 0,
        elevation: 0,
        height:
          value23 === "courtyard-area"
            ? value24.style === "deck"
              ? 0.16
              : value24.style === "paving"
                ? 0.06
                : 0.04
            : value23 === "courtyard-path"
              ? 0.08
              : 1.2,
        color: "#7d8799",
        drawing: value24,
      },
      value25 = arg1.clone();
    (arg1.scene().items.push(object2),
      fn9(value25) &&
        (arg1.push(value25),
        fn7(),
        arg1.select(object2.id),
        arg1.setTool("select"),
        (value16 = true),
        arg1.changed(),
        arg1.refresh()));
  }
  ((value6.onchange = () => {
    ((object1[text2].style = value6.value),
      text2 === "courtyard-area" &&
        (object1[text2].patternWidth = value6.value === "deck" ? 0.16 : 0.6));
  }),
    (value7.onchange = () => {
      ((list2 = []), (value11 = null), arg1.draw());
    }),
    (value4.querySelector('[data-action="finish"]').onclick = fn10),
    (value4.querySelector('[data-action="cancel"]').onclick = () => arg1.setTool("select")));
  function fn11(arg16, arg17, arg18) {
    if (
      arg16.type === "courtyard-area" &&
      (!validLoop(arg17) ||
        arg18.some(
          (arg19, arg20) =>
            !validHole(
              arg19,
              arg17,
              arg18.filter((arg21, arg22) => arg22 !== arg20),
            ),
        ))
    )
      return false;
    const value30 = packDrawingPoints(arg17, arg1.ppm(), arg18);
    return value30.width > 200 || value30.depth > 200
      ? false
      : ((arg16.drawing.angle = fn1(arg16)),
        Object.assign(arg16, {
          x: value30.x,
          y: value30.y,
          width: value30.width,
          depth: value30.depth,
          rotation: 0,
        }),
        (arg16.drawing.points = value30.points),
        (arg16.drawing.holes = value30.holes),
        true);
  }
  function fn12(arg23, arg24) {
    for (const [value31, value32] of [-1, ...arg23.drawing.holes.map((arg25, arg26) => arg26)].map(
      (arg27) => [
        arg27,
        drawingPlanPoints(
          arg23,
          arg1.ppm(),
          arg27 < 0 ? arg23.drawing.points : arg23.drawing.holes[arg27],
        ),
      ],
    )) {
      const value33 = value32.findIndex(
        (arg28) => Math.hypot(arg28.x - arg24.x, arg28.y - arg24.y) * arg1.zoom() < 10,
      );
      if (value33 >= 0)
        return {
          index: value33,
          ring: value31,
        };
    }
    return null;
  }
  function fn13(arg29) {
    if (arg29.button !== 0 || arg1.panning()) return;
    if (fn3()) {
      if (!arg1.calibrated()) return;
      (arg29.preventDefault(),
        arg29.stopImmediatePropagation(),
        value1.focus({
          preventScroll: true,
        }),
        (list1 = []));
      const value40 =
        value9 && list2.length === 2 ? fn4(arg29) : fn5(fn4(arg29), list2.at(-1), arg29.shiftKey);
      if (value9) {
        if (list2.length < 2) {
          ((!list2.length ||
            Math.hypot(value40.x - list2[0].x, value40.y - list2[0].y) > arg1.ppm() * 0.01) &&
            list2.push(value40),
            list2.length === 2 && arg1.toast("点击裁剪线要去掉的一侧；Esc 取消。"),
            arg1.draw());
          return;
        }
        const value41 = arg1.scene().items.find((arg30) => arg30.id === value9),
          value42 = value41 && trimCourtyardArea(value41, list2[0], list2[1], value40, arg1.ppm());
        if (!value42?.length) {
          arg1.toast("裁剪会移除整块地面，请选择另一侧，或按 Esc 取消。");
          return;
        }
        if (
          value42.length > 16 ||
          value42.some(
            (arg31) =>
              arg31.outline.length > 128 ||
              arg31.holes.length > 16 ||
              arg31.holes.some((arg32) => arg32.length > 128),
          )
        ) {
          arg1.toast("裁剪结果过于复杂，请分段裁剪。");
          return;
        }
        const value43 = value42.map((arg33, arg34) => {
          const value45 = packDrawingPoints(arg33.outline, arg1.ppm(), arg33.holes);
          return {
            ...structuredClone(value41),
            id: arg34 ? arg1.id() : value41.id,
            x: value45.x,
            y: value45.y,
            width: value45.width,
            depth: value45.depth,
            rotation: 0,
            drawing: {
              ...structuredClone(value41.drawing),
              angle: fn1(value41),
              points: value45.points,
              holes: value45.holes,
            },
          };
        });
        arg1.snapshot();
        const value44 = arg1.scene().items.indexOf(value41);
        (arg1.scene().items.splice(value44, 1, ...value43),
          fn7(),
          arg1.setTool("select"),
          arg1.select(value43[0].id),
          (value16 = true),
          arg1.changed(),
          arg1.refresh());
        return;
      }
      if (text2 === "courtyard-area" && value7.value === "rectangle" && !value13) {
        ((value12 = {
          rectangle: true,
          start: value40,
          current: value40,
          pointerId: arg29.pointerId,
        }),
          value1.setPointerCapture(arg29.pointerId));
        return;
      }
      if (
        list2.length >= 3 &&
        Math.hypot(value40.x - list2[0].x, value40.y - list2[0].y) * arg1.zoom() < 12 &&
        text2 === "courtyard-area"
      ) {
        fn10();
        return;
      }
      ((!list2.length ||
        Math.hypot(value40.x - list2.at(-1).x, value40.y - list2.at(-1).y) > 0.04 * arg1.ppm()) &&
        list2.push(value40),
        list2.length >= 128 &&
          ((list2 = list2.slice(0, 128)), arg1.toast("已达到单条轮廓 128 个节点，请完成绘制。")),
        arg1.draw());
      return;
    }
    const value34 = fn2();
    if (text2 !== "select" || !value16 || !isCourtyardDrawing(value34)) return;
    const value35 = fn4(arg29),
      value36 = structuredClone(value34),
      value37 = arg1.clone();
    let value38 = fn12(value34, value35),
      value39 = false;
    if (!value38) {
      const list3 = [
        drawingPlanPoints(value34, arg1.ppm()),
        ...value34.drawing.holes.map((arg35) => drawingPlanPoints(value34, arg1.ppm(), arg35)),
      ];
      for (let value46 = 0; value46 < list3.length && !value38; value46++)
        for (
          let value47 = 0;
          value47 <
          list3[value46].length -
            (value34.type === "courtyard-area" || value34.drawing.closed ? 0 : 1);
          value47++
        ) {
          const value48 = list3[value46][value47],
            value49 = list3[value46][(value47 + 1) % list3[value46].length],
            object3 = {
              x: (value48.x + value49.x) / 2,
              y: (value48.y + value49.y) / 2,
            };
          if (!(
            Math.hypot(value48.x - value49.x, value48.y - value49.y) * arg1.zoom() < 30 ||
            Math.hypot(value35.x - object3.x, value35.y - object3.y) * arg1.zoom() > 8 ||
            list3[value46].length >= 128
          )) {
            (list3[value46].splice(value47 + 1, 0, object3),
              fn11(value34, list3[0], list3.slice(1)) &&
                ((value38 = {
                  index: value47 + 1,
                  ring: value46 - 1,
                }),
                (value39 = true)));
            break;
          }
        }
    }
    value38 &&
      (arg29.preventDefault(),
      arg29.stopImmediatePropagation(),
      value1.focus({
        preventScroll: true,
      }),
      (value14 = value38.index),
      (value15 = value38.ring),
      (value12 = {
        id: value34.id,
        item: value34,
        pointerId: arg29.pointerId,
        before: value37,
        original: value36,
        outline: drawingPlanPoints(value34, arg1.ppm()),
        holes: value34.drawing.holes.map((arg36) => drawingPlanPoints(value34, arg1.ppm(), arg36)),
        moved: value39,
        inserted: value39,
      }),
      (value12.patternAngle = fn1(value34)),
      value1.setPointerCapture(arg29.pointerId),
      fn18(value34),
      arg1.draw());
  }
  function fn14(arg37) {
    if (value12?.pointerId === arg37.pointerId) {
      if ((arg37.preventDefault(), arg37.stopImmediatePropagation(), value12.rectangle)) {
        const value56 = fn5(fn4(arg37), null, false),
          value57 = value12.start;
        if (arg37.shiftKey) {
          const value58 = Math.max(
            Math.abs(value56.x - value57.x),
            Math.abs(value56.y - value57.y),
          );
          ((value12.current = {
            x: value57.x + Math.sign(value56.x - value57.x || 1) * value58,
            y: value57.y + Math.sign(value56.y - value57.y || 1) * value58,
          }),
            (value10 = {
              point: value12.current,
              kind: "axis",
              label: "正方形",
            }));
        } else value12.current = value56;
        arg1.draw();
        return;
      }
      const value50 = arg1.scene().items.find((arg38) => arg38.id === value12.id);
      if (!value50) return;
      const value51 = value50.drawing.angle,
        value52 = value50.rotation;
      ((value50.drawing.angle = value12.patternAngle), (value50.rotation = 0));
      const value53 = structuredClone(value12.outline),
        value54 = structuredClone(value12.holes),
        value55 = value15 < 0 ? value53 : value54[value15];
      ((value55[value14] = fn5(
        fn4(arg37),
        value55[(value14 + value55.length - 1) % value55.length],
        arg37.shiftKey,
      )),
        (value12.invalid = !fn11(value50, value53, value54)),
        value12.invalid
          ? ((value50.drawing.angle = value51), (value50.rotation = value52))
          : (value12.moved = true),
        arg1.draw());
      return;
    }
    fn3() &&
      (arg37.stopImmediatePropagation(),
      (value11 =
        value9 && list2.length === 2 ? fn4(arg37) : fn5(fn4(arg37), list2.at(-1), arg37.shiftKey)),
      arg1.draw());
  }
  function fn15(arg39) {
    if (value12?.pointerId !== arg39.pointerId) return;
    (arg39.preventDefault(), arg39.stopImmediatePropagation());
    const value59 = value12;
    value12 = null;
    try {
      value1.releasePointerCapture(arg39.pointerId);
    } catch {}
    if (value59.rectangle) {
      if (arg39.type === "pointercancel") {
        arg1.draw();
        return;
      }
      const value60 = value59.start,
        value61 = value59.current;
      if (
        Math.abs(value60.x - value61.x) < arg1.ppm() * 0.1 ||
        Math.abs(value60.y - value61.y) < arg1.ppm() * 0.1
      ) {
        arg1.draw();
        return;
      }
      ((list2 = [
        value60,
        {
          x: value61.x,
          y: value60.y,
        },
        value61,
        {
          x: value60.x,
          y: value61.y,
        },
      ]),
        fn10());
      return;
    }
    if (arg39.type === "pointercancel") {
      (Object.assign(
        arg1.scene().items.find((arg40) => arg40.id === value59.id),
        value59.original,
      ),
        arg1.refresh());
      return;
    }
    (value59.moved && fn9(value59.before) && (arg1.push(value59.before), arg1.changed()),
      value59.invalid && arg1.toast("该位置会使轮廓交叉或留空越界，已保留最后有效位置。"),
      arg1.refresh());
  }
  (value1.addEventListener("pointerdown", fn13, true),
    value1.addEventListener("pointermove", fn14, true));
  for (const value62 of ["pointerup", "pointercancel"])
    value1.addEventListener(value62, fn15, true);
  (value1.addEventListener(
    "dblclick",
    (arg41) => {
      if (fn3()) {
        (arg41.preventDefault(),
          arg41.stopImmediatePropagation(),
          text2 !== "courtyard-area" && fn10());
        return;
      }
      const value63 = fn2();
      if (!value16 || !isCourtyardDrawing(value63)) return;
      const value64 = fn4(arg41),
        list4 = [
          drawingPlanPoints(value63, arg1.ppm()),
          ...value63.drawing.holes.map((arg42) => drawingPlanPoints(value63, arg1.ppm(), arg42)),
        ];
      for (let value65 = 0; value65 < list4.length; value65++)
        for (
          let value66 = 0;
          value66 <
          list4[value65].length -
            (value63.type === "courtyard-area" || value63.drawing.closed ? 0 : 1);
          value66++
        ) {
          const value67 = list4[value65][value66],
            value68 = list4[value65][(value66 + 1) % list4[value65].length];
          if (segmentDistance(value64, value67, value68) * arg1.zoom() > 10) continue;
          if (list4[value65].length >= 128) return;
          const value69 = value68.x - value67.x,
            value70 = value68.y - value67.y,
            value71 = Math.max(
              0,
              Math.min(
                1,
                ((value64.x - value67.x) * value69 + (value64.y - value67.y) * value70) /
                  (value69 * value69 + value70 * value70 || 1),
              ),
            ),
            value72 = arg1.clone();
          if (
            (list4[value65].splice(value66 + 1, 0, {
              x: value67.x + value71 * value69,
              y: value67.y + value71 * value70,
            }),
            !fn11(value63, list4[0], list4.slice(1)) || !fn9(value72))
          )
            return;
          (arg1.push(value72),
            (value14 = value66 + 1),
            (value15 = value65 - 1),
            arg1.changed(),
            arg1.refresh(),
            arg41.preventDefault(),
            arg41.stopImmediatePropagation());
          return;
        }
    },
    true,
  ),
    window.addEventListener(
      "keydown",
      (arg43) => {
        if (!arg43.target.closest?.('input,select,textarea,[contenteditable="true"]')) {
          if (
            value12 &&
            (arg43.key === "Escape" ||
              ((arg43.metaKey || arg43.ctrlKey) && arg43.key.toLowerCase() === "z"))
          ) {
            (arg43.preventDefault(),
              arg43.stopImmediatePropagation(),
              fn15({
                pointerId: value12.pointerId,
                type: "pointercancel",
                preventDefault() {},
                stopImmediatePropagation() {},
              }));
            return;
          }
          if (
            !fn3() &&
            value16 &&
            value14 >= 0 &&
            isCourtyardDrawing(fn2()) &&
            ["Delete", "Backspace"].includes(arg43.key)
          ) {
            (arg43.preventDefault(),
              arg43.stopImmediatePropagation(),
              value5.querySelector('[data-action="remove-node"]').onclick?.());
            return;
          }
          if (
            fn3() &&
            (arg43.metaKey || arg43.ctrlKey) &&
            arg43.key.toLowerCase() === "z" &&
            (list2.length || list1.length)
          ) {
            (arg43.preventDefault(),
              arg43.stopImmediatePropagation(),
              arg43.shiftKey
                ? list1.length && list2.push(list1.pop())
                : list2.length && list1.push(list2.pop()),
              arg1.draw());
            return;
          }
          fn3() &&
            ["Enter", "Escape", "Backspace", "Delete"].includes(arg43.key) &&
            (arg43.preventDefault(),
            arg43.stopImmediatePropagation(),
            arg43.key === "Enter"
              ? fn10()
              : arg43.key === "Escape"
                ? arg1.setTool("select")
                : (list2.length && list1.push(list2.pop()), arg1.draw()));
        }
      },
      true,
    ));
  function fn16(arg44, arg45) {
    const value73 = arg1.ppm(),
      value74 = courtyardPalette(
        arg44.type === "courtyard-area"
          ? "garden-" + arg44.drawing.style
          : arg44.type === "courtyard-path"
            ? "garden-stepping"
            : "garden-fence",
        "default",
      ),
      value75 = arg1.planColor?.(arg44),
      value76 = arg1.isSelected(arg44.id),
      value77 = drawingPlanPoints(arg44, value73),
      fn19 = (arg46) => {
        arg46.forEach((arg47, arg48) => {
          const value78 = arg1.screen(arg47);
          arg48 ? arg45.lineTo(value78.x, value78.y) : arg45.moveTo(value78.x, value78.y);
        });
      };
    if (
      (arg45.save(),
      (arg45.strokeStyle = value76 ? "#ff9d2e" : value75 || "#c7d0d7"),
      (arg45.lineWidth = value76 ? 2.5 : 1.5),
      arg44.type === "courtyard-area")
    ) {
      arg45.fillStyle =
        (value75 ||
          "#" +
            (arg44.drawing.style === "lawn"
              ? value74.leaf
              : arg44.drawing.style === "deck"
                ? value74.base
                : value74.light
            )
              .toString(16)
              .padStart(6, "0")) + "66";
      const value79 = surfaceRegions(
        arg44,
        surfaceExclusions(arg44, arg1.scene().items, arg1.buildings(), value73),
      );
      arg45.beginPath();
      for (const value80 of value79)
        for (const value81 of [value80.outline, ...value80.holes])
          (fn19(
            drawingPlanPoints(
              arg44,
              value73,
              value81.map((arg49) => ({
                x: arg49.x / arg44.width,
                y: arg49.y / arg44.depth,
              })),
            ),
          ),
            arg45.closePath());
      (arg45.fill("evenodd"), arg45.stroke());
    } else {
      const value82 = ((arg44.rotation || 0) * Math.PI) / 180,
        value83 = Math.cos(value82),
        value84 = Math.sin(value82),
        fn20 = (arg50) =>
          arg1.screen({
            x: arg44.x + (arg50.x * value83 - arg50.y * value84) * value73,
            y: arg44.y + (arg50.x * value84 + arg50.y * value83) * value73,
          });
      if (arg44.type === "courtyard-path")
        for (const value85 of samplePath(
          pathPoints(arg44),
          Math.max(arg44.drawing.spacing, arg44.drawing.stoneDepth + 0.05),
        )) {
          const value86 = fn20(value85);
          (arg45.save(),
            arg45.translate(value86.x, value86.y),
            arg45.rotate(value85.angle + value82),
            (arg45.fillStyle = value75 || "#" + value74.light.toString(16).padStart(6, "0")),
            arg45.beginPath());
          const value87 = arg44.drawing.stoneDepth * value73 * arg1.zoom(),
            value88 = arg44.drawing.stoneWidth * value73 * arg1.zoom();
          (arg44.drawing.style === "square"
            ? arg45.rect(-value87 / 2, -value88 / 2, value87, value88)
            : arg45.ellipse(0, 0, value87 / 2, value88 / 2, 0, 0, Math.PI * 2),
            arg45.fill(),
            arg45.stroke(),
            arg45.restore());
        }
      else {
        if (arg44.drawing.style === "hedge") {
          arg45.fillStyle = (value75 || "#" + value74.leaf.toString(16).padStart(6, "0")) + "99";
          for (const value89 of hedgeSamples(arg44, fenceOpenings(arg44, arg1.scene().items))) {
            const value90 = fn20(value89);
            (arg45.beginPath(),
              arg45.arc(
                value90.x,
                value90.y,
                arg44.drawing.thickness * 1.5 * value73 * arg1.zoom(),
                0,
                Math.PI * 2,
              ),
              arg45.fill(),
              arg45.stroke());
          }
        } else {
          ((arg45.lineWidth = Math.max(3, arg44.drawing.thickness * value73 * arg1.zoom())),
            arg45.beginPath());
          for (const [value91, value92] of fenceSegments(
            arg44,
            fenceOpenings(arg44, arg1.scene().items),
          )) {
            const value93 = fn20(value91),
              value94 = fn20(value92);
            (arg45.moveTo(value93.x, value93.y), arg45.lineTo(value94.x, value94.y));
          }
          arg45.stroke();
        }
      }
    }
    if (value76 && value16) {
      for (const [value95, value96] of [
        [-1, value77],
        ...arg44.drawing.holes.map((arg51, arg52) => [
          arg52,
          drawingPlanPoints(arg44, value73, arg51),
        ]),
      ])
        value96.forEach((arg53, arg54) => {
          const value97 = arg1.screen(arg53);
          ((arg45.fillStyle = value14 === arg54 && value15 === value95 ? "#ff9d2e" : "#edf2f7"),
            arg45.beginPath(),
            arg45.arc(value97.x, value97.y, 5, 0, Math.PI * 2),
            arg45.fill(),
            arg45.stroke());
        });
      for (const value98 of [
        value77,
        ...arg44.drawing.holes.map((arg55) => drawingPlanPoints(arg44, value73, arg55)),
      ])
        for (
          let value99 = 0;
          value99 <
          value98.length - (arg44.type === "courtyard-area" || arg44.drawing.closed ? 0 : 1);
          value99++
        ) {
          const value100 = value98[value99],
            value101 = value98[(value99 + 1) % value98.length];
          if (Math.hypot(value100.x - value101.x, value100.y - value101.y) * arg1.zoom() < 30)
            continue;
          const value102 = arg1.screen({
            x: (value100.x + value101.x) / 2,
            y: (value100.y + value101.y) / 2,
          });
          ((arg45.fillStyle = "#17202b"),
            arg45.fillRect(value102.x - 3, value102.y - 3, 6, 6),
            arg45.strokeRect(value102.x - 3, value102.y - 3, 6, 6));
        }
    }
    arg45.restore();
  }
  function fn17(arg56) {
    if (!fn3() && !value12) return;
    let list5 = [...list2];
    if (value12?.rectangle) {
      const value103 = value12.start,
        value104 = value12.current;
      list5 = [
        value103,
        {
          x: value104.x,
          y: value103.y,
        },
        value104,
        {
          x: value103.x,
          y: value104.y,
        },
        value103,
      ];
    } else value11 && !(value9 && list2.length === 2) && list5.push(value11);
    if (!list5.length && !value10) return;
    (arg56.save(),
      (arg56.strokeStyle = "#ff9d2e"),
      (arg56.lineWidth = 2),
      arg56.setLineDash([6, 4]),
      arg56.beginPath(),
      list5.forEach((arg57, arg58) => {
        const value105 = arg1.screen(arg57);
        arg58 ? arg56.lineTo(value105.x, value105.y) : arg56.moveTo(value105.x, value105.y);
      }),
      text2 === "courtyard-area" &&
        !value9 &&
        list5.length >= 3 &&
        (arg56.closePath(), (arg56.fillStyle = "#ff9d2e16"), arg56.fill()),
      arg56.stroke(),
      arg56.setLineDash([]));
    for (const value106 of list2) {
      const value107 = arg1.screen(value106);
      (arg56.beginPath(),
        arg56.arc(value107.x, value107.y, 4, 0, Math.PI * 2),
        (arg56.fillStyle = "#ff9d2e"),
        arg56.fill());
    }
    const fn21 = (arg59, arg60, arg61 = "#43d2e6", arg62 = -25) => {
      const value108 = arg1.screen(arg59);
      arg56.font = "12px sans-serif";
      const value109 = arg56.measureText(arg60).width,
        value110 = Math.max(4, Math.min(value108.x + 10, value1.clientWidth - value109 - 16)),
        value111 = Math.max(4, Math.min(value108.y + arg62, value1.clientHeight - 26));
      ((arg56.fillStyle = "#17202b"),
        arg56.fillRect(value110, value111, value109 + 12, 22),
        (arg56.fillStyle = arg61),
        arg56.fillText(arg60, value110 + 6, value111 + 15));
    };
    if (value10?.kind && !(value9 && list2.length === 2)) {
      const value112 = arg1.screen(value10.point);
      ((arg56.strokeStyle = "#43d2e6"),
        (arg56.lineWidth = 2),
        arg56.strokeRect(value112.x - 5, value112.y - 5, 10, 10),
        fn21(value10.point, value10.label));
    }
    if (list5.length >= 2) {
      const value113 = list5.at(-2),
        value114 = list5.at(-1);
      fn21(
        {
          x: (value113.x + value114.x) / 2,
          y: (value113.y + value114.y) / 2,
        },
        (Math.hypot(value114.x - value113.x, value114.y - value113.y) / arg1.ppm()).toFixed(2) +
          " m",
        "#ff9d2e",
        10,
      );
    }
    if (value9 && list2.length === 2 && value11) {
      const value115 = arg1.scene().items.find((arg63) => arg63.id === value9),
        value116 = value115 && trimCourtyardArea(value115, list2[0], list2[1], value11, arg1.ppm()),
        value117 = arg1.screen(list2[0]),
        value118 = arg1.screen(list2[1]),
        value119 = value118.x - value117.x,
        value120 = value118.y - value117.y;
      ((arg56.strokeStyle = "#ff9d2e"),
        arg56.setLineDash([6, 4]),
        arg56.beginPath(),
        arg56.moveTo(value117.x - value119 * 100, value117.y - value120 * 100),
        arg56.lineTo(value117.x + value119 * 100, value117.y + value120 * 100),
        arg56.stroke(),
        arg56.setLineDash([]),
        (arg56.fillStyle = "#43d2e633"),
        (arg56.strokeStyle = "#43d2e6"),
        arg56.beginPath());
      for (const value121 of value116 || [])
        for (const value122 of [value121.outline, ...value121.holes])
          (value122.forEach((arg64, arg65) => {
            const value123 = arg1.screen(arg64);
            arg65 ? arg56.lineTo(value123.x, value123.y) : arg56.moveTo(value123.x, value123.y);
          }),
            arg56.closePath());
      (arg56.fill("evenodd"), arg56.stroke(), fn21(value11, "裁掉此侧，蓝色保留"));
    }
    arg56.restore();
  }
  function fn18(arg66) {
    if (((value5.hidden = !isCourtyardDrawing(arg66)), value5.hidden))
      return ((value17 = null), (text1 = ""), false);
    value17 !== arg66.id &&
      ((value14 = -1), (value15 = -1), (value16 = true), (value17 = arg66.id));
    const value124 = JSON.stringify([
      arg66.id,
      arg66.type,
      arg66.height,
      arg66.elevation,
      arg66.rotation,
      arg66.drawing,
      value16,
      value14,
      value15,
    ]);
    if (text1 === value124 && value8 === arg66) return true;
    ((text1 = value124), (value8 = arg66));
    const value125 = arg66.type,
      value126 = arg66.drawing,
      fn22 = (arg67, arg68, arg69, arg70, arg71, arg72) =>
        "<label>" +
        arg67 +
        '<input aria-label="' +
        arg67 +
        '" data-field="' +
        arg68 +
        '" type="number" value="' +
        arg69 +
        '" min="' +
        arg70 +
        '" max="' +
        arg71 +
        '" step="' +
        arg72 +
        '"></label>';
    (disposeStudioSelects(value5),
      (value5.innerHTML =
        '<label>样式<select aria-label="庭院对象样式" data-field="style"></select></label><div class="field-grid">' +
        (value125 === "courtyard-area" && value126.style === "lawn"
          ? ""
          : fn22(
              value125 === "courtyard-area" ? "面层厚度（m）" : "高度（m）",
              "height",
              arg66.height,
              0.01,
              6,
              0.01,
            )) +
        fn22(
          value125 === "courtyard-area" ? "整体抬高（m）" : "离地（m）",
          "elevation",
          arg66.elevation,
          0,
          6,
          0.01,
        ) +
        fn22("整体旋转（°）", "rotation", arg66.rotation, -360, 360, 1) +
        (value125 === "courtyard-area" && value126.style !== "lawn"
          ? fn22("铺设方向（°）", "angle", value126.angle, -180, 180, 5) +
            fn22(
              value126.style === "deck" ? "木板宽（m）" : "砖宽（m）",
              "patternWidth",
              value126.patternWidth,
              0.08,
              2,
              0.01,
            ) +
            (value126.style === "paving"
              ? fn22("砖长（m）", "patternLength", value126.patternLength, 0.1, 3, 0.05)
              : "")
          : "") +
        (value125 !== "courtyard-area"
          ? fn22(
              value125 === "courtyard-path"
                ? "步距（m）"
                : value126.style === "hedge"
                  ? "绿篱株距（m）"
                  : "立柱间距（m）",
              value126.style === "hedge" ? "hedgeSpacing" : "spacing",
              value126.style === "hedge" ? value126.hedgeSpacing : value126.spacing,
              0.2,
              5,
              0.05,
            )
          : "") +
        (value125 === "courtyard-path"
          ? fn22("石头宽（m）", "stoneWidth", value126.stoneWidth, 0.15, 1.5, 0.05) +
            fn22("石头长（m）", "stoneDepth", value126.stoneDepth, 0.15, 1.5, 0.05)
          : "") +
        (value125 === "courtyard-fence"
          ? fn22("围挡厚度（m）", "thickness", value126.thickness, 0.06, 0.8, 0.01)
          : "") +
        "</div>" +
        (value125 === "courtyard-path"
          ? '<label class="courtyard-toggle"><input type="checkbox" data-field="curve" ' +
            (value126.curve ? "checked" : "") +
            ">平滑曲线</label>"
          : "") +
        (value125 === "courtyard-fence"
          ? '<label class="courtyard-toggle"><input type="checkbox" data-field="closed" ' +
            (value126.closed ? "checked" : "") +
            ">闭合围挡</label>"
          : "") +
        (value125 === "courtyard-fence"
          ? '<div class="courtyard-subsection"><p class="courtyard-section-title">预留门洞</p><div class="field-grid">' +
            fn22("门洞宽（m）", "gateWidth", value126.gateWidth, 0, 4, 0.1) +
            fn22("距起点（m）", "gateOffset", value126.gateOffset, 0, 200, 0.1) +
            '</div><p class="muted">宽度设为 0 关闭；放置庭院门也会自动留口。</p></div>'
          : "") +
        ('<div class="courtyard-subsection"><p class="courtyard-section-title">轮廓编辑</p><div class="courtyard-actions"><button type="button" data-action="nodes">' +
          (value16 ? "完成节点编辑" : "编辑节点") +
          '</button><button type="button" data-action="remove-node" ' +
          (value14 < 0 ? "disabled" : "") +
          ">删除选中节点</button>") +
        (value125 === "courtyard-area"
          ? '<button type="button" data-action="trim">画线裁剪</button><button type="button" data-action="hole">绘制留空</button><button type="button" data-action="remove-hole">移除选中留空</button>'
          : "") +
        '</div><p class="muted">' +
        (value125 === "courtyard-fence" && value126.style === "hedge"
          ? "株距是相邻植株中心的距离；越小越密，越大越疏。"
          : "") +
        "拖动圆点改形，拖动边中点加节点；选中圆点后按 Delete 删除。完成节点编辑后可整体拖动。" +
        (value125 === "courtyard-area" ? "画线裁剪：画一条线，再点要裁掉的一侧。" : "") +
        "</p></div>"),
      fn6(value5.querySelector("select"), value125, value126.style),
      value5.querySelectorAll("[data-field]").forEach(
        (arg73) =>
          (arg73.onchange = () => {
            const value128 = arg1.clone(),
              value129 = arg73.dataset.field,
              value130 =
                arg73.type === "checkbox"
                  ? arg73.checked
                  : arg73.tagName === "SELECT"
                    ? arg73.value
                    : Number(arg73.value);
            if (["height", "elevation", "rotation"].includes(value129))
              arg66[value129] = Math.max(
                Number(arg73.min),
                Math.min(Number(arg73.max), Number.isFinite(value130) ? value130 : 0),
              );
            else {
              if (value129 === "style" && value125 === "courtyard-area") {
                const object4 = {
                  lawn: 0.04,
                  deck: 0.16,
                  paving: 0.06,
                };
                (Math.abs(arg66.height - object4[value126.style]) < 0.001 &&
                  (arg66.height = object4[value130]),
                  (value126.patternWidth = value130 === "deck" ? 0.16 : 0.6));
              }
              ((value126[value129] = value130),
                Object.assign(arg66, normalizeCourtyardDrawing(arg66)));
            }
            fn9(value128) && (arg1.push(value128), arg1.changed(), arg1.refresh());
          }),
      ),
      (value5.querySelector('[data-action="nodes"]').onclick = () => {
        ((value16 = !value16), fn18(arg66), arg1.draw());
      }),
      (value5.querySelector('[data-action="remove-node"]').onclick = () => {
        const value131 = drawingPlanPoints(arg66, arg1.ppm()),
          value132 = value126.holes.map((arg74) => drawingPlanPoints(arg66, arg1.ppm(), arg74)),
          value133 = value15 < 0 ? value131 : value132[value15];
        if (!value133 || value133.length <= (value125 === "courtyard-area" ? 3 : 2)) return;
        const value134 = arg1.clone();
        if ((value133.splice(value14, 1), !fn11(arg66, value131, value132))) {
          arg1.toast("删除后轮廓无效，已保留原节点。");
          return;
        }
        fn9(value134) && (arg1.push(value134), (value14 = -1), arg1.changed(), arg1.refresh());
      }),
      value5.querySelector('[data-action="hole"]')?.addEventListener("click", () => {
        (arg1.setTool("courtyard-area"),
          (value13 = arg66.id),
          (value7.value = "polygon"),
          arg1.toast("在所选地面内部围出留空范围，点击起点或按 Enter 完成。"));
      }),
      value5.querySelector('[data-action="trim"]')?.addEventListener("click", () => {
        (arg1.setTool("courtyard-area"),
          (value9 = arg66.id),
          (value7.value = "polygon"),
          (value6.closest("label").hidden = true),
          (value4.querySelector(".area-mode").hidden = true),
          (value4.querySelector('[data-action="finish"]').disabled = true),
          (value4.querySelector("span").textContent =
            "点两点确定裁剪直线（两端延伸），再点击要裁掉的一侧；蓝色区域保留，Esc 取消"),
          arg1.toast("点两点画裁剪线，再点击要裁掉的一侧。蓝色预览保留区域，Esc 取消。"));
      }));
    const value127 = value5.querySelector('[data-action="remove-hole"]');
    value127 &&
      ((value127.disabled = value15 < 0),
      (value127.onclick = () => {
        value15 < 0 ||
          (arg1.snapshot(),
          value126.holes.splice(value15, 1),
          (value15 = -1),
          (value14 = -1),
          arg1.changed(),
          arg1.refresh());
      }));
    for (const value135 of value5.querySelectorAll("select")) enhanceStudioSelect(value135);
    return (initializeNumberInputs(value5), true);
  }
  return {
    setTool: fn8,
    refresh: fn18,
    draw: fn17,
    drawItem: fn16,
    editing: () => value16 && isCourtyardDrawing(fn2()),
  };
}
