/**
 * 自建模型的零件 DSL：规格 = 一份零件表（几何种类 + 槽位 + 位置）。
 */
/**
 * 声明一个零件。
 * @param {number} slot 材质槽位号，落成 `material-<slot>`。
 * @param {"box"|"roundedbox"|"cyl"|"sphere"|"lathe"|"torus"|"capsule"|"extrude"} kind 几何种类。
 * @param {number[]} size 逐 kind 不同：
 * @param {number[]} at 位置 [x, y, z]（米）。y 的含义由 align 决定，见下。
 * @param {object} [options]
 */
export function part(slot, kind, size, at, options = {}) {
  return { slot, kind, size, at, ...options };
}

/** 便捷写法：底部对齐的方盒。 */
export function box(slot, size, at, options = {}) {
  return part(slot, "box", size, at, options);
}

/** 便捷写法：竖轴圆柱，y 是底面高度。 */
export function cyl(slot, radius, height, segments, at, options = {}) {
  return part(slot, "cyl", [radius, height, segments], at, options);
}

/** 便捷写法：圆角盒（沙发 / 坐垫 / 软包用，近看才不像一排石膏块）。 */
export function roundedBox(slot, size, at, options = {}) {
  return part(slot, "roundedbox", size, at, { segments: 3, ...options });
}

/** 便捷写法：球（灯罩、花器、旋钮）。 */
export function sphere(slot, radius, at, options = {}) {
  return part(slot, "sphere", [radius, 16, 12], at, options);
}

/**
 * 便捷写法：回转体（圆桌面、花器、灯罩、圆盆、酒杯）。
 */
export function lathe(slot, profile, segments, at, options = {}) {
  return part(slot, "lathe", [profile, segments], at, options);
}

export function clathe(slot, profile, segments, at, options = {}) {
  return part(slot, "lathe", [profile, segments], at, { centered: true, ...options });
}

/**
 * 便捷写法：环（桌面描边、凳圈踏脚、风扇护网、盆沿）。
 */
export function torus(slot, radius, tube, at, options = {}) {
  return part(slot, "torus", [radius, tube], at, options);
}

export function ctorus(slot, radius, tube, at, options = {}) {
  return part(slot, "torus", [radius, tube], at, { centered: true, ...options });
}

/** 便捷写法：胶囊（软包扶手、抱枕、瓶身 —— 两端半球，比圆柱少一道硬棱）。 */
export function capsule(slot, radius, length, at, options = {}) {
  return part(slot, "capsule", [radius, length], at, options);
}

export function ccapsule(slot, radius, length, at, options = {}) {
  return part(slot, "capsule", [radius, length], at, { centered: true, ...options });
}

/**
 * 便捷写法：锥形圆柱（真实家具的腿几乎都是上粗下细）。
 */
export function taper(slot, radiusBottom, radiusTop, height, segments, at, options = {}) {
  return part(slot, "cyl", [radiusBottom, height, segments], at, { radiusTop, ...options });
}

export function ctaper(slot, radiusBottom, radiusTop, height, segments, at, options = {}) {
  return part(slot, "cyl", [radiusBottom, height, segments], at, {
    centered: true,
    radiusTop,
    ...options
  });
}

/**
 * 便捷写法：把一段**平面轮廓**拉成体（大钢琴的弯背、异形台面、弧形靠背）。
 */
export function extrude(slot, outline, depth, at, options = {}) {
  return part(slot, "extrude", [outline, depth], at, options);
}

/**
 * 取一组零件**以及它们沿 x = 0 的镜像**（成对的扶手、腿、把手）。
 */
export function mirrorPair(parts) {
  const list = Array.isArray(parts) ? parts : [parts];
  return [...list, ...list.map(item => ({ ...item, mirrorX: !item.mirrorX }))];
}

/**
 * 环列一组零件：桌子 / 凳子的多腿、风扇叶片、圆桌的支撑辐条。
 */
export function ringOf(count, { radius, startAngle = 0, center = [0, 0] }, build) {
  const parts = [];
  for (let index = 0; index < count; index += 1) {
    const angle = startAngle + (360 / count) * index;
    const built = build(index, angle);
    for (const item of Array.isArray(built) ? built : [built]) {
      parts.push({ ...item, spin: { angle, radius, center } });
    }
  }
  return parts;
}

/**
 * 以「水平中心」定位的便捷写法。
 */
export function cbox(slot, size, at, options = {}) {
  return part(slot, "box", size, at, { centered: true, ...options });
}

export function croundedBox(slot, size, at, options = {}) {
  return part(slot, "roundedbox", size, at, { centered: true, segments: 3, ...options });
}

export function ccyl(slot, radius, height, segments, at, options = {}) {
  return part(slot, "cyl", [radius, height, segments], at, { centered: true, ...options });
}
