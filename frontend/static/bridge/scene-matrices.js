/**
 * 场景对象的矩阵更新加速。
 *
 * 场景构建完成后调用一次，给家具、墙体这类数量大又大多静止的对象装上「值未变则跳过重算」的
 * 短路逻辑——每帧遍历上百个对象重建矩阵是帧率的主要损耗来源。对外导出 cacheObjectTransforms。
 * 只包装仍在使用原型原始 updateMatrix 的对象，避免覆盖别的模块自己的实现；同一对象用模块级
 * WeakSet 记账，不重复包装。
 */

// 已包装对象的记账表；用 WeakSet 是为了让对象被销毁后能随 GC 释放，不长期持有引用。
const instrumentedObjects = new WeakSet();
/**
 * 为场景树中可缓存的对象安装矩阵更新短路逻辑。
 */
export function cacheObjectTransforms(rootObject, objectPrototype) {
  let instrumentedCount = 0;
  rootObject?.traverse(traversedObject => {
    // 跳过两类对象：已经包装过的，以及被其它模块改写过 updateMatrix 的。
    // 后者若强行包装，会把别人的逻辑（例如骨骼动画的额外计算）整段吞掉。
    if (
      instrumentedObjects.has(traversedObject) ||
      traversedObject.updateMatrix !== objectPrototype.prototype.updateMatrix
    ) {
      return;
    }
    // 原始实现与上一次变换快照都保存在闭包里：放对象属性上会污染 three.js 对象的属性集，
    // 也可能被序列化或遍历逻辑误读。
    const originalUpdateMatrix = traversedObject.updateMatrix;
    let lastPositionX;
    let lastPositionY;
    let lastPositionZ;
    let lastQuaternionX;
    let lastQuaternionY;
    let lastQuaternionZ;
    let lastQuaternionW;
    let lastScaleX;
    let lastScaleY;
    let lastScaleZ;
    let lastParent;
    // 比较 position / quaternion / scale 的分量而非矩阵元素：分量比较更便宜，
    // 且不必先构造矩阵，能把「未变化」的代价压到十次浮点比较。
    traversedObject.updateMatrix = function () {
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
        // 父节点变了：局部矩阵虽未变，世界矩阵仍需重算，否则对象会停留在旧父节点下的位置。
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
