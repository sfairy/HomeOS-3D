/**
 * 窗户（玻璃 + 窗框）的几何参数表。
 */

type GeometryPart = [number, number, number, number, number, number];

type WindowGeometryParts = {
  glass: GeometryPart[];
  frames: GeometryPart[];
  divided: boolean;
};

/**
 * 计算窗户的玻璃与窗框部件。
 */
export function windowGeometryParts(
  windowWidth: number,
  windowHeight: number,
  sillHeight: number,
  allowDivided = true
): WindowGeometryParts | null {
  // NaN / Infinity 会在几何体里静默产出畸形网格，这里统一拦掉并回落到不建模。
  if (
    ![windowWidth, windowHeight, sillHeight].every(Number.isFinite) ||
    windowWidth <= 0 ||
    windowHeight <= 0
  ) {
    return null;
  }
  const frameThickness = Math.min(0.045, windowWidth / 4, windowHeight / 4);
  const centerY = sillHeight + windowHeight / 2;
  // 玻璃比窗洞四周各缩进一个框料厚度，厚度 2.5 厘米，落在窗框内部。
  const glassParts: GeometryPart[] = [
    [windowWidth - frameThickness, windowHeight - frameThickness, 0.025, 0, centerY, 0]
  ];
  // 窗框统一 6 厘米厚（比玻璃厚），先上下两条横料，再左右两条竖料，竖料扣掉横料占用的高度。
  const frameParts: GeometryPart[] = [
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
