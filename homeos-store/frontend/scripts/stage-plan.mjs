#!/usr/bin/env node
/**
 * 生成商店首屏「3D 舞台」里的等距户型示意图。
 *
 * 为什么用脚本画而不是手写 SVG：墙体、门洞、家具、设备点必须在同一套平面坐标里推导，
 * 手写路径时门开在哪一侧、设备落在哪个房间很容易和户型对不上。这里只维护一份平面数据
 * （单位米），投影、遮挡顺序、设备百分比坐标都由脚本算出来。
 *
 * 相机是标准等距：sx = (x - y) * cos30，sy = (x + y) * sin30 - z。
 * 墙统一切到 0.62m 高——墙越高，身后被挡住的地面越多（0.62m 会挡住约 1.24m 进深），
 * 小房间就只剩一条缝了。
 *
 * 用法：node homeos-store/frontend/scripts/stage-plan.mjs
 * 产物：homeos-store/frontend/public/static/media/stage-plan.svg
 *      终端同时打印设备锚点的百分比坐标，贴回 content/home.ts 的 STAGE.anchors。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_SVG = path.resolve(HERE, "../public/static/media/stage-plan.svg");

// ---------------------------------------------------------------- 平面尺寸（米）

const FW = 14; // 东西向
const FD = 9; // 南北向（y 越大越靠近观察者）
const WALL_H = 0.62;
const WALL_T = 0.17;

// ---------------------------------------------------------------- 投影

const K = Math.sqrt(3) / 2;
const S = 0.5;
const SCALE = 29; // 1 米 = 29 个画面单位
const PAD = 12;

const bounds = (() => {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of [
    [0, 0],
    [FW, 0],
    [FW, FD],
    [0, FD],
  ]) {
    for (const z of [0, WALL_H]) {
      const sx = (x - y) * K;
      const sy = (x + y) * S - z;
      minX = Math.min(minX, sx);
      maxX = Math.max(maxX, sx);
      minY = Math.min(minY, sy);
      maxY = Math.max(maxY, sy);
    }
  }
  return { minX, maxX, minY, maxY };
})();

const VBW = Math.round((bounds.maxX - bounds.minX) * SCALE + PAD * 2);
const VBH = Math.round((bounds.maxY - bounds.minY) * SCALE + PAD * 2);

/** 平面坐标 → 画面坐标。 */
function pt(x, y, z = 0) {
  return [
    ((x - y) * K - bounds.minX) * SCALE + PAD,
    ((x + y) * S - z - bounds.minY) * SCALE + PAD,
  ];
}

const px = (x, y, z = 0) => pt(x, y, z).map((n) => n.toFixed(2)).join(",");
const mid = (a, b) => (a + b) / 2;

// ---------------------------------------------------------------- 材质

const MAT = {
  // 顶面最亮、+y 面次之、+x 面最暗：一束从左上来打的光。
  // 墙面用竖直渐变而不是纯色，墙脚自然压暗，看起来才有体积。
  wall: { top: "#f8f4ec", y: "url(#wallY)", x: "url(#wallX)", edge: "rgba(28,36,48,.26)" },
  wood: { top: "#c79e74", y: "#ad8760", x: "#92704b", edge: "rgba(32,24,15,.32)" },
  woodDeep: { top: "#b28760", y: "#98704c", x: "#7e5b3b", edge: "rgba(32,24,15,.32)" },
  fabric: { top: "#a6b5c4", y: "#8e9eaf", x: "#76879a", edge: "rgba(24,32,44,.26)" },
  linen: { top: "#f1f2f3", y: "#dcdfe2", x: "#c5cacf", edge: "rgba(24,32,44,.22)" },
  dark: { top: "#333d4b", y: "#28313d", x: "#1e2530", edge: "rgba(10,14,20,.45)" },
  metal: { top: "#c2c9d1", y: "#a8b0b9", x: "#8d959f", edge: "rgba(24,32,44,.26)" },
  pot: { top: "#cf9a78", y: "#b47f5f", x: "#98684b", edge: "rgba(32,24,16,.32)" },
  stone: { top: "#dfe2e4", y: "#c9ced2", x: "#b0b6bb", edge: "rgba(24,32,44,.24)" },
  rug: { top: "#b9c3c9", y: "#b9c3c9", x: "#b9c3c9", edge: "rgba(24,32,44,.16)" },
};

const GLASS_FILL = "rgba(176,214,228,.34)";
const GLASS_EDGE = "rgba(226,244,250,.7)";
const GLASS = { top: GLASS_FILL, y: GLASS_FILL, x: GLASS_FILL, edge: GLASS_EDGE };

// ---------------------------------------------------------------- SVG 片段

/** 顶面/地板这类平贴在地面上的阴影与贴图，先攒起来，最后统一模糊。 */
const floorMarks = [];
/** 门弧这类要清晰的地面细线，紧跟地板绘制，不参与模糊。 */
const floorLines = [];

function polygon(points, fill, opts = {}) {
  const stroke = opts.stroke
    ? ` stroke="${opts.stroke}" stroke-width="${opts.sw ?? 1}" stroke-linejoin="round"`
    : "";
  return `<polygon points="${points.join(" ")}" fill="${fill}"${stroke}${opts.extra ?? ""}/>`;
}

/** 立方体：只画观察者看得到的三个面（+x、+y、顶面）。opts.rim 给顶面补一条受光边。 */
function cube(x0, x1, y0, y1, z0, z1, mat, opts = {}) {
  const parts = [
    polygon([px(x1, y0, z0), px(x1, y1, z0), px(x1, y1, z1), px(x1, y0, z1)], mat.x, {
      stroke: mat.edge,
      sw: 0.9,
    }),
    polygon([px(x0, y1, z0), px(x1, y1, z0), px(x1, y1, z1), px(x0, y1, z1)], mat.y, {
      stroke: mat.edge,
      sw: 0.9,
    }),
    polygon([px(x0, y0, z1), px(x1, y0, z1), px(x1, y1, z1), px(x0, y1, z1)], mat.top, {
      stroke: mat.edge,
      sw: 0.9,
    }),
  ];
  if (opts.rim) {
    parts.push(
      polygon([px(x0, y0, z1), px(x1, y0, z1), px(x1, y1, z1), px(x0, y1, z1)], "none", {
        stroke: opts.rim,
        sw: opts.rimW ?? 0.8,
      }),
    );
  }
  return parts.join("");
}

/** 地面上的水平面片。 */
function plane(x0, x1, y0, y1, z, fill, extra = "") {
  return polygon([px(x0, y0, z), px(x1, y0, z), px(x1, y1, z), px(x0, y1, z)], fill, {
    extra,
  });
}

// ---------------------------------------------------------------- 深度排序

const volumes = [];

/** key 越大越靠近观察者，后画即盖住前面的。墙会切块，避免整段墙用中点排序时压住前排家具。 */
function vol(key, svg) {
  volumes.push({ key, svg });
}

// ---------------------------------------------------------------- 地板

const ROOMS = [
  { label: "餐厅", at: [1.62, 3.02], x: [0, 3.6], y: [0, 3.6], floor: "wood" },
  { label: "厨房", at: [4.95, 1.48], x: [3.6, 7.0], y: [0, 3.6], floor: "tile" },
  { label: "卫生间", at: [7.62, 1.34], x: [7.0, 9.2], y: [0, 3.0], floor: "tile" },
  { label: "次卧", at: [11.34, 3.02], x: [9.2, 14], y: [0, 4.6], floor: "wood2" },
  { label: "主卧", at: [11.72, 7.62], x: [9.2, 14], y: [4.6, 9.0], floor: "wood2" },
  { label: "客厅", at: [4.62, 4.3], x: [0, 7.0], y: [3.6, 8.0], floor: "wood" },
  { label: "玄关", at: [7.74, 7.02], x: [7.0, 9.2], y: [3.0, 9.0], floor: "stone" },
  { label: "阳台", at: [3.42, 8.64], x: [0, 7.0], y: [8.0, 9.0], floor: "deck" },
];

const FLOOR = {
  wood: { a: "#d2b898", b: "#ccb191", line: "rgba(96,70,42,.16)" },
  wood2: { a: "#cdb294", b: "#c6aa8b", line: "rgba(96,70,42,.16)" },
  tile: { a: "#c3cbcf", b: "#bfc8cc", line: "rgba(40,56,70,.15)" },
  stone: { a: "#c7cbcd", b: "#c2c6c8", line: "rgba(40,56,70,.13)" },
  deck: { a: "#bfae95", b: "#b9a78d", line: "rgba(80,60,36,.18)" },
};

function floorOf(room) {
  const [x0, x1] = room.x;
  const [y0, y1] = room.y;
  const f = FLOOR[room.floor];
  const out = [];
  if (room.floor === "tile" || room.floor === "stone") {
    out.push(plane(x0, x1, y0, y1, 0.004, f.a));
    for (let x = x0 + 0.45; x < x1 - 0.01; x += 0.45) {
      out.push(polygon([px(x, y0, 0.006), px(x, y1, 0.006)], "none", { stroke: f.line, sw: 0.8 }));
    }
    for (let y = y0 + 0.45; y < y1 - 0.01; y += 0.45) {
      out.push(polygon([px(x0, y, 0.006), px(x1, y, 0.006)], "none", { stroke: f.line, sw: 0.8 }));
    }
    return out.join("");
  }
  const step = 0.42;
  let i = 0;
  for (let y = y0; y < y1 - 0.001; y += step, i += 1) {
    out.push(plane(x0, x1, y, Math.min(y + step, y1), 0.004, i % 2 ? f.b : f.a));
  }
  return out.join("");
}

// ---------------------------------------------------------------- 墙

/**
 * dir='x'：墙沿 x 走向，at 是 y；dir='y'：墙沿 y 走向，at 是 x。
 * open 里的 a/b 是沿墙方向的位置；kind：door / window / slider / railing / entry / open。
 */
const WALLS = [
  {
    dir: "x",
    at: 0,
    from: 0,
    to: 14,
    open: [
      { a: 0.95, b: 2.75, kind: "window" },
      { a: 4.35, b: 6.45, kind: "window" },
      { a: 7.55, b: 8.85, kind: "window" },
      { a: 10.05, b: 12.55, kind: "window" },
    ],
  },
  {
    dir: "y",
    at: 0,
    from: 0,
    to: 9,
    open: [
      { a: 1.05, b: 2.55, kind: "window" },
      { a: 4.5, b: 5.7, kind: "window" },
    ],
  },
  { dir: "y", at: 3.6, from: 0, to: 3.6, open: [{ a: 2.45, b: 3.3, kind: "door", hinge: "b", into: -1 }] },
  { dir: "x", at: 3.6, from: 3.6, to: 7.0, open: [] },
  { dir: "y", at: 7.0, from: 0, to: 3.6, open: [] },
  { dir: "x", at: 3.0, from: 7.0, to: 9.2, open: [{ a: 8.15, b: 8.95, kind: "door", hinge: "a", into: -1 }] },
  { dir: "y", at: 7.0, from: 3.6, to: 8.0, open: [{ a: 6.55, b: 8.0, kind: "open" }] },
  { dir: "y", at: 7.0, from: 8.0, to: 9.0, open: [] },
  { dir: "y", at: 9.2, from: 0, to: 4.6, open: [{ a: 3.5, b: 4.3, kind: "door", hinge: "b", into: 1 }] },
  { dir: "y", at: 9.2, from: 4.6, to: 9.0, open: [{ a: 5.55, b: 6.35, kind: "door", hinge: "a", into: 1 }] },
  { dir: "x", at: 4.6, from: 9.2, to: 14, open: [] },
  { dir: "x", at: 8.0, from: 0, to: 7.0, open: [{ a: 0.55, b: 6.45, kind: "slider" }] },
  { dir: "x", at: 9.0, from: 0, to: 7.0, open: [{ a: 0.06, b: 6.94, kind: "railing" }] },
  { dir: "x", at: 9.0, from: 7.0, to: 14, open: [{ a: 7.5, b: 8.6, kind: "entry" }] },
  { dir: "y", at: 14, from: 0, to: 9, open: [{ a: 6.3, b: 7.7, kind: "window" }] },
];

/** 把一段墙按洞口切成实体块；每块再切成 ≤1.1m 的小段参与排序。 */
function emitWall(wall) {
  const segs = [];
  let cursor = wall.from;
  for (const o of [...wall.open].sort((p, q) => p.a - q.a)) {
    if (o.a > cursor + 0.001) segs.push({ a: cursor, b: o.a, kind: "solid" });
    segs.push({ ...o });
    cursor = Math.max(cursor, o.b);
  }
  if (cursor < wall.to - 0.001) segs.push({ a: cursor, b: wall.to, kind: "solid" });

  for (const seg of segs) {
    if (seg.kind === "solid") {
      const chunks = Math.max(1, Math.ceil((seg.b - seg.a) / 1.1));
      const step = (seg.b - seg.a) / chunks;
      for (let i = 0; i < chunks; i += 1) {
        addWallBox(wall, seg.a + step * i, seg.a + step * (i + 1), 0, WALL_H, MAT.wall);
      }
      continue;
    }
    if (seg.kind === "window") {
      addWallBox(wall, seg.a, seg.b, 0, 0.2, MAT.wall);
      addWallBox(wall, seg.a, seg.b, 0.54, WALL_H, MAT.wall);
      addGlassPanel(wall, seg.a, seg.b, 0.2, 0.54);
      continue;
    }
    if (seg.kind === "slider") {
      addWallBox(wall, seg.a, seg.b, 0, 0.045, MAT.wall);
      addWallBox(wall, seg.a, seg.b, WALL_H - 0.045, WALL_H, MAT.wall);
      addGlassPanel(wall, seg.a, seg.b, 0.045, WALL_H - 0.045);
      continue;
    }
    if (seg.kind === "railing") {
      addRailing(wall, seg.a, seg.b);
      continue;
    }
    if (seg.kind === "entry") {
      addEntryDoor(wall, seg);
      continue;
    }
    if (seg.kind === "door") {
      addDoorLeaf(wall, seg);
    }
  }
}

function addWallBox(wall, a, b, z0, z1, mat) {
  const key = (wall.dir === "x" ? mid(a, b) + wall.at : wall.at + mid(a, b)) + 0.004;
  const rim = z1 >= WALL_H - 0.001 ? "rgba(255,255,255,.78)" : undefined;
  const svg =
    wall.dir === "x"
      ? cube(a, b, wall.at - WALL_T / 2, wall.at + WALL_T / 2, z0, z1, mat, { rim })
      : cube(wall.at - WALL_T / 2, wall.at + WALL_T / 2, a, b, z0, z1, mat, { rim });
  vol(key, svg);
}

function addGlassPanel(wall, a, b, z0, z1) {
  const base = wall.dir === "x" ? mid(a, b) + wall.at : wall.at + mid(a, b);
  const g = 0.02;
  const panel =
    wall.dir === "x"
      ? cube(a, b, wall.at - g, wall.at + g, z0, z1, GLASS)
      : cube(wall.at - g, wall.at + g, a, b, z0, z1, GLASS);
  // 窗光：先垫一层模糊的冷光，玻璃才有「外面有光进来」的感觉。
  vol(base - 0.05, `<g filter="url(#glow)" opacity=".5">${panel}</g>`);
  const mullions = Math.max(1, Math.round((b - a) / 0.85));
  const bars = [];
  for (let i = 1; i < mullions; i += 1) {
    const p = a + ((b - a) * i) / mullions;
    const points =
      wall.dir === "x"
        ? [px(p, wall.at - g, z0), px(p, wall.at - g, z1)]
        : [px(wall.at - g, p, z0), px(wall.at - g, p, z1)];
    bars.push(polygon(points, "none", { stroke: "rgba(232,246,250,.5)", sw: 0.9 }));
  }
  vol(base + 0.02, panel + bars.join(""));
}

function addRailing(wall, a, b) {
  const h = 0.56;
  const key = (wall.dir === "x" ? mid(a, b) + wall.at : wall.at + mid(a, b)) + 0.03;
  const g = 0.025;
  const panel =
    wall.dir === "x"
      ? cube(a, b, wall.at - g, wall.at + g, 0.03, h, GLASS)
      : cube(wall.at - g, wall.at + g, a, b, 0.03, h, GLASS);
  const rail =
    wall.dir === "x"
      ? cube(a, b, wall.at - g - 0.012, wall.at + g + 0.012, h, h + 0.035, MAT.metal)
      : cube(wall.at - g - 0.012, wall.at + g + 0.012, a, b, h, h + 0.035, MAT.metal);
  const posts = [];
  for (let p = a + 0.9; p < b - 0.3; p += 1.5) {
    posts.push(
      wall.dir === "x"
        ? cube(p, p + 0.05, wall.at - g, wall.at + g, 0.03, h, MAT.metal)
        : cube(wall.at - g, wall.at + g, p, p + 0.05, 0.03, h, MAT.metal),
    );
  }
  vol(key, panel + rail + posts.join(""));
}

/** 开着的门扇：铰在洞口一端、垂直于墙立着，一眼能看出门朝哪边开。 */
function addDoorLeaf(wall, seg) {
  const len = Math.min(seg.b - seg.a, 0.95);
  const into = seg.into ?? 1;
  const hinge = seg.hinge === "b" ? seg.b : seg.a;
  const s = seg.hinge === "b" ? -1 : 1;
  const thick = 0.055;
  if (wall.dir === "x") {
    const yAt = wall.at + (into > 0 ? WALL_T / 2 : -WALL_T / 2);
    const y0 = into > 0 ? yAt : yAt - len;
    const y1 = into > 0 ? yAt + len : yAt;
    const x0 = hinge + (s > 0 ? 0 : -thick);
    vol(x0 + thick + mid(y0, y1) + 0.05, cube(x0, x0 + thick, y0, y1, 0, WALL_H - 0.06, MAT.woodDeep));
    swingArc(hinge, wall.at, len, [s, 0], [0, into]);
    return;
  }
  const xAt = wall.at + (into > 0 ? WALL_T / 2 : -WALL_T / 2);
  const x0 = into > 0 ? xAt : xAt - len;
  const x1 = into > 0 ? xAt + len : xAt;
  const y0 = hinge + (s > 0 ? 0 : -thick);
  vol(mid(x0, x1) + y0 + thick + 0.05, cube(x0, x1, y0, y0 + thick, 0, WALL_H - 0.06, MAT.woodDeep));
  swingArc(wall.at, hinge, len, [0, s], [into, 0]);
}

/** 地面上的开门弧线：把门的开合范围画出来，比单画一扇门更清楚。 */
function swingArc(hx, hy, radius, u, v) {
  const steps = 18;
  const pts = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = (Math.PI / 2) * (i / steps);
    const x = hx + radius * (Math.cos(t) * u[0] + Math.sin(t) * v[0]);
    const y = hy + radius * (Math.cos(t) * u[1] + Math.sin(t) * v[1]);
    pts.push(px(x, y, 0.012));
  }
  floorLines.push(
    `<polyline points="${pts.join(" ")}" fill="none" stroke="rgba(38,52,68,.34)" stroke-width="0.9" stroke-dasharray="3 3"/>`,
  );
}

function addEntryDoor(wall, seg) {
  // 入户门：门槛一条浅色带 + 常闭的深色门扇，门锁点就落在上面。
  vol(mid(seg.a, seg.b) + wall.at + 0.06, cube(seg.a, seg.b, 8.9, 9.06, 0.005, 0.028, MAT.stone));
  const leaf = cube(seg.a, seg.b, 8.88, 8.96, 0.028, WALL_H - 0.02, MAT.woodDeep);
  vol(mid(seg.a, seg.b) + 8.92 + 0.08, leaf);
  // 门把手
  const [hx, hy] = pt(seg.b - 0.2, 8.9, 0.36);
  vol(mid(seg.a, seg.b) + 8.92 + 0.09, `<circle cx="${hx.toFixed(2)}" cy="${hy.toFixed(2)}" r="1.5" fill="#e8d8b6"/>`);
}

for (const wall of WALLS) emitWall(wall);

// ---------------------------------------------------------------- 家具

function shadowOf(x0, x1, y0, y1, z) {
  floorMarks.push(plane(x0 + 0.1, x1 + 0.1, y0 + 0.1, y1 + 0.1, z + 0.002, "rgba(12,18,26,.2)"));
}

function addBox(x0, x1, y0, y1, z0, z1, mat, opts = {}) {
  vol(mid(x0, x1) + mid(y0, y1), cube(x0, x1, y0, y1, z0, z1, mat));
  if (opts.shadow !== false && z0 <= 0.01) shadowOf(x0, x1, y0, y1, z0);
}

/** 桌/柜这类带细腿的家具，比整块盒子更像家具。 */
function addTable(x0, x1, y0, y1, h, mat, legMat = MAT.woodDeep) {
  const t = 0.06;
  const leg = 0.07;
  addBox(x0, x1, y0, y1, h - t, h, mat, { shadow: false });
  for (const [lx, ly] of [
    [x0 + 0.05, y0 + 0.05],
    [x1 - leg - 0.05, y0 + 0.05],
    [x0 + 0.05, y1 - leg - 0.05],
    [x1 - leg - 0.05, y1 - leg - 0.05],
  ]) {
    addBox(lx, lx + leg, ly, ly + leg, 0, h - t, legMat);
  }
  shadowOf(x0, x1, y0, y1, 0);
}

function addChair(x0, x1, y0, y1, backSide) {
  const leg = 0.04;
  addBox(x0, x1, y0, y1, 0.34, 0.4, MAT.fabric, { shadow: false });
  for (const [lx, ly] of [
    [x0 + 0.03, y0 + 0.03],
    [x1 - leg - 0.03, y0 + 0.03],
    [x0 + 0.03, y1 - leg - 0.03],
    [x1 - leg - 0.03, y1 - leg - 0.03],
  ]) {
    addBox(lx, lx + leg, ly, ly + leg, 0, 0.34, MAT.woodDeep, { shadow: false });
  }
  const b = 0.07;
  if (backSide === "y-") addBox(x0, x1, y0, y0 + b, 0.4, 0.86, MAT.fabric, { shadow: false });
  if (backSide === "y+") addBox(x0, x1, y1 - b, y1, 0.4, 0.86, MAT.fabric, { shadow: false });
  if (backSide === "x-") addBox(x0, x0 + b, y0, y1, 0.4, 0.86, MAT.fabric, { shadow: false });
  if (backSide === "x+") addBox(x1 - b, x1, y0, y1, 0.4, 0.86, MAT.fabric, { shadow: false });
  shadowOf(x0, x1, y0, y1, 0);
}

function addPlant(cx, cy, r, h) {  addBox(cx - r, cx + r, cy - r, cy + r, 0, 0.26, MAT.pot);
  const [sx, sy] = pt(cx, cy, h);
  const s = r * SCALE * 1.5;
  vol(
    cx + cy + 0.2,
    `<g filter="url(#soft3)">` +
      `<ellipse cx="${sx.toFixed(1)}" cy="${(sy - s * 0.44).toFixed(1)}" rx="${(s * 0.84).toFixed(1)}" ry="${(s * 0.6).toFixed(1)}" fill="#7f9c74"/>` +
      `<ellipse cx="${(sx - s * 0.36).toFixed(1)}" cy="${(sy - s * 0.14).toFixed(1)}" rx="${(s * 0.58).toFixed(1)}" ry="${(s * 0.44).toFixed(1)}" fill="#6f8d66"/>` +
      `<ellipse cx="${(sx + s * 0.4).toFixed(1)}" cy="${(sy - s * 0.2).toFixed(1)}" rx="${(s * 0.52).toFixed(1)}" ry="${(s * 0.4).toFixed(1)}" fill="#8aa67d"/>` +
      `</g>`,
  );
}

function addBed(x0, x1, y0, y1, head) {
  const bedH = 0.36;
  addBox(x0, x1, y0, y1, 0.08, bedH, MAT.woodDeep, { shadow: false });
  addBox(x0 + 0.05, x1 - 0.05, y0 + 0.05, y1 - 0.05, bedH, bedH + 0.1, MAT.linen, { shadow: false });
  if (head === "y-") {
    addBox(x0 + 0.05, x1 - 0.05, y0 + 0.06, y0 + 0.5, bedH + 0.1, bedH + 0.24, MAT.linen, { shadow: false });
    addBox(x0 + 0.06, x1 - 0.06, y0 + 0.72, y1 - 0.1, bedH + 0.1, bedH + 0.21, MAT.fabric, { shadow: false });
    addBox(x0, x1, y0 - 0.06, y0, 0, 0.92, MAT.woodDeep, { shadow: false });
  } else {
    addBox(x0 + 0.06, x0 + 0.5, y0 + 0.05, y1 - 0.05, bedH + 0.1, bedH + 0.24, MAT.linen, { shadow: false });
    addBox(x0 + 0.72, x1 - 0.1, y0 + 0.06, y1 - 0.06, bedH + 0.1, bedH + 0.21, MAT.fabric, { shadow: false });
    addBox(x0 - 0.06, x0, y0, y1, 0, 0.92, MAT.woodDeep, { shadow: false });
  }
  shadowOf(x0, x1, y0, y1, 0);
}

function addSofa(x0, x1, y0, y1, back) {
  const seat = 0.34;
  addBox(x0, x1, y0, y1, 0.06, seat, MAT.fabric, { shadow: false });
  if (back === "x+") addBox(x1 - 0.26, x1, y0, y1, 0, 0.8, MAT.fabric, { shadow: false });
  if (back === "x-") addBox(x0, x0 + 0.26, y0, y1, 0, 0.8, MAT.fabric, { shadow: false });
  if (back === "y+") addBox(x0, x1, y1 - 0.26, y1, 0, 0.8, MAT.fabric, { shadow: false });
  if (back === "y-") addBox(x0, x1, y0, y0 + 0.26, 0, 0.8, MAT.fabric, { shadow: false });
  addBox(x0, x1, y0, y0 + 0.16, 0.06, 0.56, MAT.fabric, { shadow: false });
  addBox(x0, x1, y1 - 0.16, y1, 0.06, 0.56, MAT.fabric, { shadow: false });
  if (back === "x+") {
    addBox(x0 + 0.05, x1 - 0.3, y0 + 0.22, mid(y0, y1) - 0.02, seat, seat + 0.11, MAT.linen, { shadow: false });
    addBox(x0 + 0.05, x1 - 0.3, mid(y0, y1) + 0.02, y1 - 0.22, seat, seat + 0.11, MAT.linen, { shadow: false });
  }
  shadowOf(x0, x1, y0, y1, 0);
}

/** 地面光斑：灯照下来的一片散光，用一个径向渐变椭圆近似。 */
function lightPool(cx, cy, r, id, opacity = 1) {
  const [sx, sy] = pt(cx, cy, 0.05);
  floorMarks.push(
    `<ellipse cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" rx="${(r * SCALE).toFixed(1)}" ry="${(
      r * SCALE * 0.58
    ).toFixed(1)}" fill="url(#${id})" opacity="${opacity}"/>`,
  );
}

/** 落地灯：细杆 + 灯罩 + 一小团暖光，补掉客厅角落的空。 */
function addFloorLamp(cx, cy) {
  addBox(cx - 0.03, cx + 0.03, cy - 0.03, cy + 0.03, 0, 1.16, MAT.metal, { shadow: false });
  addBox(cx - 0.16, cx + 0.16, cy - 0.16, cy + 0.16, 1.16, 1.34, MAT.linen, { shadow: false });
  const [sx, sy] = pt(cx, cy, 1.24);
  vol(cx + cy + 0.4, `<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="${(SCALE * 0.5).toFixed(
    1,
  )}" fill="url(#warmGlow)" opacity=".85"/>`);
}

/* ---- 餐厅 ---- */
addTable(1.2, 2.6, 1.3, 2.2, 0.74, MAT.wood);
addChair(1.34, 1.72, 0.86, 1.24, "y-");
addChair(2.08, 2.46, 0.86, 1.24, "y-");
addChair(1.34, 1.72, 2.26, 2.64, "y+");
addChair(2.08, 2.46, 2.26, 2.64, "y+");
addPlant(3.24, 0.5, 0.2, 0.5);
addPlant(0.42, 3.18, 0.22, 0.55);

/* ---- 厨房 ---- */
addBox(3.76, 6.84, 0.07, 0.66, 0, 0.86, MAT.stone, { shadow: false });
addBox(3.76, 6.84, 0.07, 0.66, 0.86, 0.9, MAT.linen, { shadow: false });
addBox(3.76, 4.36, 0.66, 2.2, 0, 0.86, MAT.stone, { shadow: false });
addBox(3.76, 4.36, 0.66, 2.2, 0.86, 0.9, MAT.linen, { shadow: false });
addBox(5.56, 6.16, 0.16, 0.55, 0.9, 0.925, MAT.metal, { shadow: false });
addBox(4.56, 5.16, 0.16, 0.55, 0.9, 0.925, MAT.dark, { shadow: false });
addBox(6.24, 6.84, 1.06, 1.72, 0, 1.3, MAT.linen);
addBox(6.22, 6.86, 1.02, 1.76, 1.3, 1.34, MAT.metal, { shadow: false });
shadowOf(3.76, 6.86, 0.07, 2.2, 0);
lightPool(5.2, 1.6, 1.3, "coolPool", 0.55);

/* ---- 卫生间 ---- */
addBox(7.1, 8.05, 0.1, 1.05, 0, 0.07, MAT.stone);
addGlassPanel({ dir: "y", at: 8.05 }, 0.1, 1.05, 0.07, 0.92);
addGlassPanel({ dir: "x", at: 1.05 }, 7.1, 8.05, 0.07, 0.92);
addBox(8.46, 8.94, 0.1, 0.3, 0, 0.72, MAT.linen, { shadow: false });
addBox(8.5, 8.9, 0.3, 0.72, 0, 0.4, MAT.linen, { shadow: false });
addBox(8.53, 8.87, 0.34, 0.68, 0.4, 0.44, MAT.stone, { shadow: false });
addTable(7.06, 7.5, 1.16, 1.72, 0.82, MAT.linen, MAT.metal);
addBox(7.16, 7.42, 1.26, 1.62, 0.82, 0.86, MAT.stone, { shadow: false });

/* ---- 次卧 ---- */
addBed(10.0, 11.5, 0.12, 2.18, "y-");
addBox(9.58, 9.96, 0.12, 0.52, 0, 0.48, MAT.wood);
addBox(11.54, 11.92, 0.12, 0.52, 0, 0.48, MAT.wood);
addBox(9.32, 9.92, 2.62, 4.02, 0, 1.02, MAT.wood);
addBox(9.3, 9.94, 2.6, 4.04, 1.02, 1.06, MAT.woodDeep, { shadow: false });
addPlant(13.28, 4.06, 0.2, 0.5);
lightPool(10.75, 1.5, 1.25, "warmPool", 0.7);

/* ---- 主卧 ---- */
addBed(9.36, 11.46, 5.62, 7.22, "x-");
addBox(9.36, 9.76, 4.98, 5.38, 0, 0.48, MAT.wood);
addBox(9.36, 9.76, 7.46, 7.86, 0, 0.48, MAT.wood);
addBox(11.7, 13.1, 4.76, 5.36, 0, 1.02, MAT.wood);
addBox(11.68, 13.12, 4.74, 5.38, 1.02, 1.06, MAT.woodDeep, { shadow: false });
addBox(11.64, 12.04, 6.06, 6.46, 0, 0.42, MAT.fabric);
addBox(9.34, 9.76, 8.3, 8.72, 0, 1.24, MAT.linen);
addBox(9.32, 9.78, 8.28, 8.74, 1.24, 1.28, MAT.metal, { shadow: false });
addPlant(13.3, 8.26, 0.2, 0.5);
lightPool(10.6, 6.5, 1.5, "warmPool", 0.75);

/* ---- 客厅 ---- */
addBox(0.86, 3.9, 4.5, 7.94, 0.004, 0.022, MAT.rug, { shadow: false });
floorMarks.push(
  plane(0.98, 3.78, 4.62, 7.82, 0.026, "none", ' stroke="rgba(255,255,255,.22)" stroke-width="0.9"'),
);
addBox(0.08, 0.56, 5.9, 7.44, 0, 0.42, MAT.wood);
addBox(0.08, 0.56, 5.88, 7.46, 0.42, 0.45, MAT.woodDeep, { shadow: false });
// 电视：机身 + 亮着的屏幕。屏幕朝 +x（对着沙发），所以只画得到这一个面。
addBox(0.12, 0.2, 6.16, 7.16, 0.5, 1.2, MAT.dark, { shadow: false });
const tvFace = polygon(
  [px(0.205, 6.22, 0.58), px(0.205, 7.1, 0.58), px(0.205, 7.1, 1.13), px(0.205, 6.22, 1.13)],
  "url(#screen)",
);
vol(0.205 + 6.66 + 0.6, `<g filter="url(#glow)" opacity=".55">${tvFace}</g>`);
vol(0.205 + 6.66 + 0.62, tvFace);
addSofa(2.46, 3.5, 5.1, 7.72, "x+");
addTable(1.26, 2.2, 5.72, 6.98, 0.34, MAT.wood);
addChair(4.42, 5.16, 6.72, 7.5, "x+");
addFloorLamp(4.06, 4.98);
addPlant(6.36, 4.22, 0.22, 0.58);
addPlant(0.42, 4.06, 0.2, 0.5);
lightPool(4.5, 5.42, 1.85, "warmPool", 0.9);
lightPool(0.95, 6.72, 1.25, "coolPool", 0.8);

/* ---- 玄关 ---- */
addBox(8.62, 9.06, 6.3, 7.5, 0, 0.92, MAT.wood);
addBox(8.6, 9.08, 6.28, 7.52, 0.92, 0.96, MAT.woodDeep, { shadow: false });
// 门口地垫：顺带把入户门的位置标出来
addBox(7.62, 8.46, 8.16, 8.82, 0.004, 0.018, MAT.dark, { shadow: false });
floorMarks.push(
  plane(7.66, 8.42, 8.2, 8.78, 0.022, "none", ' stroke="rgba(255,255,255,.16)" stroke-width="0.8"'),
);
lightPool(8.05, 7.9, 0.9, "warmPool", 0.55);

/* ---- 阳台 ---- */
addPlant(0.52, 8.42, 0.22, 0.6);
addPlant(6.44, 8.44, 0.22, 0.6);
addTable(3.0, 4.0, 8.28, 8.74, 0.4, MAT.wood);
addChair(2.34, 2.98, 8.26, 8.76, "x-");
addChair(4.02, 4.66, 8.26, 8.76, "x+");

// ---------------------------------------------------------------- 组装

volumes.sort((a, b) => a.key - b.key);

const labels = ROOMS.map((room) => {
  const [x, y] = pt(room.at[0], room.at[1], 0);
  return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" class="room">${room.label}</text>`;
}).join("");

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VBW} ${VBH}" width="${VBW}" height="${VBH}" role="img" aria-label="一层户型等距示意图">
  <defs>
    <linearGradient id="wallY" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fbf8f1"/>
      <stop offset="1" stop-color="#d8d2c7"/>
    </linearGradient>
    <linearGradient id="wallX" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#e2dcd1"/>
      <stop offset="1" stop-color="#b9b2a5"/>
    </linearGradient>
    <radialGradient id="halo" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#3f7fb0" stop-opacity=".42"/>
      <stop offset=".55" stop-color="#2a5c8c" stop-opacity=".16"/>
      <stop offset="1" stop-color="#1b3350" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="warmPool" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#ffd9a0" stop-opacity=".5"/>
      <stop offset=".55" stop-color="#ffca86" stop-opacity=".2"/>
      <stop offset="1" stop-color="#ffc078" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="coolPool" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#9fd8f0" stop-opacity=".42"/>
      <stop offset=".6" stop-color="#7fc6e4" stop-opacity=".14"/>
      <stop offset="1" stop-color="#6fb8d8" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="warmGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#ffe1b4" stop-opacity=".9"/>
      <stop offset="1" stop-color="#ffcf90" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="screen" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#8fd0ea" stop-opacity=".95"/>
      <stop offset=".6" stop-color="#4e8fc0" stop-opacity=".85"/>
      <stop offset="1" stop-color="#2c5f8e" stop-opacity=".8"/>
    </linearGradient>
    <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity=".12"/>
      <stop offset=".45" stop-color="#ffffff" stop-opacity=".02"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <filter id="soft" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="2.6"/>
    </filter>
    <filter id="soft3" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="0.7"/>
    </filter>
    <filter id="glow" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="4.5"/>
    </filter>
    <filter id="cast" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="13"/>
    </filter>
    <style>
      .room {
        font: 600 10.5px/1 "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, sans-serif;
        letter-spacing: .2em;
        text-anchor: middle;
        fill: rgba(34,44,56,.6);
        paint-order: stroke;
        stroke: rgba(255,255,255,.68);
        stroke-width: 2.6;
        stroke-linejoin: round;
      }
    </style>
  </defs>

  <!-- 背景透明：卡片自己的径向渐变透出来，图不会在卡片里留一块矩形色差。 -->
  <ellipse cx="${(VBW * 0.5).toFixed(0)}" cy="${(VBH * 0.52).toFixed(0)}" rx="${(
    VBW * 0.62
  ).toFixed(0)}" ry="${(VBH * 0.72).toFixed(0)}" fill="url(#halo)"/>

  <g filter="url(#cast)" opacity=".8">
    ${plane(-0.72, FW + 0.98, -0.56, FD + 0.72, -0.3, "#04070c")}
  </g>

  ${cube(-0.14, FW + 0.14, -0.14, FD + 0.14, -0.26, 0, {
    top: "#36445f",
    y: "#26314a",
    x: "#1a2331",
    edge: "rgba(8,12,18,.5)",
  })}
  <!-- 地台前缘的一道冷光，让整块户型从暗背景里浮起来 -->
  <g filter="url(#glow)" opacity=".7">
    <polyline points="${px(FW + 0.14, -0.14, -0.26)} ${px(FW + 0.14, FD + 0.14, -0.26)} ${px(
      -0.14,
      FD + 0.14,
      -0.26,
    )}" fill="none" stroke="#8fd0ea" stroke-width="2.2"/>
  </g>

  <g>${ROOMS.map(floorOf).join("")}</g>
  <g>${floorLines.join("")}</g>
  <g filter="url(#soft)">${floorMarks.join("")}</g>
  <g>${plane(0, FW, 0, FD, 0.03, "url(#sheen)")}</g>
  <g>${volumes.map((v) => v.svg).join("")}</g>
  <g>${labels}</g>
</svg>
`;

fs.mkdirSync(path.dirname(OUT_SVG), { recursive: true });
fs.writeFileSync(OUT_SVG, svg, "utf8");

// ---------------------------------------------------------------- 设备锚点

const ANCHORS = [
  { id: "screen", plan: [0.36, 6.7], label: "电视" },
  { id: "light", plan: [4.5, 5.42], label: "主灯" },
  { id: "vacuum", plan: [5.5, 7.6], label: "扫地机" },
  { id: "lock", plan: [8.05, 8.96], label: "门锁" },
  { id: "climate", plan: [9.55, 8.5], label: "空调" },
];

console.log(`wrote ${path.relative(process.cwd(), OUT_SVG)}  (${VBW}×${VBH})`);
console.log(`aspect-ratio: ${(VBW / VBH).toFixed(3)}`);
for (const { id, plan, label } of ANCHORS) {
  const [x, y] = pt(plan[0], plan[1], 0);
  console.log(
    `    { id: "${id}", label: "${label}", x: ${((x / VBW) * 100).toFixed(2)}, y: ${(
      (y / VBH) *
      100
    ).toFixed(2)} },`,
  );
}
