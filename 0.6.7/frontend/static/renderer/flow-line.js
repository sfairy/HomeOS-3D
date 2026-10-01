import {
  normalizeFlowLine as normalizeFlowLine2,
  flowLinePath as flowLinePath2,
  flowClamp as flowClamp2,
  flowLineMotion as flowLineMotion2,
} from "../flow-line-model.js?v=20260930-flow-line-sign-v1";
export function renderFlowLine(arg1, v1 = {}) {
  const v2 = normalizeFlowLine2(arg1.properties),
    element = document.createElement("div");
  ((element.className = "hb-flow-line"),
    element.setAttribute("aria-hidden", "true"),
    (element.style.opacity = String(v2.opacity)),
    (element.style.pointerEvents = "none"));
  const v3 = flowClamp2(arg1.position?.width, 1, 20000, 600),
    v4 = flowClamp2(arg1.position?.height, 1, 20000, 300),
    v5 = (arg2, arg3, v6 = element) => {
      const elementNS = document.createElementNS("http://www.w3.org/2000/svg", arg2);
      for (const [v7, v8] of Object.entries(arg3)) elementNS.setAttribute(v7, String(v8));
      return (v6.append(elementNS), elementNS);
    },
    v9 = v5("svg", {
      viewBox: "0 0 " + v3 + " " + v4,
      preserveAspectRatio: "none",
      focusable: "false",
    });
  if (v2.points.length < 2) return element;
  const v10 = flowLinePath2(v2.points, v2.shape, v3, v4, v2.radius),
    v11 = (arg4, v12 = v9) =>
      v5(
        "path",
        {
          d: v10,
          fill: "none",
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
          ...arg4,
        },
        v12,
      );
  v2.baseVisible &&
    v11({
      stroke: v2.baseColor,
      "stroke-width": v2.width,
      "stroke-opacity": v2.baseOpacity,
    });
  const max = Math.max(v2.spacing, v2.tail + v2.width * 2),
    v13 = v2.tail / 14,
    list = [],
    text = arg1.bindings?.entity?.entityId || "",
    v14 = (arg5) => (v1.runtimeStateReady?.() === false ? undefined : arg5);
  let v15 = flowLineMotion2(v2, v14(v1.states?.get(text))),
    direction = v15.direction;
  function fn1(arg6, v16 = () => 0, v17 = v9) {
    const element2 = v11(arg6, v17);
    return (
      element2.classList.add("hb-flow-line-stream"),
      list.push({
        node: element2,
        offset: v16,
      }),
      (element2.style.animationDuration = max / Math.max(1, v2.speed) + "s"),
      element2
    );
  }
  if (v2.glow > 0) {
    const v18 = v5(
      "g",
      {
        opacity: v2.glow / 100,
      },
      v9,
    );
    ((v18.style.filter = "blur(" + (1 + v2.glow / 16) + "px)"),
      fn1(
        {
          stroke: v2.color,
          "stroke-width": v2.width * 1.8,
          "stroke-dasharray": v2.tail + " " + (max - v2.tail),
        },
        (arg7) => (arg7 === 1 ? v2.tail : 0),
        v18,
      ));
  }
  for (let num = 13; num >= 0; num--)
    fn1(
      {
        stroke: v2.color,
        "stroke-width": v2.width * (1 - num / 20),
        "stroke-opacity": 0.08 + 0.9 * (1 - num / 14) ** 1.6,
        "stroke-dasharray": v13 + " " + (max - v13),
      },
      (arg8) => (arg8 === 1 ? (num + 1) * v13 : -num * v13),
    );
  v2.headVisible &&
    fn1({
      stroke: v2.headColor,
      "stroke-width": v2.width * (v2.effect === "energy" ? 1.15 : 0.85),
      "stroke-dasharray": "0.01 " + (max - 0.01),
    });
  let v19 = true,
    v20 = false;
  const v21 = () => {
    for (const { node: element3, offset: v22 } of list) {
      const v23 = v22(direction);
      (element3.style.setProperty("--flow-from", String(v23)),
        element3.style.setProperty("--flow-to", String(v23 - direction * max)));
    }
  };
  v21();
  let v24;
  const v25 = () => {
      if (v24 !== v15.running) {
        v24 = v15.running;
        for (const { node: v26 } of list) v26.style.visibility = v24 ? "" : "hidden";
      }
      element.style.setProperty(
        "--flow-play-state",
        !v20 && v15.running && !document.hidden && v19 && v1.animate !== false
          ? "running"
          : "paused",
      );
    },
    v27 = (arg9) => {
      v20 ||
        ((v15 = flowLineMotion2(v2, v14(arg9))),
        v15.running && v15.direction !== direction && ((direction = v15.direction), v21()),
        v25());
    };
  ((element.syncFlowLineState = v27),
    v2.controlMode === "entity-sign" && text && v1.registerRuntimeStateHandler?.(text, v27));
  const intersectionObserver =
    typeof IntersectionObserver == "function"
      ? new IntersectionObserver((arg10) => {
          ((v19 = arg10.some((arg11) => arg11.isIntersecting)), v25());
        })
      : null;
  (intersectionObserver?.observe(element),
    document.addEventListener("visibilitychange", v25),
    v25());
  const v28 = () => {
    v20 ||
      ((v20 = true),
      intersectionObserver?.disconnect(),
      document.removeEventListener("visibilitychange", v25),
      element.style.setProperty("--flow-play-state", "paused"));
  };
  return ((element.destroyFlowLine = v28), v1.cleanup?.(v28), element);
}
