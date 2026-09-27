/**
 * 场景对象的矩阵更新加速。
 */

type Vector3Like = { x: number; y: number; z: number };
type QuaternionLike = { x: number; y: number; z: number; w: number };

type TransformObject = {
  position: Vector3Like;
  quaternion: QuaternionLike;
  scale: Vector3Like;
  parent?: unknown;
  matrixWorldNeedsUpdate?: boolean;
  updateMatrix: () => void;
  traverse: (callback: (object: TransformObject) => void) => void;
};

type ObjectPrototype = {
  prototype: {
    updateMatrix: () => void;
  };
};

// 已包装对象的记账表；用 WeakSet 是为了让对象被销毁后能随 GC 释放，不长期持有引用。
const instrumentedObjects = new WeakSet<object>();
/**
 * 为场景树中可缓存的对象安装矩阵更新短路逻辑。
 */
export function cacheObjectTransforms(
  rootObject: TransformObject | null | undefined,
  objectPrototype: ObjectPrototype
) {
  let instrumentedCount = 0;
  rootObject?.traverse(traversedObject => {
    // 跳过两类对象：已经包装过的，以及被其它模块改写过 updateMatrix 的。
    if (
      instrumentedObjects.has(traversedObject) ||
      traversedObject.updateMatrix !== objectPrototype.prototype.updateMatrix
    ) {
      return;
    }
    // 原始实现与上一次变换快照都保存在闭包里：放对象属性上会污染 three.js 对象的属性集，
    const originalUpdateMatrix = traversedObject.updateMatrix;
    let lastPositionX: number | undefined;
    let lastPositionY: number | undefined;
    let lastPositionZ: number | undefined;
    let lastQuaternionX: number | undefined;
    let lastQuaternionY: number | undefined;
    let lastQuaternionZ: number | undefined;
    let lastQuaternionW: number | undefined;
    let lastScaleX: number | undefined;
    let lastScaleY: number | undefined;
    let lastScaleZ: number | undefined;
    let lastParent: unknown;
    // 比较 position / quaternion / scale 的分量而非矩阵元素：分量比较更便宜，
    traversedObject.updateMatrix = function (this: TransformObject) {
      const position = this.position;
      const quaternion = this.quaternion;
      const scale = this.scale;
      // 九个分量全等即认定未变化，走短路返回；唯一例外是父节点换了。
      if (
        position.x === lastPositionX &&
        position.y === lastPositionY &&
        position.z === lastPositionZ &&
        quaternion.x === lastQuaternionX &&
        quaternion.y === lastQuaternionY &&
        quaternion.z === lastQuaternionZ &&
        quaternion.w === lastQuaternionW &&
        scale.x === lastScaleX &&
        scale.y === lastScaleY &&
        scale.z === lastScaleZ
      ) {
        if (this.parent !== lastParent) {
          this.matrixWorldNeedsUpdate = true;
        }
        lastParent = this.parent;
        return;
      }
      // 真正的重建路径：调用原型实现，并记下本次快照供下一帧比较。
      originalUpdateMatrix.call(this);
      lastParent = this.parent;
      lastPositionX = position.x;
      lastPositionY = position.y;
      lastPositionZ = position.z;
      lastQuaternionX = quaternion.x;
      lastQuaternionY = quaternion.y;
      lastQuaternionZ = quaternion.z;
      lastQuaternionW = quaternion.w;
      lastScaleX = scale.x;
      lastScaleY = scale.y;
      lastScaleZ = scale.z;
    };
    // 替换成功后才记账：中途抛错时不会留下「已记账但没包装」的假象。
    instrumentedObjects.add(traversedObject);
    instrumentedCount++;
  });
  // 返回新增包装数而非总数：调用方用它判断本次重建是否真的装上了加速。
  return instrumentedCount;
}
