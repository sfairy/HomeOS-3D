/**
 * 预览资源的延后回收（0.7.8 `studio-preview-resources`）。
 *
 * 编辑器重建预览场景时，旧资源不能立刻释放（正在渲染的帧还持有引用），
 * 统一挂到交接队列，等下一次安全的空闲点再销毁。
 */

type PreviewResourceHandoff = {
  /** 把资源排进回收队列；交接阶段已结束则返回 false。 */
  retire: (resource: any) => boolean;
  /** 在交接区内执行任务；任务抛错时仍会清理队列。 */
  run: <T>(task: () => T, flushAfter?: boolean) => T;
  /** 立即清空队列。 */
  release: () => void;
};

export function createPreviewResourceHandoff(
  disposeResource: (resource: any) => void,
): PreviewResourceHandoff {
  let isHandingOff = false;
  const pendingResources = new Set<any>();

  function flushPending() {
    const resources = [...pendingResources];
    pendingResources.clear();
    for (const resource of resources) disposeResource(resource);
  }

  return {
    retire(resource) {
      if (isHandingOff) return false;
      pendingResources.add(resource);
      return true;
    },
    run(task, flushAfter = true) {
      // 已在交接中，或明确要求「先回收再直接跑」，都不再包裹一层交接。
      if (isHandingOff || (flushPending(), !flushAfter)) return task();
      isHandingOff = true;
      let didSucceed = false;
      try {
        const result = task();
        didSucceed = true;
        return result;
      } finally {
        isHandingOff = false;
        didSucceed || flushPending();
      }
    },
    release: flushPending,
  };
}
