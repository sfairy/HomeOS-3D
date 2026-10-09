/**
 * 旧命令式运行时 → 外壳（Vue Router）的导航桥。
 *
 * 背景：编辑器（`app/editor/home.ts`）与户型图绘制（`app/3d-studio/studio/studio-app.ts`）
 * 原本是「模块求值即执行」的一次性引导脚本，ESM 只求值一次，卸载后无法在同一文档里重挂，
 * 所以跨视图跳转一律走 `window.location.assign(...)` 整页导航。
 *
 * 现在两个运行时都具备 `boot*()` / `teardown*()` 生命周期（见 `platform/legacy-scope.ts`），
 * 可以在同一个文档内进出，于是把这类跳转改成本模块：外壳注册了导航实现就走路由，没有的话
 * （例如 `stage.html` 嵌入式外壳、单页面调试页）退回整页跳转，行为与改造前一致。
 */

type ShellNavigate = (path: string) => void | Promise<unknown>;

let shellNavigate: ShellNavigate | null = null;

/** 外壳启动时注册自己的导航入口（`router.push`）。 */
export function registerShellNavigation(navigate: ShellNavigate): void {
  shellNavigate = navigate;
}

/**
 * 把目标规整成外壳可用的应用内路径。
 *
 * 支持 `"/3d-studio"` 这样的路径、`"/studio/editor?tab=1#x"` 这样的带查询/锚点路径，以及
 * 同源的绝对地址（旧代码里 `studioBackLinkElement.href` 就是绝对地址）。跨源地址或非法
 * 地址返回 `null`，由调用方退回整页跳转。
 */
function toShellPath(target: string): string | null {
  if (!target) return null;
  if (target.startsWith("/") && !target.startsWith("//")) return target;
  try {
    const url = new URL(target, window.location.href);
    if (url.origin !== window.location.origin) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

/**
 * 应用内导航：优先交给外壳路由，未注册或不可路由时整页跳转。
 *
 * 返回是否走了外壳路由，便于调用方在需要时做后续处理（例如清理本视图状态）。
 */
export function navigateInShell(target: string): boolean {
  const path = toShellPath(target);
  if (shellNavigate && path !== null) {
    // 已经在该路径上：外壳路由会判定为重复导航，直接当作成功，避免无谓的整页刷新。
    if (path === window.location.pathname + window.location.search) return true;
    void shellNavigate(path);
    return true;
  }
  window.location.assign(target);
  return false;
}
