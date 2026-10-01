const patchedObjectSet = new WeakSet();
export function cacheObjectTransforms(root, reference) {
  let patchedCount = 0;
  return (
    root?.traverse((object) => {
      if (patchedObjectSet.has(object) || object.updateMatrix !== reference.prototype.updateMatrix)
        return;
      const originalUpdateMatrix = object.updateMatrix;
      let lastPosX,
        lastPosY,
        lastPosZ,
        lastQuatX,
        lastQuatY,
        lastQuatZ,
        lastQuatW,
        lastScaleX,
        lastScaleY,
        lastScaleZ,
        lastParent;
      ((object.updateMatrix = function () {
        const position = this.position,
          quaternion = this.quaternion,
          scale = this.scale;
        if (
          position.x === lastPosX &&
          position.y === lastPosY &&
          position.z === lastPosZ &&
          quaternion.x === lastQuatX &&
          quaternion.y === lastQuatY &&
          quaternion.z === lastQuatZ &&
          quaternion.w === lastQuatW &&
          scale.x === lastScaleX &&
          scale.y === lastScaleY &&
          scale.z === lastScaleZ
        ) {
          (this.parent !== lastParent && (this.matrixWorldNeedsUpdate = true),
            (lastParent = this.parent));
          return;
        }
        (originalUpdateMatrix.call(this),
          (lastParent = this.parent),
          (lastPosX = position.x),
          (lastPosY = position.y),
          (lastPosZ = position.z),
          (lastQuatX = quaternion.x),
          (lastQuatY = quaternion.y),
          (lastQuatZ = quaternion.z),
          (lastQuatW = quaternion.w),
          (lastScaleX = scale.x),
          (lastScaleY = scale.y),
          (lastScaleZ = scale.z));
      }),
        patchedObjectSet.add(object),
        patchedCount++);
    }),
    patchedCount
  );
}
