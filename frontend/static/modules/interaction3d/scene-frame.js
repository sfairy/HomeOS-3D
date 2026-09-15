/**
 * 场景坐标框架：把相机的位姿在「两个项目 / 两种楼层摆放」之间搬移。
 *
 * 位置：切换项目、导入导出或切换「全楼层」预览时，同一个相机视角要落到新场景的同一处，
 *   这一步必须换算坐标系，否则视角会跳。本模块只做几何计算，不接触渲染器。
 * 对外导出：transformSceneCamera（computeFloorPlacement 为内部实现）。
 * 全局约定：项目文档里楼层的摆放字段为 originX/originY、offsetX/offsetZ、rotation（角度）、
 *   elevation，以及 scene.calibration.pixelsPerMeter；缺任一字段都按默认值兜底，不得抛错。
 * 副作用：无，纯函数；返回的相机对象是深拷贝，调用方可以安全改写。
 */

// 计算楼层的世界摆放：把楼层局部坐标映射到世界坐标所需的缩放 ppm、旋转 (c, s) 与平移 (x, y, z)。
// 返回 null 表示该楼层在当前项目里不存在（调用方据此走「不做变换」的兜底）。
function computeFloorPlacement(project, floorId, activeFloorId) {
  const floors = project.floors || [];
  // "all"（全楼层）模式下相机锚定到当前激活楼层；其余情况按传入的 floorId 直接取。
  const floor = floors.find(
    floorEntry => floorEntry.id === (floorId === "all" ? activeFloorId : floorId)
  );
  if (!floor) {
    return null;
  }
  const scene = floor.scene;
  // 标定缺失时按 1 像素/米处理：数学上仍有意义，视觉上等价于 1:1。
  const pixelsPerMeter = scene.calibration?.pixelsPerMeter || 1;
  // 全楼层预览不重新求包围盒，而是照抄每个楼层自己记录的摆放：旋转按角度制取负
  // （three.js 绕 Y 轴的旋向与文档中的定义相反），高度则按 elevation 排序后乘以
  // previewFloorGap，保证层与层之间不会互相穿插。
  if (floorId === "all" && floors.length > 1) {
    // 文档里的 rotation 是角度制，且绕 Y 轴的旋向与 three.js 相反，因此取负号后再转弧度。
    const rotationRad = (-(floor.rotation || 0) * Math.PI) / 180;
    const cosRotation = Math.cos(rotationRad);
    const sinRotation = Math.sin(rotationRad);
    return {
      ppm: pixelsPerMeter,
      c: cosRotation,
      s: sinRotation,
      x:
        (floor.offsetX || 0) -
        (cosRotation * (floor.originX || 0) + sinRotation * (floor.originY || 0)) / pixelsPerMeter,
      z:
        (floor.offsetZ || 0) -
        (-sinRotation * (floor.originX || 0) + cosRotation * (floor.originY || 0)) / pixelsPerMeter,
      y:
        [...floors].sort((floorA, floorB) => floorA.elevation - floorB.elevation).indexOf(floor) *
        project.previewFloorGap
    };
  }
  // 单层模式：优先用墙体端点求包围盒，没有墙就用家具项，再退到背景图尺寸，
  // 最后是 1200 × 800 的兜底画布 —— 任何一层都能算出一个可用的摆放。
  let points = scene.walls?.length
    ? scene.walls.flatMap(wall => [wall.start, wall.end])
    : scene.items?.length
      ? scene.items
      : scene.background?.width && scene.background?.height
        ? [
            {
              x: 0,
              y: 0
            },
            {
              x: scene.background.width,
              y: scene.background.height
            }
          ]
        : [
            {
              x: 0,
              y: 0
            },
            {
              x: 1200,
              y: 800
            }
          ];
  // 过滤掉坐标非有限的点：一个坏点就会把包围盒整体算成 NaN，进而毁掉整次视角变换。
  points = points.filter(point => Number.isFinite(point?.x) && Number.isFinite(point?.y));
  // 没有任何有效点时返回 null，交由上层保持原相机不动。
  if (!points.length) {
    return null;
  }
  // 取包围盒中心作为楼层原点，因此最终平移量是中心坐标取负。
  const minX = Math.min(...points.map(minXPoint => minXPoint.x));
  const minY = Math.min(...points.map(minYPoint => minYPoint.y));
  // 加 1 兜底：所有点共线时包围盒宽/高会退化成 0。
  const maxX = Math.max(minX + 1, ...points.map(maxXPoint => maxXPoint.x));
  const maxY = Math.max(minY + 1, ...points.map(maxYPoint => maxYPoint.y));
  return {
    ppm: pixelsPerMeter,
    c: 1,
    s: 0,
    x: -(minX + maxX) / 2 / pixelsPerMeter,
    z: -(minY + maxY) / 2 / pixelsPerMeter,
    y: 0
  };
}
/**
 * 把相机位姿从源项目的坐标系搬到目标项目的坐标系。
 *
 * 先用两个项目共有的楼层 ID 作为锚点 —— 只有共享楼层才能保证「同一个房间」被对齐；
 * 任一侧缺少摆放信息时返回相机状态的深拷贝（必须是拷贝，否则调用方一改就污染入参）。
 *
 * @param {object} cameraState 相机状态，含 position / target，可能还有 up 与 frameSize。
 * @param {object} sourceProject 源项目文档。
 * @param {object} targetProject 目标项目文档。
 * @param {string} requestedFloorId 请求的楼层 ID，可为 "all"。
 * @param {boolean} [shouldSwap] 为真时交换源与目标，用于反向变换。
 * @returns {object} 变换后的相机状态；无可用摆放时为原状态的深拷贝。
 */
export function transformSceneCamera(
  cameraState,
  sourceProject,
  targetProject,
  requestedFloorId,
  shouldSwap = false
) {
  // 相机状态缺失时原样返回，不做深拷贝 —— 这里本来就没有可改的对象。
  if (!cameraState) {
    return cameraState;
  }
  // 两边都存在的楼层才是可解释的锚点：只有它能同时出现在两套坐标系里。
  const sharedFloorId = sourceProject.floors?.find(sourceFloor =>
    targetProject.floors?.some(targetFloor => targetFloor.id === sourceFloor.id)
  )?.id;
  // 第三个参数是 "all" 模式下的激活楼层，这里统一传共享楼层，保证两侧算的是同一处。
  let sourcePlacement = computeFloorPlacement(sourceProject, requestedFloorId, sharedFloorId);
  let targetPlacement = computeFloorPlacement(targetProject, requestedFloorId, sharedFloorId);
  // 任一例取不到摆放就无法换算，退回深拷贝：宁可视角不动，也不要算出错误位置。
  if (!sourcePlacement || !targetPlacement) {
    return structuredClone(cameraState);
  }
  // 交换源与目标后，同一段变换代码就同时支持正向与反向，无需维护两套公式。
  if (shouldSwap) {
    [sourcePlacement, targetPlacement] = [targetPlacement, sourcePlacement];
  }
  // 长度比例 = 源像素/米 ÷ 目标像素/米。
  const scale = sourcePlacement.ppm / targetPlacement.ppm;
  // 用两套摆放的旋转直接合成角度差：cos(θt−θs) 与 sin(θt−θs)，
  // 避免分别取出角度再相减带来的符号与周期（±360°）处理。
  const cosDelta = targetPlacement.c * sourcePlacement.c + targetPlacement.s * sourcePlacement.s;
  const sinDelta = targetPlacement.s * sourcePlacement.c - targetPlacement.c * sourcePlacement.s;
  // 位置与方向的旋转都只需要这一对 (c, s)，因此先备好一个函数复用。
  const rotatePoint = ([sourceX, sourceY, sourceZ]) => [
    cosDelta * sourceX + sinDelta * sourceZ,
    sourceY,
    -sinDelta * sourceX + cosDelta * sourceZ
  ];
  // 变换顺序：平移到源原点 → 旋转 → 按比例缩放 → 平移到目标原点。
  const transformPoint = ([pointX, pointY, pointZ]) => {
    const rotatedPoint = rotatePoint([
      pointX - sourcePlacement.x,
      pointY - sourcePlacement.y,
      pointZ - sourcePlacement.z
    ]);
    return [
      rotatedPoint[0] * scale + targetPlacement.x,
      rotatedPoint[1] * scale + targetPlacement.y,
      rotatedPoint[2] * scale + targetPlacement.z
    ];
  };
  // position / target 是「点」，要平移 + 旋转 + 缩放；up 是方向向量，只旋转不平移；
  // frameSize 是长度量，只缩放。三者语义不同，因此分别处理而不是共用一次变换。
  return {
    ...structuredClone(cameraState),
    position: transformPoint(cameraState.position),
    target: transformPoint(cameraState.target),
    ...(cameraState.up
      ? {
          up: rotatePoint(cameraState.up)
        }
      : {}),
    ...(cameraState.frameSize
      ? {
          frameSize: cameraState.frameSize * scale
        }
      : {})
  };
}
