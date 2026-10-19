/**
 * 动画节拍与视锥可见性（0.7.8 `animation-work`）。
 *
 * - `createAnimationCadence`：把渲染帧压到固定 30fps，返回本次应推进的秒数；
 * - `createAnimationVisibility`：按包围球 + 摄像机视锥判断动画对象是否可见，
 *   反射通道可以额外放行，避免镜子里的动画被剔除。
 */

export type AnimationCadence = {
  take: (nowMs: number) => number | null;
  reset: () => void;
};

/** 创建 30fps（默认）节拍器；`take` 在未到间隔时返回 null。 */
export function createAnimationCadence(frameIntervalMs = 1000 / 30): AnimationCadence {
  let lastTickMs: number | null = null;
  return {
    take(nowMs) {
      if (lastTickMs !== null && nowMs - lastTickMs < frameIntervalMs - 1) return null;
      const elapsedMs = lastTickMs === null ? frameIntervalMs : Math.max(0, nowMs - lastTickMs);
      lastTickMs = nowMs;
      return elapsedMs / 1000;
    },
    reset() {
      lastTickMs = null;
    },
  };
}

export type AnimationVisibility = {
  visible: (target: any, options?: { reflected?: boolean; padding?: number }) => boolean;
  invalidate: () => void;
};

/**
 * 创建可见性判定器。
 *
 * @param THREE             three 命名空间
 * @param getCamera         目标对象 → 摄像机（可返回 null）
 * @param getRevision       场景版本号；变化时清空包围球缓存
 * @param mayReflect        反射通道是否放行该对象
 */
export function createAnimationVisibility({
  THREE: THREE,
  getCamera: getCamera,
  getRevision: getRevision,
  mayReflect: mayReflect = () => true,
}: {
  THREE?: any;
  getCamera?: (target: any) => any;
  getRevision?: () => any;
  mayReflect?: (target: any) => boolean;
} = {}): AnimationVisibility {
  let boundsCache = new WeakMap<any, number>(),
    cachedRevision: any;
  const sphere = new THREE.Sphere(),
    projectionMatrix = new THREE.Matrix4(),
    frustum = new THREE.Frustum();

  /** 对象自身几何 + 子节点偏移的保守包围半径。 */
  function boundRadius(target: any): number {
    let radius = 0;
    if (target.geometry) {
      target.geometry.computeBoundingSphere?.();
      const boundingSphere = target.geometry.boundingSphere;
      if (boundingSphere) radius = boundingSphere.center.length() + boundingSphere.radius;
    }
    for (const child of target.children || []) {
      if (child.userData?.environmentEffect) continue;
      const childScale = Math.max(
        Math.abs(child.scale.x),
        Math.abs(child.scale.y),
        Math.abs(child.scale.z),
      );
      radius = Math.max(radius, child.position.length() + boundRadius(child) * childScale);
    }
    return radius;
  }

  return {
    visible(target, { reflected = false, padding = 0 } = {}) {
      if (!target) return true;
      for (let ancestor = target; ancestor; ancestor = ancestor.parent)
        if (ancestor.visible === false) return false;
      if (reflected && mayReflect(target)) return true;
      const revision = getRevision?.();
      if (revision !== cachedRevision) {
        cachedRevision = revision;
        boundsCache = new WeakMap();
      }
      const camera = getCamera?.(target);
      if (!camera?.projectionMatrix || !target.matrixWorld) return true;
      let radius = boundsCache.get(target);
      if (radius === undefined) {
        radius = boundRadius(target);
        boundsCache.set(target, radius);
      }
      if (!Number.isFinite(radius)) return true;
      target.updateWorldMatrix(true, false);
      camera.updateMatrixWorld();
      sphere.center.set(0, 0, 0);
      sphere.radius = radius + padding;
      sphere.applyMatrix4(target.matrixWorld);
      // 稍微收缩投影矩阵，避免贴边对象在剔除边界上闪烁。
      projectionMatrix.copy(camera.projectionMatrix);
      for (const elementIndex of [0, 4, 8, 12, 1, 5, 9, 13])
        projectionMatrix.elements[elementIndex] *= 0.9;
      return (
        frustum
          .setFromProjectionMatrix(projectionMatrix.multiply(camera.matrixWorldInverse))
          .intersectsSphere(sphere)
      );
    },
    invalidate() {
      boundsCache = new WeakMap();
      cachedRevision = undefined;
    },
  };
}
