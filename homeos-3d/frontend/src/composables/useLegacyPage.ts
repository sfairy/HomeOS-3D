import { onBeforeRouteLeave } from "vue-router";
import { withEmbedBase } from "../embed-base.js";

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

/**
 * 离开重型视图时强制整文档跳转。
 *
 * 编辑器 / 3D 工作室 / 展示页挂载的是一次性引导模块（大量顶层副作用、three.js 渲染循环、
 * WebSocket、全局监听），ESM 只会求值一次，无法安全卸载后在同一文档里重挂。让浏览器整页
 * 导航即可完整回收。
 *
 * `to.fullPath` 是 base 相对路径，必须经 withEmbedBase 补回 `/embed/<token>` 前缀，
 * 否则嵌入页一旦发生路由跳转就会掉出嵌入上下文（display cookie 随之失效）。
 */
export function useHardExit(): void {
  onBeforeRouteLeave((to) => {
    window.location.assign(withEmbedBase(to.fullPath));
    return false;
  });
}
