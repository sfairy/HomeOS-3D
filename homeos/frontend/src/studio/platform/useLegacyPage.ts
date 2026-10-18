const loaded = new Map<string, Promise<void>>();

/**
 * 按需加载一个经典（非 module）脚本，等待其执行完成。
 *
 * 由视图在挂载时按原始顺序补上（异步脚本也会保证执行顺序与插入顺序一致）。
 * 注意：hls.js 已改由 @/shared/camera/hls-loader 按需加载，不要再用这个函数在引导阶段阻塞加载它。
 */
export function loadClassicScript(src: string): Promise<void> {
  const existing = loaded.get(src);
  if (existing) return existing;
  const promise = new Promise<void>((resolve, reject) => {
    const el = document.createElement("script");
    el.src = src;
    el.async = false;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`加载脚本失败：${src}`));
    document.head.appendChild(el);
  });
  loaded.set(src, promise);
  return promise;
}
