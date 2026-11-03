/**
 * 自定义窗型绘制器（0.8.4）。
 *
 * 三段式：左侧 SVG 正立面（画分隔线 / 选窗格）、中间 3D 预览（看开合）、右侧检查器
 * （改尺寸与窗型）。所有修改都经过 {@link WindowHistory}：`change()` 里改坏了就整体回滚，
 * 所以 UI 永远拿得到一份通过 `validateWindowRecord` 的快照。
 *
 * 拖动分隔线是唯一「不进撤销栈直到松手」的操作：按下时记一份 before，移动时直接改
 * 树、松手才 `commit(before)` —— 否则每帧都会压一条历史。
 */

import { normalizeModelRemark } from "@app/shared/model-remarks";
import {
  disposeStudioSelects,
  initializeNumberInputs,
  initializeStudioSelects,
  syncStudioSelect,
} from "@app/3d-studio/authoring/ui/studio-widgets";

import { WINDOW_DESIGNER_TEMPLATE } from "./designer-template";
import {
  WindowHistory,
  changeKind,
  changePanelCount,
  cloneWindow,
  createWindowDraft,
  entries,
  find,
  isHung,
  leaf,
  mergeWindowSegment,
  moveSplit,
  resizeLeaf,
  split,
  validateWindowRecord,
  windowOpeningRemark,
  windowSplitSegment,
  type WindowLeaf,
  type WindowRecord,
  type WindowSplit,
} from "./layout";
import { WindowPreview, createPreviewMotion } from "./preview";
import { openWindowTutorial } from "./tutorial";

/** 窗型名称（检查器 / 窗格列表 / 提示文案共用）。 */
const WINDOW_KIND_LABELS: Record<string, string> = {
  fixed: "固定玻璃",
  casement: "平开窗",
  "top-hung": "上悬窗",
  "bottom-hung": "下悬窗",
  sliding: "推拉窗组",
};

const CASEMENT_KINDS = ["casement", "top-hung", "bottom-hung"] as const;

/** 画布留白：四周各留一圈给尺寸标注。 */
const CANVAS_PADDING_X = 88;
const CANVAS_PADDING_Y = 90;

/** 拖动分隔线时「吸附到正中」的像素阈值。 */
const CENTER_SNAP_PIXELS = 9;

/** 有未应用的修改时，第一次关闭只提醒，这么久内再关一次才真的丢弃。 */
const CLOSE_CONFIRM_MS = 4000;

export interface WindowDesignerOptions {
  /** 要编辑的窗户（含 `windowDesign`）。 */
  record: WindowRecord;
  /** 材质色板，用于 3D 预览。 */
  style: any;
  interiorSide?: 1 | -1;
  /** 应用窗型。返回 `false` 表示「先别关弹窗」（例如后端拒绝）。 */
  onApply: (draft: WindowRecord) => unknown;
  onClose?: () => void;
}

export interface WindowDesignerHandle {
  close: () => void;
  hasPendingChange: () => boolean;
  readonly isOpen: boolean;
}

/** 打开窗型绘制器。 */
export function openWindowDesigner({
  record,
  style,
  interiorSide = 1,
  onApply,
  onClose = () => {},
}: WindowDesignerOptions): WindowDesignerHandle {
  const draft = createWindowDraft(record, interiorSide);
  const host = document.createElement("div");
  host.innerHTML = WINDOW_DESIGNER_TEMPLATE;
  const dialog = host.firstElementChild as HTMLDialogElement;
  document.body.append(dialog);
  const query = (name: string) => dialog.querySelector<HTMLElement>("#wd-" + name)!;

  let history = new WindowHistory(draft);
  let selectedSashId = entries(draft).find((entry) => !entry.node.children)!.node.id;
  let segmentRatio = 0.5;
  let tool: "select" | "x" | "y" = "select";
  let tutorial: { close: () => void } | null = null;
  let preview: WindowPreview | null = null;
  let motion: ReturnType<typeof createPreviewMotion> | null = null;
  let drag:
    | { kind: "move"; id: string; pointerId: number; before: WindowRecord }
    | { kind: "draw"; id: string; axis: "x" | "y"; pointerId: number }
    | null = null;
  let drawPreview: { id: string; axis: "x" | "y"; position: number } | null = null;
  let canvasScale: { scale: number; ox: number; oy: number; w: number; h: number } | null = null;
  let closed = false;
  /** 上次「确认关闭」的时间戳；0 表示当前没有等待确认的关闭请求。 */
  let closeArmedAt = 0;

  const isDirty = () => !closed && JSON.stringify(history.value) !== JSON.stringify(draft);
  const value = () => history.value;
  const currentEntry = () => find(value(), selectedSashId);
  const currentSplit = () => {
    const entry = find(value(), selectedSashId);
    return entry && entry.node.children ? (entry.node as WindowSplit) : null;
  };

  function notify(message: string): void {
    const notice = query("notice");
    notice.textContent = message;
    notice.hidden = false;
  }

  function ensureSelection(): void {
    if (find(value(), selectedSashId)) return;
    const firstLeaf = entries(value()).find((entry) => !entry.node.children);
    if (firstLeaf) selectedSashId = firstLeaf.node.id;
  }

  /**
   * 结束进行中的拖动：把树恢复到按下前的快照。返回是否真的取消了一次拖动。
   * 画分隔线的拖动没有动过树，直接丢掉预览线即可。
   */
  function suspendDrag(): boolean {
    if (!drag) return false;
    const active = drag;
    drag = null;
    drawPreview = null;
    if (active.kind === "move") history.value = active.before;
    const drawing = query("drawing") as unknown as SVGSVGElement;
    drawing.hasPointerCapture?.(active.pointerId) && drawing.releasePointerCapture(active.pointerId);
    return true;
  }

  function close(): void {
    if (closed) return;
    closed = true;
    tutorial?.close();
    disposeStudioSelects(dialog);
    preview?.dispose();
    motion?.dispose();
    resizeObserver.disconnect();
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    window.removeEventListener("pagehide", handlePageHide);
    window.removeEventListener("pageshow", handlePageShow);
    preview = null;
    motion = null;
    tutorial = null;
    history = null as unknown as WindowHistory;
    dialog.close();
    dialog.remove();
    onClose();
  }

  /**
   * 关闭前的最后一道门：绘制器里的修改只有点「应用窗型」才会进文档，
   * 一次 Esc / 误点 × 就会把整场设计悄无声息地丢干净（绘制器没有自动保存）。
   * 所以有未应用的修改时先「武装」一次（文案改口 + 提示条），再关才真的丢。
   */
  function requestClose(): void {
    if (!isDirty()) return close();
    const now = Date.now();
    if (now - closeArmedAt < CLOSE_CONFIRM_MS) return close();
    closeArmedAt = now;
    const status = query("draft-status");
    const cancel = query("cancel");
    status.textContent = "有未应用的修改：再点一次「放弃修改」/ Esc 才会丢弃。";
    cancel.textContent = "放弃修改";
    notify("修改尚未应用。要保留请点「应用窗型」，要丢弃请再点一次关闭。");
    window.setTimeout(() => {
      if (closed || closeArmedAt !== now) return;
      closeArmedAt = 0;
      status.textContent = "修改尚未应用";
      cancel.textContent = "取消";
    }, CLOSE_CONFIRM_MS);
  }

  function change(mutate: (window: WindowRecord) => void, refit = false): void {
    suspendDrag();
    try {
      history.change(mutate);
      query("notice").hidden = true;
      render(refit);
    } catch (error) {
      render();
      notify((error as Error).message);
    }
  }

  /** 整屏刷新：画布 → 检查器 → 窗格列表 → 预览 → 控件状态。 */
  function render(refit = false): void {
    if (!history) return;
    motion?.stop();
    ensureSelection();
    drawCanvas();
    renderInspector();
    renderCellList();
    dialog.querySelectorAll("select").forEach((select) => syncStudioSelect(select));
    preview?.setRecord(value(), selectedSashId, refit);
    resetPreviewControls();

    const hasMovable =
      !!preview &&
      entries(value()).some((entry) => !entry.node.children && (entry.node as WindowLeaf).kind !== "fixed");
    for (const controlId of ["preview-play", "preview-open", "preview-close", "opening"])
      (query(controlId) as HTMLButtonElement).disabled = !hasMovable;
    (query("preview-stop") as HTMLButtonElement).disabled = true;
    if (hasMovable) {
      if (query("motion-status").textContent === "设置可开启窗扇后可预览动画")
        query("motion-status").textContent = "预览就绪 · 不控制设备";
    } else query("motion-status").textContent = "设置可开启窗扇后可预览动画";

    (query("undo") as HTMLButtonElement).disabled = !history.past.length;
    (query("redo") as HTMLButtonElement).disabled = !history.future.length;
    (query("delete-split") as HTMLButtonElement).disabled = !windowSplitSegment(
      value(),
      selectedSashId,
      segmentRatio,
    )?.canMerge;
    dialog.querySelectorAll<HTMLElement>("[data-tool]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.tool === tool));
    });
    query("tool-hint").textContent =
      tool === "select"
        ? "点击选择线段可局部删除；拖动仍调整整条分隔。"
        : `在目标区域中点击或拖动，画一条${tool === "x" ? "竖" : "横"}向分隔线。`;
    query("draft-status").textContent = isDirty() ? "修改尚未应用" : "绘制后点击应用";
  }

  /** 检查器：分隔线只显示位置与删除说明，窗格显示完整开合参数。 */
  function renderInspector(): void {
    const entry = currentEntry();
    if (!entry) return;
    const node = entry.node;
    (query("draft-width") as HTMLInputElement).value = String(Math.round(value().width * 1000));
    (query("draft-height") as HTMLInputElement).value = String(Math.round(value().height * 1000));
    query("leaf-fields").hidden = !!node.children;
    query("split-fields").hidden = !node.children;

    if (node.children) {
      const splitNode = node as WindowSplit;
      query("selection-name").textContent = splitNode.axis === "x" ? "竖向分隔线" : "横向分隔线";
      query("split-label").firstChild!.textContent =
        splitNode.axis === "x" ? "距本区左边 / mm" : "距本区顶边 / mm";
      (query("split-position") as HTMLInputElement).value = String(
        Math.round((splitNode.axis === "x" ? entry.width : entry.height) * splitNode.ratio * 1000),
      );
      query("split-delete-note").textContent =
        windowSplitSegment(value(), selectedSashId, segmentRatio)?.reason || "请选择一段分隔线。";
      return;
    }

    const leafNode = node as WindowLeaf;
    const leaves = entries(value()).filter((candidate) => !candidate.node.children);
    query("selection-name").textContent =
      "窗格 " + (leaves.findIndex((candidate) => candidate.node.id === selectedSashId) + 1);
    (query("leaf-kind") as HTMLSelectElement).value = leafNode.kind;
    (query("leaf-width") as HTMLInputElement).value = String(Math.round(entry.width * 1000));
    (query("leaf-height") as HTMLInputElement).value = String(Math.round(entry.height * 1000));
    // 某个方向没有分隔线时，单独改这个窗格的尺寸没有意义 —— 置灰而不是让它报错。
    for (const axis of ["x", "y"] as const) {
      (query(axis === "x" ? "leaf-width" : "leaf-height") as HTMLInputElement).disabled =
        !entry.ancestors.some((ancestorId) => (find(value(), ancestorId)!.node as WindowSplit).axis === axis);
    }
    const casement = (CASEMENT_KINDS as readonly string[]).includes(leafNode.kind);
    query("casement-fields").hidden = !casement;
    query("sliding-fields").hidden = leafNode.kind !== "sliding";
    query("side-hinge-field").hidden = isHung(leafNode.kind);
    query("hung-hinge-field").hidden = !isHung(leafNode.kind);
    (query("hung-hinge") as HTMLInputElement).value = leafNode.kind === "top-hung" ? "顶部" : "底部";
    (query("angle") as HTMLInputElement).max = isHung(leafNode.kind) ? "90" : "120";
    (query("hinge") as HTMLSelectElement).value = leafNode.hinge;
    (query("swing") as HTMLSelectElement).value = leafNode.swing;
    (query("angle") as HTMLInputElement).value = String(leafNode.angle);
    (query("slide-count") as HTMLSelectElement).value = String(leafNode.count);
    (query("slide-direction") as HTMLSelectElement).value = leafNode.slide;
    query("default-opening-field").hidden = leafNode.kind === "fixed";
    (query("default-opening") as HTMLInputElement).value = String(leafNode.defaultOpening ?? 0);
    query("angle-field").hidden = !casement;
    query("opening-fields").classList.toggle("field-pair", casement);

    const remarksHost = query("sash-remarks");
    remarksHost.replaceChildren();
    remarksHost.hidden = leafNode.kind === "fixed";
    const label = document.createElement("label");
    const input = document.createElement("input");
    label.textContent = leafNode.kind === "sliding" ? "推拉窗组备注" : "窗扇备注";
    input.maxLength = 60;
    input.value = windowOpeningRemark(value(), leafNode);
    input.placeholder = "用于安防绑定时识别窗户";
    input.setAttribute("aria-label", label.textContent);
    input.addEventListener("change", () =>
      change((window) => {
        const remarks = (window.windowDesign!.sashRemarks ||= {});
        const normalized = normalizeModelRemark(input.value);
        // 推拉组即使清空也保留一个空键：这代表「整组共用一份备注」，
        // 删掉键会让下面那条「原窗扇备注仍保留」的提示反复出现。
        if (normalized || leafNode.kind === "sliding") remarks[leafNode.id] = normalized;
        else delete remarks[leafNode.id];
      }),
    );
    label.append(input);
    remarksHost.append(label);

    if (leafNode.kind === "sliding") {
      const hint = document.createElement("p");
      hint.className = "muted";
      hint.textContent = "整组共用一份备注，在 3D 安防中添加一次即可。";
      remarksHost.append(hint);
      const panelRemarks = leafNode.panelIds
        .map((panelId) => value().windowDesign!.sashRemarks?.[panelId]?.trim())
        .filter(Boolean) as string[];
      const hasOwnRemark = Object.hasOwn(value().windowDesign!.sashRemarks || {}, leafNode.id);
      if (new Set(panelRemarks).size > 1 && !hasOwnRemark) {
        const note = document.createElement("p");
        note.className = "muted";
        note.textContent = "原窗扇备注：" + panelRemarks.join("；") + "。可在上方填写整组备注，原文字仍保留。";
        remarksHost.append(note);
      }
    }
  }

  /** 窗格按钮条：小窗格里文字太小，用它兜底选择。 */
  function renderCellList(): void {
    const leaves = entries(value()).filter((entry) => !entry.node.children);
    query("cell-count").textContent = leaves.length + " 个分格";
    query("cell-list").replaceChildren(
      ...leaves.map((entry, index) => {
        const button = document.createElement("button");
        button.textContent = index + 1 + " · " + WINDOW_KIND_LABELS[(entry.node as WindowLeaf).kind];
        button.setAttribute("aria-pressed", String(entry.node.id === selectedSashId));
        button.onclick = () => {
          suspendDrag();
          selectedSashId = entry.node.id;
          tool = "select";
          render();
        };
        return button;
      }),
    );
  }

  function svgElement(tag: string, attributes: Record<string, string | number> = {}, text?: string) {
    const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [name, attributeValue] of Object.entries(attributes))
      element.setAttribute(name, String(attributeValue));
    if (text !== undefined) element.textContent = text;
    (query("drawing") as unknown as SVGSVGElement).append(element);
    return element;
  }

  function svgText(
    x: number,
    y: number,
    text: string,
    attributes: Record<string, string | number> = {},
  ) {
    return svgElement(
      "text",
      { x, y, fill: "#a7b7c4", "font-size": 11, "text-anchor": "middle", ...attributes },
      text,
    );
  }

  /** 画正立面：窗格 → 开合示意 → 外框 → 分隔线（分隔线最后画，压在窗格上方便点选）。 */
  function drawCanvas(): void {
    if (!history || !dialog.open) return;
    const drawing = query("drawing") as unknown as SVGSVGElement;
    const bounds = drawing.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const current = value();
    const scale = Math.max(
      0.1,
      Math.min((bounds.width - CANVAS_PADDING_X) / current.width, (bounds.height - CANVAS_PADDING_Y) / current.height),
    );
    const offsetX = (bounds.width - current.width * scale) / 2;
    const offsetY = (bounds.height - current.height * scale) / 2;
    canvasScale = { scale, ox: offsetX, oy: offsetY, w: bounds.width, h: bounds.height };
    drawing.setAttribute("viewBox", `0 0 ${bounds.width} ${bounds.height}`);
    drawing.replaceChildren();
    svgElement("title", {}, "窗户正立面。分格可通过下方按钮选择。");

    const allEntries = entries(current);
    const leaves = allEntries.filter((entry) => !entry.node.children);
    for (const [index, entry] of leaves.entries()) {
      const leafNode = entry.node as WindowLeaf;
      const x = offsetX + entry.x * scale;
      const y = offsetY + entry.y * scale;
      const width = entry.width * scale;
      const height = entry.height * scale;
      const selected = entry.node.id === selectedSashId;
      svgElement("rect", {
        x: x + 2,
        y: y + 2,
        width: Math.max(1, width - 4),
        height: Math.max(1, height - 4),
        fill: selected ? "#48321f" : "#18303b",
        stroke: selected ? "#ff9d2e" : "#385966",
        "stroke-width": selected ? 2 : 1,
        "data-cell": entry.node.id,
        class: "cell-shape",
      });
      if (leafNode.kind === "casement") {
        // 窗扇开启示意：铰链在左就从左边画 V 形，在右就镜像。
        const hingeLeft = leafNode.hinge === "left";
        const hingeX = hingeLeft ? x + 7 : x + width - 7;
        const farX = hingeLeft ? x + width - 7 : x + 7;
        svgElement("path", {
          d: `M ${hingeX} ${y + 7} L ${farX} ${y + height / 2} L ${hingeX} ${y + height - 7}`,
          fill: "none",
          stroke: selected ? "#cf8d4c" : "#6592a5",
          "stroke-width": 1,
          "stroke-dasharray": leafNode.swing === "out" ? "4 3" : "none",
          "pointer-events": "none",
        });
      }
      if (isHung(leafNode.kind)) {
        const topHung = leafNode.kind === "top-hung";
        const hingeY = topHung ? y + 7 : y + height - 7;
        const farY = topHung ? y + height - 7 : y + 7;
        svgElement("path", {
          d: `M ${x + 7} ${hingeY} L ${x + width / 2} ${farY} L ${x + width - 7} ${hingeY}`,
          fill: "none",
          stroke: selected ? "#cf8d4c" : "#6592a5",
          "stroke-width": 1,
          "stroke-dasharray": leafNode.swing === "out" ? "4 3" : "none",
          "pointer-events": "none",
        });
        if (width > 75 && height > 85)
          svgText(x + width / 2, topHung ? y + 22 : y + height - 14, topHung ? "顶铰链" : "底铰链", {
            "font-size": 10,
            "pointer-events": "none",
          });
      }
      if (leafNode.kind === "sliding") {
        for (let panelIndex = 1; panelIndex < leafNode.count; panelIndex += 1)
          svgElement("line", {
            x1: x + (width * panelIndex) / leafNode.count,
            y1: y + 5,
            x2: x + (width * panelIndex) / leafNode.count,
            y2: y + height - 5,
            stroke: "#6a8a97",
            "pointer-events": "none",
          });
        svgText(x + width / 2, y + height * 0.7, leafNode.slide === "right" ? "→" : "←", {
          "font-size": 19,
          "pointer-events": "none",
        });
      }
      svgText(x + width / 2, y + height / 2 - 5, "窗格 " + (index + 1), {
        fill: selected ? "#ffd4a7" : "#d0e5ed",
        "pointer-events": "none",
      });
      if (width > 65 && height > 55)
        svgText(
          x + width / 2,
          y + height / 2 + 14,
          `${Math.round(entry.width * 1000)} × ${Math.round(entry.height * 1000)}`,
          { "font-size": 10, "pointer-events": "none" },
        );
    }

    svgElement("rect", {
      x: offsetX,
      y: offsetY,
      width: current.width * scale,
      height: current.height * scale,
      fill: "none",
      stroke: "#94a9b6",
      "stroke-width": 4,
      "pointer-events": "none",
    });

    for (const entry of allEntries.filter((candidate) => candidate.node.children)) {
      const splitNode = entry.node as WindowSplit;
      const x = offsetX + entry.x * scale;
      const y = offsetY + entry.y * scale;
      const geometry =
        splitNode.axis === "x"
          ? {
              x1: x + entry.width * splitNode.ratio * scale,
              x2: x + entry.width * splitNode.ratio * scale,
              y1: y,
              y2: y + entry.height * scale,
            }
          : {
              x1: x,
              x2: x + entry.width * scale,
              y1: y + entry.height * splitNode.ratio * scale,
              y2: y + entry.height * splitNode.ratio * scale,
            };
      svgElement("line", { ...geometry, stroke: "#94a9b6", "stroke-width": 4, "pointer-events": "none" });
      if (selectedSashId === splitNode.id) {
        const segment = windowSplitSegment(current, splitNode.id, segmentRatio);
        if (segment)
          svgElement("line", {
            ...(segment.vertical
              ? {
                  x1: offsetX + segment.coordinate * scale,
                  x2: offsetX + segment.coordinate * scale,
                  y1: offsetY + segment.start * scale,
                  y2: offsetY + segment.end * scale,
                }
              : {
                  x1: offsetX + segment.start * scale,
                  x2: offsetX + segment.end * scale,
                  y1: offsetY + segment.coordinate * scale,
                  y2: offsetY + segment.coordinate * scale,
                }),
            stroke: "#ff9d2e",
            "stroke-width": 5,
            "pointer-events": "none",
          });
      }
      svgElement("line", {
        ...geometry,
        "data-split": splitNode.id,
        class: "split-hit " + (splitNode.axis === "y" ? "horizontal" : ""),
      });
    }

    svgText(bounds.width / 2, offsetY - 18, Math.round(current.width * 1000) + " mm");
    svgText(bounds.width / 2, offsetY + current.height * scale + 24, "窗户正立面");
    svgText(
      offsetX + current.width * scale + 18,
      bounds.height / 2,
      String(Math.round(current.height * 1000)),
      {
        transform: `rotate(90 ${offsetX + current.width * scale + 18} ${bounds.height / 2})`,
      },
    );

    if (drawPreview) {
      const target = find(current, drawPreview.id);
      if (target) {
        const position = drawPreview.position;
        const geometry =
          drawPreview.axis === "x"
            ? {
                x1: offsetX + (target.x + position) * scale,
                x2: offsetX + (target.x + position) * scale,
                y1: offsetY + target.y * scale,
                y2: offsetY + (target.y + target.height) * scale,
              }
            : {
                x1: offsetX + target.x * scale,
                x2: offsetX + (target.x + target.width) * scale,
                y1: offsetY + (target.y + position) * scale,
                y2: offsetY + (target.y + position) * scale,
              };
        svgElement("line", {
          ...geometry,
          stroke: "#ff9d2e",
          "stroke-width": 2,
          "stroke-dasharray": "5 4",
          "pointer-events": "none",
        });
      }
    }
  }

  /** 指针坐标 → 窗型本地坐标（米）。 */
  function pointOf(event: PointerEvent): { x: number; y: number } {
    const bounds = (query("drawing") as unknown as SVGSVGElement).getBoundingClientRect();
    const scale = canvasScale!;
    return {
      x: (event.clientX - bounds.left - scale.ox) / scale.scale,
      y: (event.clientY - bounds.top - scale.oy) / scale.scale,
    };
  }

  function hitTestLeaf(point: { x: number; y: number }) {
    return entries(value()).find(
      (entry) =>
        !entry.node.children &&
        point.x >= entry.x &&
        point.x <= entry.x + entry.width &&
        point.y >= entry.y &&
        point.y <= entry.y + entry.height,
    );
  }

  /** 分隔线落点：靠近区域中点就吸附到中点，否则按 1 cm 取整。 */
  function snapPosition(
    entry: { x: number; y: number; width: number; height: number },
    point: { x: number; y: number },
    axis: "x" | "y",
  ): number {
    const delta = axis === "x" ? point.x - entry.x : point.y - entry.y;
    const extent = axis === "x" ? entry.width : entry.height;
    return Math.abs(delta - extent / 2) * canvasScale!.scale < CENTER_SNAP_PIXELS
      ? extent / 2
      : Math.round(delta / 0.01) * 0.01;
  }

  const drawing = query("drawing") as unknown as SVGSVGElement;

  drawing.addEventListener("pointerdown", (event) => {
    if (!history || drag || event.button !== 0 || event.isPrimary === false || !canvasScale) return;
    const point = pointOf(event);
    const splitTarget = (event.target as Element).closest("[data-split]") as HTMLElement | null;
    if (tool === "select" && splitTarget) {
      selectedSashId = splitTarget.dataset.split!;
      const entry = find(value(), selectedSashId)!;
      segmentRatio =
        (entry.node as WindowSplit).axis === "x"
          ? (point.y - entry.y) / entry.height
          : (point.x - entry.x) / entry.width;
      drag = { kind: "move", id: selectedSashId, pointerId: event.pointerId, before: cloneWindow(value()) };
      render();
      drawing.setPointerCapture(event.pointerId);
      return;
    }
    const leafEntry = hitTestLeaf(point);
    if (!leafEntry) return;
    selectedSashId = leafEntry.node.id;
    if (tool === "select") {
      render();
      return;
    }
    drag = { kind: "draw", id: selectedSashId, axis: tool, pointerId: event.pointerId };
    drawPreview = { id: selectedSashId, axis: tool, position: snapPosition(leafEntry, point, tool) };
    drawCanvas();
    renderInspector();
    drawing.setPointerCapture(event.pointerId);
  });

  drawing.addEventListener("pointermove", (event) => {
    if (!history || !canvasScale || event.isPrimary === false) return;
    if (drag && event.pointerId !== drag.pointerId) return;
    const point = pointOf(event);
    if (drag?.kind === "move") {
      const entry = find(value(), drag.id);
      if (!entry?.node.children) return;
      try {
        moveSplit(value(), entry.node.id, snapPosition(entry, point, (entry.node as WindowSplit).axis));
      } catch {
        // 拖到装不下的位置：保持上一个合法位置，不打断拖动。
      }
      drawCanvas();
      renderInspector();
      preview?.setRecord(value(), selectedSashId);
      return;
    }
    if (tool !== "select") {
      const target = drag ? find(value(), drag.id) : hitTestLeaf(point);
      drawPreview = target ? { id: target.node.id, axis: tool, position: snapPosition(target, point, tool) } : null;
      drawCanvas();
    }
  });

  drawing.addEventListener("pointerup", (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const active = drag;
    drag = null;
    drawPreview = null;
    drawing.hasPointerCapture(event.pointerId) && drawing.releasePointerCapture(event.pointerId);
    if (active.kind === "move") {
      history.commit(active.before);
      render();
      return;
    }
    const point = pointOf(event);
    const entry = find(value(), active.id);
    if (!entry) return;
    change((window) => {
      const created = split(window, active.id, active.axis, snapPosition(entry, point, active.axis));
      if (created) selectedSashId = created;
    });
  });

  for (const eventName of ["pointercancel", "lostpointercapture"] as const)
    drawing.addEventListener(eventName, (event) => {
      if (drag?.pointerId === (event as PointerEvent).pointerId && suspendDrag()) render();
    });
  drawing.addEventListener("pointerleave", () => {
    if (drag) return;
    drawPreview = null;
    drawCanvas();
  });

  const resizeObserver = new ResizeObserver(() => drawCanvas());
  resizeObserver.observe(drawing.parentElement!);

  dialog.querySelectorAll<HTMLElement>("[data-tool]").forEach((button) => {
    button.onclick = () => {
      suspendDrag();
      tool = button.dataset.tool as typeof tool;
      drawPreview = null;
      render();
    };
  });
  query("undo").onclick = () => {
    suspendDrag();
    history.undo();
    render();
  };
  query("redo").onclick = () => {
    suspendDrag();
    history.redo();
    render();
  };
  query("delete-split").onclick = () =>
    change((window) => {
      selectedSashId = mergeWindowSegment(window, selectedSashId, segmentRatio);
    });
  query("blank").onclick = () =>
    change((window) => {
      window.windowDesign!.layout = leaf();
      selectedSashId = window.windowDesign!.layout.id;
    });

  for (const dimension of ["width", "height"] as const)
    query("draft-" + dimension).addEventListener("change", () =>
      change((window) => {
        window[dimension] = Number((query("draft-" + dimension) as HTMLInputElement).value) / 1000;
      }, true),
    );
  query("leaf-kind").addEventListener("change", () =>
    change((window) => changeKind(currentEntry()!.node as WindowLeaf, (query("leaf-kind") as HTMLSelectElement).value as any)),
  );
  for (const [field, axis] of [
    ["width", "x"],
    ["height", "y"],
  ] as const)
    query("leaf-" + field).addEventListener("change", () =>
      change((window) =>
        resizeLeaf(window, selectedSashId, axis, Number((query("leaf-" + field) as HTMLInputElement).value) / 1000),
      ),
    );
  for (const [controlId, field, numeric] of [
    ["hinge", "hinge", false],
    ["swing", "swing", false],
    ["angle", "angle", true],
    ["slide-count", "count", true],
    ["slide-direction", "slide", false],
    ["default-opening", "defaultOpening", true],
  ] as const)
    query(controlId).addEventListener("change", () =>
      change((window) => {
        const node = currentEntry()!.node as WindowLeaf;
        const control = query(controlId) as HTMLInputElement | HTMLSelectElement;
        if (field === "count") changePanelCount(node, Number(control.value));
        else (node as any)[field] = numeric ? Number(control.value) : control.value;
      }),
    );
  query("split-position").addEventListener("change", () =>
    change((window) =>
      moveSplit(window, selectedSashId, Number((query("split-position") as HTMLInputElement).value) / 1000),
    ),
  );
  query("equalize").onclick = () =>
    change((window) => {
      const entry = find(window, selectedSashId)!;
      moveSplit(window, selectedSashId, ((entry.node as WindowSplit).axis === "x" ? entry.width : entry.height) / 2);
    });

  function onPreviewPosition(position: number, percentages: number[]): void {
    (query("opening") as HTMLInputElement).value = String(position);
    query("opening-value").textContent = percentages.some(
      (percentage) => Math.abs(percentage - percentages[0]) > 0.001,
    )
      ? "各窗格开度不同"
      : Math.round(position) + "%";
    preview?.setPositions(percentages);
  }

  function resetPreviewControls(): void {
    motion?.stop();
    preview?.setPosition(null);
    (query("opening") as HTMLInputElement).value = String(motion?.position ?? 0);
    query("opening-value").textContent = "各窗格默认";
  }

  query("preview-default").onclick = resetPreviewControls;
  (query("opening") as HTMLInputElement).addEventListener("input", () =>
    motion?.seek(Number((query("opening") as HTMLInputElement).value)),
  );
  query("preview-open").onclick = () => motion?.open();
  query("preview-close").onclick = () => motion?.close();
  query("preview-play").onclick = () => motion?.play();
  query("preview-stop").onclick = () => motion?.stop();
  query("front-view").onclick = () => preview?.reset("interior");
  query("exterior-view").onclick = () => preview?.reset("exterior");
  query("reset-view").onclick = () => preview?.reset();
  query("tutorial").onclick = () => {
    if (tutorial) return;
    if (suspendDrag()) render();
    motion?.stop();
    tutorial = openWindowTutorial({
      onClose: () => {
        tutorial = null;
        if (!closed) query("tutorial").focus();
      },
    });
  };

  for (const actionId of ["cancel", "close-dialog"]) query(actionId).onclick = requestClose;
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    requestClose();
  });
  query("apply").onclick = () => {
    if (drag) {
      notify("请先结束当前拖动。");
      return;
    }
    try {
      const applied = cloneWindow(value());
      // 备注只留「还存在的窗扇」：删掉的分格不能把备注带进新配置。
      const knownIds = new Set(
        entries(applied).flatMap(({ node }) => [node.id, ...((node as WindowLeaf).panelIds || [])]),
      );
      if (applied.windowDesign!.sashRemarks)
        applied.windowDesign!.sashRemarks = Object.fromEntries(
          Object.entries(applied.windowDesign!.sashRemarks).filter(([key]) => knownIds.has(key)),
        );
      validateWindowRecord(applied);
      onApply(applied) !== false && close();
    } catch (error) {
      notify((error as Error).message);
    }
  };

  dialog.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (/INPUT|SELECT|TEXTAREA/.test((event.target as HTMLElement).tagName)) return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      suspendDrag();
      if (event.shiftKey) history.redo();
      else history.undo();
      render();
      return;
    }
    if ((event.key === "Delete" || event.key === "Backspace") && currentSplit()) {
      event.preventDefault();
      (query("delete-split") as HTMLButtonElement).click();
    }
  });
  dialog.addEventListener("keyup", (event) => event.stopPropagation());

  function handleVisibilityChange(): void {
    if (document.hidden) {
      if (suspendDrag()) render();
      motion?.stop();
    } else preview?.render();
  }

  function handlePageHide(event: PageTransitionEvent): void {
    if (event.persisted) {
      if (suspendDrag()) render();
      motion?.stop();
    } else close();
  }

  function handlePageShow(): void {
    preview?.resize();
    drawCanvas();
  }

  document.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("pagehide", handlePageHide);
  window.addEventListener("pageshow", handlePageShow);
  dialog.showModal();
  initializeStudioSelects(dialog);
  // 尺寸 / 角度这类 mm 与度数靠键盘敲太慢：给每个数字输入挂一对 ± 按钮
  // （与户型检查器同一套 `.number-stepper`，步长取各输入自己的 step）。
  initializeNumberInputs(dialog);

  try {
    preview = new WindowPreview(query("preview"), style);
  } catch (error) {
    query("preview").textContent = "3D 预览不可用：" + (error as Error).message;
  }

  motion = createPreviewMotion({
    readPositions: () => preview?.getPositions() ?? [],
    onPosition: onPreviewPosition,
    onState: (state) => {
      (query("preview-stop") as HTMLButtonElement).disabled = !motion?.running;
      const status: Record<string, string> = {
        idle: "预览就绪",
        opening: "正在打开",
        closing: "正在关闭",
        holding: "即将关闭",
        stopped: "已停止",
      };
      query("motion-status").textContent = status[state] + " · 不控制设备";
    },
  });

  render(true);
  if (draft.width !== record.width || draft.height !== record.height)
    notify(
      `普通窗尺寸已变小；为保留上次分格，绘制草稿已扩展为 ${Math.round(draft.width * 1000)} × ${Math.round(
        draft.height * 1000,
      )} mm，应用后生效。`,
    );

  return {
    close,
    hasPendingChange: isDirty,
    get isOpen() {
      return !closed;
    },
  };
}
