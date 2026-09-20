/**
 * 窗户（玻璃 + 窗框）的几何参数表。
 *
 * 生成墙体开口构件时产出窗户各部件的尺寸与位置，再由 studio-app.js 的 addWallBandMesh 建成
 * 盒体。只导出纯函数 windowGeometryParts。长度一律米；每个部件是
 * [尺寸X, 尺寸Y, 尺寸Z, 局部X, 局部Y, 局部Z]，坐标以窗户所在墙面底部中点为原点，Y 轴向上，
 * Z 轴为墙体厚度方向，X 轴沿墙长方向。
 */

/**
 * 计算窗户的玻璃与窗框部件。
 * 尺寸非法（非有限数、宽或高不为正）时返回 null，调用方据此跳过该窗户的建模。
 */
export function windowGeometryParts(windowWidth, windowHeight, sillHeight, allowDivided = true) {
  // NaN / Infinity 会在几何体里静默产出畸形网格，这里统一拦掉并回落到不建模。
  if (
    ![windowWidth, windowHeight, sillHeight].every(Number.isFinite) ||
    windowWidth <= 0 ||
    windowHeight <= 0
  ) {
    return null;
  }
  // 框料厚度 4.5 厘米，同时不超过窗洞边长的四分之一，避免小窗被框料吃满。
  const frameThickness = Math.min(0.045, windowWidth / 4, windowHeight / 4);
  const centerY = sillHeight + windowHeight / 2;
  // 玻璃比窗洞四周各缩进一个框料厚度，厚度 2.5 厘米，落在窗框内部。
  const glassParts = [
    [windowWidth - frameThickness, windowHeight - frameThickness, 0.025, 0, centerY, 0]
  ];
  // 窗框统一 6 厘米厚（比玻璃厚），先上下两条横料，再左右两条竖料，竖料扣掉横料占用的高度。
  const frameParts = [
    [windowWidth, frameThickness, 0.06, 0, sillHeight + frameThickness / 2, 0],
    [windowWidth, frameThickness, 0.06, 0, sillHeight + windowHeight - frameThickness / 2, 0],
    [
      frameThickness,
      windowHeight - frameThickness * 2,
      0.06,
      -(windowWidth - frameThickness) / 2,
      centerY,
      0
    ],
    [
      frameThickness,
      windowHeight - frameThickness * 2,
      0.06,
      (windowWidth - frameThickness) / 2,
      centerY,
      0
    ]
  ];
  // 宽于 1.2 米的窗户加一根竖中挺，否则单扇大玻璃看起来过于空旷；
  // 该阈值同时被调用方用于统计优化前后的网格数量，改动需一并调整。
  const isDivided = allowDivided && windowWidth > 1.2;
  if (isDivided) {
    // 中挺比外框细一点（0.7 倍宽、5.5 厘米厚），视觉上从属而非并列。
    frameParts.push([
      frameThickness * 0.7,
      windowHeight - frameThickness * 2,
      0.055,
      0,
      centerY,
      0
    ]);
  }
  return {
    glass: glassParts,
    frames: frameParts,
    divided: isDivided
  };
}
