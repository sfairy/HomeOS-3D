/**
 * 自建模型的规格表：每个条目描述一件新物件的零件构成。
 */
import {
  box,
  capsule,
  cbox,
  ccapsule,
  ccyl,
  clathe,
  croundedBox,
  ctaper,
  ctorus,
  cyl,
  extrude,
  lathe,
  mirrorPair,
  ringOf,
  roundedBox,
  sphere,
  taper,
  torus
} from "./model-library.mjs";

/**
 * lite 版顶点数上限（相对完整版的比例）的缺省值。
 */
export const DEFAULT_LITE_VERTEX_BUDGET_RATIO = 0.9;

/**
 * 四腿家具的通用腿：`legSpanX` / `legSpanZ` 是**腿心到中心的距离**（米）。
 */
function fourLegs(slot, { legSpanX, legSpanZ, legSize, height, square = true }) {
  const half = legSize / 2;
  const offsets = [
    [-legSpanX, -legSpanZ],
    [legSpanX, -legSpanZ],
    [-legSpanX, legSpanZ],
    [legSpanX, legSpanZ]
  ];
  return offsets.map(([x, z]) =>
    square
      ? cbox(slot, [legSize, height, legSize], [x - half, 0, z - half], { centered: false })
      : ccyl(slot, half, height, 12, [x, 0, z])
  );
}

/**
 * 沿 z 均布一列等大的零件（地毯流苏、格栅条、百叶片）。
 */
function rowAlongZ(slot, { size, count, span, x, y }) {
  const [sizeX, sizeY, sizeZ] = size;
  const pitch = span / count;
  const parts = [];
  for (let index = 0; index < count; index += 1) {
    parts.push(cbox(slot, [sizeX, sizeY, sizeZ], [x, y, -span / 2 + pitch * (index + 0.5)]));
  }
  return parts;
}

/**
 * 一把餐椅的零件（四条腿 + 座面 + 靠背 + 四根横撑），整椅可以绕竖直轴转向。
 */
function diningChair({
  center,
  facing,
  slotLeg,
  slotSeat,
  slotTrim,
  seatWidth,
  seatDepth,
  seatHeight,
  seatThickness,
  backTop,
  backThickness,
  legSize
}) {
  const radians = (facing * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const placed = (slot, size, [lx, y, lz], options = {}) =>
    cbox(slot, size, [center[0] + lx * cos + lz * sin, y, center[1] - lx * sin + lz * cos], {
      rot: [0, facing, 0],
      ...options
    });
  const legInsetX = seatWidth / 2 - legSize / 2;
  const legInsetZ = seatDepth / 2 - legSize / 2;
  const railHeight = seatHeight * 0.34;
  const railSpanX = seatWidth - legSize * 2;
  const railSpanZ = seatDepth - legSize * 2;
  return [
    ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) =>
      placed(slotLeg, [legSize, seatHeight, legSize], [sx * legInsetX, 0, sz * legInsetZ])
    ),
    // 座面：圆角盒（软包坐垫），也是椅子在 lite 版里降段数的一处。
    croundedBox(slotSeat, [seatWidth, seatThickness, seatDepth], [
      center[0],
      seatHeight,
      center[1]
    ], { rot: [0, facing, 0], radius: 0.014 }),
    // 靠背：贴着座面后沿长上去，顶到 backTop —— 整把椅子的高度由它定。
    placed(
      slotSeat,
      [seatWidth, backTop - seatHeight - seatThickness, backThickness],
      [0, seatHeight + seatThickness, -(seatDepth / 2 - backThickness / 2)]
    ),
    placed(slotTrim, [0.02, 0.02, railSpanZ], [-legInsetX, railHeight, 0], { fullOnly: true }),
    placed(slotTrim, [0.02, 0.02, railSpanZ], [legInsetX, railHeight, 0], { fullOnly: true }),
    placed(slotTrim, [railSpanX, 0.02, 0.02], [0, railHeight, -legInsetZ], { fullOnly: true }),
    placed(slotTrim, [railSpanX, 0.02, 0.02], [0, railHeight, legInsetZ], { fullOnly: true })
  ];
}

/**
 * 厨房地柜的通用骨架：踢脚 + 柜体 + 背板 + N 扇门 + 门板拉手。
 */
function kitchenBaseCarcassParts({ width, depth, doorCount, openTop = false }) {
  const doorGap = 0.003;
  const doorRunWidth = width - 0.08;
  const doorWidth = (doorRunWidth - doorGap * (doorCount - 1)) / doorCount;
  const doorFrontZ = depth / 2 - 0.04;
  const doorCenterZ = doorFrontZ + 0.01;
  const handleZ = doorFrontZ + 0.02 - 0.006;
  const doors = [];
  for (let index = 0; index < doorCount; index += 1) {
    const doorCenterX = -doorRunWidth / 2 + doorWidth / 2 + index * (doorWidth + doorGap);
    doors.push(cbox(1, [doorWidth, 0.73, 0.02], [doorCenterX, 0.07, doorCenterZ]));
    // 拉手落在门板的中缝一侧（真实厨房门板几乎都是这个位置），只在完整版留。
    doors.push(cbox(3, [Math.min(0.24, doorWidth * 0.45), 0.014, 0.014], [
      doorCenterX + (index % 2 === 0 ? doorWidth * 0.28 : -doorWidth * 0.28),
      0.66,
      handleZ
    ], { fullOnly: true }));
  }
  const carcass = openTop
    ? [
        // 不封顶的柜体：左右侧板 + 底板 + 背板（水盆柜的箱体）。
        cbox(2, [0.02, 0.75, depth - 0.04], [-(width / 2 - 0.03), 0.06, -0.02]),
        cbox(2, [0.02, 0.75, depth - 0.04], [width / 2 - 0.03, 0.06, -0.02]),
        cbox(2, [width - 0.08, 0.02, depth - 0.06], [0, 0.06, -0.02])
      ]
    : [cbox(2, [width - 0.04, 0.75, depth - 0.04], [0, 0.06, -0.02])];
  return [
    // 踢脚内缩 10cm：落地那 6cm 因此是踢脚而不是柜体正面。
    cbox(4, [width - 0.12, 0.06, depth - 0.1], [0, 0, -0.05]),
    ...carcass,
    // 背板只在**不封顶**的箱体里出现（水盆柜）：封顶的柜体本身就是一块实心箱，背板埋在里面
    ...(openTop
      ? [cbox(5, [width - 0.08, 0.73, 0.016], [0, 0.08, -(depth / 2) + 0.012], { fullOnly: true })]
      : []),
    ...doors
  ];
}

/**
 * 一段落地帘布的规格。`side` 决定帘布怎么分：
 */
function curtainSpec(side) {
  // 帘布高度 = 整件高度减去顶轨占的那一段（顶轨半径 12mm，轴心在 2.388，占 2.376…2.400）。
  const clothHeight = 2.376;
  // 波浪半径 = 进深的一半：一排竖圆柱的直径就是整件进深 0.18，圆柱轴心一律落在 z = 0 平面上。
  const waveRadius = 0.09;
  const waveSegments = 20;
  const waveRow = (startX, count, pitch) => {
    const row = [];
    for (let index = 0; index < count; index += 1) {
      row.push(ccyl(0, waveRadius, clothHeight, waveSegments, [startX + index * pitch, 0, 0]));
    }
    return row;
  };
  const parts = [];
  if (side === "left") {
    // 11 道波从 -0.81 排到 0.69（最右一道的右沿正好 0.78），右侧 12cm 留给前缘。
    parts.push(...waveRow(-0.81, 11, 0.15));
    parts.push(cbox(0, [0.12, clothHeight, 0.03], [0.84, 0, 0]));
  } else if (side === "right") {
    parts.push(...waveRow(-0.69, 11, 0.15));
    parts.push(cbox(0, [0.12, clothHeight, 0.03], [-0.84, 0, 0]));
  } else {
    // 两幅各 6 道波、间距 0.135：外侧顶到 ±0.90，内侧到 ∓0.045，中间留 9cm 的缝。
    parts.push(...waveRow(-0.81, 6, 0.135));
    parts.push(...waveRow(0.135, 6, 0.135));
  }
  // 顶轨：沿 x 的圆杆（圆柱默认轴为 y，转 90° 变成横杆）。用 align: "center" 让**轴心**落在
  parts.push(
    ctaper(1, 0.012, 0.012, 1.76, 12, [0, 2.388, 0], { rot: [0, 0, 90], align: "center" })
  );
  // 两个墙面支架（贴在轨下方的托板）。lite 版丢掉它们：远看就是轨上的两个小方块。
  parts.push(cbox(1, [0.03, 0.05, 0.06], [-0.5, 2.321, 0], { fullOnly: true }));
  parts.push(cbox(1, [0.03, 0.05, 0.06], [0.5, 2.321, 0], { fullOnly: true }));
  return {
    note:
      "落地窗帘：" +
      (side === "split"
        ? "两幅波浪帘布对开（中缝 9cm）"
        : `单幅波浪帘布 + ${side === "left" ? "右" : "左"}侧不褶的前缘`) +
      " + 沿墙的顶轨 + 两个墙面支架。",
    size: [1.8, 2.4, 0.18],
    slots: [
      { role: "fabric", color: 0xd5d2ca, roughness: 0.94, metalness: 0 },
      { role: "metal", color: 0x9aa1a8, roughness: 0.34, metalness: 0.45 }
    ],
    parts: parts
  };
}

/**
 * 三角钢琴的俯视轮廓：归一化坐标 → 实际尺寸。
 */
function pianoPlan({ halfWidth, tailZ, frontZ }) {
  const point = ([u, v]) => [u * halfWidth, tailZ + (frontZ - tailZ) * v];
  return {
    outline: {
      start: point([1, 1]),
      path: [
        { lineTo: point([-1, 1]) },
        { lineTo: point([-0.972, 0.72]) },
        { curveTo: [point([-0.944, 0.3]), point([-0.806, 0.12])] },
        { curveTo: [point([-0.722, 0.02]), point([-0.42, 0])] },
        { curveTo: [point([-0.14, 0.03]), point([0.06, 0.16])] },
        { curveTo: [point([0.44, 0.34]), point([0.64, 0.6])] },
        { curveTo: [point([0.86, 0.8]), point([1, 0.94])] },
        { lineTo: point([1, 1]) }
      ]
    },
    // 轮廓的占地中心（z 向不在 0 上）：extrude 用 centered 定位时要把这个值传给 at[2]。
    centerZ: (tailZ + frontZ) / 2
  };
}

const ARC_SEGMENTS_PER_RADIAN = 10;
const LITE_ARC_SEGMENTS_PER_RADIAN = 6;

function pillarOutline(shape, width, depth) {
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  const outlinePoints = segmentsPerRadian => {
    const points = [];
    const pushEllipseArc = (centerX, centerY, radiusX, radiusY, startRadians, endRadians) => {
      // 段数取偶数：半圆的弧跨 π，最深处（z = -半深）正好落在弧的**中点**上，只有偶数段才采得到
      const rounded = Math.max(
        5,
        Math.round(Math.abs(endRadians - startRadians) * segmentsPerRadian)
      );
      const segments = rounded % 2 === 0 ? rounded : rounded + 1;
      for (let arcStep = 1; arcStep <= segments; arcStep += 1) {
        const arcAngle = startRadians + ((endRadians - startRadians) * arcStep) / segments;
        points.push([
          centerX + Math.cos(arcAngle) * radiusX,
          centerY + Math.sin(arcAngle) * radiusY
        ]);
      }
    };
    if (shape === "round") {
      points.push([halfWidth, 0]);
      pushEllipseArc(0, 0, halfWidth, halfDepth, 0, Math.PI * 2);
    } else if (shape === "semicircle") {
      // 平直面在 +y（立正之后就是 -z，靠墙那一侧），弧从 +x 端扫到 -x 端。
      points.push([-halfWidth, halfDepth], [halfWidth, halfDepth]);
      pushEllipseArc(0, halfDepth, halfWidth, depth, 0, -Math.PI);
    } else if (shape === "quarter") {
      points.push([-halfWidth, halfDepth], [halfWidth, halfDepth]);
      pushEllipseArc(-halfWidth, halfDepth, width, depth, 0, -Math.PI / 2);
    } else {
      // quarterinner：与 quarter 在同一占位内互补，两根叠在一起正好拼满一个方柱。
      points.push([halfWidth, halfDepth], [halfWidth, -halfDepth], [-halfWidth, -halfDepth]);
      pushEllipseArc(-halfWidth, halfDepth, width, depth, -Math.PI / 2, 0);
    }
    // 显式闭合：`quarter` 的弧扫到 (-半宽, -半深) 就停了，回不到起点，而 extrude 要求末点
    const firstPoint = points[0];
    const lastPoint = points[points.length - 1];
    if (
      Math.abs(firstPoint[0] - lastPoint[0]) > 1e-6 ||
      Math.abs(firstPoint[1] - lastPoint[1]) > 1e-6
    ) {
      points.push([firstPoint[0], firstPoint[1]]);
    }
    return points;
  };
  const detailedPoints = outlinePoints(ARC_SEGMENTS_PER_RADIAN);
  const litePoints = outlinePoints(LITE_ARC_SEGMENTS_PER_RADIAN);
  return {
    start: detailedPoints[0],
    path: detailedPoints.slice(1).map(point => ({ lineTo: point })),
    litePath: litePoints.slice(1).map(point => ({ lineTo: point }))
  };
}

/**
 * 一片叶子的平面轮廓：卵形、两端收尖、中段最宽（沿 +y 长出，关于 x = 0 对称）。
 */
/**
 * 叶形轮廓：**两段二次曲线**（正面一条、背面一条）围成一片柳叶形叶面。
 */
function leafOutline(length, width) {
  const halfWidth = width / 2;
  return {
    start: [0, 0],
    path: [
      { curveTo: [[halfWidth * 2, length * 0.4], [0, length]] },
      { curveTo: [[-halfWidth * 2, length * 0.4], [0, 0]] }
    ]
  };
}

/**
 * 叶片从基点到叶尖的**水平投影**换算成叶片长度。
 * @param {number} reach 基点到叶尖的水平投影（米）。
 * @param {number} baseRadius 叶基离整件中轴的水平距离（米）。
 * @param {number} tiltDegrees 叶片与水平面的夹角（度，正 = 叶尖下倾）。
 * @param {number} thickness 叶厚（米），与 plantLeaf 烘进轮廓的厚度必须一致。
 */
function leafLengthForReach(reach, baseRadius, tiltDegrees, thickness = 0.012) {
  const tiltRadians = (tiltDegrees * Math.PI) / 180;
  return (
    (reach - baseRadius - (thickness / 2) * Math.abs(Math.sin(tiltRadians))) /
    Math.cos(tiltRadians)
  );
}

/**
 * 一片叶子（轮廓拉体）：
 */
function plantLeaf({ azimuth, tilt, base, length, width, slot = 3, fullOnly = false }) {
  const tiltRadians = (tilt * Math.PI) / 180;
  const azimuthRadians = (azimuth * Math.PI) / 180;
  // 叶片轴线：先绕 X 立起（下倾 tilt），再绕 Y 转到方位角。
  const axis = [
    -Math.cos(tiltRadians) * Math.sin(azimuthRadians),
    -Math.sin(tiltRadians),
    -Math.cos(tiltRadians) * Math.cos(azimuthRadians)
  ];
  // 曲线分段压到 10（库默认 14）：叶面就是一条二次曲线，14 段与 10 段在实物尺寸下看不出差别，
  const options = { centered: true, align: "center", rot: [-90 - tilt, azimuth, 0], curveSegments: 10 };
  if (fullOnly) {
    options.fullOnly = true;
  }
  return extrude(
    slot,
    leafOutline(length, width),
    0.012,
    [
      base[0] + (axis[0] * length) / 2,
      base[1] + (axis[1] * length) / 2,
      base[2] + (axis[2] * length) / 2
    ],
    options
  );
}

/**
 * 一片叶的**叶尖**相对叶基（`base`）高出多少。
 */
function plantLeafRise(tilt, length, thickness = 0.012) {
  const tiltRadians = (tilt * Math.PI) / 180;
  return length * Math.sin(-tiltRadians) + (thickness / 2) * Math.abs(Math.cos(tiltRadians));
}

/**
 * 反解「叶尖正好落在 topY」的叶基高度。
 */
function plantLeafBaseForTop(topY, tilt, length) {
  return topY - plantLeafRise(tilt, length);
}

/**
 * 绿植的树冠：一层层「环列的叶片」。
 */
function plantCrownParts() {
  // 层参数：下层叶大而下垂（tilt 为正 = 叶尖下倾），越往上叶越小、越直立。
  const layers = [
    { count: 6, baseY: 0.5, baseRadius: 0.045, tilt: 12, reach: 0.3, width: 0.13, startAngle: 0 },
    { count: 6, baseY: 0.66, baseRadius: 0.05, tilt: -6, reach: 0.375, width: 0.14, startAngle: 30 },
    { count: 6, baseY: 0.84, baseRadius: 0.055, tilt: -24, reach: 0.375, width: 0.135, startAngle: 0 },
    { count: 6, baseY: 1.02, baseRadius: 0.055, tilt: -40, reach: 0.3, width: 0.125, startAngle: 30 },
    { count: 4, baseY: 1.2, baseRadius: 0.05, tilt: -56, reach: 0.235, width: 0.115, startAngle: 45 }
  ];
  const parts = [];
  for (const layer of layers) {
    const length = leafLengthForReach(layer.reach, layer.baseRadius, layer.tilt);
    parts.push(
      ...ringOf(layer.count, { radius: layer.baseRadius, startAngle: layer.startAngle }, () =>
        plantLeaf({
          // 环列的基准位是「站在 +z、正面朝外」，而 plantLeaf 的 0° 方位角指向 −z，
          azimuth: 180,
          tilt: layer.tilt,
          base: [0, layer.baseY, 0],
          length,
          width: layer.width
        })
      )
    );
  }
  const crownTilt = -74;
  const crownReach = 0.155;
  const crownBaseRadius = 0.04;
  const crownLength = leafLengthForReach(crownReach, crownBaseRadius, crownTilt);
  const crownBaseY = plantLeafBaseForTop(1.6, crownTilt, crownLength);
  parts.push(
    ...ringOf(3, { radius: crownBaseRadius, startAngle: 60 }, () =>
      plantLeaf({
        azimuth: 180,
        tilt: crownTilt,
        base: [0, crownBaseY, 0],
        length: crownLength,
        width: 0.1
      })
    )
  );
  return parts;
}

/**
 * 固定种子的伪随机（与 studio-surface-fabrics.js 里画贴图用的是同一套线性同余）。
 */
function createSeededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

/**
 * 一格书架上的书：一排竖立的书脊 + 收口的两本斜靠 + 一摞平放的书。
 */
function bookRowParts({ slots, seed, fromX, toX, bottomY, zCenter, maxHeight, withStack = false }) {
  const random = createSeededRandom(seed);
  const parts = [];
  const totalWidth = toX - fromX;
  // 平放那一摞要先在格口里**占位**：先摆满整排再拿摞去挤，末尾几本就会戳进侧板或中竖板。
  const stackWidth = withStack ? 0.17 + random() * 0.05 : 0;
  const rowWidth = totalWidth - (withStack ? stackWidth + 0.025 : 0);
  const fillWidth = rowWidth * 0.86;
  const gapBetweenBooks = 0.0015;
  let cursor = fromX;
  let order = 0;
  while (true) {
    const thickness = 0.02 + random() * 0.024;
    if (cursor + thickness - fromX > fillWidth) {
      break;
    }
    // 高度只取到格口净高的 92%：剩下的空当是「书没顶到上层板」的读感，也是给斜靠的书留的余量。
    const height = Math.min(maxHeight, 0.17 + random() * 0.11);
    const depth = 0.13 + random() * 0.045;
    const slot = slots[Math.floor(random() * slots.length) % slots.length];
    parts.push(
      cbox(slot, [thickness, height, depth], [cursor + thickness / 2, bottomY, zCenter], {
        // 每两本里让一本只在完整版保留：lite 版的书脊稀一点，但整排仍然成立 ——
        fullOnly: order % 2 === 1
      })
    );
    cursor += thickness + gapBetweenBooks;
    order += 1;
  }
  // 收口：两本斜靠的书。真实书架的最后一两本不是插满的，而是斜靠着前一本。
  if (rowWidth - fillWidth >= 0.055) {
    const leanSlot = slots[(Math.floor(random() * slots.length) + 1) % slots.length];
    const leanHeight = Math.min(maxHeight, 0.2 + random() * 0.06);
    const leanThickness = 0.024;
    parts.push(
      cbox(
        leanSlot,
        [leanThickness, leanHeight, 0.15],
        [cursor + leanThickness / 2 + 0.004, bottomY, zCenter],
        { rot: [0, 0, -11] }
      ),
      cbox(
        leanSlot,
        [0.022, leanHeight * 0.94, 0.145],
        [cursor + leanThickness + 0.022, bottomY, zCenter],
        { rot: [0, 0, -22], fullOnly: true }
      )
    );
  }
  // 一摞平放的书（2~3 本）：书架的层次感大半来自它，也是一格书里最容易一眼认出来的部分。
  if (withStack) {
    const stackCount = 2 + Math.floor(random() * 2);
    const stackDepth = 0.2;
    let stackY = bottomY;
    for (let index = 0; index < stackCount; index += 1) {
      const stackThickness = 0.028 + random() * 0.014;
      // 摞起来一旦顶到格口净高就收手（真实书架也是按格口高度决定摞几本）。
      if (stackY + stackThickness - bottomY > maxHeight) {
        break;
      }
      const width = stackWidth - index * 0.012;
      // 每高一层往里错 1.2cm：正正方方一摞书垛会读成一块木方，错开才像随手摞的。
      parts.push(
        cbox(slots[index % slots.length], [width, stackThickness, stackDepth], [
          fromX + totalWidth - stackWidth / 2 + index * 0.006,
          stackY,
          zCenter
        ], { fullOnly: index > 0 })
      );
      stackY += stackThickness + 0.001;
    }
  }
  return parts;
}

/**
 * 书柜两列 × 四层的格口内容。
 */
function bookcaseShelfContents() {
  const shelfBottoms = [0.51, 0.852, 1.192, 1.532];
  const shelfThickness = 0.018;
  const ceilingBelowTopBoard = 1.85;
  const slotPairs = [
    [7, 8, 7, 8, 7, 8],
    [8, 7, 7, 8, 8, 7]
  ];
  const column = {
    right: { fromX: 0.035, toX: 0.55 },
    left: { fromX: -0.55, toX: -0.035 }
  };
  const parts = [];
  shelfBottoms.forEach((shelfBottom, level) => {
    const floorY = shelfBottom + shelfThickness - 0.004;
    const ceiling = level === shelfBottoms.length - 1
      ? ceilingBelowTopBoard
      : shelfBottoms[level + 1];
    // 净高打 88 折：书顶不贴上层板，才有「书是摆进去的」而不是「填满的」。
    const maxHeight = (ceiling - floorY) * 0.88;
    // 最上层右列让给摆件（花瓶 + 相框），左列照旧摆书。
    if (level === 3) {
      parts.push(...bookRowParts({
        slots: slotPairs[0],
        seed: 3100 + level,
        ...column.left,
        bottomY: floorY,
        zCenter: 0.01,
        maxHeight
      }));
      return;
    }
    parts.push(...bookRowParts({
      slots: slotPairs[0],
      seed: 3100 + level,
      ...column.right,
      bottomY: floorY,
      zCenter: 0.01,
      maxHeight,
      withStack: level % 2 === 0
    }));
    parts.push(...bookRowParts({
      slots: slotPairs[1],
      seed: 4100 + level,
      ...column.left,
      bottomY: floorY,
      zCenter: 0.01,
      maxHeight,
      withStack: level % 2 === 1
    }));
  });
  return parts;
}

/**
 * 书架格口里的一件小摆件（花瓶 / 相框）：书柜最上层那一格摆件通常比书多，
 */
function bookcaseDecorParts({ bottomY, centerX, zCenter, slot, kind, height, seed }) {
  const random = createSeededRandom(seed);
  if (kind === "vase") {
    const radius = 0.045 + random() * 0.02;
    return [
      // 母线首尾都是同一个点 [0, 0]（= 收口到轴上）：`lathe` 要求母线闭合，且贴着轴（半径 0）
      clathe(
        slot,
        [
          [0, 0],
          [radius, 0],
          [radius, height * 0.34],
          [radius * 0.46, height * 0.62],
          [radius * 0.58, height],
          [0, height],
          [0, 0]
        ],
        18,
        [centerX, bottomY, zCenter]
      )
    ];
  }
  const width = 0.14 + random() * 0.06;
  return [
    cbox(slot, [width, height * 0.72, 0.02], [centerX, bottomY, zCenter]),
    cbox(slot, [width * 0.82, height * 0.26, 0.03], [centerX, bottomY + height * 0.72, zCenter], {
      fullOnly: true
    })
  ];
}

/**
 * 鞋柜敞开格里的一双鞋。
 */
function shoecabinetShoePair({ bottomY, centerX, zCenter, splay }) {
  const soleWidth = 0.094;
  const soleLength = 0.25;
  const upperLength = 0.15;
  const toeLength = 0.09;
  const toeThickness = 0.026;
  const splayRadians = (splay * Math.PI) / 180;
  const rotatedWidth = soleWidth * Math.cos(splayRadians) + soleLength * Math.sin(splayRadians);
  const soleThickness = 0.02;
  const upperHeight = 0.075;
  const parts = [];
  for (const shoeSide of [-1, 1]) {
    const shoeX = centerX + shoeSide * (rotatedWidth / 2);
    const shoeRotation = [0, shoeSide * splay, 0];
    // 鞋跟那一端的 z（+z 是柜门方向，鞋帮贴在这里）。
    const heelZ = zCenter + soleLength / 2;
    parts.push(
      cbox(7, [soleWidth, soleThickness, soleLength], [shoeX, bottomY, zCenter], {
        rot: shoeRotation
      }),
      // 鞋帮：从鞋跟往鞋头方向 15cm。
      cbox(7, [soleWidth - 0.006, upperHeight, upperLength], [shoeX, bottomY + soleThickness, heelZ - upperLength / 2], {
        rot: shoeRotation
      }),
      // 鞋头：只有鞋帮的三分之一高，压在鞋底前段上 —— 少了它整只鞋就是一块方料。
      cbox(7, [soleWidth - 0.012, toeThickness, toeLength], [shoeX, bottomY + soleThickness, heelZ - upperLength - toeLength / 2], {
        rot: shoeRotation,
        fullOnly: true
      })
    );
  }
  return parts;
}

/**
 * 鞋柜六处敞开格的摆鞋表（左列四层 + 右列敞开中格）。
 */
function shoecabinetBayShoes() {
  const bays = [
    { floorY: 0.45, xFrom: -0.84, xTo: -0.05, seed: 5301, pairCount: 3 },
    { floorY: 0.8, xFrom: -0.84, xTo: -0.05, seed: 5302, pairCount: 3 },
    { floorY: 1.13, xFrom: -0.84, xTo: -0.05, seed: 5303, pairCount: 2 },
    { floorY: 1.46, xFrom: -0.84, xTo: -0.05, seed: 5304, pairCount: 3 },
    { floorY: 1.0, xFrom: 0.05, xTo: 0.84, seed: 5305, pairCount: 3 }
  ];
  const parts = [];
  for (const bay of bays) {
    const random = createSeededRandom(bay.seed);
    const usableWidth = bay.xTo - bay.xFrom;
    for (let pairIndex = 0; pairIndex < bay.pairCount; pairIndex += 1) {
      // 先等分格口宽度，再加一点抖动：鞋与鞋之间因此既不等距、也不会撞在一起。
      const pairCenter = bay.xFrom + (usableWidth * (pairIndex + 0.5)) / bay.pairCount;
      const jitter = (random() - 0.5) * usableWidth * 0.06;
      parts.push(
        ...shoecabinetShoePair({
          bottomY: bay.floorY,
          centerX: pairCenter + jitter,
          // 进深位置也抖：一格里三双鞋若都贴着背板，俯视就是一排对齐的方块。
          zCenter: -0.02 + random() * 0.05,
          splay: 10 + Math.round(random() * 5)
        })
      );
    }
  }
  return parts;
}

function pillarSpec(shape) {
  const pillarWidth = 0.45;
  const pillarHeight = 2.8;
  const pillarDepth = 0.45;
  const baseHeight = 0.14;
  const capHeight = 0.12;
  const shaftHeight = pillarHeight - baseHeight - capHeight;
  const bandInset = 0.004;
  const shapeLabel = {
    square: "方柱",
    round: "圆柱",
    semicircle: "半圆柱",
    quarter: "四分之一圆柱",
    quarterinner: "内凹四分之一圆柱"
  }[shape];
  const parts = [];
  if (shape === "square") {
    // 纯方盒：柱脚 / 柱身 / 柱帽三段各 12 个三角形，没有任何分段落可降。
    parts.push(
      cbox(1, [pillarWidth - bandInset, baseHeight, pillarDepth - bandInset], [0, 0, 0]),
      cbox(0, [pillarWidth, shaftHeight, pillarDepth], [0, baseHeight, 0]),
      cbox(2, [pillarWidth - bandInset, capHeight, pillarDepth - bandInset], [
        0,
        baseHeight + shaftHeight,
        0
      ])
    );
  } else {
    // 圆截面走圆柱（lite 会把 40 段降到 20 段），椭圆截面的四种走轮廓拉体。
    const shaftPart =
      shape === "round"
        ? ccyl(0, pillarWidth / 2, shaftHeight, 40, [0, baseHeight, 0])
        : extrude(0, pillarOutline(shape, pillarWidth, pillarDepth), shaftHeight, [
            0,
            baseHeight,
            0
          ], { centered: true, rot: [-90, 0, 0] });
    const bandParts =
      shape === "round"
        ? [
            ccyl(1, (pillarWidth - bandInset) / 2, baseHeight, 40, [0, 0, 0]),
            ccyl(2, (pillarWidth - bandInset) / 2, capHeight, 40, [
              0,
              baseHeight + shaftHeight,
              0
            ])
          ]
        : [
            extrude(
              1,
              pillarOutline(shape, pillarWidth - bandInset, pillarDepth - bandInset),
              baseHeight,
              [0, 0, 0],
              { centered: true, rot: [-90, 0, 0] }
            ),
            extrude(
              2,
              pillarOutline(shape, pillarWidth - bandInset, pillarDepth - bandInset),
              capHeight,
              [0, baseHeight + shaftHeight, 0],
              { centered: true, rot: [-90, 0, 0] }
            )
          ];
    parts.push(bandParts[0], shaftPart, bandParts[1]);
  }
  return {
    note: `${shapeLabel}：柱脚 + 柱身 + 柱帽三段（同截面叠起，靠材质分色读线脚，不外扩占地）。`,
    size: [pillarWidth, pillarHeight, pillarDepth],
    // 方柱的 lite 与完整版同形（纯方盒没有可降的分段，而柱帽必须撑高度），
    ...(shape === "square" ? { liteVertexBudgetRatio: 1 } : {}),
    slots: [
      { role: "body", color: 0xefede8, roughness: 0.66, metalness: 0.02 },
      { role: "base", color: 0xdcd7cd, roughness: 0.7, metalness: 0.02 },
      { role: "trim", color: 0xe6e2da, roughness: 0.6, metalness: 0.03 }
    ],
    parts
  };
}

/**
 * U 形双跑楼梯的跑位计算（钢楼梯 / 玻璃楼梯共用）。
 */
function uStairLayout({ size, flightWidth, stringerHeight, riserCount = 10, landingDepth = 0.5 }) {
  const [stairWidth, stairHeight, stairDepth] = size;
  const halfWidth = stairWidth / 2;
  const halfDepth = stairDepth / 2;
  // 平台贴在 -z 端；两跑分别从 +z 端往 -z 升、再从平台往 +z 升。
  const landingFrontZ = -halfDepth + landingDepth;
  const landingCenterZ = -halfDepth + landingDepth / 2;
  const run = halfDepth - landingFrontZ;
  const flightRise = stairHeight / (riserCount * 2);
  const flightTopY = flightRise * riserCount;
  const treadDepth = run / riserCount;
  const flightGap = stairWidth - flightWidth * 2;
  const flightCentersX = [
    -(flightGap / 2 + flightWidth / 2),
    flightGap / 2 + flightWidth / 2
  ];
  // 斜梁：沿梯段对角线的一根箱形梁，坡度就是楼梯坡度。长度**按竖直外框反解**，取到
  const stringerAngleDegrees = (Math.atan2(flightTopY, run) * 180) / Math.PI;
  const stringerRadians = (stringerAngleDegrees * Math.PI) / 180;
  const stringerLength =
    (flightTopY * 0.995 - stringerHeight * Math.cos(stringerRadians)) /
    Math.sin(stringerRadians);
  return {
    stairWidth,
    halfWidth,
    halfDepth,
    halfHeight: stairHeight / 2,
    landingFrontZ,
    landingCenterZ,
    landingDepth,
    run,
    flightRise,
    flightTopY,
    treadDepth,
    riserCount,
    flightWidth,
    flightCentersX,
    stringerHeight,
    stringerLength,
    stringerAngleDegrees,
    stringerCenterZ: (halfDepth + landingFrontZ) / 2
  };
}

/**
 * 由跑位参数拼出一件 U 形双跑楼梯的全部零件。
 */
function uStairParts({
  layout,
  treadSlot,
  treadThickness,
  structureSlot,
  nosingSlot,
  treadInset,
  landingPlateThickness,
  landingInset = 0
}) {
  const parts = [];
  for (const flightIndex of [0, 1]) {
    const flightCenterX = layout.flightCentersX[flightIndex];
    // 斜梁的坡度对两跑是同一角度、相反方向：第一跑从 +z 往 -z 升，第二跑反过来。
    const stringerAngle = (flightIndex === 0 ? 1 : -1) * layout.stringerAngleDegrees;
    const stringerBaseY = flightIndex === 0 ? 0 : layout.flightTopY;
    for (const stringerX of [
      flightCenterX - layout.flightWidth / 2 + 0.025,
      flightCenterX + layout.flightWidth / 2 - 0.025
    ]) {
      parts.push(
        cbox(
          structureSlot,
          [0.05, layout.stringerHeight, layout.stringerLength],
          [stringerX, stringerBaseY, layout.stringerCenterZ],
          { centered: true, rot: [stringerAngle, 0, 0] }
        )
      );
    }
    for (let step = 0; step < layout.riserCount; step += 1) {
      const stepTopY = layout.flightRise * (step + 1) + flightIndex * layout.flightTopY;
      const stepCenterZ =
        flightIndex === 0
          ? layout.halfDepth - layout.treadDepth * (step + 0.5)
          : layout.landingFrontZ + layout.treadDepth * (step + 0.5);
      const treadWidth = layout.flightWidth - treadInset - 0.004;
      // 踏板两条长边原与斜梁的内外表面**逐面齐平**（两件朝向相同 → 同向共面，钢梯 34~36cm²/处、
      const stepFrontSign = flightIndex === 0 ? 1 : -1;
      parts.push(
        cbox(treadSlot, [treadWidth, treadThickness, layout.treadDepth], [
          flightCenterX,
          stepTopY - treadThickness,
          stepCenterZ
        ])
      );
      if (treadInset > 0) {
        // 玻璃踏板的钢包边：夹在玻璃两条长边外侧（正好占满那 5cm 的缩进），
        parts.push(
          ...mirrorPair(
            cbox(
              nosingSlot,
              [treadInset / 2, treadThickness, layout.treadDepth - 0.006],
              [flightCenterX + treadWidth / 2 + treadInset / 4 - 0.005, stepTopY - treadThickness - 0.001, stepCenterZ],
              { centered: true, fullOnly: true }
            )
          )
        );
      } else {
        // 钢楼梯的防滑条：踏面前缘往里 3cm 的一条窄带，压在踏面下 1mm（做成凹槽而不是凸棱）。
        parts.push(
          cbox(
            nosingSlot,
            [treadWidth - 0.24, 0.008, 0.02],
            [
              flightCenterX,
              stepTopY - 0.009,
              stepCenterZ + stepFrontSign * (layout.treadDepth / 2 - 0.03)
            ],
            { fullOnly: true }
          )
        );
      }
    }
  }
  // 中间平台：平台板 + 三根边梁。缩进只做在**宽度**方向（两侧留给边梁）；
  const landingPlateWidth = layout.stairWidth - landingInset;
  parts.push(
    cbox(treadSlot, [landingPlateWidth, landingPlateThickness, layout.landingDepth], [
      0,
      layout.flightTopY - landingPlateThickness,
      layout.landingCenterZ
    ]),
    // 边梁的**顶面**原正好顶住平台板底面（都在 flightTopY − 板厚）。木板单面渲染时那是一对
    cbox(structureSlot, [layout.stairWidth, 0.1, 0.05], [
      0,
      layout.flightTopY - landingPlateThickness - 0.103,
      layout.landingFrontZ + 0.025
    ], { fullOnly: true }),
    ...mirrorPair(
      cbox(structureSlot, [0.05, 0.1, layout.landingDepth], [
        layout.halfWidth - 0.025,
        layout.flightTopY - landingPlateThickness - 0.103,
        layout.landingCenterZ
      ], { centered: true, fullOnly: true })
    )
  );
  return parts;
}

export const MODEL_SPECS = Object.freeze({
  cabinet: {
    note: "衣柜 / 储物柜：柜体 + 双侧框架 + 对开门 + 踢脚 + 竖条拉手。门板前留 5.6cm 侧回边与 2.8cm 中缝，读成成品柜。",
    size: [1.6, 1.9, 0.45],
    // 八件全是方盒：没有分段可降，而**拉手是最前缘**（撑住 0.45 的进深），一件都丢不得 ——
    liteVertexBudgetRatio: 1,
    slots: [
      { role: "body", color: 0x5a3a22, roughness: 0.66, metalness: 0 },
      { role: "door", color: 0xf5f3ef, roughness: 0.24, metalness: 0.08 },
      { role: "metal", color: 0x9aa1a8, roughness: 0.32, metalness: 0.3 },
      { role: "trim", color: 0x5a3a22, roughness: 0.66, metalness: 0 },
      { role: "base", color: 0x4a2e1a, roughness: 0.7, metalness: 0 }
    ],
    parts: [
      // 踢脚：内缩 5cm，底边落地 —— 落地那 6cm 因此是踢脚而不是柜体。
      cbox(4, [1.46, 0.06, 0.38], [0, 0, -0.03]),
      // 柜体箱体：底面抬到 0.06（踢脚之上），深度到门板背后为止。
      cbox(0, [1.56, 1.84, 0.41], [0, 0.06, -0.02]),
      // 左右侧框架：把门板框住，正面留出 3.6cm 侧回边，同时凑满满宽 1.6。
      cbox(3, [0.02, 1.84, 0.41], [-0.79, 0.06, -0.02]),
      cbox(3, [0.02, 1.84, 0.41], [0.79, 0.06, -0.02]),
      // 对开门：各 0.73 宽，中缝 2.8cm，上端留 5.5cm 顶回边、下端与踢脚平齐。
      cbox(1, [0.73, 1.785, 0.02], [-0.379, 0.06, 0.195]),
      cbox(1, [0.73, 1.785, 0.02], [0.379, 0.06, 0.195]),
      // 竖条拉手：贴在中缝两侧，凸出门板 2cm。**它是最前缘（-0.225…0.225 就是这 0.45）**，
      cbox(2, [0.02, 0.28, 0.02], [-0.036, 1, 0.215]),
      cbox(2, [0.02, 0.28, 0.02], [0.036, 1, 0.215])
    ]
  },
  coffeetable: {
    note: "组合茶几：悬挑的白色石板压在通体黑色石座上，两件叠合错位；白石板即石材台面。",
    size: [1.9, 0.5, 1.05],
    slots: [
      { role: "top", color: 0xf2f1ed, roughness: 0.18, metalness: 0.02 },
      { role: "base", color: 0x1e2023, roughness: 0.15, metalness: 0.03 }
    ],
    parts: [
      // 黑石座：落地那一件。右端顶到 +0.95，长 1.72 / 深 1.05 —— 长宽比 1.64。
      croundedBox(1, [1.72, 0.3, 1.05], [0.09, 0, 0], { radius: 0.008 }),
      // 白石板：坐在黑石座之上（0.30 → 0.50），向左错位悬挑，左端顶到 -0.95 把总宽凑满 1.90。
      croundedBox(0, [1.0, 0.2, 0.85], [-0.45, 0.3, 0], { radius: 0.008 })
    ]
  },
  // ── 三人沙发（布艺座位的样板）────────────────────────────────────────────
  sofa: {
    note: "三人沙发：收分木脚 + 木框座台 + 一体软包座箱 / 靠背 / 扶手 + 三块可分离坐垫 + 三块靠垫 + 两只抱枕。",
    size: [2.2, 0.82, 0.9],
    slots: [
      { role: "leg", color: 0xbc9163, roughness: 0.7, metalness: 0 },
      { role: "frame", color: 0xc49a6c, roughness: 0.68, metalness: 0 },
      { role: "upholstery", color: 0xf3e7d8, roughness: 0.92, metalness: 0 },
      { role: "cushion", color: 0xefe0cd, roughness: 0.92, metalness: 0 },
      { role: "accent", color: 0xd8b49c, roughness: 0.9, metalness: 0 }
    ],
    parts: [
      // 四条收分木脚：0 → 0.12。腿心内缩到 ±1.02 / ±0.36，整条腿都藏在座箱投影里 ——
      ...mirrorPair([
        ctaper(0, 0.028, 0.02, 0.12, 12, [1.02, 0, 0.36]),
        ctaper(0, 0.028, 0.02, 0.12, 12, [1.02, 0, -0.36])
      ]),
      // 座台木框：宽深吃满 2.2 × 0.9 —— 沙发的占地由它定，前面那四条腿都在它投影之内。
      cbox(1, [2.2, 0.09, 0.9], [0, 0.12, 0]),
      // 座箱软包：坐在木框上（0.21 → 0.38）。扶手与靠背都从这一层长上去。
      croundedBox(2, [2.2, 0.17, 0.9], [0, 0.21, 0], { radius: 0.03 }),
      // 靠背：贴着座箱后沿（z −0.45 → −0.27），顶端正好落在 0.82 —— 整件高度由它定。
      croundedBox(2, [2.2, 0.61, 0.18], [0, 0.21, -0.36], { radius: 0.05 }),
      // 两侧扶手：宽 0.18、外沿顶到 ±1.10，比靠背低 19cm。拖到与靠背齐平会读成一张围子床。
      ...mirrorPair(croundedBox(2, [0.18, 0.42, 0.9], [1.01, 0.21, 0], { radius: 0.05 })),
      // 三块可分离坐垫：正好铺满两侧扶手之间的 1.84m（3 × 0.6 + 两条 2cm 缝），
      croundedBox(3, [0.6, 0.14, 0.66], [-0.62, 0.38, 0.06], { radius: 0.04 }),
      croundedBox(3, [0.6, 0.14, 0.66], [0, 0.38, 0.06], { radius: 0.04 }),
      croundedBox(3, [0.6, 0.14, 0.66], [0.62, 0.38, 0.06], { radius: 0.04 }),
      // 三块靠垫：倚在靠背上，下沿压住坐垫 2cm（悬空摆会读成三块飘着的板）。
      croundedBox(3, [0.58, 0.34, 0.18], [-0.61, 0.4, -0.18], { radius: 0.05 }),
      croundedBox(3, [0.58, 0.34, 0.18], [0, 0.4, -0.18], { radius: 0.05 }),
      croundedBox(3, [0.58, 0.34, 0.18], [0.61, 0.4, -0.18], { radius: 0.05 }),
      // 两只抱枕：撞色件，靠在两侧的靠垫前。只在完整版保留 —— lite 那份先把它们丢掉，
      ...mirrorPair(
        croundedBox(4, [0.36, 0.32, 0.13], [0.66, 0.44, -0.02], { radius: 0.05, fullOnly: true })
      )
    ]
  },
  // ── 客厅休闲椅与凳 ───────────────────────────────────────────────────────
  armchair: {
    note: "单人沙发椅：木框架（座台 + 望板 + 收分木脚）+ 布艺坐垫 / 靠背 + 扶手 + 靠枕。",
    size: [0.85, 0.75, 0.8],
    slots: [
      { role: "leg", color: 0xbc9163, roughness: 0.7, metalness: 0 },
      { role: "frame", color: 0xc49a6c, roughness: 0.68, metalness: 0 },
      { role: "upholstery", color: 0xf3e7d8, roughness: 0.92, metalness: 0 },
      { role: "accent", color: 0xe4d5c2, roughness: 0.9, metalness: 0 },
      { role: "cushion", color: 0xefe0cd, roughness: 0.92, metalness: 0 }
    ],
    parts: [
      ...mirrorPair([
        ctaper(0, 0.022, 0.016, 0.16, 12, [0.375, 0, 0.335]),
        ctaper(0, 0.022, 0.016, 0.16, 12, [0.375, 0, -0.335])
      ]),
      // 座台：深度吃满 0.8（沙发的进深就由它定），腿藏在四角内侧。
      cbox(1, [0.79, 0.07, 0.8], [0, 0.16, 0]),
      croundedBox(2, [0.76, 0.14, 0.72], [0, 0.3, 0], { radius: 0.05 }),
      // 靠背：顶端正好落在 0.75（0.37 + 0.38）。
      croundedBox(2, [0.79, 0.38, 0.14], [0, 0.37, -0.31], { radius: 0.05 }),
      // 扶手：宽度撑满 0.85，是这件家具在平面图上最外的一圈。
      ...mirrorPair(croundedBox(3, [0.09, 0.2, 0.7], [0.38, 0.4, -0.025], { radius: 0.04 })),
      croundedBox(4, [0.5, 0.24, 0.1], [0, 0.5, -0.2], { radius: 0.04, fullOnly: true })
    ]
  },
  loungechair: {
    note: "休闲躺椅：皮革长条座面 + 后仰靠背（靠背顶端正好落在 0.85），细金属框架腿。",
    size: [0.7, 0.85, 1.6],
    slots: [
      { role: "leg", color: 0x2e2a26, roughness: 0.4, metalness: 0.25 },
      { role: "upholstery", color: 0xb0703c, roughness: 0.62, metalness: 0.02 },
      { role: "accent", color: 0x9c5f30, roughness: 0.62, metalness: 0.02 }
    ],
    parts: [
      ...mirrorPair([
        ctaper(0, 0.02, 0.016, 0.3, 10, [0.325, 0, 0.755]),
        ctaper(0, 0.02, 0.016, 0.3, 10, [0.325, 0, -0.755])
      ]),
      // 座面：进深吃满 1.6（0.8 × 2），靠背与横杆都收在它里面。
      croundedBox(1, [0.7, 0.12, 1.6], [0, 0.3, 0], { radius: 0.05 }),
      croundedBox(
        2,
        [0.696, 0.6, 0.12],
        [0, 0.307, -0.6163],
        { radius: 0.05, rot: [-30, 0, 0] }
      ),
      box(0, [0.66, 0.035, 0.05], [-0.33, 0.14, -0.8]),
      box(0, [0.66, 0.035, 0.05], [-0.33, 0.14, 0.75], { fullOnly: true })
    ]
  },
  ottoman: {
    note: "脚凳：圆角方软包 + 四条收分木脚 + 顶面压线，可兼作临时坐凳。",
    size: [0.6, 0.4, 0.45],
    slots: [
      { role: "leg", color: 0xbc9163, roughness: 0.7, metalness: 0 },
      { role: "upholstery", color: 0xe4d5c2, roughness: 0.92, metalness: 0 },
      { role: "trim", color: 0xd8c6b0, roughness: 0.9, metalness: 0 }
    ],
    parts: [
      ...mirrorPair([
        ctaper(0, 0.022, 0.016, 0.12, 12, [0.255, 0, 0.185]),
        ctaper(0, 0.022, 0.016, 0.12, 12, [0.255, 0, -0.185])
      ]),
      // 软包坐面：0.125 ~ 0.40（圆角方包）。底面比压线高 5mm —— 见下面压线那条注释。
      croundedBox(1, [0.6, 0.275, 0.45], [0, 0.125, 0], { radius: 0.07 }),
      // 束腰压线：贴地那一圈内缩 2cm，读起来是「布面收在木脚上」而不是一坨布压在地上。
      croundedBox(2, [0.56, 0.05, 0.41], [0, 0.12, 0], { radius: 0.012, fullOnly: true })
    ]
  },
  bench: {
    note: "长凳：厚座板 + 四条收分腿 + 三面望板 + 底横杆，餐桌侧或床尾都能用。",
    size: [1.4, 0.45, 0.42],
    slots: [
      { role: "top", color: 0xc49a6c, roughness: 0.68, metalness: 0 },
      { role: "leg", color: 0xbc9163, roughness: 0.68, metalness: 0 },
      { role: "trim", color: 0x9c6b3f, roughness: 0.68, metalness: 0 }
    ],
    parts: [
      ...mirrorPair([
        ctaper(1, 0.026, 0.019, 0.405, 14, [0.61, 0, 0.15]),
        ctaper(1, 0.026, 0.019, 0.405, 14, [0.61, 0, -0.15])
      ]),
      // 望板：长边两道 + 短边两道，望板是「这是一件木工家具」最省顶点的表达。
      cbox(2, [1.24, 0.07, 0.024], [0, 0.33, 0.185]),
      cbox(2, [1.24, 0.07, 0.024], [0, 0.33, -0.185]),
      ...mirrorPair(cbox(2, [0.024, 0.07, 0.3], [0.6, 0.33, 0])),
      cbox(0, [1.4, 0.045, 0.42], [0, 0.405, 0]),
      ccyl(1, 0.012, 1.16, 10, [0, 0.14, 0], { rot: [0, 0, 90], align: "center", fullOnly: true })
    ]
  },
  chair: {
    note: "餐椅：四条收分木脚 + 木座框 + 软包坐垫 + 后腿延伸的靠背立柱与上横档 + 靠背软垫。",
    size: [0.5, 0.86, 0.5],
    slots: [
      { role: "leg", color: 0xbc9163, roughness: 0.7, metalness: 0 },
      { role: "frame", color: 0xc49a6c, roughness: 0.66, metalness: 0 },
      { role: "upholstery", color: 0xe4d5c2, roughness: 0.92, metalness: 0 }
    ],
    parts: [
      // 四条收分木脚：0 → 0.415，腿心在 ±0.21 / ±0.21，收在坐垫投影之内。
      ...mirrorPair([
        ctaper(0, 0.022, 0.016, 0.415, 10, [0.21, 0, 0.21]),
        ctaper(0, 0.022, 0.016, 0.415, 10, [0.21, 0, -0.21])
      ]),
      // 木座框：0.37 → 0.42，比坐垫小一圈（坐垫的边要压出来）。
      cbox(1, [0.46, 0.05, 0.46], [0, 0.37, 0]),
      // 软包坐垫：宽深吃满 0.5 × 0.5 —— 餐椅的占地由它定。
      croundedBox(2, [0.5, 0.07, 0.5], [0, 0.42, 0], { radius: 0.03 }),
      // 靠背立柱：与后腿同一根料、往上接到 0.86（整件高度由它定）。
      ...mirrorPair(cbox(1, [0.045, 0.44, 0.045], [0.21, 0.42, -0.21])),
      // 上横档：把两根立柱连起来，宽 0.465 刚好落在两柱外沿之间。
      cbox(1, [0.465, 0.06, 0.05], [0, 0.8, -0.21]),
      // 靠背软垫：夹在两根立柱之间（两端各留 1.5cm 让立柱露出来）。
      croundedBox(2, [0.36, 0.22, 0.045], [0, 0.56, -0.21], { radius: 0.02 })
    ]
  },
  barstool: {
    note: "吧凳：外八金属腿 + 环状踏脚 + 圆木座面（带盘边），配吧台用。",
    size: [0.42, 0.95, 0.42],
    slots: [
      { role: "leg", color: 0x454c54, roughness: 0.32, metalness: 0.3 },
      { role: "top", color: 0xc49a6c, roughness: 0.66, metalness: 0 }
    ],
    parts: [
      // 四条腿外八 3°：站得开、看着稳；环列时朝向自动补正，不必自己算 sin / cos。
      ...ringOf(4, { radius: 0.135, startAngle: 45 }, () =>
        ctaper(0, 0.016, 0.012, 0.9, 14, [0, 0, 0], { rot: [3, 0, 0] })
      ),
      // 踏脚圈：一个环比四根横杆更省顶点，也更像实物（圈随腿外八略微放大到 0.148）。
      ctorus(0, 0.148, 0.009, [0, 0.27, 0], { fullOnly: true }),
      clathe(
        1,
        [
          [0, 0],
          [0.21, 0],
          [0.21, 0.035],
          [0.19, 0.05],
          [0, 0.05],
          [0, 0]
        ],
        36,
        [0, 0.9, 0]
      )
    ]
  },
  sidetable: {
    note: "边几：薄台面 + 四条收分木腿 + 下层置物板，沙发扶手旁的置物小几。",
    size: [0.45, 0.55, 0.45],
    slots: [
      { role: "top", color: 0xc49a6c, roughness: 0.68, metalness: 0 },
      { role: "leg", color: 0xbc9163, roughness: 0.68, metalness: 0 },
      { role: "shelf", color: 0xc49a6c, roughness: 0.68, metalness: 0 }
    ],
    parts: [
      // 四条腿摆在四角（环列 + 45° 起始角），上粗下细 —— 真实边几的腿都有一点收分。
      ...ringOf(4, { radius: 0.269, startAngle: 45 }, () =>
        ctaper(1, 0.018, 0.012, 0.52, 14, [0, 0, 0])
      ),
      cbox(0, [0.45, 0.03, 0.45], [0, 0.52, 0]),
      cbox(2, [0.34, 0.02, 0.34], [0, 0.17, 0], { fullOnly: true })
    ]
  },
  console: {
    note: "玄关台：窄长台面 + 单层抽屉 + 四条收分腿 + 底横撑，靠墙放钥匙与摆件。",
    size: [1.2, 0.8, 0.35],
    slots: [
      { role: "top", color: 0xc49a6c, roughness: 0.68, metalness: 0 },
      { role: "body", color: 0xc49a6c, roughness: 0.68, metalness: 0 },
      { role: "drawer", color: 0xd8b98f, roughness: 0.62, metalness: 0 },
      { role: "leg", color: 0xbc9163, roughness: 0.68, metalness: 0 },
      { role: "trim", color: 0x9c6b3f, roughness: 0.68, metalness: 0 }
    ],
    parts: [
      ...mirrorPair([
        ctaper(3, 0.022, 0.016, 0.6, 14, [0.545, 0, 0.135]),
        ctaper(3, 0.022, 0.016, 0.6, 14, [0.545, 0, -0.135])
      ]),
      cbox(1, [1.12, 0.165, 0.32], [0, 0.6, 0]),
      cbox(2, [1.04, 0.12, 0.02], [0, 0.615, 0.16]),
      // 拉手：一条通长的木条比两个小圆钮更像这一档家具的做法。
      cbox(2, [0.26, 0.018, 0.016], [0, 0.685, 0.167], { fullOnly: true }),
      cbox(4, [1.06, 0.028, 0.26], [0, 0.22, 0], { fullOnly: true }),
      cbox(0, [1.2, 0.035, 0.35], [0, 0.765, 0])
    ]
  },

  nightstand: {
    note: "床头柜：四条收分木腿 + 上层抽屉箱 + 下层敞格层板 + 台面。",
    size: [0.5, 0.55, 0.42],
    slots: [
      { role: "leg", color: 0x5a3a22, roughness: 0.62, metalness: 0 },
      { role: "body", color: 0x5a3a22, roughness: 0.64, metalness: 0 },
      { role: "drawer", color: 0xd8d6d0, roughness: 0.45, metalness: 0.12 },
      { role: "top", color: 0x9c6b3f, roughness: 0.5, metalness: 0 },
      { role: "metal", color: 0x9aa1a8, roughness: 0.3, metalness: 0.42 },
      { role: "shelf", color: 0x8a6a4a, roughness: 0.62, metalness: 0 }
    ],
    parts: [
      // 腿心退到 ±0.20 / ±0.16：腿间净空够宽，才读得出是「四条腿」而不是一块箱座。
      ...fourLegs(0, { legSpanX: 0.2, legSpanZ: 0.16, legSize: 0.036, height: 0.34, square: false }),
      cbox(5, [0.42, 0.018, 0.36], [0, 0.14, -0.01]),
      cbox(1, [0.42, 0.2, 0.018], [0, 0.158, -0.191], { fullOnly: true }),
      // 抽屉箱体坐在腿上（0.34 → 0.528），比台面各缩 2cm，台面才有「压边」可读。
      cbox(1, [0.46, 0.188, 0.38], [0, 0.34, -0.01]),
      cbox(2, [0.4, 0.15, 0.02], [0, 0.355, 0.185]),
      cbox(4, [0.16, 0.014, 0.014], [0, 0.462, 0.202], { fullOnly: true }),
      // 台面：整件最宽最深的一件，占地 0.5 × 0.42 由它定。
      cbox(3, [0.5, 0.022, 0.42], [0, 0.528, 0])
    ]
  },
  tvstand: {
    note: "电视柜：踢脚 + 左右抽屉箱 + 中间敞开层格 + 台面（顶面能放电视），左右各一根横向拉手。",
    size: [1.8, 0.48, 0.42],
    slots: [
      { role: "body", color: 0x5a3a22, roughness: 0.64, metalness: 0 },
      { role: "base", color: 0x3f2916, roughness: 0.66, metalness: 0 },
      { role: "drawer", color: 0xd8d6d0, roughness: 0.45, metalness: 0.12 },
      { role: "top", color: 0x9c6b3f, roughness: 0.5, metalness: 0 },
      { role: "interior", color: 0x8a6a4a, roughness: 0.66, metalness: 0 },
      { role: "shelf", color: 0x8a6a4a, roughness: 0.62, metalness: 0 },
      { role: "metal", color: 0x9aa1a8, roughness: 0.3, metalness: 0.42 }
    ],
    parts: [
      // 踢脚内缩 6cm：落地那 5cm 因此是踢脚而不是箱体正面。
      cbox(1, [1.68, 0.05, 0.3], [0, 0, -0.03]),
      // 左右抽屉箱各 0.58 宽，中间留 0.6 的敞开格（机顶盒 / 音响放这里）。
      cbox(0, [0.58, 0.4, 0.4], [-0.59, 0.05, -0.01]),
      cbox(0, [0.58, 0.4, 0.4], [0.59, 0.05, -0.01]),
      cbox(4, [0.6, 0.4, 0.018], [0, 0.05, -0.201], { fullOnly: true }),
      // 层板比敞开格的净宽（0.6）窄 4mm：净宽与背板同宽会让两者的 **+x / −x 侧面同向共面**
      cbox(5, [0.596, 0.016, 0.38], [0, 0.25, -0.01], { fullOnly: true }),
      cbox(2, [0.52, 0.3, 0.02], [-0.59, 0.09, 0.19]),
      cbox(2, [0.52, 0.3, 0.02], [0.59, 0.09, 0.19]),
      cbox(6, [0.3, 0.014, 0.014], [-0.59, 0.352, 0.202], { fullOnly: true }),
      cbox(6, [0.3, 0.014, 0.014], [0.59, 0.352, 0.202], { fullOnly: true }),
      // 台面：整件最宽最深的一件，占地 1.8 × 0.42 由它定。
      cbox(3, [1.8, 0.03, 0.42], [0, 0.45, 0])
    ]
  },
  bookcase: {
    note:
      "书柜：落地踢脚 + 双侧板 + 中竖板（分左右两列）+ 下柜双门与竖条拉手 + 四层可调层板 + 背板 + 顶板；" +
      "格口里是成排的书（竖立 / 斜靠 / 平放）与花瓶、相框摆件。",
    size: [1.2, 1.9, 0.32],
    slots: [
      { role: "body", color: 0x5a3a22, roughness: 0.64, metalness: 0 },
      { role: "base", color: 0x3f2916, roughness: 0.66, metalness: 0 },
      { role: "shelf", color: 0xd8b98f, roughness: 0.6, metalness: 0 },
      { role: "interior", color: 0x8a6a4a, roughness: 0.68, metalness: 0 },
      { role: "top", color: 0x9c6b3f, roughness: 0.5, metalness: 0 },
      { role: "door", color: 0xd8b98f, roughness: 0.54, metalness: 0 },
      { role: "metal", color: 0x9aa1a8, roughness: 0.3, metalness: 0.42 },
      { role: "book", color: 0xcbb289, roughness: 0.82, metalness: 0 },
      { role: "accent", color: 0xa9563f, roughness: 0.78, metalness: 0 }
    ],
    // 尺寸标注（全部是「底面高度」，与 cbox 的 y 语义一致；盒厚 0.018）：
    parts: [
      // ── 柜体 ────────────────────────────────────────────────────────────────
      // 踢脚：正面让开 4cm、两侧让开 2cm，落地那 6cm 因此读成踢脚而不是柜体正面。
      cbox(1, [1.12, 0.06, 0.24], [0, 0, -0.02]),
      // 侧板：落地到顶板里 1cm（1.86），而且**比顶板窄 2mm**（±0.598 对 ±0.6）——
      cbox(0, [0.02, 1.8, 0.29], [-0.588, 0.06, -0.005]),
      cbox(0, [0.02, 1.8, 0.29], [0.588, 0.06, -0.005]),
      cbox(0, [0.016, 1.34, 0.29], [0, 0.52, -0.005]),
      // 背板走 interior：正对格口的那一面就是它，也是「有背板」与「通透架」的区别所在。
      cbox(3, [1.146, 1.765, 0.014], [0, 0.08, -0.141]),
      // 下柜底板：抬高 2mm 坐在踢脚上（严格贴着踢脚顶面就是一对共面三角形）。
      cbox(2, [1.15, 0.018, 0.25], [0, 0.062, -0.005]),
      // 下柜顶面（同时是第一层层板）与另外三层层板。
      ...[0.51, 0.852, 1.192, 1.532].map(bookcaseShelfY =>
        cbox(2, [1.15, 0.018, 0.25], [0, bookcaseShelfY, -0.005])
      ),
      ...mirrorPair(cbox(5, [0.556, 0.426, 0.016], [0.29, 0.072, 0.138])),
      // 竖条拉手贴在中缝两侧：正面到 0.16，正好与顶板前缘齐平 —— 再往外就越过占地（深度 0.32）。
      ...mirrorPair(cbox(6, [0.014, 0.14, 0.016], [0.045, 0.32, 0.152])),
      // 顶板：占地 1.2 × 0.32 由它定，两侧各压出侧板 2mm。
      cbox(4, [1.2, 0.05, 0.32], [0, 1.85, 0]),
      // ── 格口里的书与摆件 ───────────────────────────────────────────────────
      // 左右两列各四个格口（下柜之上四层）；两列给不同的种子，书的厚度 / 高度 / 颜色分布因此不同。
      ...bookcaseShelfContents(),
      // 最上层右格让给摆件：一只花瓶 + 一个相框，免得整柜读成仓库。
      ...bookcaseDecorParts({
        bottomY: 1.546,
        centerX: 0.16,
        zCenter: 0.02,
        slot: 8,
        kind: "vase",
        height: 0.24,
        seed: 91
      }),
      ...bookcaseDecorParts({
        bottomY: 1.546,
        centerX: 0.42,
        zCenter: 0.01,
        slot: 6,
        kind: "frame",
        height: 0.22,
        seed: 17
      })
    ]
  },
  glasscabinet: {
    note: "玻璃柜：踢脚 + 柜体（顶底板 / 双侧板 / 背板 / 中竖板）+ 两块木层板 + 两扇整扇玻璃门 + 竖条拉手。",
    size: [1.2, 1.9, 0.4],
    slots: [
      { role: "body", color: 0x5a3a22, roughness: 0.64, metalness: 0 },
      { role: "glass", color: 0xa9c5d3, roughness: 0.12, metalness: 0.04 },
      { role: "interior", color: 0x8a6a4a, roughness: 0.68, metalness: 0 },
      { role: "shelf", color: 0xd8b98f, roughness: 0.6, metalness: 0 },
      { role: "base", color: 0x3f2916, roughness: 0.66, metalness: 0 },
      { role: "metal", color: 0x9aa1a8, roughness: 0.3, metalness: 0.42 },
      { role: "top", color: 0x9c6b3f, roughness: 0.5, metalness: 0 }
    ],
    parts: [
      cbox(4, [1.12, 0.08, 0.32], [0, 0, -0.03]),
      // 顶板：占地 1.2 × 0.4 由它定。
      cbox(6, [1.2, 0.06, 0.4], [0, 1.84, 0]),
      cbox(0, [1.14, 0.02, 0.36], [0, 0.08, -0.01]),
      cbox(0, [0.02, 1.76, 0.36], [-0.58, 0.08, -0.01]),
      cbox(0, [0.02, 1.76, 0.36], [0.58, 0.08, -0.01]),
      // 背板走 interior：透过玻璃直视到的就是它，也是玻璃「透不透」的关键一面。
      cbox(2, [1.14, 1.74, 0.014], [0, 0.10, -0.179]),
      cbox(2, [0.016, 1.74, 0.352], [0, 0.10, -0.01], { fullOnly: true }),
      // 层板：宽收 4mm、后缘让到背板正面（−0.172）、底面抬到 0.10，三处原都与背板同面
      ...[0.66, 1.26].map(glassCabinetShelfY =>
        cbox(3, [1.136, 0.018, 0.322], [0, glassCabinetShelfY, -0.011])
      ),
      // 两扇整扇玻璃门：无框中缝 5mm，正面到 0.19。
      cbox(1, [0.573, 1.72, 0.01], [-0.2895, 0.1, 0.185]),
      cbox(1, [0.573, 1.72, 0.01], [0.2895, 0.1, 0.185]),
      // 竖条拉手贴在中缝两侧：正面到 0.2，与顶板前缘齐平，不越占地。
      cbox(5, [0.018, 0.18, 0.008], [-0.032, 0.86, 0.196], { fullOnly: true }),
      cbox(5, [0.018, 0.18, 0.008], [0.032, 0.86, 0.196], { fullOnly: true })
    ]
  },
  shelf: {
    note: "置物架：两块侧板 + 四层开放式置物板 + 顶部横板 + 后侧两根拉杆（结构与侧面全敞开）。",
    size: [1.2, 1.8, 0.45],
    slots: [
      { role: "body", color: 0x5a3a22, roughness: 0.64, metalness: 0 },
      { role: "shelf", color: 0xd8b98f, roughness: 0.6, metalness: 0 },
      { role: "top", color: 0x9c6b3f, roughness: 0.5, metalness: 0 },
      { role: "metal", color: 0x9aa1a8, roughness: 0.34, metalness: 0.4 }
    ],
    parts: [
      cbox(0, [0.024, 1.765, 0.42], [-0.588, 0, -0.015]),
      cbox(0, [0.024, 1.765, 0.42], [0.588, 0, -0.015]),
      ...[0, 0.42, 0.84, 1.26].map(shelfBoardY => cbox(1, [1.152, 0.024, 0.42], [0, shelfBoardY, -0.015])),
      // 后侧两根拉杆：细杆把两侧板连起来（真实置物架都有这道抗剪构件），也是「通透架」的记号。
      cbox(3, [1.148, 0.02, 0.02], [0, 0.44, -0.214], { fullOnly: true }),
      cbox(3, [1.148, 0.02, 0.02], [0, 1.71, -0.214], { fullOnly: true }),
      // 顶板：占地 1.2 × 0.45 由它定。
      cbox(2, [1.2, 0.035, 0.45], [0, 1.765, 0])
    ]
  },
  wallcabinet: {
    note:
      "吊柜：柜体（顶底板 / 双侧板 / 背板 / 中竖板 + 层板）+ 双开门 + 竖条拉手；无腿，靠挂墙件悬空。" +
      "挂高（柜底 1.4m）烘在几何里，见 mountHeight —— 与**原版既有资产同一个口径**：那台吊柜的柜底" +
      "也在 1.378m，而原版的 ITEM_TYPE_DEFINITIONS.wallcabinet 里没有 elevation，摆位只把 elevation" +
      "当「在这一段之上再加的偏移」。本仓把挂高留在 elevation 里的话，同一个草稿在原版打开就会抬两次。",
    size: [1.5, 0.82, 0.35],
    // 挂高烘进几何：导出时整件抬起 1.4m（成品几何 y ∈ [1.4, 2.22]，声明高度仍是 0.82 的柜体）。
    mountHeight: 1.4,
    slots: [
      { role: "body", color: 0x5a3a22, roughness: 0.64, metalness: 0 },
      { role: "door", color: 0xf5f3ef, roughness: 0.42, metalness: 0.06 },
      { role: "top", color: 0x9c6b3f, roughness: 0.5, metalness: 0 },
      { role: "interior", color: 0x8a6a4a, roughness: 0.68, metalness: 0 },
      { role: "shelf", color: 0xd8b98f, roughness: 0.6, metalness: 0 },
      { role: "metal", color: 0x9aa1a8, roughness: 0.3, metalness: 0.42 }
    ],
    parts: [
      // 围板厚 2cm：吊柜没有踢脚，底板就是整件（0 基）的地面 —— 底面 y = 0，挂高由 mountHeight 抬。
      cbox(0, [1.46, 0.02, 0.3], [0, 0, -0.02]),
      cbox(0, [0.02, 0.76, 0.3], [-0.73, 0.02, -0.02]),
      cbox(0, [0.02, 0.76, 0.3], [0.73, 0.02, -0.02]),
      // 背板 / 中竖板 / 层板三件原来四处贴死（三件同宽 1.46、背面同在 −0.17、顶面同在 0.78），
      cbox(3, [1.44, 0.757, 0.014], [0, 0.02, -0.163]),
      cbox(3, [0.016, 0.757, 0.286], [0, 0.02, -0.013], { fullOnly: true }),
      cbox(4, [1.44, 0.018, 0.28], [0, 0.4, -0.013], { fullOnly: true }),
      // 顶板：占地 1.5 × 0.35 由它定。
      cbox(2, [1.5, 0.04, 0.35], [0, 0.78, 0]),
      // 双开门：各 0.72 宽、中缝 1cm，正面到 0.145（柜体正面 0.13 + 门板 1.5cm）。
      cbox(1, [0.72, 0.74, 0.02], [-0.365, 0.03, 0.135]),
      cbox(1, [0.72, 0.74, 0.02], [0.365, 0.03, 0.135]),
      cbox(5, [0.02, 0.2, 0.02], [-0.03, 0.3, 0.155]),
      cbox(5, [0.02, 0.2, 0.02], [0.03, 0.3, 0.155])
    ]
  },
  shoecabinet: {
    note:
      "鞋柜：落地踢脚 + 左列换鞋凳（石面坐板）+ 左列四层敞开鞋格 + 右列下柜双门 / 敞开中格 / " +
      "上柜双门 + 左列上柜双短门 + 背板 + 木顶板；六处敞开格里摆着成双的鞋。",
    size: [1.8, 2.25, 0.42],
    slots: [
      { role: "body", color: 0x5a3a22, roughness: 0.64, metalness: 0 },
      { role: "base", color: 0x3f2916, roughness: 0.66, metalness: 0 },
      { role: "shelf", color: 0xd8b98f, roughness: 0.6, metalness: 0 },
      { role: "interior", color: 0x8a6a4a, roughness: 0.68, metalness: 0 },
      { role: "door", color: 0xd8b98f, roughness: 0.54, metalness: 0 },
      { role: "metal", color: 0x9aa1a8, roughness: 0.3, metalness: 0.42 },
      { role: "top", color: 0x9c6b3f, roughness: 0.5, metalness: 0 },
      { role: "stash", color: 0x6f7176, roughness: 0.7, metalness: 0.05 }
    ],
    // 高度分带（全部是「底面高度」，与 cbox 的 y 语义一致）：
    parts: [
      // ── 骨架 ──────────────────────────────────────────────────────────────
      // 踢脚：两侧各内缩 4cm、正面内缩 4cm，背面也收 2cm —— 背面与侧板背面同面会沿柜底闪一条线。
      cbox(1, [1.72, 0.06, 0.34], [0, 0, -0.01]),
      // 侧板 / 中竖板：顶端做到 2.20（顶板底面）而不是咬进顶板 —— 咬进去那一截的外侧面会与
      cbox(0, [0.02, 2.14, 0.4], [-0.888, 0.06, 0]),
      cbox(0, [0.02, 2.14, 0.4], [0.888, 0.06, 0]),
      cbox(0, [0.02, 2.14, 0.4], [0, 0.06, 0]),
      // 背板：四面都缩在骨架内（x 两侧各让 1.2cm、z 让 2.4cm、上下让 6mm）。x 让到 0.874 而不是
      cbox(3, [1.748, 2.09, 0.014], [0, 0.1, -0.183]),
      // ── 左列：换鞋凳 + 四层敞开鞋格 + 上柜 ────────────────────────────────
      cbox(0, [0.868, 0.36, 0.385], [-0.444, 0.06, 0.0075]),
      // 坐板：比凳箱**前伸 2cm**（到 0.22，与门板正面同一条竖线），这就是旧资产那块
      cbox(6, [0.868, 0.03, 0.405], [-0.444, 0.42, 0.0175]),
      // 四层鞋格的层板：背面让开背板 2mm、正面到柜体前缘 0.20。
      ...[0.78, 1.11, 1.44].map(shoecabinetShelfY =>
        cbox(2, [0.868, 0.02, 0.374], [-0.444, shoecabinetShelfY, 0.013])
      ),
      // 上柜底板：四层鞋格与上柜之间的那道横板。
      cbox(2, [0.868, 0.02, 0.374], [-0.444, 1.78, 0.013]),
      // ── 右列：下柜 + 敞开中格 + 上柜 ──────────────────────────────────────
      cbox(2, [0.868, 0.02, 0.374], [0.444, 0.06, 0.013]),
      cbox(2, [0.868, 0.018, 0.374], [0.444, 0.52, 0.013], { fullOnly: true }),
      // 下柜顶面 = 敞开中格的底面：走**台面**角色 —— 旧资产那段暖阳档着色器切的就是这一条
      cbox(6, [0.868, 0.02, 0.374], [0.444, 0.98, 0.013]),
      // 中格顶面 = 上柜底板；上柜里再一块中隔板。
      cbox(2, [0.868, 0.02, 0.374], [0.444, 1.4, 0.013]),
      cbox(2, [0.868, 0.018, 0.374], [0.444, 1.8, 0.013], { fullOnly: true }),
      ...[
        { x: 0.234, bottomY: 0.08, height: 0.88 },
        { x: 0.676, bottomY: 0.08, height: 0.88 },
        { x: 0.234, bottomY: 1.42, height: 0.74 },
        { x: 0.676, bottomY: 1.42, height: 0.74 },
        { x: -0.234, bottomY: 1.8, height: 0.36 },
        { x: -0.676, bottomY: 1.8, height: 0.36 }
      ].map(shoecabinetDoor =>
        cbox(4, [0.418, shoecabinetDoor.height, 0.016], [
          shoecabinetDoor.x,
          shoecabinetDoor.bottomY,
          0.208
        ])
      ),
      // 竖条拉手：贴在各自中缝两侧（右列中缝在 x=0.455、左列在 −0.455），背面埋进门板 4mm、
      ...[
        { x: 0.41, bottomY: 0.46 },
        { x: 0.5, bottomY: 0.46 },
        { x: 0.41, bottomY: 1.7 },
        { x: 0.5, bottomY: 1.7 },
        { x: -0.41, bottomY: 1.9 },
        { x: -0.5, bottomY: 1.9 }
      ].map(shoecabinetHandle =>
        cbox(5, [0.014, 0.16, 0.014], [shoecabinetHandle.x, shoecabinetHandle.bottomY, 0.213], {
          fullOnly: true
        })
      ),
      // 顶板：占地 1.8 × 0.42 与整件最高的一件都由它定；走柜体木色（旧资产的上箱体也是木色，
      cbox(0, [1.8, 0.05, 0.42], [0, 2.2, 0.01]),
      // ── 六处敞开格里的鞋 ─────────────────────────────────────────────────
      ...shoecabinetBayShoes()
    ]
  },
  vanity: {
    note: "梳妆台：四条金属细腿 + 双抽屉箱体 + 台面 + 台面上的立式梳妆镜（镜框 + 镜面）。",
    size: [1.2, 1.55, 0.5],
    slots: [
      { role: "leg", color: 0x9aa1a8, roughness: 0.3, metalness: 0.42 },
      { role: "body", color: 0x5a3a22, roughness: 0.64, metalness: 0 },
      { role: "drawer", color: 0xd8d6d0, roughness: 0.45, metalness: 0.12 },
      { role: "top", color: 0x9c6b3f, roughness: 0.5, metalness: 0 },
      { role: "mirror", color: 0xdbe4ea, roughness: 0.08, metalness: 0.35 },
      { role: "metal", color: 0x9aa1a8, roughness: 0.3, metalness: 0.42 },
      { role: "trim", color: 0x3f2916, roughness: 0.6, metalness: 0.1 }
    ],
    parts: [
      ...fourLegs(0, { legSpanX: 0.52, legSpanZ: 0.2, legSize: 0.03, height: 0.31, square: false }),
      // 抽屉箱体坐在腿上（0.305 → 0.72，比腿顶高 5mm、比台面底高 1cm：两处相接的面各咬进去
      cbox(1, [1.14, 0.415, 0.44], [0, 0.305, -0.01]),
      cbox(2, [0.56, 0.17, 0.02], [-0.3, 0.42, 0.219]),
      cbox(2, [0.56, 0.17, 0.02], [0.3, 0.42, 0.219]),
      cbox(5, [0.24, 0.014, 0.014], [-0.3, 0.545, 0.232], { fullOnly: true }),
      cbox(5, [0.24, 0.014, 0.014], [0.3, 0.545, 0.232], { fullOnly: true }),
      // 台面：占地 1.2 × 0.5 由它定。
      cbox(3, [1.2, 0.04, 0.5], [0, 0.71, 0]),
      // 梳妆镜：立在台面后沿（背衬 + 镜框 + 镜面），顶到整件高度 1.55。
      cbox(6, [0.76, 0.81, 0.014], [0, 0.74, -0.193]),
      cbox(5, [0.7, 0.74, 0.03], [0, 0.78, -0.181]),
      cbox(4, [0.64, 0.68, 0.008], [0, 0.81, -0.168])
    ]
  },

  // ── 桌案族：既有二进制资产迁进流水线（第三批）─────────────────────────────
  table: {
    note: "餐桌组合：木台面 + 望板 + 四条收分木腿，配 6 张软包餐椅（两侧各两张、两端各一张，全部推进桌下）。",
    size: [2.4, 0.82, 1.8],
    slots: [
      { role: "top", color: 0xc49a6c, roughness: 0.34, metalness: 0.02 },
      { role: "trim", color: 0x9c6b3f, roughness: 0.62, metalness: 0 },
      { role: "leg", color: 0xbc9163, roughness: 0.68, metalness: 0 },
      { role: "cushion", color: 0xefe0cd, roughness: 0.92, metalness: 0 }
    ],
    parts: [
      // 桌腿：腿心退到 ±0.68 / ±0.38（台面 1.5 × 0.9 的投影之内），上粗下细。
      ...mirrorPair([
        ctaper(2, 0.03, 0.022, 0.6, 14, [0.68, 0, 0.38]),
        ctaper(2, 0.03, 0.022, 0.6, 14, [0.68, 0, -0.38])
      ]),
      // 望板：撑在四条腿之间（0.60 → 0.67），比台面各缩 8cm，台面才有「压边」可读。
      cbox(1, [1.34, 0.07, 0.74], [0, 0.6, 0]),
      cbox(1, [1.28, 0.03, 0.03], [0, 0.16, 0], { fullOnly: true }),
      // 台面：整件最宽最深的一件，占地 1.5 × 0.9 那一块由它定。
      croundedBox(0, [1.5, 0.04, 0.9], [0, 0.67, 0], { radius: 0.012 }),
      // 六张椅子：两侧各两张（x ±0.42）、两端各一张（x ±0.98）。椅心到桌沿 1cm，
      ...[
        { center: [-0.42, 0.68], facing: 180 },
        { center: [0.42, 0.68], facing: 180 },
        { center: [-0.42, -0.68], facing: 0 },
        { center: [0.42, -0.68], facing: 0 },
        { center: [0.98, 0], facing: 270 },
        { center: [-0.98, 0], facing: 90 }
      ].flatMap(chair => diningChair({
        ...chair,
        slotLeg: 2,
        slotSeat: 3,
        slotTrim: 1,
        seatWidth: 0.44,
        seatDepth: 0.44,
        seatHeight: 0.42,
        seatThickness: 0.05,
        backTop: 0.82,
        backThickness: 0.04,
        legSize: 0.032
      }))
    ]
  },
  /**
   * 圆餐桌 / 圆餐桌带转盘：同一个函数的两个变体。
   */
  ...(() => {
    const roundDiningChairs = [
      { center: [0, 0.88], facing: 180 },
      { center: [0, -0.88], facing: 0 },
      { center: [0.88, 0], facing: 270 },
      { center: [-0.88, 0], facing: 90 }
    ].flatMap(chair => diningChair({
      ...chair,
      slotLeg: 4,
      slotSeat: 5,
      slotTrim: 3,
      seatWidth: 0.44,
      seatDepth: 0.44,
      seatHeight: 0.4,
      seatThickness: 0.05,
      backTop: 0.78,
      backThickness: 0.04,
      legSize: 0.032
    }));
    const roundDiningSlots = [
      { role: "top", color: 0xc49a6c, roughness: 0.34, metalness: 0.02 },
      { role: "base", color: 0x3f2916, roughness: 0.6, metalness: 0 },
      { role: "body", color: 0x9c6b3f, roughness: 0.6, metalness: 0 },
      { role: "trim", color: 0x9c6b3f, roughness: 0.62, metalness: 0 },
      { role: "leg", color: 0xbc9163, roughness: 0.68, metalness: 0 },
      { role: "cushion", color: 0xefe0cd, roughness: 0.92, metalness: 0 },
      { role: "metal", color: 0x8c8f94, roughness: 0.3, metalness: 0.45 }
    ];
    const roundDiningTableParts = [
      // 落地底盘：一块比中柱略宽的圆盘（0 → 0.02），中柱就坐在它上面。
      ccyl(1, 0.42, 0.02, 40, [0, 0, 0]),
      // 中柱 + 柱顶承台：一条车削出来的母线（柱身收细、柱顶再外张承台），
      clathe(
        2,
        [
          [0, 0],
          [0.4, 0],
          [0.4, 0.04],
          [0.27, 0.1],
          [0.105, 0.16],
          [0.095, 0.5],
          [0.135, 0.56],
          [0.135, 0.57],
          [0, 0.57],
          [0, 0]
        ],
        40,
        [0, 0.02, 0]
      ),
      // 台面围边：台面下沿一圈（0.59 → 0.64），让 4cm 厚的台面读起来有一道边。
      ccyl(3, 0.655, 0.05, 48, [0, 0.59, 0]),
      // 台面：整件最宽的一件，直径 1.4 决定平面符号里那个圆。
      clathe(0, [[0, 0], [0.7, 0], [0.7, 0.04], [0, 0.04], [0, 0]], 48, [0, 0.64, 0]),
      ...roundDiningChairs
    ];
    const turntableParts = [
      // 转盘面 + 中轴盖：都坐在台面上（0.68 起），顶到 0.725，仍在椅背 0.78 之下。
      clathe(0, [[0, 0], [0.4, 0], [0.4, 0.025], [0, 0.025], [0, 0]], 48, [0, 0.68, 0]),
      ccyl(6, 0.09, 0.02, 24, [0, 0.705, 0])
    ];
    return {
      rounddiningtable: {
        note: "圆形餐桌：车削中柱 + 落地底盘 + 台面围边 + 圆台面，配 4 张软包餐椅（四面各一张，推进桌下）。",
        size: [2.2, 0.78, 2.2],
        slots: roundDiningSlots,
        parts: roundDiningTableParts
      },
      rounddiningtable_turntable: {
        note: "圆形餐桌（带转盘）：与圆餐桌同一套骨架，台面中央多一层转盘面与中轴盖。",
        size: [2.2, 0.78, 2.2],
        slots: roundDiningSlots,
        parts: [...roundDiningTableParts, ...turntableParts]
      }
    };
  })(),
  desk: {
    note: "书桌：薄台面 + 单层抽屉箱 + 四条收分腿 + 背面挡板，抽屉面一根横向长拉手。",
    size: [1.4, 0.76, 0.65],
    slots: [
      { role: "top", color: 0xc49a6c, roughness: 0.34, metalness: 0.02 },
      { role: "body", color: 0x5a3a22, roughness: 0.62, metalness: 0 },
      { role: "drawer", color: 0xd8b98f, roughness: 0.58, metalness: 0 },
      { role: "leg", color: 0xbc9163, roughness: 0.68, metalness: 0 },
      { role: "metal", color: 0x8c8f94, roughness: 0.3, metalness: 0.45 }
    ],
    parts: [
      // 四条腿收在四角（±0.63 / ±0.26），腿心到台面边缘留 7cm —— 台面才有出挑。
      ...mirrorPair([
        ctaper(3, 0.026, 0.019, 0.725, 14, [0.63, 0, 0.26]),
        ctaper(3, 0.026, 0.019, 0.725, 14, [0.63, 0, -0.26])
      ]),
      // 抽屉箱坐在腿上（0.605 → 0.72），正面到 0.30（台面半深 0.325，留 25mm 回边）。
      cbox(1, [0.86, 0.115, 0.58], [0, 0.605, -0.005]),
      cbox(2, [0.8, 0.09, 0.02], [0, 0.615, 0.291]),
      cbox(4, [0.22, 0.014, 0.014], [0, 0.676, 0.303], { fullOnly: true }),
      // 背挡板：挡住桌子背后的腿间空档（真实书桌都有这道板），也是 lite 版的减重项。
      cbox(1, [1.2, 0.26, 0.018], [0, 0.33, -0.2], { fullOnly: true }),
      // 台面：占地 1.4 × 0.65 由它定。
      croundedBox(0, [1.4, 0.035, 0.65], [0, 0.725, 0], { radius: 0.01 })
    ]
  },
  bar: {
    note: "吧台：通长台面 + 吧台柜体 + 踢脚 + 前侧踏脚横杆 + 正面三格敞开酒格，配 3 张无靠背吧凳。",
    size: [2.2, 1.05, 0.65],
    slots: [
      { role: "top", color: 0x8f6a45, roughness: 0.42, metalness: 0.02 },
      { role: "body", color: 0x5a3a22, roughness: 0.64, metalness: 0 },
      { role: "base", color: 0x3f2916, roughness: 0.66, metalness: 0 },
      { role: "trim", color: 0x9c6b3f, roughness: 0.62, metalness: 0 },
      { role: "leg", color: 0x454c54, roughness: 0.32, metalness: 0.3 },
      { role: "cushion", color: 0xefe0cd, roughness: 0.9, metalness: 0 },
      { role: "metal", color: 0x8c8f94, roughness: 0.3, metalness: 0.45 }
    ],
    parts: [
      // 踢脚内缩 5cm：落地那 6cm 因此是踢脚而不是柜体正面。
      cbox(2, [2.06, 0.058, 0.55], [0, 0.002, -0.045]),
      // 吧台柜体靠后：z 从 −0.325 到 −0.03，前侧留出 0.295 的容腿空间给吧凳。
      cbox(1, [2.1, 0.88, 0.295], [0, 0.06, -0.1775]),
      // 正面三格敞开酒格：三块隔板 + 一层底板，格子背板即柜体正面。
      cbox(3, [0.02, 0.28, 0.02], [-0.35, 0.62, -0.02], { fullOnly: true }),
      cbox(3, [0.02, 0.28, 0.02], [0.35, 0.62, -0.02], { fullOnly: true }),
      cbox(1, [0.716, 0.02, 0.02], [0, 0.622, -0.022], { fullOnly: true }),
      // 踏脚横杆：架在柜体正面之外的那一段（真实吧台的做法），离地 0.16。
      cbox(3, [2.04, 0.04, 0.04], [0, 0.16, 0.015]),
      cbox(6, [0.24, 0.014, 0.014], [0, 0.5, 0.133], { fullOnly: true }),
      // 台面：占地 2.2 × 0.65 由它定，前沿挑出柜体 0.325 − (−0.03) = 0.355 就是吧台的样子。
      cbox(0, [2.2, 0.05, 0.65], [0, 1, 0]),
      // 三张无靠背吧凳：座面 0.3 × 0.3，座高 0.72，全部收在台面正下方的容腿空间里。
      ...[
        [-0.7, 0.13],
        [0, 0.13],
        [0.7, 0.13]
      ].flatMap(([stoolX, stoolZ]) => [
        ...fourLegs(4, { legSpanX: 0.118, legSpanZ: 0.118, legSize: 0.026, height: 0.72, square: false })
          .map(legPart => ({ ...legPart, at: [legPart.at[0] + stoolX, legPart.at[1], legPart.at[2] + stoolZ] })),
        croundedBox(5, [0.3, 0.045, 0.3], [stoolX, 0.72, stoolZ], { radius: 0.016 }),
        ctorus(6, 0.132, 0.008, [stoolX, 0.26, stoolZ], { fullOnly: true })
      ])
    ]
  },
  squarecoffeetable: {
    note: "方茶几：厚台面 + 望板 + 四条方腿 + 下层置物板（板下两道隔板分成三格）。",
    size: [1.4, 0.46, 0.7],
    slots: [
      { role: "top", color: 0xc49a6c, roughness: 0.34, metalness: 0.02 },
      { role: "trim", color: 0x9c6b3f, roughness: 0.62, metalness: 0 },
      { role: "leg", color: 0xbc9163, roughness: 0.68, metalness: 0 },
      { role: "shelf", color: 0xd8b98f, roughness: 0.6, metalness: 0 }
    ],
    parts: [
      // 四条方腿收在四角（±0.66 / ±0.32）—— 平面符号里那四个圆点就是它们。
      cbox(2, [0.05, 0.415, 0.05], [-0.66, 0, -0.32]),
      cbox(2, [0.05, 0.415, 0.05], [0.66, 0, -0.32]),
      cbox(2, [0.05, 0.415, 0.05], [-0.66, 0, 0.32]),
      cbox(2, [0.05, 0.415, 0.05], [0.66, 0, 0.32]),
      // 望板撑在四条腿之间（0.35 → 0.41），比台面各缩 5cm。
      cbox(1, [1.3, 0.06, 0.6], [0, 0.35, 0]),
      // 下层置物板：尺寸与平面符号里那个内框同源（0.66 × 0.76 的占地比例）。
      cbox(3, [0.92, 0.025, 0.53], [0, 0.155, 0]),
      // 两道隔板把置物板分成三格（对应平面符号里那两条竖线）。
      cbox(1, [0.02, 0.17, 0.53], [-0.153, 0.18, 0], { fullOnly: true }),
      cbox(1, [0.02, 0.17, 0.53], [0.153, 0.18, 0], { fullOnly: true }),
      // 台面：占地 1.4 × 0.7 由它定。
      croundedBox(0, [1.4, 0.045, 0.7], [0, 0.415, 0], { radius: 0.012 })
    ]
  },

  // ── 厨房地柜三件：既有二进制资产迁进流水线（第四批）───────────────────────
  kitchenbase: {
    note: "厨房地柜：踢脚 + 柜体 + 四扇门 + 通长台面，门板各一根横向拉手。",
    size: [2.4, 0.85, 0.6],
    slots: [
      { role: "top", color: 0xefeae0, roughness: 0.3, metalness: 0.04 },
      { role: "door", color: 0xf5f3ef, roughness: 0.4, metalness: 0.06 },
      { role: "body", color: 0x5a3a22, roughness: 0.64, metalness: 0 },
      { role: "metal", color: 0x9aa1a8, roughness: 0.3, metalness: 0.42 },
      { role: "base", color: 0x3f2916, roughness: 0.66, metalness: 0 },
      { role: "interior", color: 0x8a6a4a, roughness: 0.68, metalness: 0 }
    ],
    parts: [
      ...kitchenBaseCarcassParts({ width: 2.4, depth: 0.6, doorCount: 4 }),
      // 台面：占地 2.4 × 0.6 由它定。
      cbox(0, [2.4, 0.04, 0.6], [0, 0.81, 0])
    ]
  },
  kitchensink: {
    note: "地柜带水盆：与地柜同一套柜体，台面在中间开孔嵌一只不锈钢台下盆（底下一道承板）。",
    size: [1.2, 0.85, 0.6],
    slots: [
      { role: "top", color: 0xefeae0, roughness: 0.3, metalness: 0.04 },
      { role: "door", color: 0xf5f3ef, roughness: 0.4, metalness: 0.06 },
      { role: "body", color: 0x5a3a22, roughness: 0.64, metalness: 0 },
      { role: "metal", color: 0x9aa1a8, roughness: 0.3, metalness: 0.42 },
      { role: "base", color: 0x3f2916, roughness: 0.66, metalness: 0 },
      { role: "interior", color: 0x8a6a4a, roughness: 0.68, metalness: 0 },
      { role: "sink", color: 0xb9bfc5, roughness: 0.24, metalness: 0.62 }
    ],
    parts: [
      ...kitchenBaseCarcassParts({ width: 1.2, depth: 0.6, doorCount: 2, openTop: true }),
      // 台面四条边围出 0.56 × 0.34 的开孔（孔沿 = 盆腔的内壁，台下盆就是这么装的）。
      cbox(0, [1.2, 0.04, 0.13], [0, 0.81, 0.235]),
      cbox(0, [1.2, 0.04, 0.13], [0, 0.81, -0.235]),
      cbox(0, [0.32, 0.04, 0.34], [-0.44, 0.81, 0]),
      cbox(0, [0.32, 0.04, 0.34], [0.44, 0.81, 0]),
      // 承板：盆吊在台面下，底下垫一道板（真实水盆柜都这么做），也挡住柜内空腔。
      cbox(5, [1.12, 0.02, 0.54], [0, 0.63, -0.02], { fullOnly: true }),
      // 不锈钢盆：底板 + 四壁，盆口顶到 0.81（台面下沿），深 0.16。
      cbox(6, [0.58, 0.02, 0.36], [0, 0.65, 0]),
      cbox(6, [0.02, 0.14, 0.36], [-0.29, 0.67, 0]),
      cbox(6, [0.02, 0.14, 0.36], [0.29, 0.67, 0]),
      cbox(6, [0.56, 0.14, 0.02], [0, 0.67, 0.18]),
      cbox(6, [0.56, 0.14, 0.02], [0, 0.67, -0.18])
    ]
  },
  kitchencooktop: {
    note: "地柜带燃气灶：与地柜同一套柜体，台面开孔里坐着一块**低于台面 1cm 的灶面板**（下嵌灶），四个火盖。",
    size: [1.2, 0.85, 0.6],
    slots: [
      { role: "top", color: 0xefeae0, roughness: 0.3, metalness: 0.04 },
      { role: "door", color: 0xf5f3ef, roughness: 0.4, metalness: 0.06 },
      { role: "body", color: 0x5a3a22, roughness: 0.64, metalness: 0 },
      { role: "metal", color: 0x9aa1a8, roughness: 0.3, metalness: 0.42 },
      { role: "base", color: 0x3f2916, roughness: 0.66, metalness: 0 },
      { role: "interior", color: 0x8a6a4a, roughness: 0.68, metalness: 0 },
      { role: "cooktop", color: 0x33363a, roughness: 0.2, metalness: 0.6 }
    ],
    parts: [
      ...kitchenBaseCarcassParts({ width: 1.2, depth: 0.6, doorCount: 2 }),
      // 台面四条边围出 0.66 × 0.46 的灶孔。
      cbox(0, [1.2, 0.04, 0.07], [0, 0.81, 0.265]),
      cbox(0, [1.2, 0.04, 0.07], [0, 0.81, -0.265]),
      cbox(0, [0.27, 0.04, 0.46], [-0.465, 0.81, 0]),
      cbox(0, [0.27, 0.04, 0.46], [0.465, 0.81, 0]),
      cbox(6, [0.658, 0.03, 0.458], [0, 0.81, 0]),
      // 四个火盖：圈 + 盖，顶面 0.849 压在台面下 1mm —— 从开孔俯视看得见，又不越 0.85。
      ...[
        [-0.165, -0.115],
        [0.165, -0.115],
        [-0.165, 0.115],
        [0.165, 0.115]
      ].flatMap(([burnerX, burnerZ]) => [
        ctorus(3, 0.075, 0.0045, [burnerX, 0.84, burnerZ], { fullOnly: true }),
        ccyl(3, 0.038, 0.009, 24, [burnerX, 0.84, burnerZ])
      ])
    ]
  },
  chestdrawer: {
    note: "斗柜：四层抽屉 + 台面，卧室与走廊的常用收纳。",
    size: [1, 1.1, 0.45],
    slots: [
      { role: "body", color: 0x3d2818, roughness: 0.6, metalness: 0 },
      { role: "drawer", color: 0xd8d6d0, roughness: 0.45, metalness: 0.12 },
      { role: "top", color: 0x9c6b3f, roughness: 0.66, metalness: 0 }
    ],
    parts: [
      cbox(0, [0.98, 1.06, 0.37], [0, 0, 0]),
      cbox(2, [1, 0.04, 0.45], [0, 1.06, 0]),
      ...[0.13, 0.38, 0.63, 0.88].flatMap(drawerBottomY => [
        box(1, [0.9, 0.2, 0.02], [-0.45, drawerBottomY, 0.185]),
        box(1, [0.24, 0.02, 0.02], [-0.12, drawerBottomY + 0.09, 0.205], { fullOnly: true })
      ])
    ]
  },
  entrycabinet: {
    note: "玄关柜：上部封闭柜门、下部敞开放鞋。",
    size: [1, 1.1, 0.38],
    slots: [
      { role: "body", color: 0x3d2818, roughness: 0.6, metalness: 0 },
      { role: "door", color: 0xffffff, roughness: 0.42, metalness: 0.06 },
      { role: "top", color: 0x9c6b3f, roughness: 0.66, metalness: 0 }
    ],
    parts: [
      cbox(0, [0.98, 1.06, 0.34], [0, 0, 0]),
      cbox(2, [1, 0.04, 0.38], [0, 1.06, 0]),
      cbox(0, [0.94, 0.035, 0.3], [0, 0.06, 0]),
      box(1, [0.45, 0.5, 0.02], [-0.47, 0.54, 0.17]),
      box(1, [0.45, 0.5, 0.02], [0.02, 0.54, 0.17]),
      box(1, [0.02, 0.12, 0.01], [-0.035, 0.73, 0.18], { fullOnly: true }),
      box(1, [0.02, 0.12, 0.01], [0.015, 0.73, 0.18], { fullOnly: true })
    ]
  },
  displaycabinet: {
    note: "展示柜：玻璃门 + 层板，餐厅或客厅的器物陈列。",
    size: [0.9, 1.8, 0.4],
    slots: [
      { role: "body", color: 0x3d2818, roughness: 0.6, metalness: 0 }, // 0 木柜体
      // 槽位色必须与柜类档位给 glass 角色的配方一致（studio-material-styles.js 的 joineryCombo），
      // 否则「未选风格」走烘进 GLB 的槽位色、「选了风格」走配方色，切换时玻璃会跳一下。
      { role: "glass", color: 0xa9c5d3, roughness: 0.12, metalness: 0.04 },
      { role: "metal", color: 0x546235, roughness: 0.4, metalness: 0.2 }
    ],
    parts: [
      cbox(0, [0.9, 0.06, 0.4], [0, 0, 0]),
      box(0, [0.06, 1.74, 0.4], [-0.45, 0.06, -0.2]),
      box(0, [0.06, 1.74, 0.4], [0.39, 0.06, -0.2]),
      cbox(0, [0.9, 0.04, 0.4], [0, 1.76, 0]),
      ...[0.46, 0.86, 1.26].map(shelfBottomY =>
        cbox(0, [0.78, 0.025, 0.36], [0, shelfBottomY, 0])
      ),
      // 玻璃门宽收 4mm（0.78 → 0.776）：与侧板内沿同宽时玻璃的 ±x 侧面正落在侧板内沿的
      cbox(1, [0.776, 1.62, 0.015], [0, 0.12, 0.192], { align: "bottom" }),
      box(2, [0.02, 0.3, 0.012], [-0.06, 0.85, 0.188], { fullOnly: true }),
      box(2, [0.02, 0.3, 0.012], [-0.02, 0.85, 0.188], { fullOnly: true })
    ]
  },

  // ── 钢琴：第三方素材迁进流水线（第五批）───────────────────────────────────
  piano: (() => {
    // 键盘是全件最要紧的一处「实物感」：52 个白键 + 35 个黑键就是 88 键钢琴的键位
    const whiteKeyWidth = 1.2 / 52;
    const whiteKeys = Array.from({ length: 52 }, (unusedKey, keyIndex) =>
      cbox(
        5,
        [whiteKeyWidth - 0.0012, 0.02, 0.145],
        [-0.6 + whiteKeyWidth * (keyIndex + 0.5), 0.72, 0.6745]
      )
    );
    // 黑键落在白键之间的缝上：一个八度里 C#/D# 在第 1、2 个缝、F#/G#/A# 在第 4、5、6 个缝
    const blackKeys = Array.from({ length: 7 }, (unusedOctave, octaveIndex) => octaveIndex).flatMap(
      octaveIndex =>
        [0, 1, 3, 4, 5].map(innerIndex =>
          cbox(6, [0.012, 0.018, 0.09], [
            -0.6 + whiteKeyWidth * (octaveIndex * 7 + innerIndex + 1),
            0.74,
            0.647
          ])
        )
    );
    return {
      note:
        "三角钢琴：弯背琴身（平面轮廓拉体）+ 腰线 + 顶盖 + 键盘条（52 白键 / 35 黑键 + 键侧木）" +
        " + 三条锥形琴腿带脚轮 + 踏板连杆与三踏板。",
      size: [1.5, 0.99, 1.5],
      slots: [
        // 槽位色是「未套用任何风格时的底色」：亮光黑琴身 + 象牙白键 + 黑键 + 钢色五金，
        { role: "body", color: 0x1a1a1c, roughness: 0.14, metalness: 0.05 },
        { role: "top", color: 0x24242a, roughness: 0.11, metalness: 0.06 },
        { role: "panel", color: 0x1e1e20, roughness: 0.16, metalness: 0.04 },
        { role: "leg", color: 0x1a1a1c, roughness: 0.16, metalness: 0.05 },
        { role: "trim", color: 0x2b2b30, roughness: 0.18, metalness: 0.06 },
        { role: "key", color: 0xf6f2e8, roughness: 0.32, metalness: 0.02 },
        { role: "accent", color: 0x16181a, roughness: 0.24, metalness: 0.04 },
        { role: "metal", color: 0x9aa1a8, roughness: 0.3, metalness: 0.5 }
      ],
      parts: (() => {
        // 三块板共用同一份轮廓，各自外张几毫米；中心 z 由轮廓自己给出（不在 0 上），
        const rimPlan = pianoPlan({ halfWidth: 0.72, tailZ: -0.74, frontZ: 0.55 });
        const beltPlan = pianoPlan({ halfWidth: 0.728, tailZ: -0.748, frontZ: 0.555 });
        const lidPlan = pianoPlan({ halfWidth: 0.732, tailZ: -0.75, frontZ: 0.56 });
        return [
          // 琴身：把俯视轮廓沿高度拉成 0.30m 厚的侧板（0.665 → 0.965）。它是全件唯一
          extrude(0, rimPlan.outline, 0.3, [0, 0.665, rimPlan.centerZ], {
            centered: true,
            rot: [90, 0, 0]
          }),
          // 腰线：琴身上沿外张 8mm 的一圈线脚。lite 丢掉 —— 远看就是上沿多一道线。
          extrude(4, beltPlan.outline, 0.05, [0, 0.92, beltPlan.centerZ], {
            centered: true,
            rot: [90, 0, 0],
            fullOnly: true
          }),
          extrude(1, lidPlan.outline, 0.025, [0, 0.965, lidPlan.centerZ], {
            centered: true,
            rot: [90, 0, 0]
          }),
          // 键床（键盘条那 20cm 的实体）+ 两条键侧木：整件最宽的 1.50m 由键床定。
          cbox(2, [1.5, 0.075, 0.2], [0, 0.645, 0.65]),
          cbox(2, [0.15, 0.03, 0.2], [-0.675, 0.72, 0.65]),
          cbox(2, [0.15, 0.03, 0.2], [0.675, 0.72, 0.65]),
          // 键滑条：键尾与琴身之间那一条，代表推到后面的键盖。lite 丢掉。
          cbox(2, [1.2, 0.02, 0.05], [0, 0.72, 0.575], { fullOnly: true }),
          ...whiteKeys,
          ...blackKeys,
          // 三条锥形琴腿 + 脚轮：前腿落在键床两端下面，后腿退到尾部偏低音侧（实物就是这样一根）。
          ctaper(3, 0.045, 0.036, 0.615, 16, [-0.62, 0.05, 0.63]),
          ctaper(3, 0.045, 0.036, 0.615, 16, [0.62, 0.05, 0.63]),
          ctaper(3, 0.04, 0.032, 0.615, 16, [-0.22, 0.05, -0.58]),
          ccyl(7, 0.032, 0.05, 12, [-0.62, 0, 0.63]),
          ccyl(7, 0.032, 0.05, 12, [0.62, 0, 0.63]),
          ccyl(7, 0.032, 0.05, 12, [-0.22, 0, -0.58]),
          // 踏板连杆：一根立柱从琴身底面（0.665）吊到踏板座（0.19），座前一排三只踏板。
          cbox(4, [0.1, 0.475, 0.05], [0, 0.19, 0.42]),
          cbox(4, [0.34, 0.035, 0.14], [0, 0.155, 0.4]),
          ...[-0.075, 0, 0.075].map(pedalCenterX =>
            cbox(7, [0.05, 0.012, 0.09], [pedalCenterX, 0.19, 0.345], { fullOnly: true })
          )
        ];
      })()
    };
  })(),

  bed: {
    note: "双人床：六条收分木脚 + 床架箱体 + 软包床垫 + 高软包床头板 + 被子（含折边）+ 床尾搭毯 + 两对枕头。",
    size: [1.8, 1.05, 2],
    slots: [
      { role: "leg", color: 0xbc9163, roughness: 0.7, metalness: 0 },
      { role: "frame", color: 0xc49a6c, roughness: 0.66, metalness: 0 },
      { role: "upholstery", color: 0xf3e7d8, roughness: 0.92, metalness: 0 },
      { role: "fabric", color: 0xece2d2, roughness: 0.94, metalness: 0 },
      { role: "cushion", color: 0xf6efe2, roughness: 0.92, metalness: 0 },
      { role: "accent", color: 0xb98c5f, roughness: 0.9, metalness: 0 }
    ],
    parts: [
      // 六条收分木脚：两米长的床只靠四角会中间塌，实物中间还有一对。
      ...mirrorPair([
        ctaper(0, 0.03, 0.022, 0.16, 10, [0.8, 0, -0.8]),
        ctaper(0, 0.03, 0.022, 0.16, 10, [0.8, 0, 0]),
        ctaper(0, 0.03, 0.022, 0.16, 10, [0.8, 0, 0.8])
      ]),
      // 床架箱体：0.14 → 0.26，宽深都吃满 1.8 × 2.0 里的进深那一条（宽由床头板定，见下）。
      cbox(1, [1.76, 0.12, 2], [0, 0.14, 0]),
      // 床垫：0.24 厚（实物 25cm 左右的弹簧垫），四周比床架各收 2cm —— 收这一圈是为了让床架的
      croundedBox(2, [1.72, 0.24, 1.88], [0, 0.25, 0.01], { radius: 0.04 }),
      // 床头板：从地面一直立到 1.05 —— 整件高度由它定，也是这张床上唯一「看得出是床头」的一件。
      croundedBox(2, [1.8, 1.05, 0.1], [0, 0, -0.945], { radius: 0.045 }),
      // 被子：从枕头前（z −0.42）盖到床尾前 6cm（0.94），四周与床头板同宽 —— 真实被子总比床垫宽。
      croundedBox(3, [1.8, 0.075, 1.36], [0, 0.475, 0.26], { radius: 0.03 }),
      // 折边：被头翻出来的那一折，比被面厚一档、压在被子最靠近枕头的那一段上（z −0.40 → −0.18，
      croundedBox(5, [1.78, 0.06, 0.22], [0, 0.545, -0.29], { radius: 0.02 }),
      // 床尾搭毯：铺在被子靠床尾那一段上的撞色织物（实物上用来防脏、也是最省事的层次来源）。
      croundedBox(5, [1.78, 0.045, 0.44], [0, 0.545, 0.72], { radius: 0.018 }),
      // 一对睡枕：竖着靠在床头板上（绕自身 X 轴后仰 12°），下沿沉进床垫 4cm ——
      ...mirrorPair(
        croundedBox(4, [0.76, 0.15, 0.44], [0.43, 0.45, -0.7], {
          radius: 0.055,
          rot: [-12, 0, 0]
        })
      ),
      // 一对抱枕：压在折边上、靠着睡枕，比睡枕更斜（18°）、更小一号 —— 层次感全靠这一对。
      ...mirrorPair(
        croundedBox(4, [0.4, 0.13, 0.3], [0.28, 0.545, -0.28], {
          radius: 0.05,
          rot: [-18, 0, 0],
          fullOnly: true
        })
      )
    ]
  },
  bunkbed: {
    note: "上下床：四根通高立柱 + 两层床板 + 侧梯；床垫是唯一的软包件，走木器族的「中性米白」那一档。",
    size: [1, 1.7, 1.95],
    slots: [
      { role: "leg", color: 0xc49a6c, roughness: 0.68, metalness: 0 }, // 0 立柱 / 侧梯
      // 床垫必须带角色：木器族的换色分支对**没有角色**的槽位是按烘焙亮度在三档木色里挑一个的，
      // 而这条床垫是亮色 ⇒ 会被刷成木色（静默失败，只在换风格时才看得出来）。
      // woodCombo 给 upholstery 定的是「中性米白、不随木色变」那一档，正是床垫该有的行为。
      { role: "upholstery", color: 0xf3e7d8, roughness: 0.92, metalness: 0 },
      { role: "shelf", color: 0x9c6b3f, roughness: 0.7, metalness: 0 }
    ],
    parts: [
      ...mirrorPair([
        cbox(0, [0.05, 1.7, 0.05], [0.475, 0, 0.95]),
        cbox(0, [0.05, 1.7, 0.05], [0.475, 0, -0.95])
      ]),
      ...[0.34, 1.29].map(bottomY => cbox(2, [0.95, 0.05, 1.9], [0, bottomY, 0])),
      ...[0.39, 1.34].map(bottomY =>
        croundedBox(1, [0.9, 0.14, 1.8], [0, bottomY, 0], { radius: 0.05 })
      ),
      // 侧梯：两根立杆 + 三档踏杆，挂在右侧前后柱之间。
      cbox(0, [0.04, 1.05, 0.04], [0.44, 0.35, -0.6]),
      cbox(0, [0.04, 1.05, 0.04], [0.44, 0.35, -0.3], { fullOnly: true }),
      ...[0.45, 0.7, 0.95].map(rungY =>
        ccyl(0, 0.014, 0.3, 10, [0.44, rungY, -0.45], { rot: [90, 0, 0], align: "center" })
      )
    ]
  },
  kidsbed: {
    note: "儿童床：低床架 + 通长圆角护栏 + 床垫，尺寸按学龄前身高取（护栏与床垫各自独立角色）。",
    size: [0.95, 0.65, 1.6],
    slots: [
      { role: "fabric", color: 0xf3e7d8, roughness: 0.9, metalness: 0 },
      { role: "frame", color: 0xc49a6c, roughness: 0.68, metalness: 0 },
      { role: "upholstery", color: 0xfbfaf8, roughness: 0.9, metalness: 0 }
    ],
    parts: [
      ...mirrorPair([
        ctaper(1, 0.03, 0.022, 0.34, 12, [0.445, 0, 0.76]),
        ctaper(1, 0.03, 0.022, 0.34, 12, [0.445, 0, -0.76])
      ]),
      cbox(1, [0.89, 0.06, 1.5], [0, 0.34, 0]),
      // 床尾板 + 单侧护栏（另一侧靠墙，真儿童床也是这样摆的）。
      cbox(1, [0.87, 0.24, 0.04], [0, 0.4, -0.77]),
      cbox(1, [0.05, 0.24, 1.5], [-0.445, 0.4, 0], { fullOnly: true }),
      croundedBox(2, [0.8, 0.16, 1.4], [0, 0.4, 0], { radius: 0.05 }),
      // 通长护栏：前后吃满 1.6（深度的下界由它定），顶端正好 0.65（0.62 + 0.03）。
      croundedBox(0, [0.91, 0.03, 1.6], [0, 0.62, 0], { radius: 0.012 })
    ]
  },

  // ── 影音 ────────────────────────────────────────────────────────────────
  soundbar: {
    note: "回音壁：长条箱体 + 正面整幅出音网布 + 右侧小显示窗 + 顶部镀铬压条 + 一对脚垫。",
    size: [0.95, 0.08, 0.12],
    slots: [
      { role: "body", color: 0x2a2c30, roughness: 0.42, metalness: 0.12 },
      { role: "grating", color: 0x1a1c20, roughness: 0.88, metalness: 0 },
      { role: "screen", color: 0x15171a, roughness: 0.2, metalness: 0.1 },
      { role: "trim", color: 0xb4babf, roughness: 0.28, metalness: 0.45 },
      { role: "leg", color: 0x1a1c20, roughness: 0.6, metalness: 0.05 }
    ],
    parts: [
      // 箱体只占前 0.114 进深，网布与显示窗贴在最前面 6mm —— 整个 0.12 进深由它们顶到；
      ...mirrorPair(cbox(4, [0.16, 0.008, 0.07], [0.33, 0, 0])),
      croundedBox(0, [0.95, 0.066, 0.114], [0, 0.008, -0.003], { radius: 0.012 }),
      cbox(1, [0.74, 0.05, 0.008], [-0.06, 0.016, 0.056]),
      cbox(2, [0.07, 0.02, 0.008], [0.4, 0.03, 0.056]),
      cbox(3, [0.9, 0.006, 0.022], [0, 0.074, 0])
    ]
  },
  speaker: {
    note: "落地音箱：矮底座 + 细长箱体 + 正面整幅网布 + 三只扬声器单元 + 顶盖 + 背面接线盒。",
    size: [0.28, 1.05, 0.28],
    slots: [
      { role: "body", color: 0x3c3f44, roughness: 0.5, metalness: 0.06 },
      { role: "metal", color: 0xb4babf, roughness: 0.3, metalness: 0.35 },
      { role: "grating", color: 0x1a1c20, roughness: 0.9, metalness: 0 },
      { role: "trim", color: 0x8c8f94, roughness: 0.34, metalness: 0.3 },
      { role: "base", color: 0x2a2c30, roughness: 0.5, metalness: 0.12 }
    ],
    parts: [
      cbox(4, [0.26, 0.02, 0.26], [0, 0, 0]),
      croundedBox(0, [0.28, 1, 0.264], [0, 0.02, 0], { radius: 0.03 }),
      cbox(2, [0.23, 0.9, 0.006], [0, 0.11, 0.135]),
      // 单元只比网布前突 2mm：同面会产生闪烁，多这一点点就够读成「嵌在网面上的喇叭」。
      ccyl(1, 0.072, 0.005, 24, [0, 0.648, 0.1375], { rot: [90, 0, 0] }),
      ccyl(1, 0.048, 0.005, 20, [0, 0.392, 0.1375], { rot: [90, 0, 0] }),
      ccyl(1, 0.032, 0.005, 16, [0, 0.208, 0.1375], { rot: [90, 0, 0], fullOnly: true }),
      // 背面接线盒**不能打 fullOnly**：它比箱体背面（−0.132）再往后 8mm，是这件最深的极值面，
      cbox(1, [0.16, 0.16, 0.008], [0, 0.12, -0.136]),
      cbox(3, [0.26, 0.03, 0.24], [0, 1.02, 0])
    ]
  },
  projector: {
    note: "投影仪：圆角机身 + 四只脚垫 + 顶面控制条与散热格栅 + 正面镜筒（金属圈 + 玻璃镜片）。",
    size: [0.3, 0.1, 0.24],
    slots: [
      { role: "body", color: 0xfafaf8, roughness: 0.42, metalness: 0.05 },
      { role: "panel", color: 0x22252a, roughness: 0.35, metalness: 0.2 },
      { role: "metal", color: 0xb4babf, roughness: 0.25, metalness: 0.45 },
      { role: "glass", color: 0xdfeaec, roughness: 0.08, metalness: 0.1 },
      { role: "grating", color: 0x9aa1a8, roughness: 0.32, metalness: 0.3 }
    ],
    parts: [
      // 正面分两级外凸：机身面 0.108 → 镜筒 0.108…0.116 → 镜片 0.116…0.12。
      ccyl(2, 0.012, 0.006, 12, [0.12, 0, 0.09]),
      ccyl(2, 0.012, 0.006, 12, [-0.12, 0, 0.09]),
      ccyl(2, 0.012, 0.006, 12, [0.12, 0, -0.09]),
      ccyl(2, 0.012, 0.006, 12, [-0.12, 0, -0.09]),
      croundedBox(0, [0.3, 0.086, 0.228], [0, 0.006, -0.006], { radius: 0.018 }),
      cbox(1, [0.12, 0.008, 0.05], [0.06, 0.092, 0]),
      cbox(4, [0.1, 0.008, 0.07], [-0.08, 0.092, 0]),
      ccyl(2, 0.042, 0.008, 24, [0.08, 0.013, 0.112], { rot: [90, 0, 0] }),
      // 镜片加厚到 8mm（背面 0.112 埋进镜筒里）：原来镜片背面与镜筒正面同在 0.116 ——
      ccyl(3, 0.03, 0.008, 24, [0.08, 0.025, 0.116], { rot: [90, 0, 0] })
    ]
  },

  // ── 环境电器 ────────────────────────────────────────────────────────────
  fan: {
    note: "落地风扇：圆底座 + 立杆 + 三叶扇头 + 金属网罩 + 杆上控制面板（显示区）。",
    size: [0.4, 1.15, 0.4],
    slots: [
      { role: "base", color: 0xd0d0c9, roughness: 0.5, metalness: 0.08 },
      { role: "metal", color: 0x9aa1a8, roughness: 0.3, metalness: 0.35 },
      { role: "body", color: 0x22252a, roughness: 0.4, metalness: 0.1 },
      { role: "trim", color: 0xb4babf, roughness: 0.3, metalness: 0.4 },
      { role: "panel", color: 0x2b2f34, roughness: 0.36, metalness: 0.16 },
      { role: "screen", color: 0x15171a, roughness: 0.2, metalness: 0.1 }
    ],
    parts: [
      // 底座径 0.40 同时管住宽与深；扇头圆心抬到 y = 1.00，网圈外沿正好顶到 1.15。
      ccyl(0, 0.2, 0.03, 28, [0, 0, 0]),
      ccyl(1, 0.018, 0.95, 16, [0, 0.03, 0]),
      ccyl(2, 0.055, 0.12, 20, [0, 0.945, -0.08], { rot: [90, 0, 0], align: "center" }),
      // 三片扇叶各自偏移到半径 0.09 处，再绕**自身中心**转 —— 转的是叶片朝向，不是落点。
      cbox(2, [0.11, 0.045, 0.012], [0.09, 1.0, -0.018], { align: "center" }),
      cbox(2, [0.11, 0.045, 0.012], [-0.045, 1.078, -0.018], { rot: [0, 0, 120], align: "center" }),
      cbox(2, [0.11, 0.045, 0.012], [-0.045, 0.922, -0.018], { rot: [0, 0, 240], align: "center" }),
      ctorus(1, 0.144, 0.006, [0, 1.0, 0.01], { axis: "z", align: "center" }),
      cbox(1, [0.012, 0.288, 0.006], [0, 1.0, 0.01], { align: "center", fullOnly: true }),
      cbox(1, [0.288, 0.012, 0.006], [0, 1.0, 0.01], { align: "center", fullOnly: true }),
      ccyl(3, 0.03, 0.02, 12, [0, 1.0, 0.012], { rot: [90, 0, 0], align: "center", fullOnly: true }),
      cbox(4, [0.1, 0.06, 0.012], [0, 0.36, 0.022]),
      cbox(5, [0.06, 0.03, 0.012], [0, 0.4, 0.034], { fullOnly: true })
    ]
  },
  humidifier: {
    note: "立式加湿器：圆桶机身 + 下部水箱视窗 + 顶部出雾口 + 控制面板（显示区）+ 底座。",
    size: [0.3, 0.55, 0.3],
    slots: [
      { role: "body", color: 0xfafaf8, roughness: 0.5, metalness: 0.04 },
      { role: "base", color: 0xd0d0c9, roughness: 0.6, metalness: 0.04 },
      { role: "trim", color: 0x9aa1a8, roughness: 0.32, metalness: 0.3 },
      { role: "glass", color: 0xdfeaec, roughness: 0.14, metalness: 0.05 },
      { role: "panel", color: 0x2b2f34, roughness: 0.36, metalness: 0.16 },
      { role: "screen", color: 0x15171a, roughness: 0.2, metalness: 0.1 }
    ],
    parts: [
      // 机身径 0.30 已经把宽与深顶满；视窗与面板是贴在筒壁上的平板，前极值 0.15 由它们接管。
      ccyl(1, 0.14, 0.05, 28, [0, 0, 0]),
      ccyl(0, 0.15, 0.472, 28, [0, 0.048, 0]),
      ccyl(2, 0.045, 0.032, 16, [0, 0.518, 0]),
      cbox(3, [0.16, 0.2, 0.012], [0, 0.14, 0.144]),
      cbox(4, [0.2, 0.1, 0.016], [0, 0.35, 0.138]),
      cbox(5, [0.12, 0.05, 0.012], [0, 0.375, 0.144])
    ]
  },
  dehumidifier: {
    note: "除湿机：机身 + 顶部出风格栅 + 下前水箱抽屉 + 控制面板（显示区）+ 前上部提手 + 底座。",
    size: [0.35, 0.6, 0.28],
    slots: [
      { role: "body", color: 0xfafaf8, roughness: 0.48, metalness: 0.05 },
      { role: "base", color: 0x3c3f44, roughness: 0.5, metalness: 0.14 },
      { role: "drawer", color: 0xdfeaec, roughness: 0.3, metalness: 0.1 },
      { role: "panel", color: 0x2b2f34, roughness: 0.36, metalness: 0.16 },
      { role: "screen", color: 0x15171a, roughness: 0.2, metalness: 0.1 },
      { role: "handle", color: 0x3c3f44, roughness: 0.42, metalness: 0.08 },
      { role: "grating", color: 0x3c3f44, roughness: 0.45, metalness: 0.2 }
    ],
    parts: [
      // 机身只到 0.586，顶上 1.4cm 是外露的格栅 —— 0.60 的高度极值落在格栅上。
      cbox(1, [0.31, 0.04, 0.22], [0, 0, -0.01]),
      croundedBox(0, [0.35, 0.546, 0.26], [0, 0.04, -0.01], { radius: 0.02 }),
      cbox(6, [0.28, 0.014, 0.2], [0, 0.586, -0.01]),
      croundedBox(2, [0.24, 0.2, 0.03], [0, 0.06, 0.125], { radius: 0.008 }),
      cbox(3, [0.26, 0.1, 0.026], [0, 0.46, 0.123]),
      cbox(4, [0.14, 0.05, 0.012], [0, 0.485, 0.134]),
      cbox(5, [0.14, 0.03, 0.02], [0, 0.535, 0.13])
    ]
  },
  freshair: {
    note: "明装新风机：箱体 + 前检修门 + 左侧控制面板（显示区）+ 右侧两个新风管接口。",
    size: [0.6, 0.3, 0.3],
    slots: [
      { role: "body", color: 0xf2f1ed, roughness: 0.5, metalness: 0.05 },
      { role: "door", color: 0xf2f1ed, roughness: 0.48, metalness: 0.06 },
      { role: "panel", color: 0x2b2f34, roughness: 0.36, metalness: 0.16 },
      { role: "screen", color: 0x15171a, roughness: 0.2, metalness: 0.1 },
      { role: "metal", color: 0x9aa1a8, roughness: 0.3, metalness: 0.35 }
    ],
    parts: [
      // 箱体只到 z = 0.06，前面留给检修门与管口 —— 前极值 0.15 由管口接管。
      cbox(0, [0.6, 0.3, 0.21], [0, 0, -0.045]),
      croundedBox(1, [0.44, 0.24, 0.06], [0, 0.03, 0.05], { radius: 0.01 }),
      cbox(2, [0.3, 0.1, 0.07], [-0.12, 0.1, 0.08]),
      cbox(3, [0.14, 0.05, 0.012], [-0.12, 0.125, 0.112]),
      ccyl(4, 0.045, 0.09, 16, [0.18, 0.09, 0.105], { rot: [90, 0, 0], align: "center" }),
      ccyl(4, 0.045, 0.09, 16, [0.18, 0.21, 0.105], { rot: [90, 0, 0], align: "center" })
    ]
  },

  // ── 智能面板与安防 ──────────────────────────────────────────────────────
  thermostat: {
    note: "温控面板：方底板 + 深色显示区 + 一圈回边（上下左右四道）+ 底部传感器点。",
    size: [0.1, 0.1, 0.02],
    slots: [
      { role: "body", color: 0xfafaf8, roughness: 0.4, metalness: 0.05 },
      { role: "screen", color: 0x22252a, roughness: 0.28, metalness: 0.12 },
      { role: "trim", color: 0xb4babf, roughness: 0.3, metalness: 0.4 },
      { role: "metal", color: 0x8c8f94, roughness: 0.3, metalness: 0.4 }
    ],
    parts: [
      // 底板只占后半 14mm，显示区与回边同处最前 6mm 里（两者错开 1mm，贴边并排会闪烁）。
      croundedBox(0, [0.1, 0.1, 0.014], [0, 0, -0.003], { radius: 0.008 }),
      cbox(1, [0.064, 0.05, 0.006], [0, 0.025, 0.007]),
      cbox(2, [0.09, 0.012, 0.006], [0, 0.078, 0.007]),
      cbox(2, [0.09, 0.012, 0.006], [0, 0.01, 0.007]),
      ...mirrorPair(cbox(2, [0.012, 0.056, 0.006], [0.039, 0.022, 0.007])),
      ccyl(3, 0.005, 0.006, 12, [0, 0.002, 0.005])
    ]
  },
  smartpanel: {
    note: "智能面板：方底板 + 大显示区 + 底部三键，比温控面板略大。",
    size: [0.12, 0.12, 0.02],
    slots: [
      { role: "body", color: 0xfafaf8, roughness: 0.4, metalness: 0.05 },
      { role: "screen", color: 0x31353a, roughness: 0.26, metalness: 0.12 },
      { role: "metal", color: 0x9aa1a8, roughness: 0.3, metalness: 0.35 }
    ],
    parts: [
      croundedBox(0, [0.12, 0.12, 0.016], [0, 0, -0.002], { radius: 0.009 }),
      cbox(1, [0.086, 0.062, 0.008], [0, 0.03, 0.006]),
      cbox(2, [0.022, 0.014, 0.008], [0, 0.008, 0.006]),
      ...mirrorPair(cbox(2, [0.022, 0.014, 0.008], [0.03, 0.008, 0.006]))
    ]
  },
  smartlock: {
    note: "智能门锁：贴门面板 + 上部密码区 + 中部显示屏 + 指纹头 + 底部横把手。",
    size: [0.08, 0.28, 0.05],
    slots: [
      { role: "body", color: 0x22252a, roughness: 0.3, metalness: 0.25 },
      { role: "screen", color: 0x0f1114, roughness: 0.22, metalness: 0.1 },
      { role: "metal", color: 0x454c54, roughness: 0.26, metalness: 0.4 },
      { role: "panel", color: 0x31353a, roughness: 0.34, metalness: 0.2 },
      { role: "trim", color: 0xb4babf, roughness: 0.24, metalness: 0.5 }
    ],
    parts: [
      croundedBox(0, [0.08, 0.28, 0.026], [0, 0, -0.012], { radius: 0.01 }),
      cbox(1, [0.05, 0.09, 0.008], [0, 0.15, 0.005]),
      cbox(3, [0.05, 0.07, 0.008], [0, 0.055, 0.005]),
      ccyl(4, 0.009, 0.008, 16, [0, 0.247, 0.005]),
      // 横把手：绕 z 转 90° 后轴向沿 x，长度就是它的 x 尺寸；落位 y 仍是底面，z 是中心。
      ccyl(2, 0.011, 0.06, 16, [0, 0.01, 0.014], { rot: [0, 0, 90] })
    ]
  },
  doorbell: {
    note: "可视门铃：竖面板 + 上部摄像头（玻璃镜片）+ 中部显示区 + 下部门铃圆环。",
    size: [0.06, 0.13, 0.03],
    slots: [
      { role: "body", color: 0x22252a, roughness: 0.3, metalness: 0.25 },
      { role: "screen", color: 0x0f1114, roughness: 0.2, metalness: 0.1 },
      { role: "glass", color: 0xdfeaec, roughness: 0.08, metalness: 0.1 },
      { role: "trim", color: 0xb4babf, roughness: 0.25, metalness: 0.45 }
    ],
    parts: [
      croundedBox(0, [0.06, 0.13, 0.018], [0, 0, -0.006], { radius: 0.008 }),
      ccyl(2, 0.011, 0.008, 20, [0, 0.108, 0.011], { rot: [90, 0, 0] }),
      cbox(1, [0.042, 0.045, 0.008], [0, 0.05, 0.007]),
      ctorus(3, 0.016, 0.004, [0, 0.028, 0.011], { axis: "z" })
    ]
  },
  gateway: {
    note: "智能网关：扁平圆角盒 + 顶面顶板与指示灯环 + 背侧网口区。",
    size: [0.12, 0.05, 0.12],
    slots: [
      { role: "body", color: 0xfafaf8, roughness: 0.5, metalness: 0.04 },
      { role: "trim", color: 0x9aa1a8, roughness: 0.3, metalness: 0.3 },
      { role: "lit", color: 0x5fd08a, roughness: 0.2, metalness: 0 },
      { role: "metal", color: 0x8c8f94, roughness: 0.3, metalness: 0.4 }
    ],
    parts: [
      croundedBox(0, [0.12, 0.046, 0.116], [0, 0, -0.002], { radius: 0.014 }),
      cbox(3, [0.08, 0.014, 0.008], [0, 0.006, 0.056]),
      croundedBox(1, [0.112, 0.002, 0.104], [0, 0.046, 0], { radius: 0.008, fullOnly: true }),
      ccyl(2, 0.014, 0.002, 20, [0, 0.048, 0])
    ]
  },

  // ── 客厅与休闲（新增） ───────────────────────────────────────────────────
  chaise: {
    note: "贵妃榻：木底座框 + 长条软包坐垫 + 矮靠背 + 坐垫压线，沙发旁的舒展位。",
    size: [0.75, 0.72, 1.65],
    slots: [
      { role: "leg", color: 0xbc9163, roughness: 0.7, metalness: 0 },
      { role: "frame", color: 0xc49a6c, roughness: 0.68, metalness: 0 },
      { role: "upholstery", color: 0xf3e7d8, roughness: 0.92, metalness: 0 },
      { role: "accent", color: 0xe4d5c2, roughness: 0.9, metalness: 0 }
    ],
    parts: [
      // 腿距 0.353 + 半径 0.022 = 0.375 ⇒ 宽度正好 0.75（这件家具宽度由腿距决定）。
      ...mirrorPair([
        ctaper(0, 0.022, 0.016, 0.14, 12, [0.353, 0, 0.8]),
        ctaper(0, 0.022, 0.016, 0.14, 12, [0.353, 0, -0.8])
      ]),
      cbox(1, [0.73, 0.06, 1.65], [0, 0.14, 0]),
      croundedBox(2, [0.71, 0.17, 1.61], [0, 0.285, 0], { radius: 0.05 }),
      croundedBox(3, [0.71, 0.35, 0.14], [0, 0.37, -0.735], { radius: 0.05 }),
      // 压线原与靠背的**底面**同在 0.37（都朝下）：122cm² 的同向共面。压线抬起 2mm 即分开，
      cbox(2, [0.69, 0.02, 1.59], [0, 0.372, 0], { fullOnly: true })
    ]
  },
  nestingtable: {
    note: "套几：大小两张方台面套叠，收起时省地方 —— 小几斜插在大几下方，这正是「套几」读得出来的地方。",
    size: [0.55, 0.5, 0.55],
    slots: [
      { role: "top", color: 0xc49a6c, roughness: 0.68, metalness: 0 },
      { role: "leg", color: 0xbc9163, roughness: 0.68, metalness: 0 }
    ],
    parts: [
      // 大几：台面吃满 0.55，腿收在四角内侧。
      ...ringOf(4, { radius: 0.33, startAngle: 45 }, () =>
        ctaper(1, 0.016, 0.011, 0.465, 12, [0, 0, 0])
      ),
      cbox(0, [0.55, 0.035, 0.55], [0, 0.465, 0]),
      ...ringOf(4, { radius: 0.235, startAngle: 45, center: [0.07, 0.07] }, () =>
        ctaper(1, 0.014, 0.01, 0.365, 12, [0, 0, 0])
      ),
      cbox(0, [0.4, 0.03, 0.4], [0.07, 0.365, 0.07])
    ]
  },
  roundcoffeetable: {
    note: "圆茶几：圆台面带收边 + 上粗下细的中心柱 + 圆底座，客厅中岛式布局。",
    size: [0.9, 0.42, 0.9],
    slots: [
      { role: "top", color: 0xb0703c, roughness: 0.62, metalness: 0.02 },
      { role: "body", color: 0x454c54, roughness: 0.32, metalness: 0.3 },
      { role: "base", color: 0x454c54, roughness: 0.32, metalness: 0.3 }
    ],
    parts: [
      // 台面：闭合母线（平面 → 立面 → 上缘内收 → 底心），上缘收 1.8cm 才像成品桌面而不是一块饼。
      clathe(
        0,
        [
          [0, 0],
          [0.45, 0],
          [0.45, 0.028],
          [0.432, 0.04],
          [0, 0.04],
          [0, 0]
        ],
        40,
        [0, 0.38, 0]
      ),
      // 底座：上收下放的圆盘，落地面积比台面小一圈（视觉上才「稳」）。
      clathe(
        2,
        [
          [0, 0],
          [0.22, 0],
          [0.22, 0.03],
          [0.17, 0.045],
          [0, 0.045],
          [0, 0]
        ],
        32,
        [0, 0, 0]
      ),
      ctaper(1, 0.06, 0.045, 0.34, 20, [0, 0.045, 0]),
      ctorus(1, 0.052, 0.008, [0, 0.34, 0], { fullOnly: true })
    ]
  },
  screenspan: {
    note: "屏风：三扇折叠面板，兼作隔断与背景。",
    size: [1.6, 1.75, 0.35],
    slots: [
      { color: 0x9c6b3f, roughness: 0.68, metalness: 0 },
      { color: 0xf3e7d8, roughness: 0.92, metalness: 0 }
    ],
    parts: [
      cbox(0, [0.53, 1.75, 0.024], [-0.535, 0, -0.16]),
      cbox(0, [0.53, 1.75, 0.024], [0, 0, 0.16]),
      cbox(0, [0.53, 1.75, 0.024], [0.535, 0, -0.16]),
      cbox(1, [0.45, 1.55, 0.004], [-0.535, 0.1, -0.145]),
      cbox(1, [0.45, 1.55, 0.004], [0, 0.1, 0.175]),
      cbox(1, [0.45, 1.55, 0.004], [0.535, 0.1, -0.145]),
      cbox(0, [1.58, 0.05, 0.03], [0, 1.75, 0], { align: "top", fullOnly: true })
    ]
  },
  coatrail: {
    note: "衣帽架：锥形木立柱 + 四向斜挑挂钩 + 圆底盘 + 中部挂圈，玄关随手挂衣。",
    size: [0.45, 1.75, 0.45],
    slots: [
      { role: "body", color: 0x9c6b3f, roughness: 0.66, metalness: 0 },
      { role: "base", color: 0x454c54, roughness: 0.32, metalness: 0.3 },
      { role: "metal", color: 0x454c54, roughness: 0.32, metalness: 0.3 }
    ],
    parts: [
      // 底盘：上收下放的圆盘，压得住重心。
      clathe(
        1,
        [
          [0, 0],
          [0.225, 0],
          [0.225, 0.022],
          [0.19, 0.035],
          [0, 0.035],
          [0, 0]
        ],
        32,
        [0, 0, 0]
      ),
      ctaper(0, 0.026, 0.019, 1.685, 16, [0, 0.035, 0]),
      sphere(0, 0.03, [0, 1.72, 0], { align: "center" }),
      // 四向挂钩：基准位朝 +z 斜挑 30°，环列四份；外伸最远 0.075 + 0.095 = 0.17 < 0.225。
      ...ringOf(4, { radius: 0.075 }, () =>
        ccyl(2, 0.013, 0.22, 8, [0, 1.5, 0], { rot: [30, 0, 0], align: "center" })
      ),
      ccyl(2, 0.075, 0.014, 20, [0, 1.15, 0], { fullOnly: true })
    ]
  },
  stool: {
    note: "圆凳：圆座面带软包边 + 四条外八锥形金属腿 + 环状踏脚。",
    size: [0.36, 0.45, 0.36],
    slots: [
      { role: "leg", color: 0x454c54, roughness: 0.32, metalness: 0.3 },
      { role: "top", color: 0xc49a6c, roughness: 0.66, metalness: 0 }
    ],
    parts: [
      ...ringOf(4, { radius: 0.125, startAngle: 45 }, () =>
        ctaper(0, 0.014, 0.01, 0.39, 12, [0, 0, 0], { rot: [4, 0, 0] })
      ),
      ctorus(0, 0.133, 0.0075, [0, 0.2, 0], { fullOnly: true }),
      clathe(
        1,
        [
          [0, 0],
          [0.18, 0],
          [0.18, 0.04],
          [0.165, 0.06],
          [0, 0.06],
          [0, 0]
        ],
        32,
        [0, 0.39, 0]
      )
    ]
  },

  // ── 收纳与柜类（新增） ───────────────────────────────────────────────────
  locker: {
    note: "储物柜：双开门 + 中部隔板，阳台与过道的通用收纳。",
    size: [0.9, 1.8, 0.4],
    // 五件全是方盒，两把手又是最前缘（撑住 0.4 的进深）：没有可降的分段，也没有能丢的件。
    liteVertexBudgetRatio: 1,
    slots: [
      { role: "body", color: 0x3d2818, roughness: 0.6, metalness: 0 },
      { role: "door", color: 0xffffff, roughness: 0.42, metalness: 0.06 },
      { role: "metal", color: 0x546235, roughness: 0.4, metalness: 0.2 }
    ],
    parts: [
      cbox(0, [0.9, 1.8, 0.36], [0, 0, -0.02]),
      cbox(1, [0.44, 1.6, 0.03], [-0.225, 0.1, 0.175]),
      cbox(1, [0.44, 1.6, 0.03], [0.225, 0.1, 0.175]),
      // 把手凸出门板 1cm，正好顶到 -0.2…0.2 这条进深线上（门板只到 0.19）：丢了就是 0.38 深。
      cbox(2, [0.02, 0.16, 0.01], [-0.03, 0.8, 0.195]),
      cbox(2, [0.02, 0.16, 0.01], [0.03, 0.8, 0.195])
    ]
  },
  laundrycabinet: {
    note: "洗衣柜：下柜收纳 + 台上圆盆，阳台洗衣位。",
    size: [0.65, 0.85, 0.6],
    slots: [
      { role: "body", color: 0x3d2818, roughness: 0.6, metalness: 0 },
      { role: "door", color: 0xffffff, roughness: 0.35, metalness: 0.05 },
      { role: "metal", color: 0x546235, roughness: 0.4, metalness: 0.2 },
      { role: "top", color: 0xd8d6d0, roughness: 0.28, metalness: 0.02 }
    ],
    parts: [
      cbox(0, [0.65, 0.8, 0.56], [0, 0, -0.02]),
      ccyl(3, 0.17, 0.05, 24, [0, 0.8, 0]),
      cbox(1, [0.58, 0.62, 0.03], [0, 0.08, 0.275]),
      // 单只把手同样是最前缘（门板到 0.29、它到 0.30）：留着，不减它。
      cbox(2, [0.02, 0.14, 0.01], [0.22, 0.35, 0.295])
    ]
  },
  balconycabinet: {
    note: "阳台柜：上柜封闭 + 下部敞口，藏清洁用品。",
    size: [0.8, 1.2, 0.4],
    slots: [
      { role: "body", color: 0x3d2818, roughness: 0.6, metalness: 0 },
      { role: "door", color: 0xffffff, roughness: 0.42, metalness: 0.06 },
      { role: "metal", color: 0x546235, roughness: 0.4, metalness: 0.2 }
    ],
    parts: [
      cbox(0, [0.8, 1.2, 0.36], [0, 0, -0.02]),
      cbox(1, [0.72, 0.64, 0.03], [0, 0.5, 0.175]),
      // 上柜内的层板：四面都藏在柜门之后，是真正的「近看才成立」——留着 fullOnly。
      cbox(0, [0.74, 0.025, 0.34], [0, 0.44, -0.02], { fullOnly: true }),
      // 把手凸出门板 1cm，撑住 0.4 的进深（门板只到 0.19）：必须两版都在。
      cbox(2, [0.02, 0.16, 0.01], [0.28, 0.75, 0.195])
    ]
  },
  winecabinet: {
    note: "酒柜：玻璃门 + 内置层板，餐厅一角的陈列柜。",
    size: [0.6, 1.6, 0.45],
    slots: [
      { role: "body", color: 0x3d2818, roughness: 0.6, metalness: 0 }, // 0 木柜体 / 层板
      // 同展示柜：槽位色与 joineryCombo 的 glass 配方保持一致。
      { role: "glass", color: 0xa9c5d3, roughness: 0.12, metalness: 0.04 },
      { role: "metal", color: 0x546235, roughness: 0.4, metalness: 0.2 }
    ],
    parts: [
      cbox(0, [0.6, 1.6, 0.42], [0, 0, -0.015]),
      // 玻璃门 0.201 ~ 0.221：背面**不能**落在柜体正面（0.195）上 —— 玻璃在运行侧是
      cbox(1, [0.48, 1.3, 0.02], [0, 0.2, 0.211]),
      // 内置层板：藏在玻璃门之后，是真正的「近看才成立」—— 留着 fullOnly。
      cbox(0, [0.52, 0.02, 0.36], [0, 0.55, -0.02], { fullOnly: true }),
      // 把手顶到 0.225，是整件最前缘（玻璃门到 0.221）—— 不能打 fullOnly，
      cbox(2, [0.02, 0.2, 0.01], [-0.16, 0.75, 0.22])
    ]
  },
  // 岛台兼餐桌（2026-09 重做）：按实物参考图（智能电动伸缩岛台餐桌）定形，比例是两条硬口径：
  kitchenisland: (() => {
    const height = 0.9;
    const counterThickness = 0.04;
    const counterBottomY = height - counterThickness;
    // 高台台面 1 : 1 —— 这两个数绑在一起，改一个必须改另一个。
    const islandLength = 0.8;
    const depth = 0.8;
    const islandMinX = 0.4;
    const islandMaxX = islandMinX + islandLength;
    const islandCenterX = (islandMinX + islandMaxX) / 2;
    // 低台长度 = 高台的 2 倍，占 x −1.2 ~ 0.4。
    const tableLength = islandLength * 2;
    const tableMinX = islandMinX - tableLength;
    // 柜体：四周各收 5cm（宽 0.7、深 0.7），顶面咬进台面 2mm。
    const carcassWidth = islandLength - 0.1;
    const carcassDepth = depth - 0.1;
    const carcassTopY = counterBottomY + 0.002;
    const plinthTopY = 0.062; // 咬进柜体底面 2mm（柜体自 0.06 起）
    // 正立面：一片 0.48 宽的平板门 + 右端一条 0.176 宽的深色竖面板，两侧各留 2cm 立边
    // 露着柜体本身，就是参考图里那圈窄框。
    const bodyFrontMinX = islandMinX + 0.05;
    const bodyFrontMaxX = islandMaxX - 0.05;
    const frontReveal = 0.02;
    const runMinX = bodyFrontMinX + frontReveal;
    const runMaxX = bodyFrontMaxX - frontReveal;
    const doorGap = 0.004;
    const doorWidth = 0.48;
    const darkPanelMinX = runMinX + doorWidth + doorGap;
    const doorBottomY = 0.1;
    const doorTopY = 0.78;
    // 门板 / 深色面板的背面正好落在柜体正面（z = 0.35）上：这是**背靠背**的一对，
    const frontFaceZ = carcassDepth / 2;
    const doorThickness = 0.022;
    const panelThickness = 0.018;
    // 控制条：填住台面下沿那圈悬挑，正面收在台面前缘（0.40）之内 6mm。
    const apronBottomY = 0.79;
    const apronFrontZ = depth / 2 - 0.006;
    // 低台：板顶 0.75（餐桌高），进深 0.72（比高台台面窄一圈，读得出是抽出来的一块）。
    const tableTopY = 0.75;
    const tableThickness = 0.035;
    const tableDepth = 0.72;
    const legThickness = 0.03;
    const tableLegX = tableMinX + 0.02;
    return {
      note: "岛台兼餐桌：高台（0.8 × 0.8 台面、高 0.9）正立面是控制条 + 平板门 + 右端窄深色面板，侧面伸出两倍长的低台（1.6 × 0.72、板高 0.75，外端板式支腿落地）。",
      size: [2.4, 0.9, 0.8],
      // 九个方盒零件，**每一块都是能认出来的特征**（高台台面 / 控制条 / 门板 / 深色竖面板 /
      liteVertexBudgetRatio: 1,
      slots: [
        { role: "body", color: 0x3d2818, roughness: 0.6, metalness: 0 },
        { role: "top", color: 0xd8d6d0, roughness: 0.28, metalness: 0.08 },
        { role: "door", color: 0xffffff, roughness: 0.42, metalness: 0.06 }, // 2 平板门
        // 深色面那一族（控制条 + 显示屏边框 + 竖面板）共用一个槽位：参考图里它们就是同一种
        // 「黑色面板」，而运行侧的 `metal` 角色给的正是柜体五金那一档深色 —— 分三个槽位只会
        // 多两张材质、颜色还是同一个（角色取色只看角色，不看槽位号）。
        { role: "metal", color: 0x2f3336, roughness: 0.34, metalness: 0.28 },
        { role: "base", color: 0x3f2916, roughness: 0.66, metalness: 0 },
        { role: "leg", color: 0x3f2916, roughness: 0.66, metalness: 0 }
      ],
      parts: [
        // 踢脚：四周内缩，顶面咬进柜体底面 2mm（柜体自 0.06 起）。
        cbox(4, [carcassWidth - 0.1, plinthTopY, carcassDepth - 0.1], [
          islandCenterX,
          0,
          0
        ]),
        // 柜体：顶面 0.862，埋进台面底 0.86 共 2mm。
        cbox(0, [carcassWidth, carcassTopY - 0.06, carcassDepth], [islandCenterX, 0.06, 0]),
        // 高台台面：0.8 × 0.8（1:1），整件 x+ / z± / 高度三项极值都由它定。
        cbox(1, [islandLength, counterThickness, depth], [islandCenterX, counterBottomY, 0]),
        // 控制条：正面 0.394，比台面前缘（0.40）缩进 6mm；顶面 0.864 埋进台面里 4mm。
        cbox(3, [carcassWidth - 0.1, 0.074, apronFrontZ - frontFaceZ], [
          islandCenterX,
          apronBottomY,
          (frontFaceZ + apronFrontZ) / 2
        ]),
        // 显示屏边框：从控制条里凸出 1.5mm（背面埋进控制条 4.5mm），因此离台面前缘还剩 4.5mm ——
        cbox(3, [0.16, 0.05, 0.006], [islandCenterX, 0.8, apronFrontZ - 0.0015]),
        // 右端深色竖面板：窄条（0.176 宽 × 0.68 高），比门板略薄。
        cbox(3, [runMaxX - darkPanelMinX, doorTopY - doorBottomY, panelThickness], [
          (darkPanelMinX + runMaxX) / 2,
          doorBottomY,
          frontFaceZ + panelThickness / 2
        ]),
        // 平板门：一片吃到 0.48 宽（参考图里深色面板只占右侧一小条）。
        cbox(2, [doorWidth, doorTopY - doorBottomY, doorThickness], [
          runMinX + doorWidth / 2,
          doorBottomY,
          frontFaceZ + doorThickness / 2
        ]),
        // 低台（伸缩餐台）板：板尾顶在柜体侧面上（x = 0.4），板尖到 x = −1.2，板长 1.6 ——
        cbox(1, [tableLength, tableThickness, tableDepth], [
          (tableMinX + islandMinX) / 2,
          tableTopY - tableThickness,
          0
        ]),
        // 板式支腿：底面落在 y=0（与踢脚同为整件最低处的两处之一），顶面咬进餐台板 2mm。
        cbox(5, [legThickness, tableTopY - tableThickness + 0.002, tableDepth - 0.12], [
          tableLegX,
          0,
          0
        ])
      ]
    };
  })(),
  pantry: {
    note: "餐边高柜：通高双门 + 中部开放格，餐厅收纳主力。",
    size: [0.9, 1.9, 0.42],
    // 同 locker：五件全是方盒，把手是最前缘，没有能丢的件也没有可降的分段。
    liteVertexBudgetRatio: 1,
    slots: [
      { role: "body", color: 0x3d2818, roughness: 0.6, metalness: 0 },
      { role: "door", color: 0xffffff, roughness: 0.42, metalness: 0.06 },
      { role: "metal", color: 0x546235, roughness: 0.4, metalness: 0.2 }
    ],
    parts: [
      cbox(0, [0.9, 1.9, 0.38], [0, 0, -0.02]),
      cbox(1, [0.43, 1.5, 0.025], [-0.225, 0.25, 0.1825]),
      cbox(1, [0.43, 1.5, 0.025], [0.225, 0.25, 0.1825]),
      // 把手凸出门板 1cm，顶到 ±0.21 那条进深线上（门板只到 0.20）。
      cbox(2, [0.02, 0.14, 0.015], [-0.04, 1.0, 0.2025]),
      cbox(2, [0.02, 0.14, 0.015], [0.04, 1.0, 0.2025])
    ]
  },
  sideboard: {
    note: "餐边柜：下柜三门 + 石台面 + 敞开的操作格 + 空心上柜（内衬 + 层板），上柜最右一扇为整扇玻璃门（无框，与玻璃柜同款玻璃）。",
    size: [1.6, 2.2, 0.45],
    slots: [
      { role: "body", color: 0x5a3a22, roughness: 0.66, metalness: 0 },
      { role: "top", color: 0xf2f1ed, roughness: 0.28, metalness: 0.02 },
      { role: "door", color: 0xf5f3ef, roughness: 0.42, metalness: 0.06 },
      { role: "glass", color: 0xa9c5d3, roughness: 0.12, metalness: 0.04 },
      { role: "interior", color: 0xa49385, roughness: 0.6, metalness: 0.03 }
    ],
    parts: [
      // 注意 cbox 的定位约定：x / z 是**中心**，y 是**底面**（align 默认 "bottom"）。
      cbox(0, [1.58, 0.858, 0.41], [0, 0, -0.01]),
      // 石台面：整件最宽最深的一件，占地 1.6 × 0.45 由它定。
      cbox(1, [1.6, 0.045, 0.45], [0, 0.8355, 0]),
      // 操作格背板：立在台面之上、贴着后背，让敞开的格子有底，而不是直接看穿到墙。
      cbox(0, [1.58, 0.4615, 0.045], [0, 0.8805, -0.2025]),
      // 下柜三门：各 0.496 宽，底边离地 3.4cm 露出一截踢脚。
      cbox(2, [0.496, 0.7551, 0.026], [-0.528, 0.0343, 0.212]),
      cbox(2, [0.496, 0.7551, 0.026], [0, 0.0343, 0.212]),
      cbox(2, [0.496, 0.7551, 0.026], [0.528, 0.0343, 0.212]),
      // ── 上柜：空心柜体（围板 1.8cm 厚，外壳仍是 body）────────────────────
      cbox(0, [0.018, 0.858, 0.42], [-0.791, 1.342, -0.015]),
      cbox(0, [0.018, 0.858, 0.42], [0.791, 1.342, -0.015]),
      cbox(0, [1.564, 0.018, 0.42], [0, 1.342, -0.015]),
      cbox(0, [1.564, 0.018, 0.42], [0, 2.182, -0.015]),
      // 背板走 `interior`：透过玻璃直视到的就是它，也是玻璃「透不透」的关键一面。
      cbox(4, [1.564, 0.822, 0.018], [0, 1.36, -0.216]),
      // 中立板 ×2：把上柜分成三格，正对三扇门；透过玻璃能看见右格那一道。
      cbox(4, [0.018, 0.822, 0.396], [-0.264, 1.36, -0.006], { fullOnly: true }),
      cbox(4, [0.018, 0.822, 0.396], [0.264, 1.36, -0.006], { fullOnly: true }),
      // 右格层板：全件里唯一一扇透明门后面看得见的那块（另两格被实心门挡着，不放）。
      cbox(4, [0.49, 0.018, 0.396], [0.5275, 1.751, -0.006], { fullOnly: true }),
      // 上柜三扇门：左 / 中两扇是门板，最右一扇是**整扇玻璃**（同一门洞尺寸，整块透明）。
      cbox(2, [0.496, 0.7379, 0.026], [-0.528, 1.4021, 0.212]),
      cbox(2, [0.496, 0.7379, 0.026], [0, 1.4021, 0.212]),
      cbox(3, [0.496, 0.7379, 0.02], [0.528, 1.4021, 0.212])
    ]
  },

  // ── 卧室 / 儿童 / 书房（新增） ───────────────────────────────────────────
  daybed: {
    note: "榻榻米床：低平木台（body）+ 薄垫（upholstery）+ 尾侧圆枕（cushion），兼顾坐卧。",
    size: [1.2, 0.55, 2.0],
    slots: [
      { role: "body", color: 0xc49a6c, roughness: 0.68, metalness: 0 },
      { role: "upholstery", color: 0xfbfaf8, roughness: 0.9, metalness: 0 },
      { role: "cushion", color: 0xf3e7d8, roughness: 0.92, metalness: 0 }
    ],
    parts: [
      cbox(0, [1.2, 0.32, 2], [0, 0, 0]),
      croundedBox(1, [1.14, 0.19, 1.94], [0, 0.32, 0], { radius: 0.05 }),
      // 尾挡枕：顶端正好 0.55（0.51 + 0.04）。
      croundedBox(2, [1.1, 0.04, 0.28], [0, 0.51, -0.83], { radius: 0.02 }),
      // 圆枕：横躺的胶囊，压进床垫 4cm（真枕头就是陷下去的）。
      ccapsule(2, 0.04, 1.0, [0, 0.51, 0.66], { rot: [0, 0, 90], align: "center", fullOnly: true }),
      cbox(1, [1.14, 0.02, 0.06], [0, 0.51, 0.94], { fullOnly: true })
    ]
  },
  cot: {
    note: "婴儿床：四柱围栏 + 可睡床板 + 布围，护栏通风不闷（床垫与布围各自独立角色）。",
    size: [0.7, 0.95, 1.35],
    slots: [
      { role: "frame", color: 0xc49a6c, roughness: 0.68, metalness: 0 },
      { role: "upholstery", color: 0xfbfaf8, roughness: 0.9, metalness: 0 },
      { role: "fabric", color: 0xf3e7d8, roughness: 0.92, metalness: 0 }
    ],
    parts: [
      // 四根立柱：0.04 见方，立在四角 ⇒ 宽度 0.7、深度 1.35 都由它定。
      ...mirrorPair([
        cbox(0, [0.04, 0.95, 0.04], [0.33, 0, 0.655]),
        cbox(0, [0.04, 0.95, 0.04], [0.33, 0, -0.655])
      ]),
      // 护栏：三面矮栏，留一面开口（大人抱娃那一侧）。
      ...[0.22, 0.42, 0.62].map(railY => cbox(0, [0.62, 0.025, 0.025], [0, railY, 0.655])),
      ...[0.22, 0.42, 0.62].flatMap(railY =>
        mirrorPair(cbox(0, [0.025, 0.025, 1.27], [0.33, railY, 0]))
      ),
      cbox(0, [0.66, 0.03, 1.31], [0, 0.3, 0]),
      croundedBox(1, [0.6, 0.12, 1.25], [0, 0.33, 0], { radius: 0.03 }),
      // 布围：挂在栏内的一圈软包围布。底面原与下面那道护栏的底面（都在 0.42）同向共面
      cbox(2, [0.6, 0.22, 0.02], [0, 0.423, 0.64], { fullOnly: true })
    ]
  },
  computertable: {
    note: "电脑桌：整板台面 + 两侧板 + 背板 + 金属键盘托，靠墙不放腿。",
    size: [1.2, 0.75, 0.6],
    slots: [
      { role: "top", color: 0xc49a6c, roughness: 0.68, metalness: 0 },
      { role: "body", color: 0xc49a6c, roughness: 0.68, metalness: 0 },
      { role: "metal", color: 0x9aa1a8, roughness: 0.35, metalness: 0.3 }
    ],
    parts: [
      // 侧板用非居中的 box 写：x 的外缘正好落在 ±0.6（宽度由台面与它共同界定）；
      ...mirrorPair(box(1, [0.025, 0.715, 0.55], [-0.6, 0, -0.275])),
      cbox(0, [1.2, 0.035, 0.6], [0, 0.715, 0]),
      cbox(2, [0.7, 0.02, 0.28], [0, 0.6, 0.14], { fullOnly: true }),
      ...mirrorPair(cbox(2, [0.03, 0.02, 0.28], [0.34, 0.6, 0.14], { fullOnly: true })),
      cbox(1, [1.15, 0.4, 0.02], [0, 0.3, -0.29], { fullOnly: true })
    ]
  },
  officestool: {
    note: "办公椅：五星脚（环列 5 份，朝向自动补正）+ 气压柱 + 布艺座面 / 靠背 + 扶手。",
    size: [0.6, 1.0, 0.6],
    slots: [
      { role: "metal", color: 0x454c54, roughness: 0.32, metalness: 0.3 },
      { role: "leg", color: 0x9aa1a8, roughness: 0.3, metalness: 0.35 },
      { role: "upholstery", color: 0x3c3f44, roughness: 0.62, metalness: 0.04 }
    ],
    parts: [
      // 五星脚：五角排布在**单轴**上天生不对称 —— 最近轴的那条（|cos| = 0.9877）与次近的（0.8910）
      ...ringOf(5, { radius: 0.1794, startAngle: 45 }, () => [
        cbox(0, [0.045, 0.022, 0.2], [0, 0, 0], { align: "bottom" }),
        ccyl(0, 0.024, 0.05, 10, [0, 0, 0.1], { align: "bottom" })
      ]),
      ccyl(0, 0.026, 0.33, 12, [0, 0.03, 0]),
      croundedBox(2, [0.5, 0.09, 0.48], [0, 0.36, 0], { radius: 0.03 }),
      // 靠背顶端正好 1.0（0.44 + 0.56）。
      croundedBox(2, [0.46, 0.56, 0.09], [0, 0.44, -0.2], { radius: 0.04 }),
      // 扶手：外缘正好 0.30（0.275 + 0.025）、前后各到 ±0.30，这件家具的宽 / 深都由它定
      ...mirrorPair(cbox(1, [0.05, 0.18, 0.6], [0.275, 0.44, 0])),
      // 靠背上的头枕垫：整块都在靠背的轮廓之内（z −0.24…−0.16 落在靠背 −0.245…−0.155 里），
      croundedBox(2, [0.3, 0.12, 0.08], [0, 0.86, -0.2], { radius: 0.04, fullOnly: true })
    ]
  },
  filecabinet: {
    note: "文件柜：四层抽屉 + 台面，书房与办公室的纸质收纳。",
    size: [0.8, 1.3, 0.45],
    // 七件全是方盒，抽屉拉手牌是最前缘（抽屉面到 0.21、它到 0.225）：没有可降的分段、没有能丢的件。
    liteVertexBudgetRatio: 1,
    slots: [
      { role: "body", color: 0x3d2818, roughness: 0.6, metalness: 0 },
      { role: "drawer", color: 0xd8d6d0, roughness: 0.45, metalness: 0.12 },
      { role: "metal", color: 0x546235, roughness: 0.4, metalness: 0.2 }
    ],
    parts: [
      cbox(0, [0.8, 1.3, 0.41], [0, 0, -0.02]),
      cbox(1, [0.72, 0.24, 0.025], [0, 0.08, 0.1975]),
      cbox(1, [0.72, 0.24, 0.025], [0, 0.4, 0.1975]),
      cbox(1, [0.72, 0.24, 0.025], [0, 0.72, 0.1975]),
      cbox(1, [0.72, 0.24, 0.025], [0, 1.04, 0.1975]),
      // 抽屉拉手牌：贴在抽屉面之前 1.5cm，是整件最前缘（撑住 0.45 的进深）。
      cbox(2, [0.2, 0.02, 0.015], [0, 0.3, 0.2175]),
      cbox(2, [0.2, 0.02, 0.015], [0, 0.62, 0.2175])
    ]
  },
  booktower: {
    note: "简易书架：两侧板 + 五层板，窄身省地方。",
    size: [0.5, 1.6, 0.3],
    slots: [
      { role: "body", color: 0xc49a6c, roughness: 0.68, metalness: 0 },
      { role: "shelf", color: 0xe4d5c2, roughness: 0.8, metalness: 0 }
    ],
    parts: [
      cbox(0, [0.025, 1.6, 0.3], [-0.2375, 0, 0]),
      cbox(0, [0.025, 1.6, 0.3], [0.2375, 0, 0]),
      cbox(1, [0.45, 0.022, 0.28], [0, 0, 0]),
      cbox(1, [0.45, 0.022, 0.28], [0, 0.4, 0]),
      cbox(1, [0.45, 0.022, 0.28], [0, 0.8, 0]),
      cbox(1, [0.45, 0.022, 0.28], [0, 1.2, 0]),
      cbox(1, [0.45, 0.022, 0.28], [0, 1.578, 0]),
      cbox(0, [0.45, 1.55, 0.012], [0, 0.025, -0.144], { fullOnly: true })
    ]
  },

  // ── 影音与桌面设备（新增） ───────────────────────────────────────────────
  gameconsole: {
    note: "游戏主机：卧式圆角机身 + 一对脚条 + 顶面散热槽 + 正面接缝面板与光驱槽。",
    size: [0.3, 0.08, 0.24],
    slots: [
      { role: "body", color: 0xfafaf8, roughness: 0.42, metalness: 0.05 },
      { role: "grating", color: 0x22252a, roughness: 0.5, metalness: 0.05 },
      { role: "panel", color: 0xe4e4e0, roughness: 0.4, metalness: 0.08 },
      { role: "screen", color: 0x15171a, roughness: 0.2, metalness: 0.1 },
      { role: "leg", color: 0x22252a, roughness: 0.6, metalness: 0.05 }
    ],
    parts: [
      ...mirrorPair(cbox(4, [0.04, 0.006, 0.16], [0.12, 0, -0.01])),
      croundedBox(0, [0.3, 0.066, 0.208], [0, 0.006, -0.016], { radius: 0.012 }),
      cbox(1, [0.2, 0.008, 0.12], [0, 0.072, -0.02]),
      cbox(2, [0.3, 0.05, 0.012], [0, 0.01, 0.11]),
      cbox(3, [0.16, 0.012, 0.008], [0.05, 0.03, 0.116])
    ]
  },
  avreceiver: {
    note: "功放：矮扁金属机身 + 四只脚 + 顶面散热区 + 正面板（显示窗 + 两只旋钮）。",
    size: [0.44, 0.16, 0.35],
    slots: [
      { role: "body", color: 0x22252a, roughness: 0.4, metalness: 0.12 },
      { role: "grating", color: 0x3c3f44, roughness: 0.55, metalness: 0.06 },
      { role: "panel", color: 0x2a2c30, roughness: 0.36, metalness: 0.2 },
      { role: "screen", color: 0x15171a, roughness: 0.2, metalness: 0.1 },
      { role: "leg", color: 0x15171a, roughness: 0.6, metalness: 0.05 },
      { role: "metal", color: 0xb4babf, roughness: 0.26, metalness: 0.5 }
    ],
    parts: [
      cbox(4, [0.05, 0.006, 0.03], [0.19, 0, 0.15]),
      cbox(4, [0.05, 0.006, 0.03], [-0.19, 0, 0.15]),
      cbox(4, [0.05, 0.006, 0.03], [0.19, 0, -0.15]),
      cbox(4, [0.05, 0.006, 0.03], [-0.19, 0, -0.15]),
      croundedBox(0, [0.44, 0.146, 0.334], [0, 0.006, -0.008], { radius: 0.01 }),
      cbox(1, [0.34, 0.008, 0.22], [0, 0.152, 0]),
      cbox(2, [0.44, 0.1, 0.012], [0, 0.02, 0.165]),
      cbox(3, [0.16, 0.04, 0.008], [0.06, 0.06, 0.171]),
      ccyl(5, 0.02, 0.008, 20, [0.19, 0.06, 0.171], { rot: [90, 0, 0] }),
      ccyl(5, 0.02, 0.008, 20, [-0.17, 0.06, 0.171], { rot: [90, 0, 0] })
    ]
  },
  screenpanel: {
    note: "投影幕：顶部卷筒 + 整幅幕布 + 底部配重杆 + 两侧边轨。",
    size: [2.2, 1.25, 0.08],
    slots: [
      { role: "metal", color: 0xb4babf, roughness: 0.3, metalness: 0.35 },
      { role: "lit", color: 0xf3f1ec, roughness: 0.85, metalness: 0 }
    ],
    parts: [
      cbox(0, [2.14, 0.04, 0.028], [0, 0, 0]),
      ...mirrorPair(cbox(0, [0.03, 1.12, 0.02], [1.085, 0.04, 0], { fullOnly: true })),
      cbox(1, [2.14, 1.12, 0.008], [0, 0.04, 0]),
      cbox(0, [2.2, 0.09, 0.08], [0, 1.16, 0])
    ]
  },

  tv_standard: {
    note: "壁挂电视：60mm 机身背板 + 一圈回边（屏幕嵌在其中）+ 背面挂架方板。没有落地件，抬高由物件的离地高度给。",
    size: [1.5, 0.92, 0.06],
    // 三块都是纯方盒：没有分段可降，挂架又撑着 0.06 的进深（见零件注释），
    liteVertexBudgetRatio: 1,
    slots: [
      { role: "body", color: 0x2a2c30, roughness: 0.46, metalness: 0.1 },
      { role: "trim", color: 0x3f4247, roughness: 0.34, metalness: 0.18 },
      { role: "metal", color: 0x8c8f94, roughness: 0.3, metalness: 0.4 }
    ],
    parts: [
      // 机身进深 0.044（-0.020…0.024），回边 7mm 贴在它前面 1mm（0.023…0.030），
      cbox(0, [1.498, 0.918, 0.044], [0, 0.001, 0.002]),
      cbox(1, [1.5, 0.0276, 0.007], [0, 0, 0.0265]),
      cbox(1, [1.5, 0.0276, 0.007], [0, 0.8924, 0.0265]),
      ...mirrorPair(cbox(1, [0.02625, 0.8648, 0.007], [0.736875, 0.0276, 0.0265])),
      // 挂架**不能打 fullOnly**：它是六面里最深的那一层（-0.030），丢掉之后 lite 只剩 0.05 进深，
      cbox(2, [0.5, 0.4, 0.011], [0, 0.26, -0.0245])
    ]
  },
  tv_tabletop: {
    note: "座装电视：底板 + 立杆 + 颈部托板（都在机身下缘以下）+ 60mm 机身与回边（机身顶到整件高度）。",
    size: [1.5, 0.92, 0.18],
    slots: [
      { role: "base", color: 0x2a2c30, roughness: 0.4, metalness: 0.22 },
      { role: "metal", color: 0x9aa1a8, roughness: 0.3, metalness: 0.42 },
      { role: "body", color: 0x2a2c30, roughness: 0.46, metalness: 0.1 },
      { role: "trim", color: 0x3f4247, roughness: 0.34, metalness: 0.18 }
    ],
    parts: [
      // 底板与立杆撑起 0.4048 的机身下缘；底板正好占满 0.18 的进深（±0.09）。
      croundedBox(0, [0.5, 0.03, 0.18], [0, 0, 0], { radius: 0.01 }),
      cbox(1, [0.07, 0.3748, 0.05], [0, 0.03, -0.06]),
      cbox(1, [0.22, 0.05, 0.06], [0, 0.4048, -0.05]),
      cbox(2, [1.498, 0.5132, 0.044], [0, 0.4064, 0.002]),
      cbox(3, [1.5, 0.015456, 0.007], [0, 0.4048, 0.0265]),
      cbox(3, [1.5, 0.015456, 0.007], [0, 0.904544, 0.0265]),
      ...mirrorPair(cbox(3, [0.02625, 0.484288, 0.007], [0.736875, 0.420256, 0.0265]))
    ]
  },
  tv_mobile: {
    note: "移动支架电视：四只脚轮 + 底盘 + 立杆（升到顶、收一条推手横杆）+ 60mm 机身与回边。",
    size: [1.5, 1.55, 0.55],
    slots: [
      { role: "leg", color: 0x22252a, roughness: 0.5, metalness: 0.1 },
      { role: "base", color: 0x2a2c30, roughness: 0.4, metalness: 0.2 },
      { role: "metal", color: 0x9aa1a8, roughness: 0.3, metalness: 0.42 },
      { role: "body", color: 0x2a2c30, roughness: 0.46, metalness: 0.1 },
      { role: "trim", color: 0x3f4247, roughness: 0.34, metalness: 0.18 }
    ],
    parts: [
      // 底盘占满 0.55 进深（±0.275），立杆退到机身之后（-0.155…-0.085），机身自 0.84475 起。
      ccyl(0, 0.035, 0.03, 16, [0.22, 0, 0.2]),
      ccyl(0, 0.035, 0.03, 16, [-0.22, 0, 0.2]),
      ccyl(0, 0.035, 0.03, 16, [0.22, 0, -0.2]),
      ccyl(0, 0.035, 0.03, 16, [-0.22, 0, -0.2]),
      croundedBox(1, [0.6, 0.05, 0.55], [0, 0.03, 0], { radius: 0.014 }),
      cbox(2, [0.09, 1.47, 0.07], [0, 0.08, -0.12]),
      cbox(2, [0.24, 0.04, 0.06], [0, 0.84475, -0.10], { fullOnly: true }),
      cbox(2, [0.5, 0.04, 0.05], [0, 1.51, -0.10]),
      cbox(3, [1.498, 0.6645, 0.044], [0, 0.84575, 0.002]),
      cbox(4, [1.5, 0.019995, 0.007], [0, 0.84475, 0.0265]),
      cbox(4, [1.5, 0.019995, 0.007], [0, 1.491255, 0.0265]),
      ...mirrorPair(cbox(4, [0.02625, 0.62651, 0.007], [0.736875, 0.864745, 0.0265]))
    ]
  },
  smartspeaker: {
    note: "智能音箱：底座 + 圆柱网布机身 + 顶部灯环 + 顶盖。",
    size: [0.12, 0.18, 0.12],
    slots: [
      { role: "grating", color: 0xdfeaec, roughness: 0.6, metalness: 0.02 },
      { role: "metal", color: 0x9aa1a8, roughness: 0.3, metalness: 0.35 },
      { role: "lit", color: 0x5fd08a, roughness: 0.2, metalness: 0 },
      { role: "trim", color: 0xe4e4e0, roughness: 0.34, metalness: 0.2 }
    ],
    parts: [
      ccyl(1, 0.056, 0.02, 24, [0, 0, 0]),
      ccyl(0, 0.06, 0.14, 28, [0, 0.02, 0]),
      ccyl(2, 0.05, 0.006, 24, [0, 0.16, 0]),
      croundedBox(3, [0.104, 0.014, 0.104], [0, 0.166, 0], { radius: 0.006 })
    ]
  },
  router: {
    note: "路由器：扁平机身 + 两侧散热条 + 正面指示条 + 两根后置天线。",
    size: [0.22, 0.15, 0.16],
    slots: [
      { role: "body", color: 0x22252a, roughness: 0.45, metalness: 0.08 },
      { role: "grating", color: 0x9aa1a8, roughness: 0.3, metalness: 0.3 },
      { role: "screen", color: 0x5fd08a, roughness: 0.2, metalness: 0.12 },
      { role: "metal", color: 0x8c8f94, roughness: 0.3, metalness: 0.4 }
    ],
    parts: [
    croundedBox(0, [0.216, 0.1, 0.15], [0, 0, -0.005], { radius: 0.015 }),
    ...mirrorPair(cbox(1, [0.008, 0.04, 0.08], [0.106, 0.02, 0])),
      cbox(2, [0.1, 0.012, 0.01], [0, 0.06, 0.075]),
      ...mirrorPair(cbox(3, [0.016, 0.062, 0.01], [0.07, 0.08794, -0.05], { rot: [-18, 0, 0] }))
    ]
  },
  printer: {
    note: "打印机：机身 + 顶盖 + 正面出纸口 + 右侧控制面板与显示窗。",
    size: [0.4, 0.3, 0.35],
    slots: [
      { role: "body", color: 0xfafaf8, roughness: 0.5, metalness: 0.04 },
      { role: "top", color: 0x9aa1a8, roughness: 0.3, metalness: 0.3 },
      { role: "grating", color: 0x22252a, roughness: 0.5, metalness: 0.06 },
      { role: "panel", color: 0x31353a, roughness: 0.36, metalness: 0.18 },
      { role: "screen", color: 0x15171a, roughness: 0.2, metalness: 0.1 }
    ],
    parts: [
      croundedBox(0, [0.4, 0.28, 0.334], [0, 0, -0.008], { radius: 0.02 }),
      croundedBox(1, [0.38, 0.02, 0.3], [0, 0.28, -0.008], { radius: 0.008 }),
      cbox(2, [0.3, 0.014, 0.012], [0, 0.1, 0.165]),
      cbox(3, [0.12, 0.05, 0.012], [0.12, 0.02, 0.165], { fullOnly: true }),
      cbox(4, [0.09, 0.03, 0.008], [0.125, 0.03, 0.171])
    ]
  },
  desktop: {
    note: "台式一体机：底座 + 立颈 + 大面板机身 + 屏面 + 底部扬声条 + 背面接口区。",
    size: [0.72, 0.5, 0.32],
    slots: [
      { role: "base", color: 0x9aa1a8, roughness: 0.34, metalness: 0.35 },
      { role: "metal", color: 0xb4babf, roughness: 0.3, metalness: 0.4 },
      { role: "body", color: 0x434b59, roughness: 0.44, metalness: 0.1 },
      { role: "screen", color: 0x15171a, roughness: 0.18, metalness: 0.1 },
      { role: "grating", color: 0x22252a, roughness: 0.7, metalness: 0.04 }
    ],
    parts: [
      // 底座就是整件 0.32 进深的顶格件（一体机的脚盘本来就能占满），机身则薄到 36mm，
      croundedBox(0, [0.3, 0.02, 0.32], [0, 0, 0], { radius: 0.008 }),
      croundedBox(1, [0.1, 0.14, 0.06], [0, 0.02, -0.05], { radius: 0.02 }),
      cbox(1, [0.16, 0.05, 0.01], [0, 0.22, -0.023], { fullOnly: true }),
      croundedBox(2, [0.72, 0.34, 0.036], [0, 0.16, 0], { radius: 0.01 }),
      cbox(4, [0.6, 0.02, 0.008], [0, 0.167, 0.018]),
      cbox(3, [0.68, 0.29, 0.008], [0, 0.19, 0.018])
    ]
  },
  laptop: {
    note: "笔记本电脑：机身 + 键面 + 触控板 + 转轴 + 后仰 12° 的翻盖（含屏面）。",
    size: [0.36, 0.22, 0.28],
    slots: [
      { role: "body", color: 0x555e6b, roughness: 0.4, metalness: 0.24 },
      { role: "metal", color: 0xb4babf, roughness: 0.28, metalness: 0.5 },
      { role: "trim", color: 0x434b59, roughness: 0.42, metalness: 0.16 },
      { role: "screen", color: 0x15171a, roughness: 0.18, metalness: 0.1 },
      { role: "grating", color: 0x22252a, roughness: 0.6, metalness: 0.06 }
    ],
    parts: [
      croundedBox(0, [0.36, 0.02, 0.202], [0, 0, 0.039], { radius: 0.006 }),
      cbox(4, [0.3, 0.006, 0.11], [0, 0.02, 0.07]),
      cbox(2, [0.1, 0.004, 0.06], [0, 0.02, -0.025]),
      ccyl(1, 0.008, 0.24, 12, [0, 0.018, -0.07], { rot: [0, 0, 90] }),
      // 翻盖与屏面用**方盒**：圆角盒的角被倒掉，绕 x 转 12° 之后量出来的包围盒比标称小
      cbox(0, [0.36, 0.196, 0.016], [0, 0.025, -0.1118], { rot: [-12, 0, 0] }),
      cbox(3, [0.33, 0.175, 0.008], [0, 0.0386, -0.1001], { rot: [-12, 0, 0] })
    ]
  },
  nas: {
    note: "网络存储：四只脚 + 立式机身 + 正面四个盘位（各带指示灯条）+ 右下显示窗 + 侧散热条。",
    size: [0.28, 0.34, 0.24],
    slots: [
      { role: "body", color: 0x2a2c30, roughness: 0.42, metalness: 0.14 },
      { role: "drawer", color: 0x3c3f44, roughness: 0.46, metalness: 0.1 },
      { role: "screen", color: 0x15171a, roughness: 0.2, metalness: 0.1 },
      { role: "lit", color: 0x5fd08a, roughness: 0.2, metalness: 0 }
    ],
    parts: [
      cbox(0, [0.04, 0.012, 0.03], [0.11, 0, 0.09]),
      cbox(0, [0.04, 0.012, 0.03], [-0.11, 0, 0.09]),
      cbox(0, [0.04, 0.012, 0.03], [0.11, 0, -0.09]),
      cbox(0, [0.04, 0.012, 0.03], [-0.11, 0, -0.09]),
      croundedBox(0, [0.28, 0.328, 0.232], [0, 0.012, -0.004], { radius: 0.01 }),
      cbox(1, [0.24, 0.055, 0.008], [0, 0.05, 0.116]),
      cbox(1, [0.24, 0.055, 0.008], [0, 0.118, 0.116]),
      cbox(1, [0.24, 0.055, 0.008], [0, 0.186, 0.116]),
      cbox(1, [0.24, 0.055, 0.008], [0, 0.254, 0.116]),
      cbox(2, [0.06, 0.03, 0.008], [0.08, 0.014, 0.116]),
      ...mirrorPair(cbox(3, [0.008, 0.3, 0.006], [0.136, 0.02, 0.113], { fullOnly: true })),
      ...mirrorPair(cbox(0, [0.008, 0.2, 0.1], [0.136, 0.09, -0.02], { fullOnly: true }))
    ]
  },

  ceilingfan: {
    note: "吊扇：吊杆与吸顶罩 + 电机壳 + 四片十字扇叶 + 底部灯罩。",
    size: [1.1, 0.4, 1.1],
    slots: [
      { role: "body", color: 0xd0d0c9, roughness: 0.5, metalness: 0.08 },
      { role: "metal", color: 0x9aa1a8, roughness: 0.3, metalness: 0.35 },
      { role: "trim", color: 0xfafaf8, roughness: 0.46, metalness: 0.06 },
      { role: "lit", color: 0xf2e6c8, roughness: 0.6, metalness: 0 }
    ],
    parts: [
      // 四片扇叶成十字：每片长 0.39、外沿正好落在 ±0.55，宽与深同时被顶满（1.10 × 1.10）。
      cbox(0, [0.39, 0.012, 0.15], [0.355, 0.264, 0]),
      cbox(0, [0.39, 0.012, 0.15], [-0.355, 0.264, 0]),
      cbox(0, [0.39, 0.012, 0.15], [0, 0.264, 0.355], { rot: [0, 90, 0] }),
      cbox(0, [0.39, 0.012, 0.15], [0, 0.264, -0.355], { rot: [0, 90, 0] }),
      ccyl(0, 0.11, 0.12, 24, [0, 0.16, 0]),
      // 吊杆原与吸顶罩同高（顶面都在 0.40，0.6cm² 的同向共面）：杆顶压到 0.395，埋进吸顶罩里。
      ccyl(1, 0.02, 0.115, 12, [0, 0.28, 0]),
      ccyl(2, 0.09, 0.03, 20, [0, 0.37, 0]),
      ccyl(3, 0.1, 0.1, 20, [0, 0.06, 0]),
      ccyl(3, 0.085, 0.06, 20, [0, 0, 0])
    ]
  },
  heater: {
    note: "取暖器：机身 + 前辐射面板 + 前上部提手与旋钮 / 显示区 + 底部格栅 + 底脚与背挂架。",
    size: [0.6, 0.55, 0.25],
    slots: [
      { role: "body", color: 0xfafaf8, roughness: 0.5, metalness: 0.04 },
      { role: "leg", color: 0x9aa1a8, roughness: 0.32, metalness: 0.3 },
      { role: "panel", color: 0x2b2f34, roughness: 0.36, metalness: 0.16 },
      { role: "metal", color: 0xb4babf, roughness: 0.3, metalness: 0.4 },
      { role: "screen", color: 0x15171a, roughness: 0.2, metalness: 0.1 },
      { role: "handle", color: 0x3c3f44, roughness: 0.42, metalness: 0.08 },
      { role: "grating", color: 0x3c3f44, roughness: 0.45, metalness: 0.2 }
    ],
    parts: [
      cbox(1, [0.06, 0.03, 0.2], [-0.24, 0, 0]),
      cbox(1, [0.06, 0.03, 0.2], [0.24, 0, 0]),
      croundedBox(0, [0.6, 0.52, 0.2], [0, 0.03, -0.01], { radius: 0.015 }),
      croundedBox(2, [0.54, 0.44, 0.06], [0, 0.07, 0.09], { radius: 0.01 }),
      cbox(6, [0.5, 0.04, 0.014], [0, 0.1, 0.116]),
      // 旋钮 / 显示区 / 提手都贴在前辐射面板上：前极值 0.125 由这三件与背挂架共同顶住。
      ccyl(3, 0.022, 0.01, 16, [0.2, 0.44, 0.12], { rot: [90, 0, 0], align: "center" }),
      cbox(4, [0.1, 0.04, 0.012], [-0.15, 0.44, 0.119]),
      // 提手原与前辐射面板**同高**（顶面都在 0.51，7cm² 的同向共面）。它下沉 3mm、并且整件
      cbox(5, [0.16, 0.03, 0.02], [0, 0.477, 0.113]),
      // 背挂架：贴机身背面再往后 5mm（机身到 −0.11、它到 −0.125），撑住 0.25 的进深 ——
      cbox(3, [0.3, 0.3, 0.02], [0, 0.15, -0.115])
    ]
  },
  ceilingac: {
    note: "吸顶空调（天花机）：面板外框 + 四向出风格栅 + 中央金属回风格栅 + 上部机身 + 面板显示区。",
    size: [0.9, 0.3, 0.9],
    slots: [
      { role: "body", color: 0xfafaf8, roughness: 0.5, metalness: 0.05 },
      { role: "panel", color: 0xfafaf8, roughness: 0.48, metalness: 0.06 },
      { role: "grating", color: 0x9aa1a8, roughness: 0.32, metalness: 0.3 },
      { role: "metal", color: 0xb4babf, roughness: 0.3, metalness: 0.4 },
      { role: "screen", color: 0x15171a, roughness: 0.2, metalness: 0.1 }
    ],
    parts: [
      // 面板下沿 y = 0.012，四向格栅与显示区沉 2mm 露在面板之下 —— y = 0 是整件最低边。
      croundedBox(1, [0.9, 0.028, 0.9], [0, 0.012, 0], { radius: 0.01 }),
      croundedBox(0, [0.78, 0.26, 0.78], [0, 0.04, 0], { radius: 0.02 }),
      cbox(2, [0.3, 0.014, 0.07], [0, 0, 0.35]),
      cbox(2, [0.3, 0.014, 0.07], [0, 0, -0.35]),
      cbox(2, [0.07, 0.014, 0.3], [0.35, 0, 0]),
      cbox(2, [0.07, 0.014, 0.3], [-0.35, 0, 0]),
      cbox(3, [0.34, 0.014, 0.34], [0, 0, 0]),
      cbox(4, [0.12, 0.014, 0.028], [0.3, 0, 0.43], { fullOnly: true })
    ]
  },
  wallac: {
    note: "壁挂空调内机：机身 + 前面板 + 顶部进风格栅 + 底部导风板 + 显示区 + 背部挂板。",
    size: [0.9, 0.28, 0.22],
    slots: [
      { role: "body", color: 0xfafaf8, roughness: 0.48, metalness: 0.06 },
      { role: "grating", color: 0x9aa1a8, roughness: 0.32, metalness: 0.3 },
      { role: "trim", color: 0xd0d0c9, roughness: 0.4, metalness: 0.12 },
      { role: "panel", color: 0xfafaf8, roughness: 0.46, metalness: 0.08 },
      { role: "screen", color: 0x15171a, roughness: 0.2, metalness: 0.1 },
      { role: "metal", color: 0xb4babf, roughness: 0.3, metalness: 0.4 }
    ],
    parts: [
      // 机身只到 0.26，顶上 2cm 是进风格栅；深度上前后各留一件（显示区 / 背板）撑到 ±0.11。
      cbox(2, [0.86, 0.03, 0.12], [0, 0, 0.02]),
      croundedBox(0, [0.9, 0.23, 0.18], [0, 0.03, -0.01], { radius: 0.02 }),
      cbox(1, [0.84, 0.02, 0.14], [0, 0.26, -0.01]),
      croundedBox(3, [0.88, 0.16, 0.04], [0, 0.06, 0.07], { radius: 0.008 }),
      cbox(4, [0.12, 0.05, 0.012], [0.28, 0.12, 0.104]),
      // 背部挂板：比机身再往后 1cm（机身到 −0.10、它到 −0.11），前极值那边由显示区顶住 ——
      cbox(5, [0.7, 0.18, 0.02], [0, 0.06, -0.1])
    ]
  },
  floorac: {
    note: "立式柜机：圆柱机身 + 底座与顶盖 + 前控制面板（显示区）+ 上部出风格栅 + 背面进风格栅。",
    size: [0.42, 1.75, 0.42],
    slots: [
      { role: "body", color: 0xfafaf8, roughness: 0.48, metalness: 0.06 },
      { role: "base", color: 0x3c3f44, roughness: 0.5, metalness: 0.14 },
      { role: "trim", color: 0xb4babf, roughness: 0.3, metalness: 0.4 },
      { role: "panel", color: 0xfafaf8, roughness: 0.46, metalness: 0.08 },
      { role: "screen", color: 0x15171a, roughness: 0.2, metalness: 0.1 },
      { role: "grating", color: 0x9aa1a8, roughness: 0.32, metalness: 0.3 }
    ],
    parts: [
      // 机身径 0.21 已经把宽与深顶满。底座与顶盖都比机身小一圈、且各沉 1cm 进机身内部，
      ccyl(1, 0.19, 0.09, 28, [0, 0, 0]),
      ccyl(0, 0.21, 1.63, 28, [0, 0.08, 0]),
      ccyl(2, 0.19, 0.05, 28, [0, 1.7, 0]),
      croundedBox(3, [0.2, 1.4, 0.1], [0, 0.25, 0.104], { radius: 0.01 }),
      cbox(4, [0.12, 0.06, 0.012], [0, 1.35, 0.198]),
      cbox(5, [0.16, 0.12, 0.02], [0, 1.55, 0.2]),
      cbox(5, [0.16, 0.8, 0.02], [0, 0.2, -0.2], { fullOnly: true })
    ]
  },
  // ── 清洁机器 ──────────────────────────────────────────────────────────────
  robotvacuum: {
    note: "扫拖机器人 + 自集尘基站：后方是宽体基站（含显示区与充电触片），扁平圆盘停在基站口，机背带激光头与防撞条。",
    size: [0.55, 0.85, 0.5],
    slots: [
      { role: "body", color: 0x3c3f44, roughness: 0.4, metalness: 0.14 },
      { role: "top", color: 0x565a61, roughness: 0.34, metalness: 0.16 },
      { role: "metal", color: 0x9aa1a8, roughness: 0.28, metalness: 0.42 },
      { role: "screen", color: 0x15171a, roughness: 0.2, metalness: 0.1 },
      { role: "trim", color: 0x8c8f94, roughness: 0.3, metalness: 0.35 }
    ],
    parts: [
      // z 的两根极值分给两件：基站后沿 −0.25、机器人前沿 +0.25。盘心因此推到 z = 0.03 —— 这样
      croundedBox(0, [0.55, 0.85, 0.2], [0, 0, -0.15], { radius: 0.02 }),
      ccyl(0, 0.22, 0.05, 32, [0, 0, 0.03]),
      ctorus(4, 0.205, 0.013, [0, 0.026, 0.03], { axis: "y", align: "center" }),
      ccyl(1, 0.205, 0.02, 32, [0, 0.05, 0.03]),
      ccyl(2, 0.03, 0.03, 16, [0, 0.07, 0.07]),
      cbox(2, [0.14, 0.02, 0.012], [0, 0.5, -0.044]),
      cbox(3, [0.16, 0.07, 0.012], [0, 0.6, -0.044])
    ]
  },
  vacuumcleaner: {
    note: "立式吸尘器：地刷 + 长杆 + 主机 + 透明尘桶 + 顶部握把。",
    size: [0.28, 1.15, 0.3],
    slots: [
      { role: "body", color: 0x22252a, roughness: 0.4, metalness: 0.1 },
      { role: "metal", color: 0x9aa1a8, roughness: 0.3, metalness: 0.35 },
      { role: "glass", color: 0xdfeaec, roughness: 0.14, metalness: 0.05 },
      { role: "handle", color: 0x3c3f44, roughness: 0.42, metalness: 0.08 },
      { role: "screen", color: 0x15171a, roughness: 0.2, metalness: 0.1 }
    ],
    parts: [
      // 地刷同时管住 x（±0.14）与 z（±0.15）两根极值，机身顶到 1.15。
      cbox(0, [0.28, 0.06, 0.3], [0, 0, 0]),
      ccyl(1, 0.018, 0.85, 12, [0, 0.06, 0]),
      croundedBox(0, [0.14, 0.24, 0.22], [0, 0.86, -0.03], { radius: 0.03 }),
      ccyl(2, 0.05, 0.16, 16, [0, 0.9, 0.04]),
      cbox(3, [0.05, 0.05, 0.16], [0, 1.1, -0.03]),
      cbox(4, [0.08, 0.04, 0.012], [0, 0.99, 0.081], { fullOnly: true })
    ]
  },
  floorwasher: {
    note: "洗地机：地刷 + 长杆 + 机身 + 清水箱（透明）+ 顶部握把。",
    size: [0.3, 1.1, 0.3],
    slots: [
      { role: "body", color: 0x22252a, roughness: 0.4, metalness: 0.1 },
      { role: "metal", color: 0x9aa1a8, roughness: 0.3, metalness: 0.35 },
      { role: "handle", color: 0x3c3f44, roughness: 0.42, metalness: 0.08 },
      { role: "glass", color: 0xdfeaec, roughness: 0.14, metalness: 0.05 },
      { role: "screen", color: 0x15171a, roughness: 0.2, metalness: 0.1 }
    ],
    parts: [
      cbox(0, [0.3, 0.07, 0.3], [0, 0, 0]),
      ccyl(1, 0.02, 0.83, 12, [0, 0.07, 0]),
      croundedBox(0, [0.16, 0.15, 0.24], [0, 0.9, 0], { radius: 0.03 }),
      cbox(2, [0.05, 0.05, 0.17], [0, 1.05, -0.02]),
      // 清水箱从机身前面凸出到 z = 0.15，与地刷同为最前面 —— 两者 y 相差近 1m，不会同面。
      croundedBox(3, [0.1, 0.16, 0.04], [0, 0.86, 0.13], { radius: 0.01 }),
      cbox(4, [0.092, 0.036, 0.012], [0, 0.982, 0.126], { fullOnly: true })
    ]
  },
  dryingrack: {
    note: "电动晾衣架：吸顶机身（含灯带与显示区）+ 四根吊绳 + 两根晾衣横杆。",
    size: [1.8, 0.5, 0.35],
    slots: [
      { role: "body", color: 0xfafaf8, roughness: 0.5, metalness: 0.05 },
      { role: "metal", color: 0xb4babf, roughness: 0.3, metalness: 0.35 },
      { role: "lit", color: 0xf2e6c8, roughness: 0.6, metalness: 0 },
      { role: "screen", color: 0x15171a, roughness: 0.2, metalness: 0.1 }
    ],
    parts: [
      // 地面在横杆底面（吸顶件的模型原点仍按「占地底面」约定落在最低那根杆上）。顶壳管 x ±0.9 与 y 顶 0.5。
      cbox(1, [1.7, 0.024, 0.024], [0, 0, 0.12]),
      cbox(1, [1.7, 0.024, 0.024], [0, 0, -0.12]),
      cbox(1, [0.008, 0.376, 0.008], [-0.75, 0.024, 0.12], { fullOnly: true }),
      cbox(1, [0.008, 0.376, 0.008], [0.75, 0.024, 0.12], { fullOnly: true }),
      cbox(1, [0.008, 0.376, 0.008], [-0.75, 0.024, -0.12], { fullOnly: true }),
      cbox(1, [0.008, 0.376, 0.008], [0.75, 0.024, -0.12], { fullOnly: true }),
      croundedBox(0, [1.8, 0.1, 0.34], [0, 0.4, 0], { radius: 0.012 }),
      // 后固定板把 z 的后极值推到 −0.175（顶壳本身是 ±0.17），显示区把前极值推到 +0.175。
      cbox(0, [1.7, 0.08, 0.02], [0, 0.41, -0.165]),
      cbox(2, [1.5, 0.012, 0.08], [0, 0.388, 0]),
      cbox(3, [0.14, 0.03, 0.012], [0.6, 0.435, 0.169])
    ]
  },
  airer: {
    note: "阳台落地晾衣杆：底板 + 两侧支架 + 主杆 + 两根次杆 + 挂钩。",
    size: [1.2, 0.3, 0.3],
    slots: [
      { role: "body", color: 0xb4babf, roughness: 0.3, metalness: 0.35 },
      { role: "metal", color: 0x9aa1a8, roughness: 0.32, metalness: 0.3 },
      { role: "handle", color: 0x546235, roughness: 0.4, metalness: 0.2 }
    ],
    parts: [
      cbox(0, [1.2, 0.02, 0.3], [0, 0, 0]),
      cbox(0, [0.03, 0.28, 0.26], [-0.585, 0.02, 0]),
      cbox(0, [0.03, 0.28, 0.26], [0.585, 0.02, 0]),
      ccyl(1, 0.015, 1.18, 12, [0, 0.28, 0], { rot: [0, 0, 90], align: "center" }),
      ccyl(1, 0.008, 1.1, 10, [0, 0.2, 0.07], { rot: [0, 0, 90], align: "center", fullOnly: true }),
      ccyl(1, 0.008, 1.1, 10, [0, 0.2, -0.07], { rot: [0, 0, 90], align: "center", fullOnly: true }),
      ccyl(2, 0.008, 0.06, 8, [0.12, 0.28, 0], { rot: [0, 0, 90], align: "center", fullOnly: true })
    ]
  },
  garmentcare: {
    note: "衣物护理机：柜体 + 整幅玻璃门 + 竖拉手 + 门上控制面板（显示区）+ 顶帽 + 踢脚与出风格栅。",
    size: [0.6, 1.85, 0.6],
    slots: [
      { role: "body", color: 0xc6cbd1, roughness: 0.34, metalness: 0.24 },
      { role: "base", color: 0x3c3f44, roughness: 0.5, metalness: 0.14 },
      { role: "door", color: 0xc6cbd1, roughness: 0.3, metalness: 0.22 },
      { role: "glass", color: 0xdfeaec, roughness: 0.12, metalness: 0.04 },
      { role: "metal", color: 0x8c8f94, roughness: 0.26, metalness: 0.5 },
      { role: "panel", color: 0x2b2f34, roughness: 0.36, metalness: 0.16 },
      { role: "screen", color: 0x1b1d20, roughness: 0.2, metalness: 0.1 },
      { role: "grating", color: 0x5b6167, roughness: 0.45, metalness: 0.3 }
    ],
    parts: [
      // 柜体前面停在 0.27（门框 0.26 起，只搭上 1cm 就够读成「装上去」），门玻璃与拉手再往前，
      croundedBox(0, [0.6, 1.79, 0.57], [0, 0.06, -0.015], { radius: 0.02 }),
      cbox(1, [0.56, 0.06, 0.45], [0, 0, -0.05]),
      cbox(0, [0.6, 0.06, 0.1], [0, 1.79, 0.25]),
      croundedBox(2, [0.57, 1.6, 0.03], [0, 0.14, 0.275], { radius: 0.008 }),
      croundedBox(3, [0.49, 1.5, 0.012], [0, 0.19, 0.286], { radius: 0.006 }),
      ccyl(4, 0.012, 0.5, 12, [0.225, 1.0, 0.288], { align: "center" }),
      cbox(5, [0.5, 0.07, 0.012], [0, 1.52, 0.292]),
      cbox(6, [0.14, 0.04, 0.012], [0, 1.535, 0.294]),
      cbox(7, [0.35, 0.03, 0.014], [0, 0.025, 0.175], { fullOnly: true })
    ]
  },
  fridge: {
    note: "十字对开门冰箱：箱体 + 上两扇高对开门 + 下两层抽屉 + 门缝蓝光灯带 + 深色隐藏拉手槽 + 四周深色门框 + 底踢脚与散热格栅。",
    size: [0.75, 1.85, 0.72],
    slots: [
      { role: "body", color: 0xc6cbd1, roughness: 0.34, metalness: 0.24 },
      { role: "door", color: 0xc6cbd1, roughness: 0.3, metalness: 0.22 },
      { role: "base", color: 0x3c3f44, roughness: 0.5, metalness: 0.14 },
      { role: "handle", color: 0x2f3338, roughness: 0.34, metalness: 0.2 },
      { role: "screen", color: 0x1b1d20, roughness: 0.22, metalness: 0.1 },
      { role: "metal", color: 0x2b2f34, roughness: 0.3, metalness: 0.35 },
      { role: "grating", color: 0x5b6167, roughness: 0.45, metalness: 0.3 },
      { role: "lit", color: 0x2f7bff, roughness: 0.3, metalness: 0.1 }
    ],
    parts: [
      croundedBox(0, [0.75, 1.845, 0.64], [0, 0.005, -0.04], { radius: 0.02 }),
      // 分缝按参考图量得：踢脚到 0.055，下抽屉 0.055–0.475，拉手槽 0.475–0.505，
      croundedBox(1, [0.352, 0.975, 0.084], [-0.1845, 0.85, 0.312], { radius: 0.012 }),
      croundedBox(1, [0.352, 0.975, 0.084], [0.1845, 0.85, 0.312], { radius: 0.012 }),
      croundedBox(1, [0.721, 0.315, 0.084], [0, 0.505, 0.312], { radius: 0.014 }),
      croundedBox(1, [0.721, 0.42, 0.084], [0, 0.055, 0.312], { radius: 0.014 }),
      // 门缝压条：上门中缝一条（宽度正好等于缝宽，与门侧壁背靠背）、灯带槽一条。
      cbox(5, [0.017, 0.975, 0.06], [0, 0.85, 0.31]),
      cbox(5, [0.721, 0.03, 0.06], [0, 0.82, 0.31]),
      // 隐藏拉手槽：两层抽屉之间那道 3cm 的深色横槽，比抽屉面退 1.4cm。
      cbox(3, [0.721, 0.03, 0.06], [0, 0.475, 0.31]),
      // 蓝色保鲜灯带：落在上门与中抽屉之间那道槽里，正面凸到整机最前面 0.36 —— 它也是
      cbox(7, [0.7, 0.014, 0.02], [0, 0.828, 0.35]),
      // 四周深色门框：左右两条竖框 + 顶沿一条横框，各比箱体窄 1mm 免得侧面共面。
      cbox(5, [0.0135, 1.77, 0.06], [-0.3673, 0.055, 0.31]),
      cbox(5, [0.0135, 1.77, 0.06], [0.3673, 0.055, 0.31]),
      cbox(5, [0.748, 0.025, 0.06], [0, 1.825, 0.31]),
      // 门内显示区：贴在中抽屉右上角（参考图里蓝灯带正下方那块小面板），凸出门面 6mm。
      croundedBox(4, [0.15, 0.05, 0.014], [0.26, 0.67, 0.353], { radius: 0.005, fullOnly: true }),
      // 踢脚：正面比箱体前脸凸 2cm，读成缩进的踢脚板；散热格栅凸在它正面上。
      cbox(2, [0.7, 0.055, 0.61], [0, 0, -0.005]),
      cbox(6, [0.4, 0.026, 0.02], [0, 0.012, 0.3], { fullOnly: true })
    ]
  },
  // 2026-09 新增：卧式冰柜（顶开盖）。顶盖是俯视能看到的唯一大面，因此盖沿与箱体各留一道缝，
  freezer: {
    note: "卧式冰柜：箱体 + 顶盖 + 前沿把手 + 右下控制面板（显示区 + 指示点）+ 铰链包边 + 底部散热格栅。",
    size: [1.05, 0.85, 0.6],
    slots: [
      { role: "body", color: 0x4a4f55, roughness: 0.34, metalness: 0.24 },
      { role: "door", color: 0x4a4f55, roughness: 0.3, metalness: 0.22 },
      { role: "base", color: 0x2b2f34, roughness: 0.5, metalness: 0.14 },
      { role: "handle", color: 0x8c8f94, roughness: 0.26, metalness: 0.5 },
      { role: "panel", color: 0x2b2f34, roughness: 0.36, metalness: 0.16 },
      { role: "screen", color: 0x1b1d20, roughness: 0.2, metalness: 0.1 },
      { role: "metal", color: 0x6d747b, roughness: 0.3, metalness: 0.4 },
      { role: "grating", color: 0x5b6167, roughness: 0.45, metalness: 0.3 },
      { role: "lit", color: 0xd23b2f, roughness: 0.3, metalness: 0.1 }
    ],
    parts: [
      // 箱体背后比顶盖收进 5mm：两者背面都写 −0.30 会得到一对共面的背面，从背后看会闪烁。
      croundedBox(0, [1.01, 0.68, 0.55], [0, 0.05, -0.02], { radius: 0.018 }),
      croundedBox(1, [1.05, 0.13, 0.585], [0, 0.72, -0.0075], { radius: 0.02 }),
      // 四只底脚：箱体底面离地 5cm，脚把整机落到 y = 0。
      cbox(2, [0.07, 0.05, 0.07], [-0.44, 0, -0.22]),
      cbox(2, [0.07, 0.05, 0.07], [0.44, 0, -0.22]),
      cbox(2, [0.07, 0.05, 0.07], [-0.44, 0, 0.18]),
      cbox(2, [0.07, 0.05, 0.07], [0.44, 0, 0.18]),
      // 盖前沿把手：一条横贯的凹槽把手，伸出盖沿前方 15mm —— 进深极值件，不能 fullOnly。
      cbox(3, [0.55, 0.032, 0.03], [0, 0.745, 0.285]),
      // 控制面板（右下）：面板板固定进深，显示区与指示点都落在面板正面之内、不吃进深极值。
      cbox(4, [0.13, 0.22, 0.02], [0.4, 0.13, 0.25]),
      cbox(5, [0.07, 0.04, 0.008], [0.4, 0.3, 0.258], { fullOnly: true }),
      cbox(8, [0.016, 0.016, 0.008], [0.4, 0.22, 0.258], { fullOnly: true }),
      // 铰链包边：压在箱体与顶盖之间那道缝上，把两者读成「一个盖 + 一个箱」。
      cbox(6, [1.015, 0.014, 0.045], [0, 0.719, 0.2675]),
      // 散热格栅：左下角一条横格栅。
      cbox(7, [0.45, 0.035, 0.02], [-0.2, 0.1, 0.262], { fullOnly: true })
    ]
  },
  washer: {
    note: "滚筒洗衣机：箱体 + 台面 + 圆形玻璃舱门 + 侧开把手 + 控制面板 + 洗涤剂抽屉 + 旋钮 + 显示屏。",
    size: [0.6, 0.85, 0.65],
    slots: [
      { role: "body", color: 0xc6cbd1, roughness: 0.34, metalness: 0.24 },
      { role: "top", color: 0xc6cbd1, roughness: 0.3, metalness: 0.26 },
      { role: "base", color: 0x3c3f44, roughness: 0.5, metalness: 0.14 },
      { role: "door", color: 0xc6cbd1, roughness: 0.28, metalness: 0.3 },
      { role: "glass", color: 0xdfeaec, roughness: 0.12, metalness: 0.04 },
      { role: "handle", color: 0x8c8f94, roughness: 0.26, metalness: 0.5 },
      { role: "panel", color: 0x2b2f34, roughness: 0.36, metalness: 0.16 },
      { role: "drawer", color: 0x2b2f34, roughness: 0.36, metalness: 0.16 },
      { role: "screen", color: 0x1b1d20, roughness: 0.2, metalness: 0.1 },
      { role: "metal", color: 0x8c8f94, roughness: 0.28, metalness: 0.45 }
    ],
    parts: [
      // 台面是整机最宽 / 最深的一件（0.60 × 0.65），箱体因此收到 0.596 / 0.62 ——
      croundedBox(1, [0.6, 0.03, 0.65], [0, 0.82, 0], { radius: 0.01 }),
      croundedBox(0, [0.596, 0.81, 0.62], [0, 0.02, -0.015], { radius: 0.02 }),
      cbox(2, [0.56, 0.03, 0.52], [0, 0, -0.03]),
      // 舱门：立起来朝向观察者的环（axis z）+ 环内的玻璃盘。环外沿顶到 z = 0.325（整机最前面），
      ctorus(3, 0.215, 0.03, [0, 0.42, 0.295], { axis: "z", align: "center" }),
      ccyl(4, 0.195, 0.02, 28, [0, 0.42, 0.286], { rot: [90, 0, 0], align: "center" }),
      cbox(5, [0.03, 0.16, 0.035], [0.245, 0.34, 0.3]),
      // 控制区：面板占右 2/3、洗涤剂抽屉占左 1/3，两者在 x 上错开、不叠，因此可以共用同一条
      cbox(6, [0.34, 0.1, 0.03], [0.12, 0.71, 0.3]),
      cbox(7, [0.18, 0.1, 0.03], [-0.2, 0.71, 0.3]),
      cbox(8, [0.11, 0.045, 0.014], [0.045, 0.7375, 0.315]),
      ccyl(9, 0.028, 0.03, 16, [0.19, 0.76, 0.31], {
        rot: [90, 0, 0],
        align: "center",
        fullOnly: true
      })
    ]
  },
  dryer: {
    note: "滚筒干衣机：与洗衣机同箱体，但门是方形大视窗 + 侧开长把手，控制区换成旋钮与出风格栅。",
    size: [0.6, 0.85, 0.65],
    slots: [
      { role: "body", color: 0xc6cbd1, roughness: 0.34, metalness: 0.24 },
      { role: "top", color: 0xc6cbd1, roughness: 0.3, metalness: 0.26 },
      { role: "base", color: 0x3c3f44, roughness: 0.5, metalness: 0.14 },
      { role: "door", color: 0xc6cbd1, roughness: 0.28, metalness: 0.3 },
      { role: "glass", color: 0xdfeaec, roughness: 0.12, metalness: 0.04 },
      { role: "handle", color: 0x8c8f94, roughness: 0.26, metalness: 0.5 },
      { role: "panel", color: 0x2b2f34, roughness: 0.36, metalness: 0.16 },
      { role: "grating", color: 0x5b6167, roughness: 0.45, metalness: 0.3 },
      { role: "screen", color: 0x1b1d20, roughness: 0.2, metalness: 0.1 },
      { role: "metal", color: 0x8c8f94, roughness: 0.28, metalness: 0.45 }
    ],
    parts: [
      croundedBox(1, [0.6, 0.03, 0.65], [0, 0.82, 0], { radius: 0.01 }),
      // 机身正面 0.295 与玻璃门背面**重合**（玻璃是 DoubleSide，背面剔不掉，327.6cm² 在闪）。
      croundedBox(0, [0.596, 0.81, 0.617], [0, 0.02, -0.0165], { radius: 0.02 }),
      cbox(2, [0.56, 0.03, 0.52], [0, 0, -0.03]),
      // 方门比舱门圈「薄而宽」，玻璃比门面再凸出 0.015 —— 凸出而不是凹陷，是为了让两块面不共面。
      croundedBox(3, [0.5, 0.54, 0.05], [0, 0.16, 0.285], { radius: 0.02 }),
      croundedBox(4, [0.36, 0.36, 0.03], [0, 0.26, 0.31], { radius: 0.015 }),
      cbox(5, [0.03, 0.22, 0.04], [0.232, 0.33, 0.3]),
      cbox(6, [0.34, 0.09, 0.03], [0.12, 0.725, 0.3]),
      cbox(7, [0.2, 0.09, 0.03], [-0.19, 0.725, 0.3]),
      cbox(8, [0.11, 0.045, 0.014], [0.045, 0.7475, 0.315]),
      ccyl(9, 0.028, 0.03, 16, [0.19, 0.77, 0.31], {
        rot: [90, 0, 0],
        align: "center",
        fullOnly: true
      })
    ]
  },
  dishwasher: {
    note: "嵌入式洗碗机：薄顶板 + 箱体 + 整幅门板 + 通长拉手 + 顶部控制条 + 显示区。",
    size: [0.6, 0.82, 0.6],
    slots: [
      { role: "body", color: 0xc6cbd1, roughness: 0.34, metalness: 0.24 },
      { role: "top", color: 0xc6cbd1, roughness: 0.3, metalness: 0.26 },
      { role: "base", color: 0x3c3f44, roughness: 0.5, metalness: 0.14 },
      { role: "door", color: 0xc6cbd1, roughness: 0.28, metalness: 0.3 },
      { role: "panel", color: 0x2b2f34, roughness: 0.36, metalness: 0.16 },
      { role: "handle", color: 0x8c8f94, roughness: 0.26, metalness: 0.5 },
      { role: "screen", color: 0x1b1d20, roughness: 0.2, metalness: 0.1 }
    ],
    parts: [
      croundedBox(1, [0.6, 0.02, 0.6], [0, 0.8, 0], { radius: 0.008 }),
      croundedBox(0, [0.6, 0.78, 0.57], [0, 0.02, -0.015], { radius: 0.015 }),
      cbox(2, [0.54, 0.02, 0.48], [0, 0, -0.02]),
      // 门板与顶部控制条在 y 上**分开**（门到 0.69，控制条从 0.69 起）：叠在同一段 y 上又共用
      croundedBox(3, [0.58, 0.64, 0.03], [0, 0.05, 0.275], { radius: 0.01 }),
      cbox(4, [0.58, 0.12, 0.03], [0, 0.69, 0.275]),
      cbox(5, [0.5, 0.05, 0.035], [0, 0.635, 0.2825]),
      cbox(6, [0.14, 0.05, 0.014], [0.16, 0.72, 0.293])
    ]
  },

  oven: {
    note: "嵌入式烤箱：机身 + 整幅玻璃门 + 门上横向拉手 + 顶部控制条（旋钮 ×2 + 显示屏）。",
    size: [0.6, 0.6, 0.55],
    slots: [
      { role: "body", color: 0x2b2f34, roughness: 0.4, metalness: 0.16 },
      { role: "door", color: 0x3c4147, roughness: 0.3, metalness: 0.28 },
      { role: "glass", color: 0x1b1d20, roughness: 0.16, metalness: 0.08 },
      { role: "panel", color: 0x22262a, roughness: 0.36, metalness: 0.18 },
      { role: "handle", color: 0xb4babf, roughness: 0.24, metalness: 0.5 },
      { role: "metal", color: 0xb4babf, roughness: 0.26, metalness: 0.45 },
      { role: "screen", color: 0x15171a, roughness: 0.2, metalness: 0.1 }
    ],
    parts: [
      // 机身负责 x（±0.30）与 y（0→0.60）两根轴的极值，后沿负责 z 的 −0.275。
      croundedBox(0, [0.6, 0.6, 0.47], [0, 0, -0.04], { radius: 0.012 }),
      croundedBox(1, [0.57, 0.46, 0.06], [0, 0.03, 0.215], { radius: 0.01 }),
      croundedBox(2, [0.48, 0.4, 0.012], [0, 0.05, 0.246], { radius: 0.006 }),
      cbox(3, [0.57, 0.09, 0.03], [0, 0.49, 0.21]),
      // 拉手是 z 轴正方向的极值（0.275）—— 嵌入式烤箱的手把本来就该凸出门面最多。
      ccyl(4, 0.012, 0.52, 14, [0, 0.46, 0.263], { rot: [0, 0, 90], align: "center" }),
      ccyl(5, 0.022, 0.025, 16, [-0.2, 0.535, 0.238], {
        rot: [90, 0, 0],
        align: "center",
        fullOnly: true
      }),
      ccyl(5, 0.022, 0.025, 16, [0.2, 0.535, 0.238], {
        rot: [90, 0, 0],
        align: "center",
        fullOnly: true
      }),
      cbox(6, [0.15, 0.04, 0.012], [0, 0.535, 0.228])
    ]
  },
  steamoven: {
    note: "嵌入式蒸烤箱：门为整幅大玻璃，控制条换成左侧大触控屏 + 右侧水箱抽屉。",
    size: [0.6, 0.6, 0.55],
    slots: [
      { role: "body", color: 0x2b2f34, roughness: 0.4, metalness: 0.16 },
      { role: "door", color: 0x3c4147, roughness: 0.3, metalness: 0.28 },
      { role: "glass", color: 0x1b1d20, roughness: 0.16, metalness: 0.08 },
      { role: "panel", color: 0x22262a, roughness: 0.36, metalness: 0.18 },
      { role: "screen", color: 0x15171a, roughness: 0.2, metalness: 0.1 },
      { role: "drawer", color: 0x3c4147, roughness: 0.3, metalness: 0.28 },
      { role: "handle", color: 0xb4babf, roughness: 0.24, metalness: 0.5 }
    ],
    parts: [
      croundedBox(0, [0.6, 0.6, 0.47], [0, 0, -0.04], { radius: 0.012 }),
      croundedBox(1, [0.57, 0.44, 0.06], [0, 0.03, 0.215], { radius: 0.01 }),
      croundedBox(2, [0.5, 0.38, 0.012], [0, 0.05, 0.246], { radius: 0.006 }),
      cbox(3, [0.57, 0.11, 0.03], [0, 0.47, 0.21]),
      // 触控屏占左 55%、水箱抽屉占右 45%，两者在 x 上错开 —— 蒸烤箱的水箱正是从右侧抽出来的。
      cbox(4, [0.31, 0.08, 0.012], [-0.125, 0.485, 0.228]),
      cbox(5, [0.226, 0.09, 0.03], [0.17, 0.48, 0.222]),
      ccyl(6, 0.012, 0.5, 14, [0, 0.44, 0.263], { rot: [0, 0, 90], align: "center" })
    ]
  },
  microwave: {
    note: "台式微波炉：机身 + 左侧大视窗门 + 门边竖拉手 + 右侧竖控制板 + 四个小脚。",
    size: [0.52, 0.32, 0.42],
    slots: [
      { role: "body", color: 0x2b2f34, roughness: 0.4, metalness: 0.16 },
      { role: "door", color: 0x3c4147, roughness: 0.3, metalness: 0.28 },
      { role: "glass", color: 0x1b1d20, roughness: 0.16, metalness: 0.08 },
      { role: "panel", color: 0x22262a, roughness: 0.36, metalness: 0.18 },
      { role: "handle", color: 0xb4babf, roughness: 0.24, metalness: 0.5 },
      { role: "metal", color: 0x8c8f94, roughness: 0.28, metalness: 0.45 },
      { role: "screen", color: 0x15171a, roughness: 0.2, metalness: 0.1 }
    ],
    parts: [
      // 机身离地 0.02 让给四个小脚，于是 y 的极值分工是「脚占 0、机身顶占 0.32」。
      croundedBox(0, [0.52, 0.3, 0.4], [0, 0.02, -0.01], { radius: 0.01 }),
      ccyl(5, 0.012, 0.02, 10, [-0.22, 0, -0.17]),
      ccyl(5, 0.012, 0.02, 10, [0.22, 0, -0.17]),
      ccyl(5, 0.012, 0.02, 10, [-0.22, 0, 0.17]),
      ccyl(5, 0.012, 0.02, 10, [0.22, 0, 0.17]),
      // 门、控制板、拉手三件的前表面都在 z = 0.21，它们在 x 上互不重叠（门 ≤ 0.11、
      croundedBox(1, [0.358, 0.258, 0.028], [-0.071, 0.041, 0.195], { radius: 0.008 }),
      croundedBox(2, [0.28, 0.2, 0.012], [-0.07, 0.06, 0.2], { radius: 0.004 }),
      cbox(3, [0.14, 0.26, 0.03], [0.19, 0.04, 0.195]),
      cbox(4, [0.03, 0.22, 0.045], [0.095, 0.04, 0.1875]),
      cbox(6, [0.1, 0.06, 0.012], [0.19, 0.21, 0.198])
    ]
  },
  rangehood: {
    note: "壁挂油烟机：下罩 + 中罩过渡 + 上部烟道箱 + 前面控制面板 / 进风格栅 / 照明灯 + 油杯。",
    size: [0.9, 0.55, 0.45],
    slots: [
      { role: "body", color: 0xb4babf, roughness: 0.3, metalness: 0.38 },
      { role: "panel", color: 0x22262a, roughness: 0.36, metalness: 0.18 },
      { role: "grating", color: 0x6d747b, roughness: 0.45, metalness: 0.3 },
      { role: "lit", color: 0xf6f2e8, roughness: 0.3, metalness: 0.0 },
      { role: "drawer", color: 0x8c8f94, roughness: 0.3, metalness: 0.4 }
    ],
    parts: [
      // 三级罩体：下罩最宽（管 x ±0.45）也最靠前，中罩收进、烟道箱最窄。z 的三根极值分别是
      croundedBox(0, [0.9, 0.12, 0.435], [0, 0, -0.0075], { radius: 0.01 }),
      croundedBox(0, [0.62, 0.2, 0.38], [0, 0.1, -0.03], { radius: 0.01 }),
      croundedBox(0, [0.3, 0.27, 0.3], [0, 0.28, -0.06], { radius: 0.01 }),
      cbox(1, [0.34, 0.06, 0.02], [0.24, 0.03, 0.215]),
      cbox(2, [0.3, 0.05, 0.012], [-0.24, 0.035, 0.216]),
      cbox(3, [0.07, 0.02, 0.012], [-0.13, 0.02, 0.212]),
      cbox(3, [0.07, 0.02, 0.012], [0.13, 0.02, 0.212]),
      // 油杯底面不写 0（那是下罩自己的底面），抬高 2mm 避开与罩底共面。
      cbox(4, [0.28, 0.035, 0.05], [0, 0.002, 0.19])
    ]
  },
  integratedstove: {
    note: "集成灶：下柜（双门 + 消毒柜玻璃门）+ 不锈钢灶台 + 后上部烟机段（进风格栅 + 照明灯）+ 双灶头带锅架。",
    size: [0.9, 1.35, 0.6],
    slots: [
      { role: "body", color: 0x2b2f34, roughness: 0.4, metalness: 0.16 },
      { role: "top", color: 0xb4babf, roughness: 0.26, metalness: 0.42 },
      { role: "door", color: 0x3c4147, roughness: 0.3, metalness: 0.24 },
      { role: "glass", color: 0x1b1d20, roughness: 0.16, metalness: 0.08 },
      { role: "handle", color: 0xb4babf, roughness: 0.24, metalness: 0.5 },
      { role: "metal", color: 0x6d747b, roughness: 0.3, metalness: 0.42 },
      { role: "grating", color: 0x6d747b, roughness: 0.45, metalness: 0.3 },
      { role: "lit", color: 0xf6f2e8, roughness: 0.3, metalness: 0.0 },
      { role: "base", color: 0x22262a, roughness: 0.5, metalness: 0.12 }
    ],
    parts: [
      // 柜体抬到 0.02，把地面那 2cm 让给踢脚 —— 两者底面若都写 0 就是一对共面三角形。
      cbox(0, [0.9, 1.0, 0.56], [0, 0.02, -0.02]),
      cbox(8, [0.86, 0.06, 0.5], [0, 0, -0.04]),
      // 灶台是全机唯一顶到 z = ±0.30 的一件（后沿给烟机段、前沿给拉手让路，见下）。
      cbox(1, [0.9, 0.04, 0.6], [0, 1.02, 0]),
      cbox(0, [0.9, 0.29, 0.34], [0, 1.06, -0.13]),
      cbox(6, [0.6, 0.08, 0.02], [0, 1.2, 0.045]),
      cbox(7, [0.5, 0.02, 0.02], [0, 1.12, 0.045]),
      ccyl(5, 0.11, 0.03, 20, [-0.22, 1.055, 0.02]),
      ccyl(5, 0.11, 0.03, 20, [0.22, 1.055, 0.02]),
      ctorus(5, 0.1, 0.008, [-0.22, 1.093, 0.02], { axis: "y", align: "center" }),
      ctorus(5, 0.1, 0.008, [0.22, 1.093, 0.02], { axis: "y", align: "center" }),
      croundedBox(2, [0.42, 0.62, 0.03], [-0.22, 0.14, 0.275], { radius: 0.008 }),
      croundedBox(2, [0.42, 0.62, 0.03], [0.22, 0.14, 0.275], { radius: 0.008 }),
      croundedBox(2, [0.42, 0.22, 0.03], [0.22, 0.79, 0.275], { radius: 0.008 }),
      croundedBox(3, [0.4, 0.2, 0.012], [-0.22, 0.8, 0.287], { radius: 0.006 }),
      // 拉手顶到 z = 0.30，与灶台同为整机最前面 —— 但两者 y 相差 1m 以上，不会同面。
      ccyl(4, 0.01, 0.3, 12, [-0.22, 0.72, 0.29], { rot: [0, 0, 90], align: "center" }),
      ccyl(4, 0.01, 0.3, 12, [0.22, 0.72, 0.29], { rot: [0, 0, 90], align: "center" }),
      ccyl(4, 0.01, 0.3, 12, [-0.22, 0.9, 0.29], { rot: [0, 0, 90], align: "center" })
    ]
  },
  // ── 厨房小电器：饭煲 / 消毒柜 / 咖啡机 / 电水壶 ───────────────────────────
  ricecooker: {
    note: "电饭煲：机身 + 顶盖（带蒸汽阀）+ 盖前控制面板（显示区）+ 两侧提手 + 底座。",
    size: [0.28, 0.25, 0.32],
    slots: [
      { role: "body", color: 0xfafaf8, roughness: 0.42, metalness: 0.06 },
      { role: "top", color: 0xfafaf8, roughness: 0.4, metalness: 0.08 },
      { role: "base", color: 0x3c3f44, roughness: 0.5, metalness: 0.14 },
      { role: "trim", color: 0xb4babf, roughness: 0.3, metalness: 0.4 },
      { role: "panel", color: 0x2b2f34, roughness: 0.36, metalness: 0.16 },
      { role: "screen", color: 0x15171a, roughness: 0.2, metalness: 0.1 },
      { role: "handle", color: 0xb4babf, roughness: 0.3, metalness: 0.4 }
    ],
    parts: [
      // 提手挂在机身两侧、盖前控制面板从盖前沿往前伸 —— 宽 0.28 与深 0.32 分别由这两处顶住，
      croundedBox(2, [0.24, 0.02, 0.28], [0, 0, 0], { radius: 0.008 }),
      croundedBox(0, [0.26, 0.17, 0.30], [0, 0.02, -0.01], { radius: 0.05 }),
      croundedBox(1, [0.24, 0.045, 0.28], [0, 0.19, -0.01], { radius: 0.04 }),
      ccyl(3, 0.018, 0.015, 12, [-0.06, 0.235, -0.07]),
      cbox(4, [0.18, 0.035, 0.016], [0, 0.2, 0.148]),
      cbox(5, [0.1, 0.025, 0.012], [0, 0.205, 0.154]),
      cbox(6, [0.02, 0.03, 0.08], [0.13, 0.1, -0.01]),
      cbox(6, [0.02, 0.03, 0.08], [-0.13, 0.1, -0.01])
    ]
  },
  sterilizer: {
    note: "嵌入式消毒柜：机身 + 玻璃门（含门框与视窗）+ 通长拉手 + 顶部控制条（显示区）+ 下导轨。",
    size: [0.6, 0.65, 0.5],
    slots: [
      { role: "body", color: 0xc6cbd1, roughness: 0.34, metalness: 0.24 },
      { role: "door", color: 0xc6cbd1, roughness: 0.3, metalness: 0.22 },
      { role: "glass", color: 0x1b1d20, roughness: 0.16, metalness: 0.08 },
      { role: "handle", color: 0xb4babf, roughness: 0.24, metalness: 0.5 },
      { role: "panel", color: 0x2b2f34, roughness: 0.36, metalness: 0.16 },
      { role: "screen", color: 0x15171a, roughness: 0.2, metalness: 0.1 },
      { role: "shelf", color: 0x8c8f94, roughness: 0.3, metalness: 0.4 }
    ],
    parts: [
      cbox(0, [0.6, 0.65, 0.44], [0, 0, -0.03]),
      croundedBox(1, [0.56, 0.44, 0.03], [0, 0.08, 0.205], { radius: 0.008 }),
      croundedBox(2, [0.46, 0.34, 0.016], [0, 0.13, 0.224], { radius: 0.006 }),
      ccyl(3, 0.012, 0.5, 12, [0, 0.3, 0.238], { rot: [0, 0, 90], align: "center" }),
      cbox(4, [0.56, 0.09, 0.03], [0, 0.54, 0.205]),
      cbox(5, [0.14, 0.045, 0.016], [0, 0.565, 0.226]),
      cbox(6, [0.5, 0.02, 0.04], [0, 0.03, 0.2], { fullOnly: true })
    ]
  },
  coffeemaker: {
    note: "半自动咖啡机：机身 + 顶部温杯盘 + 冲煮头与冲煮把手 + 蒸汽棒 + 前接水盘 + 后水箱 + 控制面板（显示区）。",
    size: [0.28, 0.38, 0.35],
    slots: [
      { role: "body", color: 0x22252a, roughness: 0.42, metalness: 0.12 },
      { role: "metal", color: 0xb4babf, roughness: 0.28, metalness: 0.4 },
      { role: "glass", color: 0xdfeaec, roughness: 0.14, metalness: 0.04 },
      { role: "panel", color: 0x2b2f34, roughness: 0.36, metalness: 0.16 },
      { role: "screen", color: 0x15171a, roughness: 0.2, metalness: 0.1 },
      { role: "top", color: 0xb4babf, roughness: 0.26, metalness: 0.42 },
      { role: "handle", color: 0x3c3f44, roughness: 0.42, metalness: 0.08 }
    ],
    parts: [
      // 机身前面只到 0.085，冲煮把手从冲煮头伸到 0.175 —— 深度极值由这两件分头顶住。
      croundedBox(0, [0.28, 0.36, 0.257], [0, 0, -0.0435], { radius: 0.02 }),
      cbox(5, [0.26, 0.02, 0.24], [0, 0.36, -0.045]),
      cbox(2, [0.22, 0.24, 0.02], [0, 0.06, -0.165]),
      cbox(1, [0.2, 0.05, 0.1], [0, 0.2, 0.08]),
      ccyl(6, 0.014, 0.12, 12, [0, 0.16, 0.115], { rot: [90, 0, 0], align: "center" }),
      cbox(1, [0.22, 0.015, 0.12], [0, 0.04, 0.07]),
      ccyl(1, 0.008, 0.12, 8, [0.115, 0.14, 0.12], { fullOnly: true }),
      cbox(3, [0.16, 0.06, 0.02], [0, 0.28, 0.095]),
      cbox(4, [0.1, 0.03, 0.01], [0, 0.295, 0.11])
    ]
  },
  kettle: {
    note: "电水壶：壶身 + 壶盖与顶珠 + 壶嘴 + 侧把手 + 底座（带开关板与电源线口）。",
    size: [0.2, 0.26, 0.2],
    slots: [
      { role: "body", color: 0xfafaf8, roughness: 0.42, metalness: 0.06 },
      { role: "metal", color: 0x9aa1a8, roughness: 0.3, metalness: 0.35 },
      { role: "handle", color: 0x22252a, roughness: 0.5, metalness: 0.1 },
      { role: "trim", color: 0xb4babf, roughness: 0.28, metalness: 0.45 },
      { role: "panel", color: 0x2b2f34, roughness: 0.36, metalness: 0.16 }
    ],
    parts: [
      // 底座径 0.19 已接近整件宽度；壶嘴往 −x 伸到 −0.10、把手往 +x 贴到 +0.10，
      ccyl(1, 0.095, 0.02, 24, [0, 0, 0]),
      ccyl(0, 0.075, 0.2, 24, [0, 0.02, 0]),
      ccyl(1, 0.07, 0.025, 24, [0, 0.22, 0]),
      ccyl(3, 0.015, 0.015, 12, [0, 0.245, 0]),
      ccyl(1, 0.018, 0.06, 12, [-0.07, 0.19, 0], { rot: [0, 0, 90], align: "center" }),
      ccyl(2, 0.016, 0.13, 12, [0.084, 0.085, 0]),
      cbox(2, [0.03, 0.02, 0.03], [0.075, 0.205, 0]),
      cbox(4, [0.05, 0.05, 0.008], [0, 0.005, 0.096]),
      // 底座后面的电源线口：与前一块同层（±0.10 就是底座撑住的 0.20 进深），
      cbox(4, [0.04, 0.04, 0.008], [0, 0.005, -0.096])
    ]
  },
  airfryer: {
    note: "空气炸锅：机身 + 顶部控制面板（旋钮与显示区）+ 前抽拉炸篮与篮把手 + 后散热格栅 + 四支防滑脚。",
    size: [0.3, 0.34, 0.34],
    slots: [
      { role: "body", color: 0x22252a, roughness: 0.42, metalness: 0.12 },
      { role: "leg", color: 0x5b6167, roughness: 0.5, metalness: 0.1 },
      { role: "grating", color: 0x5b6167, roughness: 0.45, metalness: 0.3 },
      { role: "panel", color: 0x2b2f34, roughness: 0.36, metalness: 0.16 },
      { role: "drawer", color: 0x3c4147, roughness: 0.3, metalness: 0.28 },
      { role: "handle", color: 0xb4babf, roughness: 0.24, metalness: 0.5 },
      { role: "trim", color: 0xb4babf, roughness: 0.26, metalness: 0.45 },
      { role: "screen", color: 0x15171a, roughness: 0.2, metalness: 0.1 }
    ],
    parts: [
      // 篮把手比炸篮再往前一层：深度 0.34 的前极值在这里，后极值在散热格栅上。
      ccyl(1, 0.012, 0.015, 10, [-0.11, 0, -0.1]),
      ccyl(1, 0.012, 0.015, 10, [0.11, 0, -0.1]),
      ccyl(1, 0.012, 0.015, 10, [-0.11, 0, 0.08]),
      ccyl(1, 0.012, 0.015, 10, [0.11, 0, 0.08]),
      croundedBox(0, [0.3, 0.245, 0.25], [0, 0.015, -0.035], { radius: 0.05 }),
      croundedBox(3, [0.3, 0.08, 0.25], [0, 0.26, -0.035], { radius: 0.03 }),
      croundedBox(4, [0.26, 0.17, 0.06], [0, 0.04, 0.12], { radius: 0.02 }),
      cbox(5, [0.12, 0.03, 0.02], [0, 0.1, 0.16]),
      ccyl(6, 0.022, 0.02, 16, [-0.09, 0.3, 0.1], { rot: [90, 0, 0], align: "center" }),
      cbox(7, [0.09, 0.045, 0.01], [0.05, 0.285, 0.095]),
      // 后散热格栅：如上所述，进深 0.34 的后极值就在它身上 —— 不能打 fullOnly
      cbox(2, [0.2, 0.06, 0.01], [0, 0.06, -0.165])
    ]
  },
  blender: {
    note: "破壁机：底座（含控制面板与显示区）+ 上宽下窄的透明杯身 + 杯盖与量杯盖 + 侧把手 + 后散热格栅。",
    size: [0.22, 0.45, 0.24],
    slots: [
      { role: "body", color: 0x22252a, roughness: 0.45, metalness: 0.1 },
      { role: "glass", color: 0xdfeaec, roughness: 0.14, metalness: 0.04 },
      { role: "trim", color: 0x9aa1a8, roughness: 0.3, metalness: 0.3 },
      { role: "panel", color: 0x2b2f34, roughness: 0.36, metalness: 0.16 },
      { role: "screen", color: 0x15171a, roughness: 0.2, metalness: 0.1 },
      { role: "grating", color: 0x5b6167, roughness: 0.45, metalness: 0.3 },
      { role: "handle", color: 0x3c3f44, roughness: 0.42, metalness: 0.08 }
    ],
    parts: [
      // 杯身是整件唯一「上宽下窄」的一件（锥形圆柱）：顶径 0.20 与杯盖的 0.22 一起决定宽度。
      croundedBox(0, [0.2, 0.16, 0.2], [0, 0, 0], { radius: 0.02 }),
      ctaper(1, 0.075, 0.1, 0.26, 20, [0, 0.15, 0]),
      ccyl(2, 0.11, 0.03, 24, [0, 0.4, 0]),
      ccyl(2, 0.035, 0.02, 16, [0, 0.43, 0]),
      cbox(6, [0.02, 0.2, 0.03], [0.1, 0.19, 0]),
      cbox(3, [0.16, 0.05, 0.015], [0, 0.06, 0.1075]),
      cbox(4, [0.1, 0.028, 0.005], [0, 0.07, 0.1175]),
      // 后散热格栅：底座背面 −0.1、它到 −0.12，撑住 0.24 的进深 —— 不能打 fullOnly
      cbox(5, [0.14, 0.08, 0.01], [0, 0.05, -0.115])
    ]
  },
  // ── 卫浴热水与净水：储水式 / 燃气热水器 / 净水器 ───────────────────────────
  storagewaterheater: {
    note: "储水式电热水器：卧式保温桶（两道箍带）+ 前控制盒（旋钮与显示区）+ 顶部进出水管 + 背面挂架 + 底部托板。",
    size: [0.86, 0.48, 0.46],
    slots: [
      { role: "body", color: 0xc6cbd1, roughness: 0.34, metalness: 0.24 },
      { role: "base", color: 0x3c3f44, roughness: 0.5, metalness: 0.14 },
      { role: "trim", color: 0x8c8f94, roughness: 0.3, metalness: 0.4 },
      { role: "panel", color: 0x2b2f34, roughness: 0.36, metalness: 0.16 },
      { role: "screen", color: 0x1b1d20, roughness: 0.2, metalness: 0.1 },
      { role: "metal", color: 0xb4babf, roughness: 0.28, metalness: 0.45 }
    ],
    parts: [
      // 桶轴沿 x：径向 0.205 决定高度（托板 0.03 + 0.205×2 = 0.44），桶长 0.86 决定宽度。
      cbox(1, [0.7, 0.03, 0.34], [0, 0, 0]),
      ccyl(0, 0.205, 0.86, 28, [0, 0.235, 0], { rot: [0, 0, 90], align: "center" }),
      // 箍带用「比桶身大 8mm 的薄圆柱」而不是环面：环面的轴只有 y / z 两种，绕出来对不上桶轴。
      ccyl(2, 0.213, 0.02, 28, [-0.26, 0.235, 0], { rot: [0, 0, 90], align: "center" }),
      ccyl(2, 0.213, 0.02, 28, [0.26, 0.235, 0], { rot: [0, 0, 90], align: "center" }),
      // 控制盒从桶身最粗处往前伸到 z = 0.226，显示区再压出 4mm —— 前极值 0.23 由显示区接管。
      cbox(3, [0.22, 0.1, 0.14], [0, 0.235, 0.156]),
      cbox(4, [0.12, 0.05, 0.012], [0, 0.26, 0.224]),
      ccyl(5, 0.022, 0.014, 16, [0.07, 0.21, 0.223], { rot: [90, 0, 0], align: "center" }),
      // 接管坐在桶顶（y = 0.44）上，顶到 0.48 —— 高度极值在这里。
      ccyl(5, 0.018, 0.04, 12, [-0.2, 0.44, 0]),
      ccyl(5, 0.018, 0.04, 12, [0.2, 0.44, 0]),
      // 背面挂架：压着桶身背面（−0.205）再往后 25mm，是这件进深 0.46 的后极值 ——
      cbox(5, [0.5, 0.05, 0.035], [0, 0.235, -0.2125]),
      // 侧面泄压阀：整个落在前极值（显示区 0.23）与桶身之间，不影响包围盒 —— 留着 fullOnly。
      ccyl(5, 0.012, 0.02, 12, [0.3, 0.235, 0.212], { rot: [90, 0, 0], align: "center", fullOnly: true })
    ]
  },
  gaswaterheater: {
    note: "燃气热水器：壁挂扁箱 + 前面板 + 上凸控制条（旋钮与显示区）+ 顶部排烟管 + 底部接管 + 进风格栅。",
    size: [0.42, 0.72, 0.22],
    slots: [
      { role: "body", color: 0xc6cbd1, roughness: 0.34, metalness: 0.24 },
      { role: "panel", color: 0x2b2f34, roughness: 0.36, metalness: 0.16 },
      { role: "screen", color: 0x1b1d20, roughness: 0.2, metalness: 0.1 },
      { role: "metal", color: 0xb4babf, roughness: 0.28, metalness: 0.45 },
      { role: "grating", color: 0x5b6167, roughness: 0.45, metalness: 0.3 }
    ],
    parts: [
      // 机身只到 0.66，顶部留 6cm 给排烟管 —— 0.72 的高度极值落在管口。
      croundedBox(0, [0.42, 0.66, 0.197], [0, 0, -0.0115], { radius: 0.015 }),
      ccyl(3, 0.045, 0.06, 16, [0, 0.66, 0]),
      croundedBox(1, [0.38, 0.5, 0.03], [0, 0.1, 0.075], { radius: 0.01 }),
      // 控制条比前面板多凸 2cm，深度极值 0.11 由它 + 旋钮外壳撑住。
      cbox(1, [0.36, 0.09, 0.045], [0, 0.565, 0.0825]),
      cbox(2, [0.14, 0.05, 0.012], [-0.09, 0.61, 0.104]),
      ccyl(3, 0.02, 0.012, 16, [0.1, 0.61, 0.104], { rot: [90, 0, 0], align: "center" }),
      cbox(4, [0.3, 0.03, 0.014], [0, 0.05, 0.086], { fullOnly: true }),
      ccyl(3, 0.014, 0.02, 10, [-0.12, 0.03, 0.1], { rot: [90, 0, 0], align: "center", fullOnly: true }),
      ccyl(3, 0.014, 0.02, 10, [0.12, 0.03, 0.1], { rot: [90, 0, 0], align: "center", fullOnly: true })
    ]
  },
  waterpurifier: {
    note: "立式净水机：机身 + 下储水门 + 中部滤芯视窗 + 出水嘴与接水盘 + 控制面板（显示区）+ 底座与顶盖。",
    size: [0.3, 1.2, 0.3],
    slots: [
      { role: "body", color: 0xc6cbd1, roughness: 0.34, metalness: 0.24 },
      { role: "metal", color: 0xb4babf, roughness: 0.28, metalness: 0.45 },
      { role: "door", color: 0xc6cbd1, roughness: 0.3, metalness: 0.22 },
      { role: "panel", color: 0x2b2f34, roughness: 0.36, metalness: 0.16 },
      { role: "screen", color: 0x1b1d20, roughness: 0.2, metalness: 0.1 },
      { role: "base", color: 0x3c3f44, roughness: 0.5, metalness: 0.14 },
      { role: "trim", color: 0x8c8f94, roughness: 0.3, metalness: 0.4 },
      { role: "glass", color: 0xdfeaec, roughness: 0.12, metalness: 0.04 }
    ],
    parts: [
      croundedBox(0, [0.3, 1.19, 0.28], [0, 0.005, -0.01], { radius: 0.02 }),
      cbox(5, [0.26, 0.03, 0.24], [0, 0, -0.01]),
      croundedBox(6, [0.28, 0.04, 0.26], [0, 1.16, -0.01], { radius: 0.01 }),
      croundedBox(2, [0.26, 0.42, 0.03], [0, 0.18, 0.135], { radius: 0.008 }),
      cbox(1, [0.16, 0.012, 0.1], [0, 0.7, 0.1]),
      ccyl(1, 0.012, 0.06, 12, [0, 0.75, 0.1]),
      cbox(3, [0.24, 0.1, 0.026], [0, 0.88, 0.135]),
      cbox(4, [0.14, 0.05, 0.012], [0, 0.91, 0.144]),
      cbox(7, [0.12, 0.12, 0.012], [0, 1.02, 0.144], { fullOnly: true })
    ]
  },
  pipelinewaterpurifier: {
    note: "管线机（壁挂式）：挂板 + 机身与顶盖收口 + 前上黑色面板（显示条）+ 三只出水嘴与接水盘 + 盘面格栅。",
    size: [0.48, 0.68, 0.24],
    slots: [
      { role: "body", color: 0xc6cbd1, roughness: 0.34, metalness: 0.24 },
      { role: "trim", color: 0xb4babf, roughness: 0.3, metalness: 0.42 },
      { role: "screen", color: 0x1b1d20, roughness: 0.18, metalness: 0.12 },
      { role: "lit", color: 0x6fd0a8, roughness: 0.3, metalness: 0 },
      { role: "metal", color: 0xb4babf, roughness: 0.28, metalness: 0.45 },
      { role: "grating", color: 0x9aa1a8, roughness: 0.32, metalness: 0.3 }
    ],
    parts: [
      // 这是一件**挂墙件**：底面 y=0 就是它的下沿，抬高由物件的离地高度给（默认 1.42m）。
      croundedBox(0, [0.48, 0.66, 0.19], [0, 0, -0.015], { radius: 0.012 }),
      croundedBox(0, [0.46, 0.02, 0.19], [0, 0.66, -0.015], { radius: 0.008 }),
      cbox(1, [0.02, 0.62, 0.01], [0.225, 0.02, 0.087]),
      cbox(1, [0.02, 0.62, 0.01], [-0.225, 0.02, 0.087]),
      // 黑色面板压在机身正面上（机身前面 z=+0.08，面板 0.08…0.092），显示条再压在面板上。
      cbox(2, [0.4, 0.32, 0.012], [0, 0.3, 0.086]),
      cbox(3, [0.14, 0.014, 0.004], [0, 0.315, 0.093]),
      cbox(4, [0.28, 0.022, 0.03], [0, 0.266, 0.09]),
      ccyl(4, 0.011, 0.04, 16, [-0.09, 0.252, 0.09], { align: "center" }),
      ccyl(4, 0.011, 0.04, 16, [0, 0.252, 0.09], { align: "center" }),
      ccyl(4, 0.011, 0.04, 16, [0.09, 0.252, 0.09], { align: "center" }),
      croundedBox(4, [0.32, 0.012, 0.1], [0, 0.1, 0.07], { radius: 0.004 }),
      cbox(5, [0.28, 0.008, 0.08], [0, 0.111, 0.07]),
      // 挂板就是上面那段注释里「贴墙的 −0.12」：它撑住 0.24 的后极值，**不能打 fullOnly**
      cbox(4, [0.3, 0.44, 0.02], [0, 0.1, -0.11])
    ]
  },
  tea_bar_machine: {
    note: "茶吧机：踢脚 + 下柜（玻璃门与门框）+ 台面与接水盘 + 上部瓶仓（背板 / 两侧板）与瓶座 + 取水头（面板 + 两只出水嘴）。",
    size: [0.62, 1.32, 0.48],
    slots: [
      { role: "body", color: 0xf2f1ed, roughness: 0.5, metalness: 0.06 },
      { role: "base", color: 0x3c3f44, roughness: 0.5, metalness: 0.14 },
      { role: "top", color: 0xd8d6d0, roughness: 0.38, metalness: 0.1 },
      { role: "metal", color: 0xb4babf, roughness: 0.28, metalness: 0.45 },
      { role: "screen", color: 0x1b1d20, roughness: 0.18, metalness: 0.12 },
      { role: "lit", color: 0x6fd0a8, roughness: 0.3, metalness: 0 },
      { role: "grating", color: 0x9aa1a8, roughness: 0.32, metalness: 0.3 },
      { role: "glass", color: 0xdfeaec, roughness: 0.12, metalness: 0.04 },
      { role: "trim", color: 0xb4babf, roughness: 0.3, metalness: 0.42 }
    ],
    parts: [
      cbox(1, [0.54, 0.06, 0.4], [0, 0, 0]),
      croundedBox(0, [0.62, 0.8, 0.465], [0, 0.06, -0.0075], { radius: 0.012 }),
      croundedBox(2, [0.62, 0.04, 0.48], [0, 0.86, 0], { radius: 0.006 }),
      cbox(7, [0.47, 0.63, 0.008], [0, 0.145, 0.232]),
      cbox(8, [0.54, 0.032, 0.014], [0, 0.784, 0.233]),
      cbox(8, [0.54, 0.032, 0.014], [0, 0.108, 0.233]),
      ...mirrorPair(cbox(8, [0.032, 0.708, 0.014], [0.254, 0.108, 0.233])),
      // 瓶仓：背板与柜体后背齐平，侧板前面收在 +0.20（比柜体浅 2.5cm），仓内因此是一只朝前开的槽。
      cbox(0, [0.62, 0.42, 0.04], [0, 0.9, -0.22]),
      ...mirrorPair(cbox(0, [0.04, 0.42, 0.44], [0.29, 0.9, -0.02])),
      // 瓶座居中偏后，接水盘压在台面前沿：两者在台面上各占一头，互不叠。
      ccyl(3, 0.13, 0.028, 24, [0, 0.902, -0.08]),
      ccyl(3, 0.145, 0.012, 24, [0, 0.93, -0.08]),
      croundedBox(3, [0.34, 0.012, 0.14], [0, 0.9, 0.15], { radius: 0.004 }),
      cbox(6, [0.3, 0.008, 0.12], [0, 0.911, 0.15]),
      // 取水头悬在瓶仓前上方（顶面与侧板同为 1.32），嘴尖离盘面 24cm，正好放下一只马克杯。
      cbox(0, [0.44, 0.1, 0.16], [0, 1.22, 0.12]),
      cbox(4, [0.3, 0.07, 0.008], [0, 1.245, 0.205]),
      cbox(5, [0.3, 0.012, 0.004], [0, 1.227, 0.207]),
      ccyl(3, 0.012, 0.04, 16, [-0.09, 1.18, 0.12], { align: "center" }),
      ccyl(3, 0.012, 0.04, 16, [0.09, 1.18, 0.12], { align: "center" })
    ]
  },
  // ── 洁具（陶瓷 / 亚克力 + 五金 + 玻璃三料分件）────────────────────────────
  basin: {
    note:
      "洗漱台组合：踢脚 + 柜体与双门拉手 + 石材台面 + 台上陶瓷盆 + 龙头 + 壁挂镜柜（含镜面）。" +
      "声明高度 0.88 只描述落地柜体，镜柜烘在它之上（authoredHeight 1.81）。",
    size: [0.9, 0.88, 0.5],
    // 镜柜顶面 1.81：实物上「台面 0.85 + 镜柜底 1.15 + 镜柜高 0.66」是标准浴室柜组合的位置
    authoredHeight: 1.81,
    slots: [
      { role: "frame", color: 0xb08a5e, roughness: 0.62, metalness: 0 },
      { role: "door", color: 0xc09a6c, roughness: 0.56, metalness: 0 },
      { role: "handle", color: 0xb4babf, roughness: 0.28, metalness: 0.45 },
      { role: "top", color: 0xf2f1ed, roughness: 0.34, metalness: 0.03 },
      { role: "body", color: 0xf6f6f3, roughness: 0.16, metalness: 0.02 },
      { role: "metal", color: 0xbfc6cc, roughness: 0.22, metalness: 0.7 },
      { role: "base", color: 0x2e2e30, roughness: 0.5, metalness: 0.14 },
      { role: "mirror", color: 0xdfe7ec, roughness: 0.06, metalness: 0.86 },
      { role: "shelf", color: 0xd8b98f, roughness: 0.6, metalness: 0 }
    ],
    parts: [
      cbox(6, [0.8, 0.06, 0.42], [0, 0, -0.001]),
      croundedBox(0, [0.86, 0.66, 0.458], [0, 0.045, -0.001], { radius: 0.01 }),
      ...mirrorPair(croundedBox(1, [0.4, 0.56, 0.016], [0.215, 0.08, 0.237], { radius: 0.006 })),
      ...mirrorPair(cbox(2, [0.014, 0.18, 0.024], [0.05, 0.34, 0.238])),
      croundedBox(3, [0.9, 0.04, 0.5], [0, 0.7, 0], { radius: 0.008 }),
      ctaper(4, 0.15, 0.185, 0.14, 28, [0, 0.73, 0]),
      ccyl(5, 0.015, 0.145, 16, [0, 0.735, -0.155]),
      ccyl(5, 0.013, 0.12, 12, [0, 0.855, -0.095], { rot: [90, 0, 0], align: "center" }),
      cbox(0, [0.72, 0.66, 0.014], [0, 1.15, -0.243]),
      cbox(0, [0.72, 0.02, 0.15], [0, 1.15, -0.175]),
      cbox(0, [0.72, 0.02, 0.15], [0, 1.79, -0.175]),
      cbox(0, [0.02, 0.66, 0.15], [-0.35, 1.15, -0.175]),
      cbox(0, [0.02, 0.66, 0.15], [0.35, 1.15, -0.175]),
      // 柜内一块层板（镜柜的标准配置：竖着放杯子 / 瓶瓶罐罐），lite 丢掉。
      cbox(8, [0.66, 0.016, 0.126], [0, 1.48, -0.166], { fullOnly: true }),
      // 两扇镜门：各 0.35 宽、中缝 1cm。门比柜体四周各收 5mm 并压进柜体 2mm —— 见上面那条
      cbox(1, [0.345, 0.65, 0.02], [-0.1775, 1.155, -0.092]),
      cbox(1, [0.345, 0.65, 0.02], [0.1775, 1.155, -0.092]),
      // 镜面：嵌在门框里、四周留 3cm 边（实物镜柜的镜子就嵌在门框里，不是满铺一块镜），
      cbox(7, [0.285, 0.565, 0.008], [-0.1775, 1.21, -0.082]),
      cbox(7, [0.285, 0.565, 0.008], [0.1775, 1.21, -0.082]),
      // 两枚小圆钮：贴在中缝两侧（镜柜门矮，横拉手会显得笨）。
      ccyl(2, 0.011, 0.02, 14, [-0.03, 1.33, -0.078], { rot: [90, 0, 0], align: "center" }),
      ccyl(2, 0.011, 0.02, 14, [0.03, 1.33, -0.078], { rot: [90, 0, 0], align: "center" })
    ]
  },
  toilet: {
    note: "马桶：落地陶瓷座体 + 后水箱 + 水箱盖（含冲水按钮）+ 座圈与盖板。",
    size: [0.42, 0.52, 0.7],
    slots: [
      { role: "body", color: 0xf6f6f3, roughness: 0.16, metalness: 0.02 },
      { role: "top", color: 0xf2f0ea, roughness: 0.3, metalness: 0.02 },
      { role: "metal", color: 0xbfc6cc, roughness: 0.22, metalness: 0.7 }
    ],
    parts: [
      // 这是**入墙水箱款**（0.52 总高就是坐面高度），水箱只露出后座那一段。
      croundedBox(0, [0.36, 0.36, 0.62], [0, 0, 0.04], { radius: 0.04 }),
      croundedBox(0, [0.4, 0.46, 0.2], [0, 0, -0.24], { radius: 0.025 }),
      croundedBox(1, [0.4, 0.028, 0.46], [0, 0.355, 0.03], { radius: 0.022 }),
      croundedBox(1, [0.4, 0.022, 0.44], [0, 0.383, 0.03], { radius: 0.02 }),
      croundedBox(1, [0.42, 0.065, 0.22], [0, 0.45, -0.24], { radius: 0.012 }),
      ccyl(2, 0.032, 0.01, 20, [0.1, 0.51, -0.24])
    ]
  },
  squattoilet: {
    note: "蹲便器：槽底 + 四周边沿围成的便槽 + 后沿高台（存水弯）+ 排水篦子。",
    size: [0.45, 0.18, 0.65],
    slots: [
      { role: "body", color: 0xf6f6f3, roughness: 0.16, metalness: 0.02 },
      { role: "interior", color: 0xe7e6e1, roughness: 0.24, metalness: 0.02 },
      { role: "grating", color: 0xb4babf, roughness: 0.28, metalness: 0.5 }
    ],
    parts: [
      // 便槽做成「边沿环 + 更低的槽底」，而不是一整块方砖：从上方看才看得见槽（槽底 1 号比
      croundedBox(1, [0.4, 0.09, 0.62], [0, 0, 0], { radius: 0.03 }),
      croundedBox(0, [0.45, 0.04, 0.06], [0, 0.08, 0.295], { radius: 0.015 }),
      croundedBox(0, [0.45, 0.1, 0.16], [0, 0.08, -0.245], { radius: 0.02 }),
      ...mirrorPair(croundedBox(0, [0.06, 0.04, 0.6], [0.195, 0.08, 0], { radius: 0.015 })),
      cbox(2, [0.14, 0.008, 0.1], [0, 0.088, -0.1])
    ]
  },
  urinal: {
    note: "小便斗：壳体 + 前方边圈围成的腔口 + 腔内面（含排水篦子）+ 顶部进水帽。",
    size: [0.38, 0.72, 0.34],
    slots: [
      { role: "body", color: 0xf6f6f3, roughness: 0.16, metalness: 0.02 },
      { role: "interior", color: 0xe7e6e1, roughness: 0.24, metalness: 0.02 },
      { role: "grating", color: 0xb4babf, roughness: 0.28, metalness: 0.5 },
      { role: "metal", color: 0xbfc6cc, roughness: 0.22, metalness: 0.7 }
    ],
    parts: [
      // 挂墙件：底面 y=0 是下沿，抬高由离地高度给（默认 0.38m）。进深 0.34 由「壳体后背 -0.17」
      croundedBox(0, [0.38, 0.66, 0.28], [0, 0, -0.03], { radius: 0.05 }),
      croundedBox(0, [0.38, 0.1, 0.065], [0, 0, 0.1375], { radius: 0.02 }),
      croundedBox(0, [0.38, 0.06, 0.065], [0, 0.6, 0.1375], { radius: 0.02 }),
      ...mirrorPair(croundedBox(0, [0.06, 0.66, 0.065], [0.16, 0, 0.1375], { radius: 0.02 })),
      croundedBox(1, [0.28, 0.52, 0.06], [0, 0.09, 0.13], { radius: 0.04 }),
      cbox(2, [0.1, 0.008, 0.05], [0, 0.11, 0.13]),
      ccyl(3, 0.032, 0.065, 16, [0, 0.655, -0.09])
    ]
  },
  bathtub: {
    note: "浴缸：内缩的缸底 + 一圈缸壁（围出缸口）+ 缸内底 + 排水口与溢流口。",
    size: [1.7, 0.58, 0.78],
    slots: [
      { role: "body", color: 0xf6f6f3, roughness: 0.16, metalness: 0.02 },
      { role: "interior", color: 0xe7e6e1, roughness: 0.24, metalness: 0.02 },
      { role: "metal", color: 0xbfc6cc, roughness: 0.22, metalness: 0.7 }
    ],
    parts: [
      // 缸壁（16cm 厚的一圈）比缸底外扩 2cm：侧面看是「下裙内收、缸沿外张」，同时也让两部分
      croundedBox(0, [1.66, 0.22, 0.74], [0, 0, 0], { radius: 0.1 }),
      croundedBox(0, [1.54, 0.38, 0.08], [0, 0.2, 0.35], { radius: 0.03 }),
      croundedBox(0, [1.54, 0.38, 0.08], [0, 0.2, -0.35], { radius: 0.03 }),
      ...mirrorPair(croundedBox(0, [0.08, 0.38, 0.62], [0.81, 0.2, 0], { radius: 0.03 })),
      croundedBox(1, [1.58, 0.06, 0.66], [0, 0.2, 0], { radius: 0.06 }),
      ccyl(2, 0.05, 0.008, 20, [0, 0.256, 0]),
      ctorus(2, 0.045, 0.008, [0, 0.44, 0.3], { axis: "z" })
    ]
  },
  shower: {
    note: "花洒：淋浴底盘（含内面与地漏篦子）+ 立柱与墙座 + 顶臂与顶喷 + 混水阀 + 滑座与手持花洒。",
    size: [0.9, 2.1, 0.9],
    slots: [
      { role: "body", color: 0xfafaf8, roughness: 0.3, metalness: 0.04 },
      { role: "interior", color: 0xeeeee9, roughness: 0.4, metalness: 0.04 },
      { role: "grating", color: 0xb4babf, roughness: 0.28, metalness: 0.5 },
      { role: "metal", color: 0xbfc6cc, roughness: 0.22, metalness: 0.7 }
    ],
    parts: [
      croundedBox(0, [0.9, 0.06, 0.9], [0, 0, 0], { radius: 0.03 }),
      croundedBox(1, [0.74, 0.02, 0.74], [0, 0.045, 0], { radius: 0.04 }),
      cbox(2, [0.14, 0.01, 0.14], [0, 0.062, -0.26]),
      ccyl(3, 0.022, 1.55, 16, [0, 0.42, -0.42]),
      cbox(3, [0.06, 0.06, 0.05], [0, 0.42, -0.425]),
      cbox(3, [0.06, 0.06, 0.05], [0, 1.94, -0.425]),
      cbox(3, [0.05, 0.05, 0.44], [0, 1.97, -0.2]),
      ccyl(3, 0.16, 0.08, 28, [0, 2.02, -0.02]),
      cbox(3, [0.26, 0.09, 0.1], [0, 1.02, -0.38]),
      cbox(3, [0.1, 0.06, 0.1], [0, 1.66, -0.37]),
      ccyl(3, 0.018, 0.2, 12, [0.1, 1.62, -0.33], { rot: [20, 0, 0], align: "center" })
    ]
  },
  glasspartition: {
    note: "玻璃隔断：两端立柱 + 上下横梁 + 玻璃面板 + 竖向拉手。",
    size: [1.2, 2, 0.08],
    slots: [
      { role: "glass", color: 0xdfeaec, roughness: 0.12, metalness: 0.04 },
      { role: "metal", color: 0xb4babf, roughness: 0.3, metalness: 0.45 },
      { role: "handle", color: 0xb4babf, roughness: 0.28, metalness: 0.45 }
    ],
    parts: [
      // 进深 0.08 由两端立柱（50 × 80mm）撑满；玻璃 12mm 居中，比立柱薄得多，两侧都不与柱面共面。
      cbox(0, [1.12, 1.92, 0.012], [0, 0.035, 0]),
      ...mirrorPair(cbox(1, [0.05, 2, 0.08], [0.575, 0, 0])),
      cbox(1, [1.14, 0.04, 0.04], [0, 0, 0]),
      ccyl(2, 0.012, 0.3, 12, [0.42, 0.9, 0.02], { fullOnly: true })
    ]
  },
  floorlamp: {
    note: "落地灯（悬臂款）：配重底板 + 立柱 + 顶端横臂 + 末端垂下的锥形罩 + 罩口金属圈。",
    size: [1.35, 1.8, 0.5],
    slots: [
      { role: "base", color: 0x2e2e30, roughness: 0.42, metalness: 0.25 },
      { role: "metal", color: 0x9c6b3f, roughness: 0.34, metalness: 0.38 },
      { role: "trim", color: 0x6b4a2e, roughness: 0.34, metalness: 0.4 },
      { role: "lit", color: 0xf6efe2, roughness: 0.88, metalness: 0 }
    ],
    parts: [
      // 占地靠两头撑满：底板在左（x -0.675…-0.325 正好压在左极值上）、灯罩挂在右
      croundedBox(0, [0.35, 0.035, 0.5], [-0.5, 0, 0], { radius: 0.014 }),
      ccyl(1, 0.02, 1.765, 20, [-0.5, 0.035, 0]),
      cbox(1, [0.98, 0.032, 0.032], [-0.02, 1.74, 0]),
      ccyl(1, 0.032, 0.05, 20, [-0.5, 1.72, 0], { fullOnly: true }),
      ccyl(1, 0.012, 0.03, 12, [0.475, 1.715, 0], { fullOnly: true }),
      ctaper(3, 0.2, 0.13, 0.32, 24, [0.475, 1.4, 0]),
      ctorus(2, 0.132, 0.011, [0.475, 1.713, 0], { fullOnly: true })
    ]
  },
  walllamp: {
    note: "壁灯（洗墙款）：贴墙背板 + 顶部横托 + 朝上张开的锥形罩（罩径正好顶满进深）。",
    size: [0.3, 0.34, 0.22],
    slots: [
      { role: "base", color: 0xd4dbe2, roughness: 0.42, metalness: 0.22 },
      { role: "metal", color: 0x9aa1a8, roughness: 0.32, metalness: 0.4 },
      { role: "lit", color: 0xf6efe2, roughness: 0.88, metalness: 0 }
    ],
    parts: [
      // 底面 y=0 落在背板下沿（与其余流水线件同一套原点约定，抬高由物件的离地高度给）。
      croundedBox(0, [0.13, 0.2, 0.026], [0, 0, -0.077], { radius: 0.01 }),
      cbox(1, [0.3, 0.04, 0.05], [0, 0.2, -0.055]),
      ctaper(2, 0.06, 0.11, 0.1, 24, [0, 0.24, 0])
    ]
  },

  // ── 软装四类（地毯 / 绿植 / 鱼缸 / 窗帘）─────────────────────────────────
  rug: {
    note: "地毯：绒面毯体 + 四周高出 1.5mm 的织带包边 + 内缩的防滑底 + 两端各 28 缕平铺流苏。",
    size: [2, 0.013, 1.4],
    liteVertexBudgetRatio: 1,
    slots: [
      { role: "fabric", color: 0xb9a894, roughness: 0.96, metalness: 0 },
      { role: "trim", color: 0x8c7a66, roughness: 0.94, metalness: 0 },
      { role: "base", color: 0x3f3a34, roughness: 0.98, metalness: 0 }
    ],
    parts: [
      // 防滑底：内缩 4cm，四面都藏在毯体之下，只在被掀起来时才看得到。它是落地（y=0）那一件。
      cbox(2, [1.84, 0.005, 1.3], [0, 0, 0]),
      // 绒面毯体：底边压在防滑底上（2.5mm），顶面到 11.5mm —— 留下 1.5mm 给包边。
      cbox(0, [1.8, 0.009, 1.34], [0, 0.0025, 0]),
      // 包边：绕毯体一圈的四条织带，顶面 13mm 就是整件高度。左右两条沿 z、上下两条沿 x，
      cbox(1, [1.9, 0.011, 0.06], [0, 0.002, 0.67]),
      cbox(1, [1.9, 0.011, 0.06], [0, 0.002, -0.67]),
      cbox(1, [0.06, 0.011, 1.28], [0.92, 0.002, 0]),
      cbox(1, [0.06, 0.011, 1.28], [-0.92, 0.002, 0]),
      // 流苏：两端各一排，平铺在地面上（高 4mm）向两侧伸到 ±1.00 —— 整宽 2.0m 由它收口。
      ...rowAlongZ(1, { size: [0.05, 0.004, 0.032], count: 28, span: 1.4, x: 0.975, y: 0 }),
      ...rowAlongZ(1, { size: [0.05, 0.004, 0.032], count: 28, span: 1.4, x: -0.975, y: 0 })
    ]
  },

  // ── 绿植 ──
  plant: {
    note: "室内高植：收分花盆 + 盆托 + 盆土面 + 直立主干 + 五层斜置叶片（每层 4~6 片、层间错开）+ 冠顶一撮嫩叶；冠幅正好 0.75 × 0.75。",
    size: [0.75, 1.6, 0.75],
    slots: [
      { role: "pot", color: 0xb9b2a6, roughness: 0.72, metalness: 0.02 },
      { role: "base", color: 0x8c8578, roughness: 0.8, metalness: 0 },
      { role: "frame", color: 0x6b5a42, roughness: 0.86, metalness: 0 },
      { role: "foliage", color: 0x4e7a3a, roughness: 0.62, metalness: 0 },
      { role: "interior", color: 0x3b2f22, roughness: 0.98, metalness: 0 }
    ],
    parts: [
      // 盆托：贴地一层薄盘，直径比盆口大 2cm —— 实物上盆托总是露在盆底一圈。
      ccyl(1, 0.19, 0.012, 28, [0, 0, 0]),
      // 花盆：下窄上宽（底 0.24 / 口 0.36），高 0.34。盆口离地 0.352（含盆托）。
      ctaper(0, 0.12, 0.18, 0.34, 28, [0, 0.012, 0]),
      // 盆土面：压在盆口下 2cm，只在盆沿内侧露一圈深色。
      ccyl(4, 0.165, 0.02, 28, [0, 0.322, 0]),
      // 主干：从土面一直升到 1.28（冠顶那撮嫩叶的叶基在 1.26 上下，主干刚好插进叶丛里）。
      ctaper(2, 0.028, 0.022, 0.44, 16, [0, 0.352, 0]),
      ctaper(2, 0.022, 0.012, 0.48, 12, [0, 0.792, 0]),
      ...plantCrownParts()
    ]
  },

  // ── 鱼缸 ──
  aquarium: {
    note: "鱼缸：底柜（踢脚 + 柜体 + 双门 + 拉手 + 台面）+ 缸体（上下口框 + 角柱 + 四面玻璃 + 深色背板）+ 带灯板的缸盖。",
    size: [1.5, 1.4, 0.55],
    slots: [
      { role: "body", color: 0x2f3237, roughness: 0.5, metalness: 0.1 },
      { role: "door", color: 0x383c42, roughness: 0.46, metalness: 0.1 },
      { role: "handle", color: 0xb4babf, roughness: 0.28, metalness: 0.45 },
      { role: "base", color: 0x22252a, roughness: 0.6, metalness: 0.06 },
      { role: "top", color: 0x2a2d32, roughness: 0.42, metalness: 0.12 },
      { role: "glass", color: 0xdfeaec, roughness: 0.12, metalness: 0.04 },
      { role: "frame", color: 0x1e2126, roughness: 0.44, metalness: 0.14 },
      { role: "interior", color: 0x1b3a40, roughness: 0.8, metalness: 0 },
      { role: "lit", color: 0xcfe8f2, roughness: 0.3, metalness: 0 }
    ],
    parts: [
      // ── 底柜 ──
      cbox(3, [1.42, 0.06, 0.47], [0, 0, -0.015]),
      cbox(0, [1.5, 0.74, 0.52], [0, 0.06, -0.015]),
      cbox(1, [0.7, 0.62, 0.02], [-0.375, 0.14, 0.255]),
      cbox(1, [0.7, 0.62, 0.02], [0.375, 0.14, 0.255]),
      cbox(2, [0.025, 0.3, 0.01], [-0.055, 0.3, 0.27]),
      cbox(2, [0.025, 0.3, 0.01], [0.055, 0.3, 0.27]),
      cbox(4, [1.5, 0.03, 0.55], [0, 0.8, 0]),
      // ── 缸体 ──
      cbox(6, [1.46, 0.03, 0.03], [0, 0.83, 0.24], { fullOnly: true }),
      cbox(6, [1.46, 0.03, 0.03], [0, 0.83, -0.24], { fullOnly: true }),
      cbox(6, [0.03, 0.03, 0.45], [-0.715, 0.83, 0], { fullOnly: true }),
      cbox(6, [0.03, 0.03, 0.45], [0.715, 0.83, 0], { fullOnly: true }),
      // 四根角柱：把玻璃的四条竖边包住，缸口因此有一圈黑框（实物上就是这圈框最显眼）。
      cbox(6, [0.03, 0.44, 0.03], [-0.715, 0.86, 0.24]),
      cbox(6, [0.03, 0.44, 0.03], [0.715, 0.86, 0.24]),
      cbox(6, [0.03, 0.44, 0.03], [-0.715, 0.86, -0.24]),
      cbox(6, [0.03, 0.44, 0.03], [0.715, 0.86, -0.24]),
      // 上口框：角柱顶端收口，也就是缸口那一圈。
      cbox(6, [1.46, 0.03, 0.03], [0, 1.27, 0.24]),
      cbox(6, [1.46, 0.03, 0.03], [0, 1.27, -0.24]),
      cbox(6, [0.03, 0.03, 0.45], [-0.715, 1.27, 0]),
      cbox(6, [0.03, 0.03, 0.45], [0.715, 1.27, 0]),
      // 四面玻璃：前后两片通长、左右两片夹在它们之间（端头埋进角柱里，不露切口）。
      cbox(5, [1.452, 0.406, 0.012], [0, 0.862, 0.2465]),
      cbox(5, [1.452, 0.406, 0.012], [0, 0.862, -0.2465]),
      cbox(5, [0.012, 0.406, 0.486], [-0.718, 0.862, 0]),
      cbox(5, [0.012, 0.406, 0.486], [0.718, 0.862, 0]),
      cbox(7, [1.42, 0.406, 0.008], [0, 0.862, -0.23]),
      // ── 缸盖：顶板 + 四面裙板，底下留一条缝让灯光漏出来 ──
      cbox(0, [1.5, 0.02, 0.55], [0, 1.38, 0]),
      cbox(0, [1.5, 0.06, 0.02], [0, 1.32, 0.265]),
      cbox(0, [1.5, 0.06, 0.02], [0, 1.32, -0.265]),
      cbox(0, [0.02, 0.06, 0.51], [-0.74, 1.32, 0]),
      cbox(0, [0.02, 0.06, 0.51], [0.74, 1.32, 0]),
      cbox(8, [1.34, 0.014, 0.42], [0, 1.324, 0], { fullOnly: true })
    ]
  },

  // ── 窗帘三段 ──
  curtain_left: curtainSpec("left"),
  curtain_right: curtainSpec("right"),
  curtain_split: curtainSpec("split"),

  // ── 空气净化与风口 ───────────────────────────────────────────────────────
  airpurifier: {
    note: "立式空气净化器：圆柱塔身 + 前下方进风格栅 + 顶盖（出风格栅与顶珠）+ 前上显示区 + 空气质量灯带 + 底座。",
    size: [0.34, 0.7, 0.34],
    slots: [
      { role: "body", color: 0xfafaf8, roughness: 0.48, metalness: 0.06 },
      { role: "base", color: 0x3c3f44, roughness: 0.5, metalness: 0.14 },
      { role: "grating", color: 0x9aa1a8, roughness: 0.32, metalness: 0.3 },
      { role: "trim", color: 0xb4babf, roughness: 0.3, metalness: 0.4 },
      { role: "screen", color: 0x15171a, roughness: 0.2, metalness: 0.1 },
      { role: "lit", color: 0x5fd08a, roughness: 0.3, metalness: 0 }
    ],
    parts: [
      // 塔身径 0.34 定下宽与深。进风格栅与灯带是贴在圆柱面上的平板 —— 板的两侧会自然越出
      ccyl(1, 0.16, 0.03, 28, [0, 0, 0]),
      ccyl(0, 0.17, 0.6, 28, [0, 0.03, 0]),
      croundedBox(2, [0.14, 0.24, 0.02], [0, 0.1, 0.16], { radius: 0.01 }),
      ccyl(3, 0.165, 0.04, 28, [0, 0.63, 0]),
      ccyl(2, 0.12, 0.02, 24, [0, 0.67, 0]),
      ccyl(3, 0.06, 0.01, 16, [0, 0.69, 0]),
      cbox(4, [0.1, 0.04, 0.012], [0, 0.645, 0.164]),
      cbox(5, [0.02, 0.22, 0.012], [0.085, 0.12, 0.155], { fullOnly: true })
    ]
  },
  airoutlet: {
    note: "线性出风口：壳体 + 上下边框与两端盖 + 中间三道百叶 + 背面静压箱接管（口长沿 Z、出风朝 +X）。",
    size: [0.188, 0.3, 2],
    slots: [
      { role: "body", color: 0xf2f1ed, roughness: 0.48, metalness: 0.08 },
      { role: "grating", color: 0x9aa1a8, roughness: 0.32, metalness: 0.3 },
      { role: "trim", color: 0xfafaf8, roughness: 0.44, metalness: 0.1 },
      { role: "metal", color: 0xb4babf, roughness: 0.3, metalness: 0.4 }
    ],
    parts: [
      // 这是一件「贴着墙/顶的长条风口」：宽 0.188 是进深、高 0.3 是面高、深 2.0 才是口长。
      croundedBox(0, [0.15, 0.26, 1.94], [-0.019, 0.02, 0], { radius: 0.012 }),
      // 接管原与壳体同背（都在 −0.094）：整件的 −x 极值由壳体撑住，接管是埋在壳体里的静压箱，
      cbox(3, [0.034, 0.16, 0.16], [-0.0755, 0.07, 0], { fullOnly: true }),
      cbox(2, [0.02, 0.03, 2], [0.084, 0.27, 0]),
      cbox(2, [0.02, 0.03, 2], [0.084, 0, 0]),
      cbox(2, [0.02, 0.24, 0.06], [0.084, 0.03, 0.97]),
      cbox(2, [0.02, 0.24, 0.06], [0.084, 0.03, -0.97]),
      cbox(1, [0.02, 0.028, 1.88], [0.078, 0.06, 0]),
      cbox(1, [0.02, 0.028, 1.88], [0.078, 0.13, 0]),
      cbox(1, [0.02, 0.028, 1.88], [0.078, 0.2, 0])
    ]
  },
  trashbin: {
    note: "智能垃圾桶：圆桶身 + 感应翻盖（盖顶与盖沿缝）+ 前感应窗 + 底圈。",
    size: [0.28, 0.45, 0.28],
    slots: [
      { role: "body", color: 0xfafaf8, roughness: 0.48, metalness: 0.06 },
      { role: "base", color: 0x9aa1a8, roughness: 0.44, metalness: 0.2 },
      { role: "trim", color: 0xb4babf, roughness: 0.3, metalness: 0.4 },
      { role: "door", color: 0x9aa1a8, roughness: 0.3, metalness: 0.32 },
      { role: "screen", color: 0x5fd08a, roughness: 0.2, metalness: 0 }
    ],
    parts: [
      // 桶身径 0.28 同时定下宽与深；翻盖比桶身小一圈，「盖沿缝」那圈金属正好夹在两者之间。
      ccyl(1, 0.13, 0.015, 24, [0, 0, 0]),
      ccyl(0, 0.14, 0.369, 28, [0, 0.015, 0]),
      ccyl(2, 0.138, 0.008, 28, [0, 0.384, 0]),
      ccyl(3, 0.135, 0.038, 28, [0, 0.392, 0]),
      ccyl(3, 0.12, 0.02, 28, [0, 0.43, 0]),
      cbox(4, [0.1, 0.014, 0.012], [0, 0.405, 0.133], { fullOnly: true })
    ]
  },

  pillar: pillarSpec("square"),
  pillar_round: pillarSpec("round"),
  pillar_semicircle: pillarSpec("semicircle"),
  pillar_quarter: pillarSpec("quarter"),
  pillar_quarterinner: pillarSpec("quarterinner"),
  stairs: {
    note: "直行楼梯：10 级实心踏步（混凝土 / 木作包板）+ 踏面板 + 防滑条 + 两侧斜裙板。",
    size: [1, 1.65, 2.8],
    slots: [
      { role: "body", color: 0xd9d4cb, roughness: 0.86, metalness: 0 },
      { role: "top", color: 0xb08a5e, roughness: 0.62, metalness: 0.02 },
      { role: "trim", color: 0x8a6a45, roughness: 0.7, metalness: 0.04 },
      { role: "panel", color: 0xc7c1b7, roughness: 0.78, metalness: 0 }
    ],
    parts: (() => {
      // 直行楼梯的参数化：10 级、踏面进深 0.28、踢面 0.165，**从 +z 端往 -z 端升**
      const stairRiserCount = 10;
      const stairTreadDepth = 2.8 / stairRiserCount;
      const stairRise = 1.65 / stairRiserCount;
      const stairTreadThickness = 0.03;
      const stairBodyWidth = 0.976;
      const stairParts = [];
      for (let stairStep = 0; stairStep < stairRiserCount; stairStep += 1) {
        const stairStepFrontZ = 1.4 - stairStep * stairTreadDepth;
        const stairStepCenterZ = stairStepFrontZ - stairTreadDepth / 2;
        const stairStepTopY = stairRise * (stairStep + 1);
        const stairBodyHeight = stairStepTopY - stairTreadThickness;
        // 踏步实体：从地面砌到踏面板下沿，逐级升高。这层是「实心楼梯」，能把踏步下面的
        stairParts.push(
          cbox(0, [stairBodyWidth, stairBodyHeight, stairTreadDepth], [
            0,
            0,
            stairStepCenterZ
          ])
        );
        const stairIsBottomStep = stairStep === 0;
        const stairNosingOverhang = stairIsBottomStep ? 0 : 0.005;
        stairParts.push(
          cbox(
            1,
            [stairBodyWidth, stairTreadThickness, stairTreadDepth + stairNosingOverhang],
            [0, stairBodyHeight, stairStepCenterZ + stairNosingOverhang / 2]
          )
        );
        // 防滑条：压在踏面前缘往里 3cm 处的一条窄带，顶面比踏面低 1mm（做成一道凹槽而不是
        stairParts.push(
          cbox(
            2,
            [0.96, 0.008, 0.02],
            [0, stairStepTopY - 0.009, stairStepFrontZ - 0.03],
            { fullOnly: true }
          )
        );
      }
      // 两侧斜裙板：贴着踏步两侧的一道斜板（实物就是封闭式楼梯那把「斜梁」）。
      const stairSlopeDegrees = (Math.atan2(1.65, 2.8) * 180) / Math.PI;
      // 裙板的竖直范围：包住 0.028 → 1.621（斜板长 2.9、截面高 0.14 时的实测外框）。
      stairParts.push(
        ...mirrorPair(
          cbox(3, [0.022, 0.14, 2.9], [0.489, 0.028, 0], {
            centered: true,
            rot: [stairSlopeDegrees, 0, 0]
          })
        )
      );
      return stairParts;
    })()
  },
  // 钢楼梯 / 玻璃楼梯：U 形双跑 + 中间平台。两件共用同一套跑位计算（见 uStairLayout），
  steelstairs: {
    note: "钢楼梯（U 形双跑）：钢斜梁 + 20 级木踏板 + 中间钢平台。",
    size: [1.86, 3.45, 2.93],
    slots: [
      { role: "metal", color: 0x6a737d, roughness: 0.42, metalness: 0.45 },
      { role: "top", color: 0xb08a5e, roughness: 0.62, metalness: 0.03 },
      { role: "trim", color: 0x3a4046, roughness: 0.5, metalness: 0.32 }
    ],
    parts: uStairParts({
      layout: uStairLayout({ size: [1.86, 3.45, 2.93], flightWidth: 0.9, stringerHeight: 0.2 }),
      treadSlot: 1,
      treadThickness: 0.03,
      structureSlot: 0,
      nosingSlot: 2,
      treadInset: 0,
      landingPlateThickness: 0.05
    })
  },
  glassstairs: {
    note: "玻璃楼梯（U 形双跑）：钢斜梁 + 20 级玻璃踏板 + 玻璃平台板。",
    size: [2.51, 3.41, 2.84],
    slots: [
      { role: "metal", color: 0x8b939c, roughness: 0.38, metalness: 0.5 },
      { role: "glass", color: 0x9fc4d2, roughness: 0.12, metalness: 0.04 },
      { role: "trim", color: 0x6a737d, roughness: 0.44, metalness: 0.42 }
    ],
    parts: uStairParts({
      layout: uStairLayout({ size: [2.51, 3.41, 2.84], flightWidth: 1.225, stringerHeight: 0.18 }),
      treadSlot: 1,
      treadThickness: 0.024,
      structureSlot: 0,
      nosingSlot: 2,
      // 玻璃踏板比梯段窄 10cm，两侧各留 5cm 让钢包边夹住玻璃的边角（裸边是玻璃最脆的地方）。
      treadInset: 0.1,
      landingPlateThickness: 0.024,
      landingInset: 0.06
    })
  },
  // 悬空楼梯（1 字型直跑）：10 级**只有踏步、没有斜梁也没有立柱**的悬挑梯 —— 实物的支承藏在
  floatingstairs: {
    note: "悬空楼梯（1 字型直跑）：10 级实木悬挑踏步 + 前缘防滑凹槽；无斜梁、无立柱。",
    size: [0.97254264, 2.59010673, 2.2483418],
    slots: [
      { role: "top", color: 0xb08a5e, roughness: 0.62, metalness: 0.02 },
      { role: "trim", color: 0x8a6a45, roughness: 0.7, metalness: 0.04 }
    ],
    parts: (() => {
      const floatingStairRiserCount = 10;
      // 踏板做厚（9cm）而不是像 stairs 那样 3cm：悬挑踏步的断面本身就是它的全部结构，
      const floatingStairTreadThickness = 0.09;
      const floatingStairGoing = 2.2483418 / floatingStairRiserCount;
      const floatingStairRise =
        (2.59010673 - floatingStairTreadThickness) / (floatingStairRiserCount - 1);
      const floatingStairTreadWidth = 0.97254264;
      const floatingStairParts = [];
      for (
        let floatingStairStep = 0;
        floatingStairStep < floatingStairRiserCount;
        floatingStairStep += 1
      ) {
        // 沿 -z 方向逐级抬升：第一级贴在 +z 端（起步端），顶级落在 -z 端 —— 与上面 stairs 的
        const floatingStairTreadTopY =
          floatingStairTreadThickness + floatingStairStep * floatingStairRise;
        const floatingStairTreadCenterZ =
          2.2483418 / 2 - floatingStairGoing * (floatingStairStep + 0.5);
        // 每级一块**独立**的踏板，彼此之间没有任何东西相连 —— 这正是「悬空」的画法。
        floatingStairParts.push(
          cbox(0, [floatingStairTreadWidth, floatingStairTreadThickness, floatingStairGoing], [
            0,
            floatingStairTreadTopY - floatingStairTreadThickness,
            floatingStairTreadCenterZ
          ])
        );
        // 前缘防滑凹槽：压在踏面前缘往里 3cm 处，整条嵌在踏板体内（顶面比踏面低 5mm、两侧各
        floatingStairParts.push(
          cbox(
            1,
            [0.96, 0.008, 0.02],
            [
              0,
              floatingStairTreadTopY - 0.013,
              floatingStairTreadCenterZ + floatingStairGoing / 2 - 0.03
            ],
            { fullOnly: true }
          )
        );
      }
      return floatingStairParts;
    })()
  },
  // 家用电梯的轿厢。旧资产是厘米单位、原点漂着、材质名是一串 `[Color_003]`，运行侧只能靠
  elevator: {
    note: "家用电梯轿厢：地板 + 三面壁板 + 顶板顶灯 + 双开轿门与门楣 + 门槛扶手 + 操作面板。",
    size: [1.4, 2.2, 1.52],
    slots: [
      { role: "panel", color: 0xd6d9dd, roughness: 0.62, metalness: 0.06 },
      { role: "door", color: 0xb4bcc4, roughness: 0.28, metalness: 0.44 },
      { role: "metal", color: 0x8b939b, roughness: 0.34, metalness: 0.5 },
      { role: "base", color: 0x4a4e54, roughness: 0.5, metalness: 0.06 },
      { role: "screen", color: 0x2c3136, roughness: 0.22, metalness: 0.12 },
      { role: "lit", color: 0xfff4e2, roughness: 0.34, metalness: 0 }
    ],
    parts: [
      // 地板：占一整块，同时定下整件的宽（±0.70）与深（±0.76）。
      cbox(3, [1.4, 0.06, 1.52], [0, 0, 0]),
      // 两侧壁板：压在占地左右两条边上（x 0.65 ~ 0.70），顶面 2.20 就是整件高度。
      ...mirrorPair(cbox(0, [0.05, 2.14, 1.52], [0.675, 0.06, 0])),
      // 后壁板：贴 -z 边，宽度只在两侧壁板之间（±0.65）。
      cbox(0, [1.3, 2.14, 0.05], [0, 0.06, -0.735]),
      // 门楣：门洞上沿 2.10 到顶板下沿 2.16 之间的那条横板。
      cbox(0, [1.3, 0.06, 0.05], [0, 2.1, 0.735]),
      // 顶板：夹在两侧壁板之间，压到 2.20。
      cbox(0, [1.3, 0.04, 1.52], [0, 2.16, 0]),
      // 顶灯：从顶板底面凸出 1.5cm 的一块灯板 —— 凹进顶板里就看不见了（顶板没有开孔）。
      cbox(5, [0.92, 0.02, 1.0], [0, 2.145, 0]),
      // 双开轿门：门洞 ±0.65 里两扇各 0.645 宽，中间留 1cm 的缝（缝里透出的是轿内，
      ...mirrorPair(cbox(1, [0.645, 2.02, 0.05], [0.3275, 0.08, 0.735])),
      // 门槛：门下那条金属条。
      cbox(2, [1.3, 0.02, 0.08], [0, 0.06, 0.72]),
      // 轿内扶手：贴后壁的一条横杆 + 两个托座（近看才成立，lite 版丢掉）。
      cbox(2, [1.2, 0.04, 0.04], [0, 0.95, -0.69], { fullOnly: true }),
      ...mirrorPair(cbox(2, [0.05, 0.05, 0.08], [0.45, 0.9, -0.68], { fullOnly: true })),
      // 操作面板：装在右侧壁板内面（向轿内凸 1.5cm），三个楼层按钮再凸出一点。
      cbox(4, [0.02, 0.34, 0.12], [0.645, 0.95, 0.6]),
      ...[1.05, 1.12, 1.19].map(elevatorButtonY =>
        cbox(2, [0.024, 0.024, 0.024], [0.632, elevatorButtonY, 0.6], { fullOnly: true })
      )
    ]
  },
  // 小汽车**不在这张表里**：2026-09-26 起它换回上游第三方车模（贴图集 + lite 走 Draco），
});

/** 规格键 → 文件基名。多数同名，留这张表是为了将来出现「类型名 ≠ 文件基名」时有地方写。 */
export const MODEL_FILE_KEY_BY_SPEC = Object.freeze({
  ...Object.fromEntries(Object.keys(MODEL_SPECS).map(specKey => [specKey, specKey])),
  // 异形柱与楼梯的**类型名 ≠ 文件基名**：类型名（物件类型）用下划线，磁盘上的文件是短横线
  pillar_round: "pillar-round",
  pillar_semicircle: "pillar-semicircle",
  pillar_quarter: "pillar-quarter",
  pillar_quarterinner: "pillar-quarterinner",
  // 小汽车的 `smallcar → car` 曾在这里：它现在不是流水线产物（见上），磁盘上的
  steelstairs: "steel-stairs",
  glassstairs: "glass-stairs",
  floatingstairs: "floating-stairs"
});

export const MODEL_DIR_BY_SPEC = Object.freeze({
  sofa: "furniture",
  bed: "furniture",
  chair: "furniture",
  cabinet: "furniture",
  coffeetable: "furniture",
  armchair: "furniture",
  loungechair: "furniture",
  ottoman: "furniture",
  bench: "furniture",
  barstool: "furniture",
  sidetable: "furniture",
  console: "furniture",
  chestdrawer: "furniture",
  entrycabinet: "furniture",
  displaycabinet: "furniture",
  bunkbed: "furniture",
  kidsbed: "furniture",
  // 柜类第二批：既有二进制资产迁进流水线（8 件，见 MODEL_SPECS 里那一段说明）。
  nightstand: "furniture",
  tvstand: "furniture",
  bookcase: "furniture",
  glasscabinet: "furniture",
  shelf: "furniture",
  wallcabinet: "furniture",
  shoecabinet: "furniture",
  vanity: "furniture",
  // 桌案第三批：餐桌组合 / 圆餐桌 / 圆餐桌带转盘 / 书桌 / 吧台 / 方茶几（6 件）。
  table: "furniture",
  rounddiningtable: "furniture",
  rounddiningtable_turntable: "furniture",
  desk: "furniture",
  bar: "furniture",
  squarecoffeetable: "furniture",
  soundbar: "electronics",
  speaker: "electronics",
  projector: "electronics",
  tv_standard: "electronics",
  tv_tabletop: "electronics",
  tv_mobile: "electronics",
  fan: "appliance",
  humidifier: "appliance",
  dehumidifier: "appliance",
  freshair: "appliance",
  thermostat: "electronics",
  smartpanel: "electronics",
  smartlock: "electronics",
  doorbell: "electronics",
  gateway: "electronics",
  chaise: "furniture",
  nestingtable: "furniture",
  roundcoffeetable: "furniture",
  screenspan: "furniture",
  coatrail: "furniture",
  stool: "furniture",
  locker: "furniture",
  laundrycabinet: "furniture",
  balconycabinet: "furniture",
  winecabinet: "furniture",
  kitchenisland: "furniture",
  pantry: "furniture",
  // 厨房地柜三件（第四批）：既有二进制资产迁进流水线。
  kitchenbase: "furniture",
  kitchensink: "furniture",
  kitchencooktop: "furniture",
  // 钢琴（第五批）：第三方素材迁进流水线。
  piano: "furniture",
  sideboard: "furniture",
  daybed: "furniture",
  cot: "furniture",
  computertable: "furniture",
  officestool: "furniture",
  filecabinet: "furniture",
  booktower: "furniture",
  gameconsole: "electronics",
  avreceiver: "electronics",
  screenpanel: "electronics",
  smartspeaker: "electronics",
  router: "electronics",
  printer: "electronics",
  desktop: "electronics",
  laptop: "electronics",
  nas: "electronics",
  floorlamp: "decor",
  walllamp: "decor",
  rug: "decor",
  plant: "decor",
  aquarium: "decor",
  curtain_left: "decor",
  curtain_right: "decor",
  curtain_split: "decor",
  basin: "bath",
  toilet: "bath",
  squattoilet: "bath",
  urinal: "bath",
  bathtub: "bath",
  shower: "bath",
  glasspartition: "bath",
  pipelinewaterpurifier: "appliance",
  tea_bar_machine: "appliance",
  ceilingfan: "appliance",
  heater: "appliance",
  ceilingac: "appliance",
  wallac: "appliance",
  floorac: "appliance",
  fan: "appliance",
  humidifier: "appliance",
  dehumidifier: "appliance",
  vacuumcleaner: "appliance",
  floorwasher: "appliance",
  dryingrack: "appliance",
  robotvacuum: "appliance",
  garmentcare: "appliance",
  storagewaterheater: "appliance",
  gaswaterheater: "appliance",
  airer: "appliance",
  integratedstove: "appliance",
  sterilizer: "appliance",
  oven: "appliance",
  steamoven: "appliance",
  microwave: "appliance",
  rangehood: "appliance",
  fridge: "appliance",
  freezer: "appliance",
  washer: "appliance",
  dryer: "appliance",
  dishwasher: "appliance",
  coffeemaker: "appliance",
  kettle: "appliance",
  airfryer: "appliance",
  blender: "appliance",
  waterpurifier: "appliance",
  trashbin: "appliance",
  ricecooker: "appliance",
  airpurifier: "appliance",
  airoutlet: "appliance",
  // 结构构件（第六批）：既有二进制资产迁进流水线 —— 柱族五件 + 楼梯三件 + 电梯。
  pillar: "structure",
  pillar_round: "structure",
  pillar_semicircle: "structure",
  pillar_quarter: "structure",
  pillar_quarterinner: "structure",
  stairs: "structure",
  steelstairs: "structure",
  glassstairs: "structure",
  floatingstairs: "structure",
  elevator: "structure",
  // 小汽车（vehicle）不在这里：它不是流水线产物，磁盘位置由注册表的 smallcar 条目给出
  glassstairs: "structure"
});
