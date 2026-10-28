/**
 * WebGL 上下文资源追踪（0.8.1 `studio-context-resources.js`）。
 *
 * 大户型/反复切楼层时会不停重建几何与材质。正常 `dispose` 由 three 自己释放 GPU 侧对象；
 * 但**上下文丢失**（驱动重置、显存压力、长时间切后台）之后 three 不会替我们走一遍 dispose，
 * 那些仍占着显存的对象就变成悬空资源，恢复上下文时还得整批重建 —— 这正是「再进大户型特别慢」
 * 的来源之一。
 *
 * 做法：给 `EventDispatcher.prototype.addEventListener` 打一层**引用计数**补丁。在 renderer 的
 * 渲染入口（`render` / `compile` / `setRenderTarget` 等）执行期间，把对象上注册的 `dispose`
 * 监听截获下来 —— 凡是渲染期间挂过 dispose 监听、且属于几何/材质/贴图/渲染目标/实例化网格的
 * 对象，都算上下文相关资源；`releaseLostContext()` 时就地替它们触发一次 `dispose`。
 *
 * 三条实现约束：
 * - 补丁必须引用计数：多实例/热更新会重复创建 tracker，最后一个走时才还原原函数；
 * - 只在 renderer 的渲染入口内记账，不把页面其它 three 用法的资源算进来；
 * - `releaseLostContext` 只在 `isContextLost()` 为真时动手，正常销毁一律走 `dispose()`。
 */
import { EventDispatcher } from "/static/vendor/three/0.186.1/three.module.min.js";

/** 渲染期被登记的资源：`callbacks` 是挂在它身上的 dispose 监听集合。 */
interface TrackedResourceRecord {
  callbacks: Set<(event: { type: string; target: unknown }) => void>;
  forget: () => void;
}

/** 渲染期记账回调：`owner` 在渲染入口执行期间被指向它。 */
type ResourceOwner = (
  resource: unknown,
  listener: (event: { type: string; target: unknown }) => void,
  originalAddEventListener: (this: unknown, type: string, listener: unknown) => void,
) => void;

interface DispatcherPatch {
  users: number;
  owner: ResourceOwner | null;
  originalAddEventListener: (this: unknown, type: string, listener: unknown) => void;
  wrapper: (this: unknown, type: string, listener: unknown) => void;
}

export interface ContextResourceTracker {
  /** 上下文丢失时立即释放渲染期登记的资源（补丁本身保留）。 */
  releaseLostContext(): void;
  /** 彻底卸载：清空登记并还原 `addEventListener`（最后一个 tracker 才真正还原）。 */
  dispose(): void;
}

/** 补丁是 three 单例原型上的，跨 tracker 实例共享。 */
let dispatcherPatch: DispatcherPatch | null = null;

/** 这些对象才值得在上下文丢失时提前 dispose：纯数据对象（Object3D 等）释放了也白释放。 */
function isContextGpuResource(candidateTarget: unknown): boolean {
  const resource = candidateTarget as Record<string, unknown> | null;
  if (!resource) return false;
  return (
    resource.isBufferGeometry === true ||
    resource.isMaterial === true ||
    resource.isTexture === true ||
    resource.isRenderTarget === true ||
    resource.isInstancedMesh === true
  );
}

function acquireDispatcherPatch(): DispatcherPatch {
  if (dispatcherPatch) {
    dispatcherPatch.users += 1;
    return dispatcherPatch;
  }
  const dispatcherPrototype = EventDispatcher.prototype as Record<string, unknown>,
    originalAddEventListener = dispatcherPrototype.addEventListener as (
      this: unknown,
      type: string,
      listener: unknown,
    ) => void,
    nextPatch: DispatcherPatch = {
      users: 1,
      owner: null,
      originalAddEventListener,
      wrapper: () => undefined,
    };
  nextPatch.wrapper = function (this: unknown, type: string, listener: unknown) {
    const activeOwner = nextPatch.owner;
    if (activeOwner && type === "dispose" && isContextGpuResource(this)) {
      const hasListener = (this as { hasEventListener?: (a: string, b: unknown) => boolean })
        .hasEventListener;
      // 已经挂过的监听不重复登记：three 的 hasEventListener 只比 type + listener。
      if (!hasListener || !hasListener.call(this, type, listener))
        activeOwner(this, listener as (event: { type: string; target: unknown }) => void, originalAddEventListener);
    }
    return originalAddEventListener.call(this, type, listener);
  };
  dispatcherPrototype.addEventListener = nextPatch.wrapper;
  dispatcherPatch = nextPatch;
  return nextPatch;
}

function releaseDispatcherPatch(activePatch: DispatcherPatch) {
  activePatch.users -= 1;
  if (activePatch.users > 0) return;
  const dispatcherPrototype = EventDispatcher.prototype as Record<string, unknown>;
  if (dispatcherPrototype.addEventListener === activePatch.wrapper)
    dispatcherPrototype.addEventListener = activePatch.originalAddEventListener;
  activePatch.owner = null;
  if (dispatcherPatch === activePatch) dispatcherPatch = null;
}

/**
 * 为一个 `WebGLRenderer` 建立上下文资源追踪。
 *
 * 只包装渲染入口（存在才包），这样其它 three 用法（离屏烘焙、缩略图渲染）不会被误记账。
 */
export function createContextResourceTracker(renderer: Record<string, unknown>): ContextResourceTracker {
  const activePatch = acquireDispatcherPatch(),
    trackedResources = new Map<unknown, TrackedResourceRecord>(),
    wrappedEntries: {
      name: string;
      original: (this: unknown, ...callArguments: unknown[]) => unknown;
      wrapped: (this: unknown, ...callArguments: unknown[]) => unknown;
    }[] = [];
  let isDisposed = false;

  function forgetResource(trackedResource: unknown) {
    const resourceRecord = trackedResources.get(trackedResource);
    if (!resourceRecord) return;
    (trackedResource as { removeEventListener?: (type: string, listener: unknown) => void })
      .removeEventListener?.("dispose", resourceRecord.forget);
    trackedResources.delete(trackedResource);
  }

  /** 渲染期登记：同一资源只挂一个 forget，监听按 Set 累积，便于 release 时逐个比对。 */
  const trackResource: ResourceOwner = (trackedResource, listener, originalAddEventListener) => {
    let resourceRecord = trackedResources.get(trackedResource);
    if (!resourceRecord) {
      resourceRecord = {
        callbacks: new Set(),
        forget: () => forgetResource(trackedResource),
      };
      trackedResources.set(trackedResource, resourceRecord);
      originalAddEventListener.call(trackedResource, "dispose", resourceRecord.forget);
    }
    resourceRecord.callbacks.add(listener);
  };

  for (const renderEntryName of [
    "render",
    "renderBufferDirect",
    "compile",
    "compileAsync",
    "initTexture",
    "setRenderTarget",
    "initRenderTarget",
  ]) {
    const originalEntry = renderer[renderEntryName];
    if (typeof originalEntry !== "function") continue;
    const originalMethod = originalEntry as (this: unknown, ...callArguments: unknown[]) => unknown,
      wrappedMethod = function (this: unknown, ...callArguments: unknown[]) {
        // 其它 tracker 正在记账时直接透传，避免抢走别人的 owner。
        if (activePatch.owner !== null) return originalMethod.apply(this, callArguments);
        activePatch.owner = trackResource;
        try {
          return originalMethod.apply(this, callArguments);
        } finally {
          activePatch.owner = null;
        }
      };
    renderer[renderEntryName] = wrappedMethod;
    wrappedEntries.push({ name: renderEntryName, original: originalMethod, wrapped: wrappedMethod });
  }

  return {
    releaseLostContext() {
      if (isDisposed) return;
      const rendererContext = (
        renderer as { getContext?: () => { isContextLost?: () => boolean } | null }
      ).getContext?.();
      if (!rendererContext?.isContextLost?.()) return;
      for (const [trackedResource, resourceRecord] of trackedResources) {
        const disposableResource = trackedResource as {
          hasEventListener?: (type: string, listener: unknown) => boolean;
          removeEventListener?: (type: string, listener: unknown) => void;
        };
        for (const disposeCallback of resourceRecord.callbacks) {
          if (!disposableResource.hasEventListener?.("dispose", disposeCallback)) continue;
          (disposeCallback({ type: "dispose", target: trackedResource }),
            disposableResource.removeEventListener?.("dispose", disposeCallback));
        }
        forgetResource(trackedResource);
      }
    },
    dispose() {
      if (isDisposed) return;
      isDisposed = true;
      for (const trackedResource of trackedResources.keys()) forgetResource(trackedResource);
      for (const { name, original, wrapped } of wrappedEntries)
        renderer[name] === wrapped && (renderer[name] = original);
      releaseDispatcherPatch(activePatch);
    },
  };
}
