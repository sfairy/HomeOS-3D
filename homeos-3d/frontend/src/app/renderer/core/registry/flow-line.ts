import {
  normalizeFlowLine as normalizeFlowLine2,
  flowLinePath as flowLinePath2,
  flowClamp as flowClamp2,
  flowLineMotion as flowLineMotion2,
} from "../../../shared/flow-line-model";
import { domSvgNode } from "@app/utils/dom-factory";
/** 流水线条渲染时由 registry 注入的宿主能力。 */
type FlowLineRuntimeHost = {
  /** 运行期状态是否已就绪；显式返回 false 时先不接状态。 */
  runtimeStateReady?: () => boolean;
  /** 实体 id → 运行期状态。 */
  states?: Map<string, any>;
  /** 显式关闭流动动画。 */
  animate?: boolean;
  registerRuntimeStateHandler?: (entityId: string, handler: (state: any) => void) => void;
  cleanup?: (destroy: () => void) => void;
};

/** 流水线条元素上挂载的运行时方法。 */
type FlowLineElement = HTMLDivElement & {
  syncFlowLineState?: (runtimeState: any) => void;
  destroyFlowLine?: () => void;
};

export function renderFlowLine(
  component: any,
  runtimeHost: FlowLineRuntimeHost = {},
) {
  const settings = normalizeFlowLine2(component.properties),
    element = document.createElement("div") as FlowLineElement;
  ((element.className = "hb-flow-line"),
    element.setAttribute("aria-hidden", "true"),
    (element.style.opacity = String(settings.opacity)),
    (element.style.pointerEvents = "none"));
  const canvasWidth = flowClamp2(component.position?.width, 1, 20000, 600),
    canvasHeight = flowClamp2(component.position?.height, 1, 20000, 300),
    createSvgNode = (tagName, attributes, parentElement = element) =>
      domSvgNode(document, tagName, attributes, parentElement),
    svgElement = createSvgNode("svg", {
      viewBox: "0 0 " + canvasWidth + " " + canvasHeight,
      preserveAspectRatio: "none",
      focusable: "false",
    });
  if (settings.points.length < 2) return element;
  const pathGeometry = flowLinePath2(
      settings.points,
      settings.shape,
      canvasWidth,
      canvasHeight,
      settings.radius,
    ),
    createPathElement = (pathAttributes, targetSvg = svgElement) =>
      createSvgNode(
        "path",
        {
          d: pathGeometry,
          fill: "none",
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
          ...pathAttributes,
        },
        targetSvg,
      );
  settings.baseVisible &&
    createPathElement({
      stroke: settings.baseColor,
      "stroke-width": settings.width,
      "stroke-opacity": settings.baseOpacity,
    });
  const max = Math.max(settings.spacing, settings.tail + settings.width * 2),
    segmentLength = settings.tail / 14,
    list: { node: SVGElement; offset: (phase: number) => number }[] = [],
    text = component.bindings?.entity?.entityId || "",
    resolveRuntimeState = (guardRuntimeState) =>
      runtimeHost.runtimeStateReady?.() === false ? undefined : guardRuntimeState;
  let motion = flowLineMotion2(settings, resolveRuntimeState(runtimeHost.states?.get(text))),
    direction = motion.direction;
  function addStream(
    strokeAttributes,
    offsetForPhase: (phase: number) => number = () => 0,
    streamParent = svgElement,
  ) {
    const streamPathElement = createPathElement(strokeAttributes, streamParent);
    return (
      streamPathElement.classList.add("hb-flow-line-stream"),
      list.push({
        node: streamPathElement,
        offset: offsetForPhase,
      }),
      (streamPathElement.style.animationDuration = max / Math.max(1, settings.speed) + "s"),
      streamPathElement
    );
  }
  if (settings.glow > 0) {
    const glowGroup = createSvgNode(
      "g",
      {
        opacity: settings.glow / 100,
      },
      svgElement,
    );
    ((glowGroup.style.filter = "blur(" + (1 + settings.glow / 16) + "px)"),
      addStream(
        {
          stroke: settings.color,
          "stroke-width": settings.width * 1.8,
          "stroke-dasharray": settings.tail + " " + (max - settings.tail),
        },
        (glowPhase) => (glowPhase === 1 ? settings.tail : 0),
        glowGroup,
      ));
  }
  for (let num = 13; num >= 0; num--)
    addStream(
      {
        stroke: settings.color,
        "stroke-width": settings.width * (1 - num / 20),
        "stroke-opacity": 0.08 + 0.9 * (1 - num / 14) ** 1.6,
        "stroke-dasharray": segmentLength + " " + (max - segmentLength),
      },
      (ringPhase) => (ringPhase === 1 ? (num + 1) * segmentLength : -num * segmentLength),
    );
  settings.headVisible &&
    addStream({
      stroke: settings.headColor,
      "stroke-width": settings.width * (settings.effect === "energy" ? 1.15 : 0.85),
      "stroke-dasharray": "0.01 " + (max - 0.01),
    });
  let isVisible = true,
    isDestroyed = false;
  const layoutStreams = () => {
    for (const { node: streamNode, offset: offsetFunction } of list) {
      const streamOffset = offsetFunction(direction);
      (streamNode.style.setProperty("--flow-from", String(streamOffset)),
        streamNode.style.setProperty("--flow-to", String(streamOffset - direction * max)));
    }
  };
  layoutStreams();
  let lastRunning;
  const refreshPlayState = () => {
      if (lastRunning !== motion.running) {
        lastRunning = motion.running;
        for (const { node: listedNode } of list)
          listedNode.style.visibility = lastRunning ? "" : "hidden";
      }
      element.style.setProperty(
        "--flow-play-state",
        !isDestroyed &&
          motion.running &&
          !document.hidden &&
          isVisible &&
          runtimeHost.animate !== false
          ? "running"
          : "paused",
      );
    },
    syncState = (runtimeState) => {
      isDestroyed ||
        ((motion = flowLineMotion2(settings, resolveRuntimeState(runtimeState))),
        motion.running &&
          motion.direction !== direction &&
          ((direction = motion.direction), layoutStreams()),
        refreshPlayState());
    };
  ((element.syncFlowLineState = syncState),
    settings.controlMode === "entity-sign" &&
      text &&
      runtimeHost.registerRuntimeStateHandler?.(text, syncState));
  const intersectionObserver =
    typeof IntersectionObserver == "function"
      ? new IntersectionObserver((observerEntries) => {
          ((isVisible = observerEntries.some((observerEntry) => observerEntry.isIntersecting)),
            refreshPlayState());
        })
      : null;
  (intersectionObserver?.observe(element),
    document.addEventListener("visibilitychange", refreshPlayState),
    refreshPlayState());
  const destroyFlowLine = () => {
    isDestroyed ||
      ((isDestroyed = true),
      intersectionObserver?.disconnect(),
      document.removeEventListener("visibilitychange", refreshPlayState),
      element.style.setProperty("--flow-play-state", "paused"));
  };
  return (
    (element.destroyFlowLine = destroyFlowLine),
    runtimeHost.cleanup?.(destroyFlowLine),
    element
  );
}
