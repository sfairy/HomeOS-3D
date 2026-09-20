/**
 * 户型「地面开洞」的多边形换算。
 *
 * 生成底板网格前，先把设计图里的开洞（楼梯口、下沉区、挑空区等）从平面坐标变成世界坐标
 * 多边形，再由底板三角化逻辑据此挖洞。只导出纯函数 floorOpeningPolygon。入参 opening 处在
 * 设计图平面坐标系（像素，y 向下），scaleFactor 表示每米对应多少像素；返回的顶点仍是平面
 * 坐标，调用方再映射到 three.js 的 x / z 平面。
 */

/**
 * 把单个地面开洞换算成旋转后的四个角点。
 * 先在开洞中心建局部坐标（宽沿 X、深沿 Y，各取一半），再按 rotation 旋转并平移回中心。
 */
export function floorOpeningPolygon(opening, scaleFactor) {
  // 设计图里的 rotation 是角度制，三角函数只认弧度，这里先换算一次供下面复用。
  const rotationRad = (opening.rotation * Math.PI) / 180;
  const cosRotation = Math.cos(rotationRad);
  const sinRotation = Math.sin(rotationRad);
  // 半宽：开洞宽（米）× 每米像素数后取一半，得到局部坐标下的 X 半尺寸。
  const halfWidth = (opening.width * scaleFactor) / 2;
  // 半深同理，对应局部坐标下的 Y 半尺寸。
  const halfDepth = (opening.depth * scaleFactor) / 2;
  // 局部坐标下按「左上 → 右上 → 右下 → 左下」顺序取四角，保证三角化时环绕方向一致。
  return [
    [-halfWidth, -halfDepth],
    [halfWidth, -halfDepth],
    [halfWidth, halfDepth],
    [-halfWidth, halfDepth]
  ].map(([localX, localY]) => ({
    x: opening.x + localX * cosRotation - localY * sinRotation,
    y: opening.y + localX * sinRotation + localY * cosRotation
  }));
}
