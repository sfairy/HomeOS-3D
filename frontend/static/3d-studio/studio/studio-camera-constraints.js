/**
 * 相机位置约束：防止视角穿到地面以下。
 */

// 约 88.2°：留出不到 2° 的余量，既允许接近水平看地面的视角，
export const MAX_CAMERA_POLAR_ANGLE = Math.PI * 0.49;
const MIN_CAMERA_HEIGHT = 0.02;
const COS_MAX_POLAR_ANGLE = Math.cos(MAX_CAMERA_POLAR_ANGLE);

/**
 * 就地钳制相机位置，使其落在允许的轨道范围之内。
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
