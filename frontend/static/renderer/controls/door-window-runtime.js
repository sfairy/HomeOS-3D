/**
 * 门窗控件的透视变换：把属性里的 8 个角点（归一化坐标）换算成 CSS matrix3d，
 * 让平面门窗贴图在画布上呈现「手绘式」四点透视。
 *
 * 位置：纯几何模块，只被门 / 窗控件渲染时调用，不感知运行时状态。doorWindowPerspectiveCorners
 * 负责角点清洗与钳制，doorWindowPerspectiveMatrix 产出最终 CSS transform 字符串。
 * 坐标：角点按左上、右上、右下、左下顺序，每点两位（x, y），以控件宽高为基准归一化 —— 0 表示左 / 上边缘。
 */

// 默认不形变：四个角分别落在矩形四角。
const DEFAULT_PERSPECTIVE_CORNERS = Object.freeze([0, 0, 1, 0, 1, 1, 0, 1]);
// 每个分量的钳制区间刻意留出 [-1.5, 2.5] 的余量，允许角点被拖到控件框外，
// 从而做出明显的斜切 / 夸张透视；完全限制在 [0, 1] 会让可调幅度太小。
const PERSPECTIVE_CORNER_BOUNDS = Object.freeze([
  [-1.5, 2.5],
  [-1.5, 2.5],
  [-1.5, 2.5],
  [-1.5, 2.5],
  [-1.5, 2.5],
  [-1.5, 2.5],
  [-1.5, 2.5],
  [-1.5, 2.5]
]);
/**
 * 归一化角点数组：非法输入回落到默认矩形，逐分量钳制并补齐非有限值。
 *
 * 逐项兜底而不是整体兜底，是为了容忍只坏掉一个分量的历史数据。
 */
export function doorWindowPerspectiveCorners(corners) {
  return (
    Array.isArray(corners) && corners.length === 8 ? corners : DEFAULT_PERSPECTIVE_CORNERS
  ).map((cornerValue, cornerIndex) => {
    const numericCornerValue = Number(cornerValue);
    const defaultCornerValue = DEFAULT_PERSPECTIVE_CORNERS[cornerIndex];
    const [minimumCornerValue, maximumCornerValue] = PERSPECTIVE_CORNER_BOUNDS[cornerIndex];
    return Math.max(
      minimumCornerValue,
      Math.min(
        maximumCornerValue,
        Number.isFinite(numericCornerValue) ? numericCornerValue : defaultCornerValue
      )
    );
  });
}
/**
 * 由四个角点求解透视矩阵并序列化成 CSS matrix3d。
 *
 * 算法：先用角点差解出单应矩阵的 H、I 两个自由度，再换算成 matrix3d 的 16 个分量，
 * 最后一步做了退化保护——四边形退化成线或点时 determinant 趋零，直接返回单位矩阵，
 * 否则 CSS 会收到 Inf / NaN 并让整个元素消失。
 */
export function doorWindowPerspectiveMatrix(width, height, cornerValues) {
  const safeWidth = Math.max(1, Number(width) || 1);
  const safeHeight = Math.max(1, Number(height) || 1);
  const normalizedCorners = doorWindowPerspectiveCorners(cornerValues);
  // 归一化后是 [0,1] 区间的比例值，这里按奇偶分量分别乘宽 / 高，换回像素坐标。
  const [
    topLeftX,
    topLeftY,
    topRightX,
    topRightY,
    bottomRightX,
    bottomRightY,
    bottomLeftX,
    bottomLeftY
  ] = normalizedCorners.map(
    (scaledCornerValue, coordinateIndex) =>
      scaledCornerValue * (coordinateIndex % 2 === 0 ? safeWidth : safeHeight)
  );
  const coefficientA = topRightX - bottomRightX;
  const coefficientB = bottomLeftX - bottomRightX;
  const coefficientC = topLeftX - topRightX + bottomRightX - bottomLeftX;
  const coefficientD = topRightY - bottomRightY;
  const coefficientE = bottomLeftY - bottomRightY;
  const coefficientF = topLeftY - topRightY + bottomRightY - bottomLeftY;
  const determinant = coefficientA * coefficientE - coefficientB * coefficientD;
  if (Math.abs(determinant) < 0.000001) {
    // 退化四边形：返回单位矩阵，保持元素可见但不变形。
    return "matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1)";
  }
  // 单应矩阵的 H 自由度：解出它才能把「透视产生的近大远小」写进 CSS。
  const homographyH = (coefficientC * coefficientE - coefficientB * coefficientF) / determinant;
  // 单应矩阵的 I 自由度，与 H 对应纵向的透视缩放。
  const homographyI = (coefficientA * coefficientF - coefficientC * coefficientD) / determinant;
  // 以下六个分量按列主序拼出 3×3 的线性部分：缩放与剪切各占对角与副对角。
  // 先除以控件宽高归一化，最后再乘回像素，避免宽高悬殊的控件把分量算成极值。
  // scaleX：第一列第一行，横向缩放，由右上角相对左上角的横向位移决定。
  const scaleX = (topRightX - topLeftX + homographyH * topRightX) / safeWidth;
  // shearX：第二列第一行，纵向边倾斜带来的横向位移分量。
  const shearX = (bottomLeftX - topLeftX + homographyI * bottomLeftX) / safeHeight;
  // shearY：第一列第二行，与 shearX 对称，承担横向边的纵向位移分量。
  const shearY = (topRightY - topLeftY + homographyH * topRightY) / safeWidth;
  // scaleY：第二列第二行，纵向缩放，由左下角相对左上角的纵向位移决定。
  const scaleY = (bottomLeftY - topLeftY + homographyI * bottomLeftY) / safeHeight;
  const perspectiveX = homographyH / safeWidth;
  const perspectiveY = homographyI / safeHeight;
  // matrix3d 是列主序：每 4 个数一列。前两列承载缩放与剪切，第三列是深度轴（不参与变形），
  // 第四列用左上角坐标做平移，最后一行补 0 / 0 / 0 / 1 的齐次分量。
  // 输出前把小于 1e-8 的分量归零，避免序列化出一长串 1.2e-16 这类无意义的浮点噪声。
  return (
    "matrix3d(" +
    [
      scaleX,
      shearY,
      0,
      perspectiveX,
      shearX,
      scaleY,
      0,
      perspectiveY,
      0,
      0,
      1,
      0,
      topLeftX,
      topLeftY,
      0,
      1
    ]
      .map(matrixEntry => (Math.abs(matrixEntry) < 1e-8 ? 0 : Number(matrixEntry.toFixed(8))))
      .join(",") +
    ")"
  );
}
