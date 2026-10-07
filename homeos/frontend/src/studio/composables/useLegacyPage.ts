const loaded = new Map<string, Promise<void>>();

/**
 * 按需加载一个经典（非 module）脚本，等待其执行完成。
 *
 * 由视图在挂载时按原始顺序补上，例如 hls.min.js 必须在编辑器/展示页的模块之前就位。
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
