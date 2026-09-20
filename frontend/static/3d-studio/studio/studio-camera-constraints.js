/**
 * 相机位置约束：防止视角穿到地面以下。
 *
 * 位置：3D 工作室的 OrbitControls 相机每帧更新位置后调用本模块钳制。把相机相对轨道中心的位置限制在
 * 「极角不超过约 88.2°、且离地至少 2 厘米」，同时尽量保持原视线方向与距离。对外导出
 * constrainCameraPosition（就地修改向量）与 constrainCameraPose（返回新姿态）。
 * 坐标：three.js 世界坐标，Y 轴向上，单位米；极角以 +Y 轴为 0 度量。
 */

// 约 88.2°：留出不到 2° 的余量，既允许接近水平看地面的视角，
// 又不会正好到 90° 导致视线与地面共面、画面抖动。
export const MAX_CAMERA_POLAR_ANGLE = Math.PI * 0.49;
// 相机离地最低 2 厘米。地面（y = 0）与带厚度的底板要留一点间距，避免近裁剪面切进地板。
const MIN_CAMERA_HEIGHT = 0.02;
// 极角阈值的余弦：offsetY 必须大于等于「距离 × 该余弦」才满足极角上限，避免每次算三角函数。
const COS_MAX_POLAR_ANGLE = Math.cos(MAX_CAMERA_POLAR_ANGLE);

/**
 * 就地钳制相机位置，使其落在允许的轨道范围之内。
 * 返回 true 表示位置被改动过，调用方据此决定是否重新渲染；未越界时完全不碰传入向量
 * （保留原始浮点值），避免每帧累积舍入误差造成视角漂移。
 */
export function constrainCameraPosition(cameraPosition, orbitTarget) {
  const offsetX = cameraPosition.x - orbitTarget.x;
  const offsetY = cameraPosition.y - orbitTarget.y;
  const offsetZ = cameraPosition.z - orbitTarget.z;
  // 距离下限 1 毫米：相机与轨道中心重合时方向向量无意义，兜底防除零。
  const distance = Math.max(Math.hypot(offsetX, offsetY, offsetZ), 0.001);
  // 两个下限取较大者：既满足极角上限，又满足最低离地高度。
  const clampedOffsetY = Math.max(
    distance * COS_MAX_POLAR_ANGLE,
    MIN_CAMERA_HEIGHT - orbitTarget.y
  );
  // 用 1e-9 容差比较：恰好落在边界上时不该被判定为越界。
  if (offsetY >= clampedOffsetY - 1e-9) {
    return false;
  }
  const horizontalDistance = Math.hypot(offsetX, offsetZ);
  // 抬高相机后若水平分量不足以维持原轨道半径，就整体拉大距离，
  // 保证相机始终贴在同一个球面上，不会因为钳制突然「贴近」目标。
  const clampedDistance = Math.max(distance, clampedOffsetY);
  const constrainedHorizontalDistance = Math.sqrt(
    Math.max(0, clampedDistance * clampedDistance - clampedOffsetY * clampedOffsetY)
  );
  // 按原水平方向等比缩放，方向为退化情形（正对轨道中心上下）时给 X 轴一个确定值。
  cameraPosition.x =
    orbitTarget.x +
    (horizontalDistance > 1e-9 ? offsetX / horizontalDistance : 0) * constrainedHorizontalDistance;
  cameraPosition.z =
    orbitTarget.z +
    (horizontalDistance > 1e-9 ? offsetZ / horizontalDistance : 1) * constrainedHorizontalDistance;
  cameraPosition.y = orbitTarget.y + clampedOffsetY;
  return true;
}

/**
 * 钳制一份「位置 + 注视点」形式的相机姿态。
 */
export function constrainCameraPose(pose) {
  if (!pose) {
    return pose;
  }
  const [positionX, positionY, positionZ] = pose.position;
  const [targetX, targetY, targetZ] = pose.target;
  // 复用就地版本的算法，所以这里先复制成可变对象，避免污染调用方持有的数组。
  const cameraPositionVector = {
    x: positionX,
    y: positionY,
    z: positionZ
  };
  if (
    constrainCameraPosition(cameraPositionVector, {
      x: targetX,
      y: targetY,
      z: targetZ
    })
  ) {
    return {
      ...pose,
      position: [cameraPositionVector.x, cameraPositionVector.y, cameraPositionVector.z]
    };
  } else {
    return pose;
  }
}
