/**
 * stage.ts 顶视 / 自由视角相机姿态规范化（纯函数）。
 */

export function normalizeCameraPose(
  three: { Vector3: new (...args: number[]) => any; MathUtils: { degToRad: (deg: number) => number } },
  rawCameraPose: any,
  constrainCameraPose: (pose: any) => any,
) {
  if (!rawCameraPose) return rawCameraPose;
  if (rawCameraPose.view !== "top")
    return constrainCameraPose({
      ...rawCameraPose,
      up: [0, 1, 0],
    });
  const poseTargetVector = new three.Vector3(...rawCameraPose.target),
    poseCameraDistance = Math.max(
      new three.Vector3(...rawCameraPose.position).distanceTo(poseTargetVector),
      0.001,
    ),
    degToRad = three.MathUtils.degToRad(rawCameraPose.topRotation || 0),
    poseUpVector = new three.Vector3(
      ...(rawCameraPose.up || [Math.sin(degToRad), 0, -Math.cos(degToRad)]),
    );
  return (
    (poseUpVector.y = 0),
    poseUpVector.lengthSq() < 1e-12 &&
      poseUpVector.set(Math.sin(degToRad), 0, -Math.cos(degToRad)),
    constrainCameraPose({
      ...rawCameraPose,
      position: [poseTargetVector.x, poseTargetVector.y + poseCameraDistance, poseTargetVector.z],
      up: poseUpVector.normalize().toArray(),
    })
  );
}
