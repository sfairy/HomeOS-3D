/** 行操作「⋯」菜单的全局协调：同一时刻只开一个，点外面 / Esc / 滚动都关掉。 */

interface RowMenuHandle {
  root: HTMLElement;
  isOpen: () => boolean;
  open: () => void;
  close: (options?: { restoreFocus?: boolean }) => void;
}

const handles: RowMenuHandle[] = [];
let installed = false;
let menuSeq = 0;

/** 每个行菜单一个稳定 id，供 aria-controls 指向浮层（组件内 setup 每实例都会重跑，计数器必须放模块级）。 */
export function nextRowMenuId(): string {
  menuSeq += 1;
  return `row-menu-pop-${menuSeq}`;
}

function closeRowMenus(options: { restoreFocus?: boolean } = {}): void {
  for (const handle of [...handles]) handle.close(options);
}

export function registerRowMenu(handle: RowMenuHandle): () => void {
  handles.push(handle);
  install();
  return () => {
    const index = handles.indexOf(handle);
    if (index >= 0) handles.splice(index, 1);
  };
}

function install(): void {
  if (installed) return;
  installed = true;

  // `installed` 保证这四个全局监听进程内只注册一次（应用级单例）：登记/注销的是
  // `handles` 里的行菜单句柄，监听本身无归属对象可挂，故不配对移除。

  document.addEventListener(
    "click",
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        closeRowMenus();
        return;
      }
      const toggle = target.closest("[data-menu-toggle]");
      if (toggle) {
        const root = toggle.closest(".menu") as HTMLElement | null;
        const handle = root ? handles.find((item) => item.root === root) : undefined;
        if (!handle) return;
        const wasOpen = handle.isOpen();
        closeRowMenus();
        if (!wasOpen) handle.open();
        return;
      }
      closeRowMenus();
    },
    true,
  );

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    // Esc 是「取消」：焦点要回到触发按钮，不能丢在页面顶部。
    closeRowMenus({ restoreFocus: true });
  });

  document.addEventListener("scroll", () => closeRowMenus(), { passive: true, capture: true });
  window.addEventListener("resize", () => closeRowMenus(), { passive: true });
}
