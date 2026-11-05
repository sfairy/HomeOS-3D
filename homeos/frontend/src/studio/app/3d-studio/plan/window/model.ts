/**
 * 自定义窗型的 3D 构建（0.8.4）：把一棵分格树变成窗框 + 玻璃 + 可动窗扇。
 *
 * 与普通窗（{@link windowGeometryParts}）的差别：
 * - 每个窗格各自有内嵌边框，分隔线本身也是实体，所以能从任意角度看到「凹进去的玻璃」；
 * - 平开 / 上悬 / 下悬的窗扇挂在一个 `Group` 上，绕铰链轴旋转，铰链位置由
 *   {@link windowHinge} 按「内开/外开 + 左/右（上/下）铰」算出来；
 * - 推拉组拆成 N 个小面板，各自沿 x 轴平移，面板间留 25 mm 重叠遮缝。
 *
 * 每个可动件都在 `userData.windowMotion` 里留下行程信息，运行期的
 * `window-motion` 只读这份数据，不再关心窗格是怎么画的。
 */

import * as THREE from "/static/vendor/three/0.187.0/three.module.min.js";

import {
  defaultWindowOpening,
  entries,
  isHung,
  type WindowDesign,
  type WindowLeaf,
  type WindowRecord,
  validateWindowDesign,
} from "./layout";

/** 可动件的行程：旋转（铰链）或平移（推拉）。 */
export interface WindowMotion {
  object: any;
  axis?: "x" | "y";
  angle?: number;
  start?: number;
  travel?: number;
  defaultOpening: number;
  position: number;
}

/** `addBoxes` 的签名 = 舞台的 `addArchitectureMesh(parent, parts, color, options)`。 */
export type WindowBoxAdder = (parent: any, parts: any[], color: unknown, options?: any) => any;

export interface CustomWindowOptions {
  group: any;
  window: WindowRecord;
  /** 材质色板（`windowFrame` / `furniture` / `glass` / `accent` / `applianceDark`）。 */
  style: any;
  addBoxes: WindowBoxAdder;
  width?: number;
  height?: number;
  sill?: number;
  /** 整扇窗的框色（默认取 `style.windowFrame`）。 */
  frameColor?: unknown;
  /** 被选中的窗扇 id：该窗扇的边框用强调色。 */
  selected?: string;
  /** 是否保留独立窗扇节点（要动画就必需）。 */
  animated?: boolean;
  /** 外框深度（米）：由墙体厚度决定，缺省沿用 85mm。 */
  frameDepth?: number;
}

/**
 * 铰链轴与旋转角：返回 `pivot`（相对窗格中心的偏移）、`center`（窗格中心相对枢轴）
 * 与 `angle`（弧度，带正负方向）。
 */
export function windowHinge(
  leaf: WindowLeaf,
  width: number,
  height: number,
  interiorSide: 1 | -1 = 1,
): { axis: "x" | "y"; pivot: [number, number]; center: [number, number]; angle: number } | null {
  if (!["casement", "top-hung", "bottom-hung"].includes(leaf.kind)) return null;
  const side = (leaf.swing === "in" ? 1 : -1) * interiorSide;
  if (leaf.kind === "casement") {
    const direction = leaf.hinge === "left" ? 1 : -1;
    return {
      axis: "y",
      pivot: [(-direction * width) / 2, 0],
      center: [(direction * width) / 2, 0],
      angle: (-direction * side * leaf.angle * Math.PI) / 180,
    };
  }
  const vertical = leaf.kind === "top-hung" ? -1 : 1;
  return {
    axis: "x",
    pivot: [0, (-vertical * height) / 2],
    center: [0, (vertical * height) / 2],
    angle: (vertical * side * leaf.angle * Math.PI) / 180,
  };
}

/** 矩形边框的四根条：`[宽, 高, 厚, x, y, z]`。 */
export function frameParts(
  width: number,
  height: number,
  x: number,
  y: number,
  z: number,
  thickness = 0.032,
  depth = 0.06,
): number[][] {
  return [
    [width, thickness, depth, x, y - height / 2 + thickness / 2, z],
    [width, thickness, depth, x, y + height / 2 - thickness / 2, z],
    [thickness, height - 2 * thickness, depth, x - width / 2 + thickness / 2, y, z],
    [thickness, height - 2 * thickness, depth, x + width / 2 - thickness / 2, y, z],
  ];
}

/**
 * 在已经定位到墙上的 `group` 里画出整扇自定义窗。
 *
 * 返回控制柄：`setPositions([0..100, ...])` 按窗格顺序（先序遍历的叶子顺序）摆姿态。
 * 设计不合法时抛错 —— 调用方负责回退到普通窗，不要让整层楼消失。
 */
export function addCustomWindow(options: CustomWindowOptions): {
  motions: WindowMotion[];
  getPositions: () => number[];
  setPositions: (percentages: number[]) => void;
  setPosition: (percentage: number | null) => void;
} {
  const {
    group,
    window: record,
    style,
    addBoxes,
    width = record.width,
    height = record.height,
    sill = record.sill || 0,
    frameColor = style.windowFrame ?? style.furniture,
    selected = "",
    animated = true,
    frameDepth = 0.085,
  } = options;
  validateWindowDesign(record.windowDesign, width, height);
  const design = record.windowDesign as WindowDesign;

  const motions: WindowMotion[] = [];
  const batches = new Map<string, { color: unknown; options: any; parts: any[] }>();

  /** 静态窗扇合并进父节点（少几个 draw call）；可动件必须各自成节点。 */
  function addPart(parent: any, parts: any[], color: unknown, partOptions: any): void {
    if (animated || partOptions.transparent) {
      addBoxes(parent, parts, color, partOptions);
      return;
    }
    const batchKey = JSON.stringify([color, partOptions]);
    if (!batches.has(batchKey)) batches.set(batchKey, { color, options: partOptions, parts: [] });
    const frame = parent === group ? null : parent;
    for (const [partWidth, partHeight, partDepth, partX, partY, partZ] of parts) {
      const point = new THREE.Vector3(partX, partY, partZ);
      if (frame) point.applyEuler(frame.rotation).add(frame.position);
      batches
        .get(batchKey)!
        .parts.push([
          partWidth,
          partHeight,
          partDepth,
          point.x,
          point.y,
          point.z,
          frame?.rotation.y || 0,
        ]);
    }
  }

  const glassOptions = {
    rounded: false,
    transparent: true,
    opacity: 0.2,
    depthWrite: false,
    side: THREE.DoubleSide,
    roughness: 0.08,
    metalness: 0.04,
    castShadow: false,
    renderOrder: 6,
  };
  const frameOptions = { rounded: false, metalness: 0.15, castShadow: false, receiveShadow: false };
  const outerFrame = frameParts(width, height, 0, sill + height / 2, 0, 0.045, frameDepth);

  /** 一片窗格的玻璃 + 内嵌边框。 */
  function addSashFrame(
    parent: any,
    sashWidth: number,
    sashHeight: number,
    centerX: number,
    centerY: number,
    color: unknown,
  ): void {
    addPart(parent, frameParts(sashWidth, sashHeight, centerX, centerY, 0, 0.027, 0.035), color, frameOptions);
    addPart(
      parent,
      [[sashWidth - 0.04, sashHeight - 0.04, 0.008, centerX, centerY, 0]],
      style.glass,
      glassOptions,
    );
  }

  const sizedRecord = { ...record, width, height };
  for (const entry of entries(sizedRecord)) {
    const node = entry.node;
    const left = -width / 2 + entry.x;
    const top = sill + height - entry.y;
    if (node.children) {
      const split = node as any;
      outerFrame.push(
        split.axis === "x"
          ? [0.035, entry.height - 0.032, 0.075, left + entry.width * split.ratio, top - entry.height / 2, 0]
          : [entry.width - 0.032, 0.035, 0.075, left + entry.width / 2, top - entry.height * split.ratio, 0],
      );
      continue;
    }
    const leaf = node as WindowLeaf;
    // 贴到整窗外沿的一侧留厚边（外框），中间相邻的窗格用薄边 —— 否则两条边会叠出黑缝。
    const insetLeft = entry.x < 1e-8 ? 0.045 : 0.0175;
    const insetRight = entry.x + entry.width > width - 1e-8 ? 0.045 : 0.0175;
    const insetTop = entry.y < 1e-8 ? 0.045 : 0.0175;
    const insetBottom = entry.y + entry.height > height - 1e-8 ? 0.045 : 0.0175;
    const glassWidth = entry.width - insetLeft - insetRight - 0.006;
    const glassHeight = entry.height - insetTop - insetBottom - 0.006;
    const centerX = left + insetLeft + 0.003 + glassWidth / 2;
    const centerY = top - insetTop - 0.003 - glassHeight / 2;
    const sashColor = selected === leaf.id ? style.accent : frameColor;

    if (leaf.kind === "fixed")
      addPart(group, [[glassWidth, glassHeight, 0.012, centerX, centerY, 0]], style.glass, glassOptions);

    const hinge = windowHinge(leaf, glassWidth, glassHeight, design.interiorSide);
    if (hinge) {
      const pivot = new THREE.Group();
      pivot.position.set(centerX + hinge.pivot[0], centerY + hinge.pivot[1], 0.012);
      pivot.userData.windowId = record.id;
      pivot.userData.windowSashId = leaf.id;
      group.add(pivot);
      pivot.rotation[hinge.axis] = (hinge.angle * defaultWindowOpening(leaf)) / 100;
      addSashFrame(pivot, glassWidth, glassHeight, hinge.center[0], hinge.center[1], sashColor);
      const sideHinged = !isHung(leaf.kind);
      const handleDirection = leaf.hinge === "left" ? 1 : -1;
      const handleX = sideHinged ? handleDirection * (glassWidth - 0.045) : 0;
      const handleY = sideHinged ? 0 : (leaf.kind === "top-hung" ? -1 : 1) * (glassHeight - 0.045);
      addPart(
        pivot,
        [[sideHinged ? 0.012 : 0.11, sideHinged ? 0.11 : 0.012, 0.018, handleX, handleY, 0.027]],
        style.applianceDark ?? frameColor,
        frameOptions,
      );
      pivot.userData.windowMotion = {
        property: "rotation",
        axis: hinge.axis,
        closed: 0,
        open: hinge.angle,
        rest: pivot.rotation[hinge.axis],
      };
      if (animated)
        motions.push({
          object: pivot,
          axis: hinge.axis,
          angle: hinge.angle,
          defaultOpening: defaultWindowOpening(leaf),
          position: defaultWindowOpening(leaf),
        });
    }

    if (leaf.kind === "sliding") {
      const panelCount = leaf.count;
      const panelWidth = (glassWidth + 0.025 * (panelCount - 1)) / panelCount;
      for (let panelIndex = 0; panelIndex < panelCount; panelIndex += 1) {
        const panel = new THREE.Group();
        const closedX = centerX - glassWidth / 2 + panelWidth / 2 + panelIndex * (panelWidth - 0.025);
        panel.position.set(closedX, centerY, (panelIndex - (panelCount - 1) / 2) * 0.046);
        const openX = centerX + (leaf.slide === "right" ? 1 : -1) * (glassWidth - panelWidth) / 2;
        const opening = defaultWindowOpening(leaf);
        panel.position.x = closedX + ((openX - closedX) * opening) / 100;
        panel.userData.windowId = record.id;
        panel.userData.windowSashId = leaf.panelIds[panelIndex];
        panel.userData.windowGroupId = leaf.id;
        // 两扇都正好被推到对侧时（极窄窗），0.8.2 的按扇绑定记的是对称位置，
        // 这里留一份 legacyOpen 供旧的按扇绑定继续对齐。
        const legacyOpen =
          Math.abs(openX - closedX) > 1e-8
            ? openX
            : centerX - (leaf.slide === "right" ? 1 : -1) * (glassWidth - panelWidth) / 2;
        panel.userData.windowMotion = {
          property: "position",
          axis: "x",
          closed: closedX,
          open: openX,
          legacyOpen,
          rest: panel.position.x,
          defaultOpening: opening,
        };
        group.add(panel);
        addSashFrame(panel, panelWidth, glassHeight, 0, 0, sashColor);
        if (animated)
          motions.push({
            object: panel,
            start: closedX,
            travel: openX - closedX,
            defaultOpening: opening,
            position: opening,
          });
      }
    }
  }

  addPart(group, outerFrame, frameColor, frameOptions);
  for (const batch of batches.values()) addBoxes(group, batch.parts, batch.color, batch.options);
  group.userData.customWindowId = record.id;

  function setPositions(percentages: number[]): void {
    motions.forEach((motion, motionIndex) => {
      const percent = Math.max(
        0,
        Math.min(1, Number(percentages[motionIndex] ?? motion.defaultOpening) / 100 || 0),
      );
      motion.position = percent * 100;
      if (motion.axis) motion.object.rotation[motion.axis] = (motion.angle as number) * percent;
      else motion.object.position.x = (motion.start as number) + (motion.travel as number) * percent;
    });
  }

  return {
    motions,
    getPositions: () => motions.map((motion) => motion.position),
    setPositions,
    setPosition: (percentage) => setPositions(motions.map(() => percentage as number)),
  };
}
