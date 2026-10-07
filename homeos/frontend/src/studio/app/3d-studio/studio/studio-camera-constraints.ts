export const MAX_CAMERA_POLAR_ANGLE = Math.PI * 0.49;
const minTargetHeight = 0.02,
  maxPolarCosine = Math.cos(MAX_CAMERA_POLAR_ANGLE);
export function constrainCameraPosition(position: any, target: any) {
  const deltaX = position.x - target.x,
    deltaY = position.y - target.y,
    deltaZ = position.z - target.z,
    distance = Math.max(Math.hypot(deltaX, deltaY, deltaZ), 0.001),
    minHeight = Math.max(distance * maxPolarCosine, minTargetHeight - target.y);
  if (deltaY >= minHeight - 1e-9) return false;
  const horizontalDistance = Math.hypot(deltaX, deltaZ),
    maxDistance = Math.max(distance, minHeight),
    lateralDistance = Math.sqrt(Math.max(0, maxDistance * maxDistance - minHeight * minHeight));
  return (
    (position.x =
      target.x + (horizontalDistance > 1e-9 ? deltaX / horizontalDistance : 0) * lateralDistance),
    (position.z =
      target.z + (horizontalDistance > 1e-9 ? deltaZ / horizontalDistance : 1) * lateralDistance),
    (position.y = target.y + minHeight),
    true
  );
}
export function constrainCameraPose(pose: any) {
  if (!pose) return pose;
  const [positionX, positionY, positionZ] = pose.position,
    [targetX, targetY, targetZ] = pose.target,
    nextPosition = {
      x: positionX,
      y: positionY,
      z: positionZ,
    };
  return constrainCameraPosition(nextPosition, {
    x: targetX,
    y: targetY,
    z: targetZ,
  })
    ? {
        ...pose,
        position: [nextPosition.x, nextPosition.y, nextPosition.z],
      }
    : pose;
}
