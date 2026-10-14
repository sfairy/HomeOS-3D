/**
 * 摆放包围盒：读取 GLB 内嵌 ``userData.homeosPlacementBounds`` 并校验。
 *
 * 烘焙进模型的包围盒只在**唯一一处**标注时可信：缺失、超过一处、版本不符、
 * 分量非有限数或任一轴退化到 1mm 以内，一律判为不可用，由调用方回退到几何体自算。
 */
const PLACEMENT_BOUNDS_KEY = "homeosPlacementBounds";
const PLACEMENT_BOUNDS_VERSION = 1;
const MIN_PLACEMENT_EXTENT_METERS = 0.001;

export function modelPlacementBounds(threeNamespace: any, modelRoot: any): any {
  let placementBounds: any = null;
  let placementBoundsCount = 0;
  modelRoot?.traverse?.((modelNode: any) => {
    const nodePlacementBounds = modelNode.userData?.[PLACEMENT_BOUNDS_KEY];
    if (nodePlacementBounds) {
      placementBounds = nodePlacementBounds;
      placementBoundsCount += 1;
    }
  });
  if (
    placementBoundsCount !== 1 ||
    placementBounds === null ||
    placementBounds.version !== PLACEMENT_BOUNDS_VERSION
  )
    return null;
  const { min, max } = placementBounds;
  if (
    !Array.isArray(min) ||
    !Array.isArray(max) ||
    min.length !== 3 ||
    max.length !== 3 ||
    ![...min, ...max].every(Number.isFinite) ||
    min.some(
      (minAxis: number, axisIndex: number) =>
        max[axisIndex] - minAxis <= MIN_PLACEMENT_EXTENT_METERS,
    )
  )
    return null;
  return new threeNamespace.Box3(
    new threeNamespace.Vector3(...min),
    new threeNamespace.Vector3(...max),
  );
}
