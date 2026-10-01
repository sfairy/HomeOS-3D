import {
  normalizeFlowLine as normalizeFlowLine2,
  flowLinePath as flowLinePath2,
  constrainFlowPoint as constrainFlowPoint2,
  fitFlowLinePath as fitFlowLinePath2,
} from "./flow-line-model.js?v=20260930-flow-line-sign-v1";
import { renderFlowLine as renderFlowLine2 } from "./renderer/flow-line.js?v=20260930-flow-line-sign-v1";
let I = null;
export function openFlowLinePathEditor(
  arg1,
  {
    canvas: v1,
    host: v2,
    container: v3,
    states: v4,
    lockTargets: v5 = [],
    enhancePathSelect: v6,
    onLayoutChange: v7,
    onSave: v8,
    onError: v9,
    onClose: v10,
  } = {},
) {
  if (!v1?.isConnected || !v2?.isConnected || !v3?.isConnected)
    throw new Error("请先在仪表盘编辑画布选择流水线条。");
  I?.close();
  const v11 = normalizeFlowLine2(arg1.properties),
    clientWidth = v1.clientWidth,
    clientHeight = v1.clientHeight,
    num = Number(arg1.position?.width) || 600,
    num2 = Number(arg1.position?.height) || 300;
  let list = [],
    v12 = false,
    value = null,
    v13 = -1,
    value2 = null,
    v14 = false,
    value3 = null,
    value4 = null,
    list2 = [],
    v15 = false,
    v16 = false;
  const element2 = document.createElement("div");
  ((element2.className = "flow-line-canvas-editor"),
    element2.setAttribute("role", "region"),
    element2.setAttribute("aria-label", "画布路径编辑"),
    (element2.innerHTML =
      '<div class="flow-line-draw-stage"><div data-preview></div><svg tabindex="0" aria-label="仪表盘路径画布"></svg></div><div class="flow-line-draw-tools"><strong>绘制流水线条</strong><button type="button" data-draw>重新绘制</button><button type="button" data-finish>完成绘制</button><button type="button" data-undo>撤销</button><button type="button" data-insert>插入节点</button><button type="button" data-delete>删除节点</button><label>路径形态 <select data-shape id="flow-line-path-shape" aria-label="路径形态"><option value="straight">折线</option><option value="rounded">圆角</option><option value="curve">曲线</option></select></label><button type="button" data-cancel>取消</button><button type="button" data-save>确认路径</button><p data-hint></p><p data-error role="alert" hidden></p><span data-count></span></div>'));
  const v17 = (arg2) => element2.querySelector(arg2),
    element3 = v17("svg"),
    element4 = v17(".flow-line-draw-stage");
  (element3.setAttribute("viewBox", "0 0 " + clientWidth + " " + clientHeight),
    element3.setAttribute("preserveAspectRatio", "none"),
    Object.assign(element4.style, {
      width: clientWidth + "px",
      height: clientHeight + "px",
    }),
    v3.append(element2),
    v3.classList.add("flow-line-path-editing"));
  const propertyValue = v3.style.getPropertyValue("--flow-line-toolbar-space");
  function fn1() {
    const v18 = v17(".flow-line-draw-tools").offsetHeight + 20 + "px";
    v3.style.getPropertyValue("--flow-line-toolbar-space") !== v18 &&
      (v3.style.setProperty("--flow-line-toolbar-space", v18), v7?.());
  }
  const v19 = () => {
    (v3.classList.remove("flow-line-path-editing"),
      propertyValue
        ? v3.style.setProperty("--flow-line-toolbar-space", propertyValue)
        : v3.style.removeProperty("--flow-line-toolbar-space"),
      v7?.());
  };
  fn1();
  function fn2() {
    const boundingClientRect = v1.getBoundingClientRect(),
      boundingClientRect2 = element2.getBoundingClientRect();
    Object.assign(element4.style, {
      left: boundingClientRect.left - boundingClientRect2.left + "px",
      top: boundingClientRect.top - boundingClientRect2.top + "px",
      transform:
        "scale(" +
        boundingClientRect.width / clientWidth +
        "," +
        boundingClientRect.height / clientHeight +
        ")",
    });
    const num3 =
      Math.min(boundingClientRect.width / clientWidth, boundingClientRect.height / clientHeight) ||
      1;
    for (const element5 of element3.querySelectorAll(".flow-line-draw-node"))
      (element5.children[0].setAttribute("r", 14 / num3),
        element5.children[1].setAttribute("r", 5 / num3));
  }
  fn2();
  const elementNS = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  (elementNS.setAttribute("viewBox", "0 0 " + num + " " + num2),
    elementNS.setAttribute("preserveAspectRatio", "none"),
    Object.assign(elementNS.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      pointerEvents: "none",
      visibility: "hidden",
    }),
    v2.append(elementNS));
  const hidden = v2.hidden;
  v2.hidden = false;
  let v20, v21;
  try {
    ((v20 = element3.getScreenCTM().inverse().multiply(elementNS.getScreenCTM())),
      (v21 = v20.inverse()));
  } catch (v22) {
    throw (element2.remove(), v19(), v22);
  } finally {
    (elementNS.remove(), (v2.hidden = hidden));
  }
  const v23 = (arg3, arg4) => {
    const matrixTransform = new DOMPoint(...arg3).matrixTransform(arg4);
    return [matrixTransform.x, matrixTransform.y];
  };
  list = v11.points.map(([v24, v25]) =>
    v23([v24 * num, v25 * num2], v20).map((arg5, arg6) => arg5 / [clientWidth, clientHeight][arg6]),
  );
  const stringify = JSON.stringify(list),
    visibility = v2.style.visibility,
    activeElement = document.activeElement;
  v2.style.visibility = "hidden";
  const map = v5.filter(Boolean).map((arg7) => ({
    element: arg7,
    inert: arg7.inert,
  }));
  map.forEach(({ element: v26 }) => (v26.inert = true));
  const v27 = (arg8, arg9, v28 = element3) => {
      const elementNS2 = document.createElementNS("http://www.w3.org/2000/svg", arg8);
      for (const [v29, v30] of Object.entries(arg9)) elementNS2.setAttribute(v29, String(v30));
      return (v28.append(elementNS2), elementNS2);
    },
    element6 = v27("path", {
      class: "flow-line-axis-guide",
      fill: "none",
    }),
    element7 = v27("path", {
      class: "flow-line-draw-ghost",
      fill: "none",
    }),
    element8 = v27("g", {}),
    v31 = (arg10) => {
      const matrixTransform2 = new DOMPoint(arg10.clientX, arg10.clientY).matrixTransform(
        element3.getScreenCTM().inverse(),
      );
      return [matrixTransform2.x / clientWidth, matrixTransform2.y / clientHeight];
    },
    v32 = () => {
      (list2.push({
        points: list.map((arg11) => [...arg11]),
        shape: v11.shape,
      }),
        list2.length > 100 && list2.shift());
    },
    v33 = (arg12, arg13) =>
      element6.setAttribute(
        "d",
        !arg12 || !arg13
          ? ""
          : arg13 === "x"
            ? "M 0 " + arg12[1] * clientHeight + " H " + clientWidth
            : "M " + arg12[0] * clientWidth + " 0 V " + clientHeight,
      ),
    v34 = () =>
      fitFlowLinePath2(
        arg1,
        list.map(([v35, v36]) => v23([v35 * clientWidth, v36 * clientHeight], v21)),
      );
  function fn3() {
    if ((value4?.destroyFlowLine?.(), v17("[data-preview]").replaceChildren(), list.length)) {
      const v37 = v34(),
        translate = v20.translate(...v37.origin);
      ((value4 = renderFlowLine2(
        {
          ...arg1,
          position: {
            ...arg1.position,
            ...v37.position,
          },
          properties: {
            ...v11,
            points: v37.points,
          },
        },
        {
          states: v4,
        },
      )),
        Object.assign(value4.style, {
          position: "absolute",
          left: "0",
          top: "0",
          width: v37.position.width + "px",
          height: v37.position.height + "px",
          transformOrigin: "0 0",
          transform:
            "matrix(" +
            translate.a +
            "," +
            translate.b +
            "," +
            translate.c +
            "," +
            translate.d +
            "," +
            translate.e +
            "," +
            translate.f +
            ")",
        }),
        v17("[data-preview]").append(value4));
    }
    if (
      ((v17("[data-count]").textContent = list.length + " / 256 个节点"),
      (v17("[data-hint]").textContent = v12
        ? "直接在底图上点击加点，双击 / Enter 完成；Shift 锁轴，Backspace 撤回，Esc 取消重画。"
        : "拖动节点调整，Shift 锁轴，方向键微调；确认路径后可用编辑历史撤销。"),
      (v17("[data-finish]").hidden = !v12),
      (v17("[data-draw]").hidden = v12),
      (v17("[data-finish]").disabled = list.length < 2),
      (v17("[data-delete]").disabled = v12 || v13 < 0 || list.length <= 2),
      (v17("[data-insert]").disabled = v12 || v13 < 0 || list.length >= 256),
      (v17("[data-undo]").disabled = v12 ? !list.length : !list2.length),
      (v17("[data-save]").disabled = v15 || v12 || list.length < 2),
      element3.classList.toggle("drawing", v12),
      (element8.style.pointerEvents = v12 ? "none" : ""),
      [...element8.children].forEach((arg14, arg15) => {
        (arg14.setAttribute(
          "transform",
          "translate(" + list[arg15][0] * clientWidth + " " + list[arg15][1] * clientHeight + ")",
        ),
          arg14.classList.toggle("selected", v13 === arg15));
      }),
      v12 && value2 && list.length)
    ) {
      const v38 = constrainFlowPoint2(value2, list.at(-1), v14, null, [clientWidth, clientHeight]);
      (element7.setAttribute(
        "d",
        flowLinePath2([...list, v38.point], v11.shape, clientWidth, clientHeight, v11.radius),
      ),
        v33(list.at(-1), v38.axis));
    } else (element7.setAttribute("d", ""), v33(null, null));
  }
  function fn4() {
    (element8.replaceChildren(),
      list.forEach((arg16, arg17) => {
        const element9 = v27(
          "g",
          {
            role: "button",
            tabindex: "0",
            "aria-label": "路径节点 " + (arg17 + 1),
            class: "flow-line-draw-node",
          },
          element8,
        );
        (v27(
          "circle",
          {
            r: 14,
            fill: "transparent",
          },
          element9,
        ),
          v27(
            "circle",
            {
              r: 5,
              class: "flow-line-node-handle",
              "vector-effect": "non-scaling-stroke",
            },
            element9,
          ),
          element9.addEventListener("pointerdown", (arg18) => {
            v12 ||
              arg18.button !== 0 ||
              v15 ||
              (arg18.preventDefault(),
              arg18.stopPropagation(),
              (v13 = arg17),
              (value3 = {
                index: arg17,
                id: arg18.pointerId,
                node: element9,
                origin: [...list[arg17]],
                raw: [...list[arg17]],
                axis: null,
                remembered: false,
              }),
              element9.setPointerCapture(arg18.pointerId),
              element9.focus(),
              fn3());
          }),
          element9.addEventListener("pointermove", (arg19) => {
            !value3 ||
              value3.id !== arg19.pointerId ||
              ((value3.raw = v31(arg19)), (v14 = arg19.shiftKey), fn5());
          }));
        const v39 = (arg20) => {
          value3?.id === arg20.pointerId &&
            (value3.remembered &&
              list[value3.index].every(
                (arg21, arg22) => Math.abs(arg21 - value3.origin[arg22]) < 1e-9,
              ) &&
              (list2.pop(), fn3()),
            (value3 = null),
            v33(null, null));
        };
        (element9.addEventListener("pointerup", v39),
          element9.addEventListener("pointercancel", v39),
          element9.addEventListener("lostpointercapture", v39),
          element9.addEventListener("focus", () => {
            ((v13 = arg17), fn3());
          }));
      }),
      fn2(),
      fn3());
  }
  function fn5() {
    const v40 = constrainFlowPoint2(value3.raw, value3.origin, v14, value3.axis, [
      clientWidth,
      clientHeight,
    ]);
    ((value3.axis = v40.axis),
      v40.point.some((arg23, arg24) => Math.abs(arg23 - list[value3.index][arg24]) > 1e-9) &&
        (value3.remembered || (v32(), (value3.remembered = true)),
        (list[value3.index] = v40.point),
        fn3()),
      v33(value3.origin, v40.axis));
  }
  function fn6() {
    list.length < 2 ||
      ((v12 = false), (value2 = null), (v13 = list.length - 1), fn4(), element3.focus());
  }
  function fn7() {
    v12 ||
      v13 < 0 ||
      list.length <= 2 ||
      (v32(), list.splice(v13, 1), (v13 = Math.min(v13, list.length - 1)), fn4());
  }
  function fn8() {
    if (v12) list.pop();
    else {
      const pop = list2.pop();
      if (!pop) return;
      ((list = pop.points),
        (v11.shape = pop.shape),
        (v17("[data-shape]").value = pop.shape),
        v44?.sync());
    }
    ((v13 = -1), fn4(), element3.focus());
  }
  ((v17("[data-draw]").onclick = () => {
    ((value = {
      points: list.map((arg25) => [...arg25]),
      shape: v11.shape,
      undo: list2.slice(),
    }),
      v32(),
      (v12 = true),
      (list = []),
      (v13 = -1),
      (value2 = null),
      fn4(),
      element3.focus());
  }),
    (v17("[data-finish]").onclick = fn6),
    (v17("[data-undo]").onclick = fn8),
    (v17("[data-delete]").onclick = fn7),
    (v17("[data-insert]").onclick = () => {
      if (v13 < 0 || list.length >= 256) return;
      v32();
      const v41 = list[v13],
        v42 = list[v13 + 1] || list[Math.max(0, v13 - 1)],
        v43 = v13 === list.length - 1 ? v13 : v13 + 1;
      (list.splice(
        v43,
        0,
        v41.map((arg26, arg27) => (arg26 + v42[arg27]) / 2),
      ),
        (v13 = v43),
        fn4());
    }),
    (v17("[data-shape]").value = v11.shape),
    (v17("[data-shape]").onchange = (arg28) => {
      v15 || (v32(), (v11.shape = arg28.target.value), fn3());
    }));
  const v44 = v6?.(v17("[data-shape]"));
  (element3.addEventListener("pointermove", (arg29) => {
    !v12 || v15 || ((value2 = v31(arg29)), (v14 = arg29.shiftKey), fn3());
  }),
    element3.addEventListener("pointerleave", () => {
      v12 && ((value2 = null), fn3());
    }),
    element3.addEventListener("click", (arg30) => {
      if (!v12 || v15 || arg30.button !== 0 || arg30.detail > 1 || list.length >= 256) return;
      const point = constrainFlowPoint2(v31(arg30), list.at(-1), arg30.shiftKey, null, [
        clientWidth,
        clientHeight,
      ]).point;
      (list.length &&
        Math.hypot(
          (point[0] - list.at(-1)[0]) * clientWidth,
          (point[1] - list.at(-1)[1]) * clientHeight,
        ) < 2) ||
        (list.push(point), (value2 = null), fn4(), element3.focus());
    }),
    element3.addEventListener("dblclick", (arg31) => {
      v12 && (arg31.preventDefault(), fn6());
    }));
  function fn9(arg32) {
    if ((arg32.stopImmediatePropagation(), v15)) {
      arg32.preventDefault();
      return;
    }
    if (v44?.keydown(arg32)) return;
    if (arg32.key === "Escape") {
      (arg32.preventDefault(),
        v12
          ? ((list = value.points),
            (v11.shape = value.shape),
            (list2 = value.undo),
            (v17("[data-shape]").value = v11.shape),
            v44?.sync(),
            (v12 = false),
            (v13 = -1),
            (value2 = null),
            fn4())
          : fn11());
      return;
    }
    if (
      (arg32.key === "Shift" && ((v14 = true), value3 ? fn5() : v12 && fn3()),
      arg32.target.closest("input,select,textarea"))
    )
      return;
    if ((arg32.metaKey || arg32.ctrlKey) && arg32.key.toLowerCase() === "z") {
      (arg32.preventDefault(), fn8());
      return;
    }
    (arg32.key === "Enter" && arg32.target === element3 && v12 && (arg32.preventDefault(), fn6()),
      ["Delete", "Backspace"].includes(arg32.key) &&
        arg32.target.closest("svg") &&
        (arg32.preventDefault(), v12 ? (list.pop(), fn4()) : fn7()));
    const v45 = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    }[arg32.key];
    if (v45 && !v12 && v13 >= 0 && arg32.target.closest("svg")) {
      arg32.preventDefault();
      const num4 = arg32.shiftKey ? 10 : 1,
        point2 = constrainFlowPoint2(
          [
            list[v13][0] + (v45[0] * num4) / clientWidth,
            list[v13][1] + (v45[1] * num4) / clientHeight,
          ],
          null,
          false,
        ).point;
      point2.some((arg33, arg34) => arg33 !== list[v13][arg34]) &&
        (v32(), (list[v13] = point2), fn3());
    }
  }
  function fn10(arg35) {
    (arg35.stopImmediatePropagation(),
      arg35.key === "Shift" && ((v14 = false), value3 ? fn5() : fn3()));
  }
  const v46 = () => {
      ((v14 = false), (value3 = null), v33(null, null));
    },
    resizeObserver = new ResizeObserver(() => {
      (fn1(), fn2());
    });
  (resizeObserver.observe(v1),
    resizeObserver.observe(v3),
    resizeObserver.observe(v17(".flow-line-draw-tools")));
  const mutationObserver = new MutationObserver(fn2);
  mutationObserver.observe(v1, {
    attributes: true,
    attributeFilter: ["style"],
  });
  const mutationObserver2 = new MutationObserver(() => {
    !v15 && (!v1.isConnected || !v2.isConnected || !element2.isConnected) && fn11();
  });
  (mutationObserver2.observe(v3, {
    childList: true,
    subtree: true,
  }),
    document.addEventListener("keydown", fn9, true),
    document.addEventListener("keyup", fn10, true),
    window.addEventListener("blur", v46),
    window.addEventListener("resize", fn2));
  function fn11() {
    v15 ||
      v16 ||
      ((v16 = true),
      v44?.destroy(),
      value4?.destroyFlowLine?.(),
      resizeObserver.disconnect(),
      mutationObserver.disconnect(),
      mutationObserver2.disconnect(),
      document.removeEventListener("keydown", fn9, true),
      document.removeEventListener("keyup", fn10, true),
      window.removeEventListener("blur", v46),
      window.removeEventListener("resize", fn2),
      (v2.style.visibility = visibility),
      map.forEach(({ element: v47, inert: v48 }) => (v47.inert = v48)),
      element2.remove(),
      v19(),
      (I = null),
      activeElement?.isConnected &&
        activeElement.focus({
          preventScroll: true,
        }),
      v10?.());
  }
  return (
    (v17("[data-cancel]").onclick = fn11),
    (v17("[data-save]").onclick = async () => {
      if (v15 || v12 || list.length < 2) return;
      if (
        list.every((arg36) => Math.hypot(arg36[0] - list[0][0], arg36[1] - list[0][1]) < 0.00001)
      ) {
        ((v17("[data-error]").hidden = false),
          (v17("[data-error]").textContent = "请至少绘制两个不同位置的节点。"));
        return;
      }
      const options =
        JSON.stringify(list) === stringify
          ? {
              properties: {
                points: v11.points,
                shape: v11.shape,
              },
            }
          : (() => {
              const v49 = v34();
              return {
                position: v49.position,
                properties: {
                  points: v49.points,
                  shape: v11.shape,
                },
              };
            })();
      ((v15 = true), fn3(), (v17(".flow-line-draw-tools").inert = true));
      try {
        (await v8?.(options), (v15 = false), fn11());
      } catch (v50) {
        ((v15 = false),
          (v17(".flow-line-draw-tools").inert = false),
          (v17("[data-error]").hidden = false),
          (v17("[data-error]").textContent = v50.message || "保存失败，请重试。"),
          v9?.(v50),
          fn3());
      }
    }),
    (I = {
      close: fn11,
    }),
    fn4(),
    element3.focus(),
    I
  );
}
