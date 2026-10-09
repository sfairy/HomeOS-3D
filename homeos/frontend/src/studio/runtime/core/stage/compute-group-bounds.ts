/**
 * stage.ts 窗帘组等成员包围盒（纯函数）。
 */

export function computeGroupBounds(
  three: { Vector3: new (...args: any[]) => any; Box3: new () => any },
  boundsGroup: any,
  environmentModelPose: ((floorId: any, modelId: any) => any) | undefined,
) {
  const memberPoseList = boundsGroup.memberItems
    .filter((poseMember: any) => poseMember.modelAvailable)
    .map((poseMemberModel: any) =>
      environmentModelPose?.(poseMemberModel.floorId, poseMemberModel.modelId),
    )
    .filter(Boolean);
  if (!memberPoseList.length) return null;
  const boundingBox = new three.Box3();
  for (const memberPose of memberPoseList) {
    const array = new three.Vector3().fromArray(memberPose.center),
      array2 = new three.Vector3().fromArray(memberPose.size || [1, 1, 1]);
    boundingBox.union(new three.Box3().setFromCenterAndSize(array, array2));
  }
  return {
    center: boundingBox.getCenter(new three.Vector3()).toArray(),
    size: boundingBox.getSize(new three.Vector3()).toArray(),
    forward: memberPoseList[0].forward,
  };
}
